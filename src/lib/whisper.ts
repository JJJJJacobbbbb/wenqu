/**
 * 语音识别 — 使用配置的 API 进行语音转文字
 * 通过 OpenAI 兼容的 /audio/transcriptions 端点
 */

import { useSettingsStore } from '../stores/settingsStore'

function getAudioApiUrl(chatApiUrl: string): string {
  return chatApiUrl.replace(/\/chat\/completions\/?$/, '/audio/transcriptions')
}

function getAudioModelInfo() {
  const settings = useSettingsStore.getState()
  for (const config of settings.apiConfigs) {
    const model = config.models.find((m) => m.audioCapable)
    if (model) return { config, model }
  }
  return null
}

/**
 * 将音频 Blob 发送到 API 进行识别
 */
export async function transcribe(audioBlob: Blob, language = 'zh'): Promise<string> {
  const modelInfo = getAudioModelInfo()
  if (!modelInfo) {
    throw new Error('请先在设置中标记一个支持音频的模型')
  }

  const formData = new FormData()
  formData.append('file', audioBlob, 'recording.webm')
  formData.append('model', modelInfo.model.modelId)
  formData.append('language', language)
  formData.append('response_format', 'json')

  const response = await fetch(getAudioApiUrl(modelInfo.config.apiUrl), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${modelInfo.config.apiKey}`,
    },
    body: formData,
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    if (response.status === 404) {
      throw new Error('当前 API 不支持语音转文字功能（/audio/transcriptions 端点不存在）')
    }
    throw new Error(`语音识别请求失败 (${response.status}): ${errText.slice(0, 100)}`)
  }

  const result = await response.json()
  return (result.text || '').trim()
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
