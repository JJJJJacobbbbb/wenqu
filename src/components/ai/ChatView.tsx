import { useEffect, useState, ReactNode, useCallback, useMemo, useRef } from 'react'
import { useAiStore } from '../../stores/aiStore'
import { useSubjectStore } from '../../stores/subjectStore'
import { useShallow } from 'zustand/react/shallow'
import { useAutoScroll } from '../../hooks/useAutoScroll'
import { useNoteStore, NOTE_CATEGORY_LABELS, type NoteCategory, type GeneratedNoteData } from '../../stores/noteStore'
import { useSettingsStore } from '../../stores/settingsStore'
import ChatMessage from './ChatMessage'
import ChatInput from './ChatInput'
import SubjectPicker from './SubjectPicker'
import SessionControls from './SessionControls'
import ThinkingDisplay from './ThinkingDisplay'
import Toast from '../shared/Toast'
import ConfirmDialog from '../shared/ConfirmDialog'

const NOTE_TYPES: { type: NoteCategory; label: string }[] = [
  { type: 'knowledge', label: '知识重点' },
  { type: 'technique', label: '解题技巧' },
  { type: 'other', label: '其他' },
]

interface ChatViewProps {
  headerExtra?: ReactNode
  wrapperClass?: string
  headerClass?: string
  headerStyle?: React.CSSProperties
  inputClass?: string
  inputStyle?: React.CSSProperties
  screenshotMode?: 'toggle' | 'single'
}

export default function ChatView({
  headerExtra,
  wrapperClass = 'h-full flex flex-col bg-gray-50',
  headerClass = 'bg-white border-b border-gray-200 relative shrink-0',
  headerStyle,
  inputClass = 'p-4 bg-white border-t border-gray-200',
  inputStyle,
  screenshotMode = 'toggle',
}: ChatViewProps) {
  const { getActiveSession, clearError, createSession, switchSession, deleteSession, activeSessionId, sessions: allSessions } = useAiStore(useShallow((s) => ({
    getActiveSession: s.getActiveSession,
    clearError: s.clearError,
    createSession: s.createSession,
    switchSession: s.switchSession,
    deleteSession: s.deleteSession,
    activeSessionId: s.activeSessionId,
    sessions: s.sessions,
  })))
  const { currentSubjectId, subjects } = useSubjectStore(useShallow((s) => ({
    currentSubjectId: s.currentSubjectId,
    subjects: s.subjects,
  })))
  const { generateNoteStream, addNote } = useNoteStore(useShallow((s) => ({
    generateNoteStream: s.generateNoteStream,
    addNote: s.addNote,
  })))
  const { getActiveModel, apiConfigs } = useSettingsStore(useShallow((s) => ({
    getActiveModel: s.getActiveModel,
    apiConfigs: s.apiConfigs,
  })))
  const session = getActiveSession()
  const { scrollRef, checkScrollPosition } = useAutoScroll(
    [session?.messages.length, session?.streamingText, session?.thinkingText, session?.chatState],
    activeSessionId
  )

  const [showHistory, setShowHistory] = useState(false)
  const [historyFilter, setHistoryFilter] = useState<'all' | 'current'>('all')
  const [toastMsg, setToastMsg] = useState<{ message: string; type: 'info' | 'error' | 'success' } | null>(null)
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null)

  // 统一笔记弹窗：input → generating → preview
  const [noteDialog, setNoteDialog] = useState<{
    msgIdx: number
    type: NoteCategory
    phase: 'input' | 'generating' | 'preview'
    extraInstructions: string
    result: GeneratedNoteData | null
  } | null>(null)
  const [noteTitle, setNoteTitle] = useState('')
  const [noteChapter, setNoteChapter] = useState('')
  const [noteContent, setNoteContent] = useState('')
  const noteSavingRef = useRef(false)

  // Escape 关闭笔记弹窗
  useEffect(() => {
    if (!noteDialog) return
    noteSavingRef.current = false
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNoteDialog(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [noteDialog])

  useEffect(() => {
    const all = useAiStore.getState().sessions
    if (Object.keys(all).length === 0) {
      createSession()
    }
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

  const handleNoteGenerate = useCallback(async () => {
    if (!session || !noteDialog || noteDialog.phase !== 'input') return
    const { msgIdx, type, extraInstructions } = noteDialog
    setNoteContent('')
    setNoteDialog({ ...noteDialog, phase: 'generating' })
    try {
      let userMsg = ''
      for (let i = msgIdx - 1; i >= 0; i--) {
        if (session.messages[i].role === 'user') {
          userMsg = session.messages[i].content
          break
        }
      }
      const aiMsg = session.messages[msgIdx].content
      const result = await generateNoteStream(userMsg, aiMsg, currentSubjectId, type, (text) => setNoteContent(text), extraInstructions || undefined)
      if (result) {
        setNoteTitle(result.title)
        setNoteChapter(result.chapter)
        setNoteContent(result.content)
        setNoteDialog({ ...noteDialog, phase: 'preview', result })
      } else {
        setToastMsg({ message: '笔记生成失败，请检查 AI 模型配置是否正确。', type: 'error' })
        setNoteDialog(null)
      }
    } catch {
      setToastMsg({ message: '笔记生成失败，请检查 AI 模型配置是否正确。', type: 'error' })
      setNoteDialog(null)
    }
  }, [session, noteDialog, currentSubjectId, generateNoteStream])

  const handleNoteSave = useCallback(() => {
    if (!noteDialog?.result || noteSavingRef.current) return
    noteSavingRef.current = true
    addNote({
      title: noteTitle || noteDialog.result.title,
      content: noteContent || noteDialog.result.content,
      subjectId: currentSubjectId,
      category: noteDialog.result.category,
      chapter: noteChapter || noteDialog.result.chapter,
    })
    setToastMsg({ message: '笔记已保存', type: 'success' })
    setNoteDialog(null)
  }, [noteDialog, noteTitle, noteChapter, noteContent, currentSubjectId, addNote])

  const hasAiModel = useMemo(() =>
    getActiveModel() !== null,
    [apiConfigs]
  )

  return (
    <div className={wrapperClass}>
      <div className={headerClass} style={headerStyle}>
        <div className="h-10 flex items-center px-3">
          <SubjectPicker />
          <SessionControls onToggleHistory={() => setShowHistory(!showHistory)} showHistory={showHistory} />
          {headerExtra}
        </div>
      </div>

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
                        {getSubjectName(s.subjectId)} · {s.messages.length} 条消息 · {new Date(s.updatedAt).toLocaleString('zh-CN')}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteSessionId(s.id)
                      }}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded flex-shrink-0"
                      aria-label="删除会话"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                  {s.messages.length > 0 && (
                    <p className="text-xs text-gray-500 mt-1 ml-3.5 line-clamp-2">
                      {s.messages[s.messages.length - 1].content}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div ref={scrollRef} onScroll={checkScrollPosition} className="flex-1 overflow-y-auto p-4 space-y-4">
          {session?.messages.map((message, idx) => {
            const isGeneratingThis = noteDialog?.msgIdx === idx && noteDialog.phase === 'generating'
            return (
              <div key={message.id}>
                {message.role === 'assistant' && message.thinkingContent && (
                  <ThinkingDisplay text={message.thinkingContent} isStreaming={false} />
                )}
                <ChatMessage message={message} />
                {hasAiModel && message.role === 'assistant' &&
                  session.chatState === 'idle' &&
                  message.content && message.content !== '(无响应内容)' && (
                  <div className="flex justify-start mt-1">
                    <div className="ml-0 max-w-[85%]">
                      <div className="flex gap-1">
                        {NOTE_TYPES.map(({ type, label }) => (
                          <button
                            key={type}
                            onClick={() => setNoteDialog({ msgIdx: idx, type, phase: 'input', extraInstructions: '', result: null })}
                            disabled={isGeneratingThis}
                            className="text-[10px] px-2 py-0.5 text-purple-500 hover:bg-purple-50 rounded border border-purple-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            + {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {session?.chatState === 'streaming' && (
            <div>
              {session.thinkingText && (
                <ThinkingDisplay text={session.thinkingText} isStreaming={true} statusText={session.statusText} />
              )}
              {session.streamingText && (
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
              {!session.streamingText && session.statusText && (
                <div className="flex items-center gap-2 text-gray-500">
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
                  <span className="text-sm">{session.statusText}</span>
                </div>
              )}
            </div>
          )}

          {session?.chatState === 'thinking' && (
            <div className="flex items-center gap-2 text-gray-500">
              <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              {session.statusText && (
                <span className="text-sm ml-1">{session.statusText}</span>
              )}
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
                  aria-label="关闭错误提示"
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
              <div className="text-center max-w-sm">
                <p className="text-lg font-medium text-gray-600 mb-1">开始提问吧</p>
                <p className="text-sm mb-4">可以截图框选或输入文字</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {['帮我解释这个公式', '这道题怎么做', '总结一下这页内容'].map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('chat:set-input', { detail: prompt }))
                      }}
                      className="px-3 py-1.5 text-xs text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className={inputClass} style={inputStyle}>
        <ChatInput screenshotMode={screenshotMode} />
      </div>

      {/* 笔记弹窗：统一 input / generating / preview 三个阶段 */}
      {noteDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => noteDialog.phase !== 'generating' && setNoteDialog(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* 头部 */}
            <div className="p-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold text-gray-800">
                  {noteDialog.phase === 'preview' ? '笔记预览' : `生成${NOTE_CATEGORY_LABELS[noteDialog.type]}笔记`}
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded bg-purple-100 text-purple-600">
                  {NOTE_CATEGORY_LABELS[noteDialog.type]}
                </span>
              </div>
              {noteDialog.phase === 'preview' ? (
                <div className="space-y-2">
                  <input
                    value={noteTitle}
                    onChange={(e) => setNoteTitle(e.target.value)}
                    className="w-full text-sm font-medium text-gray-800 border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
                    placeholder="笔记标题"
                  />
                  <input
                    value={noteChapter}
                    onChange={(e) => setNoteChapter(e.target.value)}
                    className="w-full text-xs text-gray-600 border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
                    placeholder="章节（可选）"
                  />
                </div>
              ) : (
                <>
                  <p className="text-xs text-gray-400 mb-3">可补充说明，让笔记更贴合你的需求</p>
                  <textarea
                    value={noteDialog.extraInstructions}
                    onChange={(e) => setNoteDialog({ ...noteDialog, extraInstructions: e.target.value })}
                    placeholder="例如：重点写公式推导过程、用表格对比..."
                    className="w-full h-24 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3 resize-none focus:outline-none focus:border-blue-400"
                    autoFocus={noteDialog.phase === 'input'}
                    disabled={noteDialog.phase === 'generating'}
                  />
                </>
              )}
            </div>

            {/* 内容区 */}
            {(noteDialog.phase === 'generating' || noteDialog.phase === 'preview') && (
              <div className="flex-1 min-h-0 p-4">
                <textarea
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  readOnly={noteDialog.phase === 'generating'}
                  className="w-full h-full text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3 resize-none focus:outline-none focus:border-blue-400"
                />
              </div>
            )}

            {/* 底部按钮 */}
            <div className="p-4 border-t border-gray-100 flex gap-2 shrink-0">
              {noteDialog.phase === 'preview' ? (
                <>
                  <button
                    onClick={handleNoteSave}
                    className="flex-1 py-2 text-sm text-white bg-purple-500 hover:bg-purple-600 rounded transition-colors"
                  >
                    保存笔记
                  </button>
                  <button
                    onClick={() => setNoteDialog(null)}
                    className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    取消
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleNoteGenerate}
                    disabled={noteDialog.phase === 'generating'}
                    className="flex-1 py-2 text-sm text-white bg-purple-500 hover:bg-purple-600 rounded transition-colors disabled:opacity-50"
                  >
                    {noteDialog.phase === 'generating' ? '生成中...' : '生成笔记'}
                  </button>
                  <button
                    onClick={() => setNoteDialog(null)}
                    disabled={noteDialog.phase === 'generating'}
                    className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
                  >
                    取消
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {toastMsg && (
        <Toast message={toastMsg.message} type={toastMsg.type} onClose={() => setToastMsg(null)} />
      )}

      <ConfirmDialog
        open={!!deleteSessionId}
        title="删除会话"
        message="确定要删除此会话吗？此操作不可撤销。"
        confirmLabel="删除"
        danger
        onConfirm={() => { if (deleteSessionId) deleteSession(deleteSessionId); setDeleteSessionId(null) }}
        onCancel={() => setDeleteSessionId(null)}
      />
    </div>
  )
}
