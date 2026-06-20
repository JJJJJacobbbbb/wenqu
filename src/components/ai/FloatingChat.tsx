import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useAiStore } from '../../stores/aiStore'
import { useSubjectStore } from '../../stores/subjectStore'
import { getDesktopHost } from '../../lib/desktopHost'
import SubjectPicker from './SubjectPicker'
import SessionControls from './SessionControls'
import ChatInput from './ChatInput'
import ChatMessage from './ChatMessage'

export default function FloatingChat() {
  const [isPinned, setIsPinned] = useState(true)
  const [showHistory, setShowHistory] = useState(false)
  const [historyFilter, setHistoryFilter] = useState<'all' | 'current'>('all')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef(getDesktopHost())
  const host = hostRef.current

  const { getActiveSession, clearError, switchSession, deleteSession, activeSessionId, sessions: allSessions } = useAiStore()
  const { currentSubjectId, subjects } = useSubjectStore()
  const session = getActiveSession()
  const scrollRef = useRef<HTMLDivElement>(null)

  // 自动滚动到底部
  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

  useEffect(() => {
    requestAnimationFrame(scrollToBottom)
  }, [session?.messages.length, session?.streamingText, session?.chatState, scrollToBottom])

  // 切换会话时滚动到底部
  useEffect(() => {
    requestAnimationFrame(scrollToBottom)
  }, [activeSessionId, scrollToBottom])

  // 关闭菜单
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const sessions = useMemo(() => {
    const allSessionList = Object.values(allSessions).sort((a, b) => b.updatedAt - a.updatedAt)
    if (historyFilter === 'current' && currentSubjectId) {
      return allSessionList.filter(s => s.subjectId === currentSubjectId)
    }
    return allSessionList
  }, [allSessions, historyFilter, currentSubjectId])

  const getSubjectName = useCallback((subjectId: string) => {
    const subject = subjects.find(s => s.id === subjectId)
    return subject?.name || '未知学科'
  }, [subjects])

  const getSubjectColor = useCallback((subjectId: string) => {
    const subject = subjects.find(s => s.id === subjectId)
    return subject?.color || '#9ca3af'
  }, [subjects])

  const handleTogglePin = useCallback(() => {
    const newValue = !isPinned
    setIsPinned(newValue)
    host.invoke('chat:set-always-on-top', newValue)
    setMenuOpen(false)
  }, [isPinned, host])

  const handleShowMain = useCallback(() => {
    host.invoke('chat:show-main')
    setMenuOpen(false)
  }, [host])

  const handleOpenSettings = useCallback(() => {
    host.invoke('chat:open-settings')
    setMenuOpen(false)
  }, [host])

  const handleClose = useCallback(() => {
    host.invoke('chat:close')
  }, [host])

  return (
    <div className="h-screen flex flex-col bg-gray-50 rounded-xl overflow-hidden shadow-2xl border border-gray-200">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shrink-0 select-none">
        <div className="h-10 flex items-center px-3">
          {/* 左侧：学科 + 会话控制 */}
          <div
            className="flex items-center flex-1 min-w-0"
            style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
            onClick={() => {
              // Electron drag 区域会消费 mousedown，导致 textarea 失焦
              // 点击后手动恢复焦点
              setTimeout(() => {
                const ta = document.querySelector('textarea')
                if (ta) ta.focus()
              }, 0)
            }}
          >
            <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              <SubjectPicker />
              <SessionControls onToggleHistory={() => setShowHistory(!showHistory)} showHistory={showHistory} />
            </div>
          </div>

          {/* 右侧：更多菜单 + 关闭 */}
          <div className="flex items-center gap-0.5 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            {/* 更多菜单 */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                title="更多"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="5" r="1" fill="currentColor" />
                  <circle cx="12" cy="12" r="1" fill="currentColor" />
                  <circle cx="12" cy="19" r="1" fill="currentColor" />
                </svg>
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[140px] py-1">
                  <button
                    onClick={handleTogglePin}
                    className="w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:bg-gray-50 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 5.5L12 9l-4 1-2 2 7 7 2-2 1-4 3.5-3L15 5.5z" />
                      <line x1="9" y1="15" x2="5.5" y2="18.5" strokeWidth={2} />
                    </svg>
                    <span>{isPinned ? '取消置顶' : '置顶'}</span>
                    {isPinned && (
                      <svg className="w-3 h-3 text-blue-500 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={handleShowMain}
                    className="w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:bg-gray-50 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                    <span>返回主窗口</span>
                  </button>
                  <button
                    onClick={handleOpenSettings}
                    className="w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:bg-gray-50 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span>设置</span>
                  </button>
                  <div className="border-t border-gray-100 my-1" />
                  <button
                    onClick={handleClose}
                    className="w-full px-3 py-2 text-left text-xs flex items-center gap-2 text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span>关闭悬浮窗</span>
                  </button>
                </div>
              )}
            </div>

            {/* 关闭按钮 */}
            <button
              onClick={handleClose}
              className="w-7 h-7 flex items-center justify-center text-gray-400 hover:bg-red-50 hover:text-red-500 rounded-md transition-colors"
              title="关闭悬浮窗"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* 内容区域 */}
      {showHistory ? (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-600">历史会话</h3>
            <button
              onClick={() => setShowHistory(false)}
              className="text-xs text-blue-500 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
            >
              ← 返回对话
            </button>
          </div>

          <div className="flex items-center gap-1.5 mb-3">
            <button
              onClick={() => setHistoryFilter('all')}
              className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                historyFilter === 'all' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              全部会话
            </button>
            {currentSubjectId && (
              <button
                onClick={() => setHistoryFilter('current')}
                className={`px-2.5 py-1 text-xs rounded-full transition-colors flex items-center gap-1 ${
                  historyFilter === 'current' ? 'text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
                style={historyFilter === 'current' ? { backgroundColor: getSubjectColor(currentSubjectId) } : undefined}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: historyFilter === 'current' ? 'white' : getSubjectColor(currentSubjectId) }}
                />
                {getSubjectName(currentSubjectId)}
              </button>
            )}
          </div>

          {sessions.length === 0 ? (
            <div className="text-center text-gray-400 py-10">
              <p className="text-sm">暂无历史会话</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  onClick={() => { switchSession(s.id); setShowHistory(false) }}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    s.id === activeSessionId
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: getSubjectColor(s.subjectId) }}
                        />
                        <p className="text-sm font-medium text-gray-700 truncate">{s.name}</p>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 ml-3.5">
                        {getSubjectName(s.subjectId)} · {s.messages.length} 条消息
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm('删除此会话？')) deleteSession(s.id)
                      }}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded flex-shrink-0"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {session?.messages.map((message) => (
              <div key={message.id}>
                <ChatMessage message={message} />
              </div>
            ))}

            {session?.chatState === 'streaming' && session.streamingText && (
              <ChatMessage
                message={{
                  id: 'streaming',
                  role: 'assistant',
                  content: session.streamingText,
                  timestamp: Date.now(),
                  type: 'text',
                }}
                isStreaming
              />
            )}

            {session?.chatState === 'thinking' && (
              <div className="flex items-center gap-2 text-gray-500">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            )}

            {session?.chatState === 'error' && session.error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-sm text-red-800">{session.error}</p>
                  </div>
                  <button
                    onClick={() => session && clearError(session.id)}
                    className="text-red-400 hover:text-red-600"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {(!session || session.messages.length === 0) && (
              <div className="h-full flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <p className="text-base font-medium">开始提问吧</p>
                  <p className="text-xs mt-1">可以截图框选或输入文字</p>
                </div>
              </div>
            )}
          </div>

          <div className="p-3 bg-white border-t border-gray-200 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <ChatInput screenshotMode="single" />
          </div>
        </>
      )}
    </div>
  )
}
