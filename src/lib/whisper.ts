/**
 * 语音识别 — 通过多模态模型的 chat/completions 接口进行语音转文字
 */

import { useSettingsStore } from '../stores/settingsStore'

function getAudioModelInfo() {
  const settings = useSettingsStore.getState()
  const activeId = settings.activeApiConfigId

  // 优先从当前激活的配置中查找
  if (activeId) {
    const active = settings.apiConfigs.find((c) => c.id === activeId)
    const model = active?.models.find((m) => m.audioCapable)
    if (model && active) return { config: active, model }
  }

  // fallback: 遍历所有配置
  for (const config of settings.apiConfigs) {
    const model = config.models.find((m) => m.audioCapable)
    if (model) return { config, model }
  }
  return null
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      resolve(dataUrl.split(',')[1]) // 去掉 data:...;base64, 前缀
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function getAudioFormat(mimeType: string): string {
  const mt = mimeType.toLowerCase()
  if (mt.includes('wav')) return 'wav'
  if (mt.includes('mp3')) return 'mp3'
  if (mt.includes('webm')) return 'webm'
  if (mt.includes('ogg')) return 'ogg'
  return 'wav'
}

/**
 * 将音频发送到多模态模型进行识别
 */
export async function transcribe(audioBlob: Blob): Promise<string> {
  const modelInfo = getAudioModelInfo()
  if (!modelInfo) {
    throw new Error('请先在设置中标记一个支持语音输入的模型')
  }

  const base64 = await blobToBase64(audioBlob)
  const format = getAudioFormat(audioBlob.type)

  let apiUrl = modelInfo.config.apiUrl.trim()
  if (!/\/chat\/completions\/?$/.test(apiUrl)) {
    apiUrl = apiUrl.replace(/\/$/, '') + '/chat/completions'
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60_000)

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${modelInfo.config.apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: modelInfo.model.modelId,
        messages: [
          { role: 'system', content: '你是一个语音转文字助手。请准确转写用户发送的语音内容，只输出转写结果，不要添加任何解释。' },
          {
            role: 'user',
            content: [
              { type: 'input_audio', input_audio: { data: base64, format } },
            ],
          },
        ],
        max_tokens: 4096,
      }),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      throw new Error(`语音识别请求失败 (${response.status}): ${errText.slice(0, 100)}`)
    }

    const result = await response.json()
    return (result.choices?.[0]?.message?.content || '').trim()
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * 检查是否有可用的语音模型
 */
export function isVoiceAvailable(): boolean {
  const settings = useSettingsStore.getState()
  return settings.hasAudioModel()
}

export interface RecordingResult {
  text: string
  audioBlob: Blob
  audioUrl: string
}

/**
 * 从麦克风录音并识别
 */
export function recordAndTranscribe(
  onStatus?: (status: 'recording' | 'processing' | 'done') => void
): {
  start: () => Promise<RecordingResult>
  stop: () => void
} {
  let mediaRecorder: MediaRecorder | null = null
  let audioChunks: Blob[] = []
  let resolveFn: ((result: RecordingResult) => void) | null = null
  let rejectFn: ((err: Error) => void) | null = null
  let stream: MediaStream | null = null
  let active = false

  if (!isVoiceAvailable()) {
    return {
      start: () => Promise.reject(new Error('请先在设置中配置支持语音的 AI 模型')),
      stop: () => {},
    }
  }

  const start = (): Promise<RecordingResult> => {
    if (active) return Promise.reject(new Error('录音已在进行中'))
    active = true
    const promise = new Promise<RecordingResult>((resolve, reject) => {
      resolveFn = resolve
      rejectFn = reject

      navigator.mediaDevices.getUserMedia({ audio: true })
        .then((mediaStream) => {
          stream = mediaStream
          audioChunks = []

          mediaRecorder = new MediaRecorder(stream, {
            mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
              ? 'audio/webm;codecs=opus'
              : 'audio/webm',
          })

          mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
              audioChunks.push(e.data)
            }
          }

          mediaRecorder.onstop = () => {
            stream?.getTracks().forEach((t) => t.stop())

            if (audioChunks.length === 0) {
              active = false
              rejectFn?.(new Error('未录制到音频'))
              return
            }

            onStatus?.('processing')

            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' })
            const audioUrl = URL.createObjectURL(audioBlob)
            transcribe(audioBlob)
              .then((text) => {
                onStatus?.('done')
                active = false
                resolveFn?.({ text, audioBlob, audioUrl })
              })
              .catch((err) => {
                URL.revokeObjectURL(audioUrl)
                onStatus?.('done')
                active = false
                rejectFn?.(err as Error)
              })
          }

          mediaRecorder.onerror = () => {
            stream?.getTracks().forEach((t) => t.stop())
            active = false
            rejectFn?.(new Error('录音设备出错'))
          }

          mediaRecorder.start(100)
          onStatus?.('recording')
        })
        .catch((err) => {
          active = false
          rejectFn?.(err instanceof Error ? err : new Error(`麦克风访问失败: ${err}`))
        })
    })

    return promise
  }

  const stop = () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop()
    } else {
      // MediaRecorder 未在录音状态，直接清理流
      stream?.getTracks().forEach((t) => t.stop())
      stream = null
      if (active) {
        active = false
        rejectFn?.(new Error('录音已取消'))
      }
    }
  }

  return { start, stop }
}
