import { useState, useCallback, useRef, useEffect } from 'react'
import { useAiStore } from '../../stores/aiStore'
import { noDragRegion } from '../../lib/styles'

interface SessionControlsProps {
  onToggleHistory: () => void
  showHistory?: boolean
}

export default function SessionControls({ onToggleHistory, showHistory }: SessionControlsProps) {
  const { createSession, getActiveSession } = useAiStore()
  const activeSession = getActiveSession()
  const [hint, setHint] = useState<string | null>(null)
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current)
    }
  }, [])

  const handleNewSession = useCallback(() => {
    if (activeSession && activeSession.messages.length === 0) {
      setHint('已是新会话')
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current)
      hintTimerRef.current = setTimeout(() => setHint(null), 1500)
      return
    }
    createSession()
  }, [activeSession, createSession])

  return (
    <div className="flex items-center gap-2 ml-auto relative" style={noDragRegion}>
      {/* 提示 */}
      {hint && (
        <div className="absolute -bottom-7 right-0 bg-gray-800 text-white text-[10px] px-2 py-1 rounded shadow-sm whitespace-nowrap z-10">
          {hint}
        </div>
      )}

      {/* 历史会话按钮 */}
      <button
        onClick={onToggleHistory}
        className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors ${
          showHistory ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
        }`}
        title="历史会话"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="hidden sm:inline">历史</span>
      </button>

      {/* 当前会话名称 */}
      {activeSession && activeSession.name !== '新会话' && (
        <span className="text-[10px] text-gray-400 max-w-[80px] truncate hidden sm:inline" title={activeSession.name}>
          {activeSession.name}
        </span>
      )}

      {/* 新会话按钮 */}
      <button
        onClick={handleNewSession}
        className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        title="新会话"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        <span className="hidden sm:inline">新会话</span>
      </button>
    </div>
  )
}

