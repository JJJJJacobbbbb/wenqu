import { useEffect, useState, ReactNode, useCallback, useMemo } from 'react'
import { useAiStore } from '../../stores/aiStore'
import { useSubjectStore } from '../../stores/subjectStore'
import { useShallow } from 'zustand/react/shallow'
import { useAutoScroll } from '../../hooks/useAutoScroll'
import { useNoteStore, type Note, type GeneratedNoteData } from '../../stores/noteStore'
import { useSettingsStore } from '../../stores/settingsStore'
import ChatMessage from './ChatMessage'
import ChatInput from './ChatInput'
import SubjectPicker from './SubjectPicker'
import SessionControls from './SessionControls'
import Toast from '../shared/Toast'
import ConfirmDialog from '../shared/ConfirmDialog'

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
  const { generateNote, addNote, mergeNote } = useNoteStore(useShallow((s) => ({
    generateNote: s.generateNote,
    addNote: s.addNote,
    mergeNote: s.mergeNote,
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
  const [noteGenMsgIdx, setNoteGenMsgIdx] = useState<number | null>(null)
  const [noteGenLoading, setNoteGenLoading] = useState(false)
  const [historyFilter, setHistoryFilter] = useState<'all' | 'current'>('all')
  const [toastMsg, setToastMsg] = useState<{ message: string; type: 'info' | 'error' | 'success' } | null>(null)
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null)
  const [similarDialog, setSimilarDialog] = useState<{
    newNote: GeneratedNoteData
    existingNote: Note
    mergeResult?: { title: string; content: string }
    merging?: boolean
  } | null>(null)

  useEffect(() => {
    // 只在完全没有会话时才创建新会话
    const all = useAiStore.getState().sessions
    if (Object.keys(all).length === 0) {
      createSession()
    }
  }, [])

  // 切换会话时关闭相似笔记弹窗
  useEffect(() => {
    setSimilarDialog(null)
  }, [activeSessionId])


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

  const handleGenerateNote = useCallback(async (msgIdx: number, type: 'knowledge' | 'technique' | 'other') => {
    if (!session) return
    setNoteGenMsgIdx(msgIdx)
    setNoteGenLoading(true)
    try {
      let userMsg = ''
      for (let i = msgIdx - 1; i >= 0; i--) {
        if (session.messages[i].role === 'user') {
          userMsg = session.messages[i].content
          break
        }
      }
      const aiMsg = session.messages[msgIdx].content
      const result = await generateNote(userMsg, aiMsg, currentSubjectId, type)
      if (result) {
        if (result.existingNote) {
          // 发现相似笔记，弹窗让用户选择
          setSimilarDialog({ newNote: result, existingNote: result.existingNote })
        } else {
          addNote({
            title: result.title,
            content: result.content,
            subjectId: currentSubjectId,
            category: result.category,
            chapter: result.chapter,
          })
        }
      } else {
        setToastMsg({ message: '笔记生成失败，请检查 AI 模型配置是否正确。', type: 'error' })
      }
    } finally {
      setNoteGenMsgIdx(null)
      setNoteGenLoading(false)
    }
  }, [session, currentSubjectId, generateNote, addNote])

  const hasAiModel = useMemo(() =>
    getActiveModel() !== null,
    [apiConfigs]
  )

  const handleMerge = useCallback(async () => {
    const dialog = similarDialog
    if (!dialog) return
    setSimilarDialog((prev) => prev ? { ...prev, merging: true } : null)
    const result = await mergeNote(dialog.existingNote, dialog.newNote.title, dialog.newNote.content)
    setSimilarDialog((prev) => prev ? { ...prev, merging: false, mergeResult: result || undefined } : null)
  }, [similarDialog, mergeNote])

  const handleDialogChoice = useCallback((action: 'update' | 'confirm-merge' | 'create' | 'cancel') => {
    const dialog = similarDialog
    if (!dialog) return
    const { updateNote } = useNoteStore.getState()
    const { newNote, existingNote, mergeResult } = dialog

    if (action === 'update') {
      updateNote(existingNote.id, { title: newNote.title, content: newNote.content, chapter: newNote.chapter })
    } else if (action === 'confirm-merge' && mergeResult) {
      updateNote(existingNote.id, { title: mergeResult.title, content: mergeResult.content })
    } else if (action === 'create') {
      addNote({
        title: newNote.title,
        content: newNote.content,
        subjectId: currentSubjectId,
        category: newNote.category,
        chapter: newNote.chapter,
      })
    }
    setSimilarDialog(null)
  }, [similarDialog, addNote, currentSubjectId])

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

          {/* 筛选按钮 */}
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
            const isGeneratingThis = noteGenMsgIdx === idx
            return (
              <div key={message.id}>
                <ChatMessage message={message} />
                {/* AI 回复完成后显示生成笔记按钮 */}
                {hasAiModel && message.role === 'assistant' &&
                  session.chatState === 'idle' &&
                  message.content && message.content !== '(无响应内容)' && (
                  <div className="flex justify-start mt-1">
                    <div className="ml-0 max-w-[85%]">
                      {isGeneratingThis ? (
                        <span className="text-[10px] text-purple-500 animate-pulse">生成笔记中...</span>
                      ) : (
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleGenerateNote(idx, 'knowledge')}
                            disabled={noteGenLoading}
                            className="text-[10px] px-2 py-0.5 text-purple-500 hover:bg-purple-50 rounded border border-purple-200 transition-colors"
                          >
                            + 知识重点
                          </button>
                          <button
                            onClick={() => handleGenerateNote(idx, 'technique')}
                            disabled={noteGenLoading}
                            className="text-[10px] px-2 py-0.5 text-purple-500 hover:bg-purple-50 rounded border border-purple-200 transition-colors"
                          >
                            + 解题技巧
                          </button>
                          <button
                            onClick={() => handleGenerateNote(idx, 'other')}
                            disabled={noteGenLoading}
                            className="text-[10px] px-2 py-0.5 text-purple-500 hover:bg-purple-50 rounded border border-purple-200 transition-colors"
                          >
                            + 其他
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {session?.chatState === 'streaming' && session.streamingText && (
            <ChatMessage
              message={{
                id: 'streaming',
                role: 'assistant',
                content: session.streamingText,
                timestamp: Date.now(),
                type: 'text',
                thinkingContent: session.thinkingText || undefined,
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

      {/* 相似笔记提示弹窗 */}
      {similarDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSimilarDialog(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-800 mb-2">发现相似笔记</h3>
            <p className="text-sm text-gray-500 mb-4">
              已有笔记「{similarDialog.existingNote.title}」与新生成的内容相似。
            </p>

            {/* 已有笔记预览 */}
            <div className="bg-gray-50 rounded p-3 mb-4 max-h-32 overflow-y-auto">
              <p className="text-xs text-gray-400 mb-1">已有笔记：</p>
              <p className="text-sm font-medium text-gray-700">{similarDialog.existingNote.title}</p>
              <p className="text-xs text-gray-500 mt-1 line-clamp-3">{similarDialog.existingNote.content}</p>
            </div>

            {/* 整合结果预览 */}
            {similarDialog.mergeResult && (
              <div className="bg-blue-50 rounded p-3 mb-4 max-h-40 overflow-y-auto">
                <p className="text-xs text-blue-500 mb-1">整合结果：</p>
                <p className="text-sm font-medium text-gray-700">{similarDialog.mergeResult.title}</p>
                <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{similarDialog.mergeResult.content}</p>
              </div>
            )}

            {/* 按钮区域 */}
            {similarDialog.mergeResult ? (
              /* 整合完成后：确认保存 / 取消 */
              <div className="flex gap-2">
                <button
                  onClick={() => handleDialogChoice('confirm-merge')}
                  disabled={similarDialog.merging}
                  className="flex-1 py-2 text-sm text-white bg-blue-500 hover:bg-blue-600 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  确认保存整合结果
                </button>
                <button
                  onClick={() => setSimilarDialog(null)}
                  disabled={similarDialog.merging}
                  className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  取消
                </button>
              </div>
            ) : similarDialog.merging ? (
              /* 整合中 */
              <div className="text-center py-3">
                <span className="text-sm text-blue-500 animate-pulse">AI 正在整合笔记...</span>
              </div>
            ) : (
              /* 初始选择：更新 / 整合 / 新建 */
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => handleDialogChoice('update')}
                    disabled={similarDialog.merging}
                    className="flex-1 py-2 text-sm text-white bg-orange-500 hover:bg-orange-600 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    更新已有
                  </button>
                  <button
                    onClick={handleMerge}
                    disabled={similarDialog.merging}
                    className="flex-1 py-2 text-sm text-white bg-blue-500 hover:bg-blue-600 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    整合合并
                  </button>
                  <button
                    onClick={() => handleDialogChoice('create')}
                    disabled={similarDialog.merging}
                    className="flex-1 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    仍然新建
                  </button>
                </div>
                <button
                  onClick={() => setSimilarDialog(null)}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  取消，不保存
                </button>
              </div>
            )}
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
