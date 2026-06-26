import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useAiStore } from '../../stores/aiStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useDocumentStore } from '../../stores/documentStore'
import { useShallow } from 'zustand/react/shallow'
import { useClickOutside } from '../../hooks/useClickOutside'
import { noDragRegion } from '../../lib/styles'
import { getDesktopHost } from '../../lib/desktopHost'
import { recordAndTranscribe, isVoiceAvailable } from '../../lib/whisper'
import { logger } from '../../lib/logger'
import { FOCUS_DELAY_MS, TEXTAREA_MAX_HEIGHT } from '../../lib/constants'

interface ChatInputProps {
  screenshotMode?: 'toggle' | 'single'
}

export default function ChatInput({ screenshotMode = 'toggle' }: ChatInputProps = {}) {
  const [input, setInput] = useState('')
  const { sendMessage, getActiveSession, stopGeneration, pendingScreenshots, addPendingScreenshot, removePendingScreenshot, clearPendingScreenshots, thinkingMode, setThinkingMode, messageDropped } = useAiStore(useShallow((s) => ({
    sendMessage: s.sendMessage,
    getActiveSession: s.getActiveSession,
    stopGeneration: s.stopGeneration,
    pendingScreenshots: s.pendingScreenshots,
    addPendingScreenshot: s.addPendingScreenshot,
    removePendingScreenshot: s.removePendingScreenshot,
    clearPendingScreenshots: s.clearPendingScreenshots,
    thinkingMode: s.thinkingMode,
    setThinkingMode: s.setThinkingMode,
    messageDropped: s.messageDropped,
  })))
  const { apiConfigs, setDefaultModel, getActiveModel, hasVisionModel } = useSettingsStore(useShallow((s) => ({
    apiConfigs: s.apiConfigs,
    setDefaultModel: s.setDefaultModel,
    getActiveModel: s.getActiveModel,
    hasVisionModel: s.hasVisionModel,
  })))
  const { selectionMode, toggleSelectionMode } = useDocumentStore(useShallow((s) => ({
    selectionMode: s.selectionMode,
    toggleSelectionMode: s.toggleSelectionMode,
  })))
  const session = getActiveSession()
  const isGenerating = session?.chatState === 'thinking' || session?.chatState === 'streaming'
  const hasVision = useMemo(() => hasVisionModel(), [apiConfigs])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pendingScreenshotsRef = useRef(pendingScreenshots)
  pendingScreenshotsRef.current = pendingScreenshots
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const recorderRef = useRef<ReturnType<typeof recordAndTranscribe> | null>(null)
  const isRecordingRef = useRef(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [modelOpen, setModelOpen] = useState(false)
  const modelDropdownRef = useRef<HTMLDivElement>(null)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [audioPreview, setAudioPreview] = useState<{ url: string; blob: Blob; duration: number } | null>(null)
  const audioPreviewRef = useRef<{ url: string; blob: Blob; duration: number } | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [showCaptureHint, setShowCaptureHint] = useState(false)
  const captureTimers = useRef<number[]>([])

  // 清理截图提示定时器 + 音频预览 URL + 录音中则停止
  useEffect(() => () => {
    captureTimers.current.forEach(clearTimeout)
    if (audioPreviewRef.current?.url) URL.revokeObjectURL(audioPreviewRef.current.url)
    if (isRecordingRef.current && recorderRef.current) {
      try { recorderRef.current.stop() } catch { /* already stopped */ }
    }
  }, [])

  // 保持 ref 与 state 同步，避免 toggleRecording 闭包过期
  useEffect(() => { isRecordingRef.current = isRecording }, [isRecording])

  // 语音错误 3 秒后自动消失
  useEffect(() => {
    if (!voiceError) return
    const t = setTimeout(() => setVoiceError(null), 3000)
    return () => clearTimeout(t)
  }, [voiceError])

  // 监听外部设置输入内容的自定义事件（用于 starter prompts）
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (typeof detail === 'string') {
        setInput(detail)
        textareaRef.current?.focus()
      }
    }
    window.addEventListener('chat:set-input', handler)
    return () => window.removeEventListener('chat:set-input', handler)
  }, [])

  // 关闭模型下拉
  useClickOutside(modelDropdownRef, useCallback(() => setModelOpen(false), []))

  // 收集所有可用模型
  const allModels = useMemo(() =>
    apiConfigs.flatMap((c) =>
      c.models.map((m) => ({ configId: c.id, configName: c.name, modelId: m.id, modelName: m.name }))
    ),
    [apiConfigs]
  )
  const activeModel = getActiveModel()

  const handleScreenshotCapture = useCallback((imageData: string) => {
    addPendingScreenshot(imageData)
    setShowCaptureHint(true)
    captureTimers.current.forEach(clearTimeout)
    captureTimers.current = [
      window.setTimeout(() => setShowCaptureHint(false), 3000),
      window.setTimeout(() => textareaRef.current?.focus(), FOCUS_DELAY_MS),
    ]
  }, [addPendingScreenshot])

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, TEXTAREA_MAX_HEIGHT) + 'px'
  }, [input])

  const handleSubmit = useCallback(() => {
    const trimmed = input.trim()
    const screens = pendingScreenshotsRef.current
    if ((!trimmed && screens.length === 0) || isGenerating) return
    sendMessage(trimmed || '请分析截图', screens.length > 0 ? screens : undefined)
    setInput('')
    clearPendingScreenshots()
    if (audioPreviewRef.current?.url) URL.revokeObjectURL(audioPreviewRef.current.url)
    audioPreviewRef.current = null
    setAudioPreview(null)
  }, [input, isGenerating, sendMessage, clearPendingScreenshots])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  const toggleRecording = useCallback(async () => {
    if (isRecordingRef.current && recorderRef.current) {
      recorderRef.current.stop()
      return
    }
    if (!isVoiceAvailable()) return
    setVoiceError(null)
    try {
      const recorder = recordAndTranscribe((status) => {
        if (status === 'processing') {
          setIsTranscribing(true)
          setIsRecording(false)
        }
      })
      recorderRef.current = recorder
      setIsRecording(true)
      const result = await recorder.start()
      if (result.text) setInput((prev) => prev + result.text)
      // 释放旧的音频 URL
      if (audioPreviewRef.current?.url) URL.revokeObjectURL(audioPreviewRef.current.url)
      const audio = new Audio(result.audioUrl)
      const duration = await new Promise<number>((resolve) => {
        audio.addEventListener('loadedmetadata', () => resolve(audio.duration || 0), { once: true })
        audio.addEventListener('error', () => resolve(0), { once: true })
      })
      const preview = { url: result.audioUrl, blob: result.audioBlob, duration }
      audioPreviewRef.current = preview
      setAudioPreview(preview)
    } catch (err) {
      const msg = err instanceof Error ? err.message : '语音识别失败'
      if (msg.includes('麦克风') || msg.includes('Permission') || msg.includes('NotAllowed')) {
        setVoiceError('请允许麦克风权限后重试')
      } else {
        setVoiceError(msg)
      }
      logger.error('语音识别错误', err)
    } finally {
      setIsRecording(false)
      setIsTranscribing(false)
      recorderRef.current = null
    }
  }, [])

  const canSend = (input.trim() || pendingScreenshots.length > 0) && !isGenerating
  const voiceDisabled = useMemo(() => !isVoiceAvailable(), [apiConfigs])

  return (
    <div className="flex flex-col gap-2">
      {/* 图片预览弹窗 */}
      {previewImage && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]">
            <img src={previewImage} alt="预览" className="max-w-full max-h-[85vh] rounded-lg shadow-2xl" />
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-2 -right-2 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-gray-100"
              aria-label="关闭预览"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* 截图提示 */}
      {showCaptureHint && (
        <div className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
          ✓ 截图已接收，在下方输入问题
        </div>
      )}

      {/* 截图预览 */}
      {pendingScreenshots.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {pendingScreenshots.map((src, i) => (
            <div key={`${src.length}-${i}`} className="relative inline-block cursor-pointer group" onClick={() => setPreviewImage(src)}>
              <img src={src} alt={`截图 ${i + 1}`} className="max-h-16 max-w-[140px] rounded border border-gray-200 group-hover:border-blue-300 transition-colors" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 rounded transition-colors flex items-center justify-center">
                <svg className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                </svg>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); removePendingScreenshot(i) }}
                className="absolute -top-1 -right-1 w-4 h-4 bg-gray-600 text-white rounded-full flex items-center justify-center text-[10px] hover:bg-red-500"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 音频预览 */}
      {audioPreview && (
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
          <button
            onClick={() => {
              if (audioRef.current) {
                audioRef.current.paused ? audioRef.current.play() : audioRef.current.pause()
              }
            }}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-blue-500 text-white hover:bg-blue-600 shrink-0"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
          <audio ref={audioRef} src={audioPreview.url} className="hidden" />
          <div className="flex-1" />
          <span className="text-[10px] text-gray-400">{audioPreview.duration > 0 ? `${Math.round(audioPreview.duration)}s` : '录音完成'}</span>
          <button
            onClick={() => {
              if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = '' }
              if (audioPreview.url) URL.revokeObjectURL(audioPreview.url)
              audioPreviewRef.current = null
              setAudioPreview(null)
            }}
            className="text-gray-400 hover:text-red-500 p-0.5"
            aria-label="删除录音"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* 消息丢弃提示 */}
      {messageDropped && (
        <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
          上一条消息正在处理中，请稍候再发送
        </div>
      )}

      {/* 输入框 */}
      <textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="输入问题..."
        className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        rows={2}
        style={{ maxHeight: 160 }}
        disabled={isGenerating}
      />

      {/* 底部工具栏: 模型选择 思考 | 框选 语音 发送 */}
      <div className="flex items-center justify-between" style={noDragRegion}>
        <div className="flex items-center gap-1">
          {/* ---- 模型选择 ---- */}
          <div className="relative" ref={modelDropdownRef}>
            <button
              onClick={() => setModelOpen(!modelOpen)}
              className="h-8 px-2 flex items-center gap-1 rounded-lg text-xs border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <span className="max-w-[80px] truncate text-gray-600">
                {activeModel ? activeModel.model.name : '未配置'}
              </span>
              <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {modelOpen && (
              <div className="absolute bottom-full left-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[200px] max-h-[200px] overflow-y-auto py-1">
                {allModels.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-gray-400">暂无可用模型</div>
                ) : (
                  allModels.map((m) => {
                    const isActive = activeModel?.model.id === m.modelId
                    return (
                      <button
                        key={m.modelId}
                        onClick={() => {
                          setDefaultModel(m.modelId)
                          setModelOpen(false)
                        }}
                        className={`w-full px-3 py-1.5 text-left text-xs flex items-center justify-between transition-colors ${
                          isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <span className="truncate block">{m.modelName}</span>
                          <span className="text-[10px] text-gray-400">{m.configName}</span>
                        </div>
                        {isActive && (
                          <svg className="w-3 h-3 text-blue-500 flex-shrink-0 ml-1" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                    )
                  })
                )}
              </div>
            )}
          </div>

          {/* ---- 思考 ---- */}
          {activeModel?.model.hasThinking && (
            <button
              onClick={() => setThinkingMode(!thinkingMode)}
              className={`h-7 px-2 flex items-center gap-0.5 rounded text-[10px] transition-colors ${
                thinkingMode
                  ? 'bg-purple-100 text-purple-600 border border-purple-200'
                  : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
              }`}
              title={thinkingMode ? '关闭思考模式' : '思考模式'}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              思考
            </button>
          )}

          {isRecording && <span className="text-xs text-red-500 animate-pulse ml-1">录音中...</span>}
          {isTranscribing && !isRecording && <span className="text-xs text-yellow-600 ml-1">识别中...</span>}
        </div>

        <div className="flex items-center gap-1.5">
          {/* ---- 框选 ---- */}
          {hasVision && (
            <button
              onClick={async () => {
                if (screenshotMode === 'toggle') {
                  toggleSelectionMode()
                } else {
                  try {
                    const host = getDesktopHost()
                    const bounds = await host.screenshot.startRegionSelect()
                    if (bounds) {
                      const imageData = await host.screenshot.captureRegion(bounds)
                      if (imageData) handleScreenshotCapture(imageData)
                    }
                  } catch (err) { logger.error('截图失败', err) }
                }
              }}
              className={`w-8 h-8 flex items-center justify-center rounded-lg shrink-0 transition-colors ${
                screenshotMode === 'toggle' && selectionMode
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
              }`}
              title={screenshotMode === 'toggle' ? (selectionMode ? '退出框选' : '框选截图') : '截图'}
              aria-label={screenshotMode === 'toggle' ? (selectionMode ? '退出框选' : '框选截图') : '截图'}
            >
              {screenshotMode === 'single' ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="6" cy="6" r="3" />
                  <circle cx="6" cy="18" r="3" />
                  <line x1="20" y1="4" x2="8.12" y2="15.88" />
                  <line x1="14.47" y1="14.48" x2="20" y2="20" />
                  <line x1="8.12" y1="8.12" x2="12" y2="12" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="4 2" />
                </svg>
              )}
            </button>
          )}

          {/* ---- 语音 ---- */}
          <button
            onClick={() => {
              if (voiceDisabled) return
              toggleRecording()
            }}
            disabled={isGenerating || isTranscribing}
            className={`w-8 h-8 flex items-center justify-center rounded-lg shrink-0 transition-colors ${
              isRecording
                ? 'bg-red-500 text-white animate-pulse'
                : isTranscribing
                  ? 'bg-yellow-500 text-white animate-pulse'
                  : voiceError
                    ? 'text-red-400 ring-1 ring-red-300'
                    : voiceDisabled
                      ? 'text-gray-300'
                      : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
            }`}
            title={voiceError || isRecording ? '停止录音' : isTranscribing ? '识别中...' : voiceDisabled ? '需在设置中标记语音模型' : '语音输入'}
            aria-label={voiceError || isRecording ? '停止录音' : isTranscribing ? '识别中...' : voiceDisabled ? '需在设置中标记语音模型' : '语音输入'}
          >
            {isTranscribing ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : voiceDisabled ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            )}
          </button>

          {/* 发送/停止 */}
          {isGenerating ? (
            <button
              onClick={stopGeneration}
              className="px-4 py-1.5 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors"
            >
              停止
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!canSend}
              className="px-4 py-1.5 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              发送
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
