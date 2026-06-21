import { useState } from 'react'
import { useSubjectStore } from '../../stores/subjectStore'
import { useAiStore } from '../../stores/aiStore'
import { useNoteStore } from '../../stores/noteStore'
import { NOTE_CATEGORY_LABELS } from '../../stores/noteStore'
import ConfirmDialog from '../shared/ConfirmDialog'

type ViewMode = 'overview' | 'sessions' | 'notes'

export default function MemoryManager() {
  const { subjects, removeSubject } = useSubjectStore()
  const { sessions, listSessionsBySubject, deleteSession } = useAiStore()
  const { notes, removeNote } = useNoteStore()

  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('overview')
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string
    message: string
    onConfirm: () => void
  } | null>(null)

  const selectedSubject = subjects.find((s) => s.id === selectedSubjectId)

  // 缓存当前选中科目的会话和笔记列表，避免重复计算
  const subjectSessions = selectedSubjectId ? listSessionsBySubject(selectedSubjectId) : []
  const subjectNotes = selectedSubjectId ? notes.filter((n) => n.subjectId === selectedSubjectId) : []

  const getSubjectStats = (subjectId: string) => {
    const subjectSessions = Object.values(sessions).filter((s) => s.subjectId === subjectId)
    const subjectNotes = notes.filter((n) => n.subjectId === subjectId)
    const totalMessages = subjectSessions.reduce((sum, s) => sum + s.messages.length, 0)
    return {
      sessionCount: subjectSessions.length,
      noteCount: subjectNotes.length,
      totalMessages,
    }
  }

  const handleDeleteSubject = (subjectId: string) => {
    setConfirmDialog({
      title: '删除科目',
      message: '确定删除此科目？将同时删除该科目下所有会话和笔记。',
      onConfirm: () => {
        const subjectSessions = Object.values(sessions).filter((s) => s.subjectId === subjectId)
        subjectSessions.forEach((s) => deleteSession(s.id))
        const subjectNotes = notes.filter((n) => n.subjectId === subjectId)
        subjectNotes.forEach((n) => removeNote(n.id))
        removeSubject(subjectId)
        if (selectedSubjectId === subjectId) setSelectedSubjectId(null)
        setConfirmDialog(null)
      },
    })
  }

  const handleDeleteAllSessions = (subjectId: string) => {
    setConfirmDialog({
      title: '清空会话',
      message: '确定清空此科目所有会话？',
      onConfirm: () => {
        const subjectSessions = Object.values(sessions).filter((s) => s.subjectId === subjectId)
        subjectSessions.forEach((s) => deleteSession(s.id))
        setConfirmDialog(null)
      },
    })
  }

  const handleDeleteAllNotes = (subjectId: string) => {
    setConfirmDialog({
      title: '清空笔记',
      message: '确定清空此科目所有笔记？',
      onConfirm: () => {
        const subjectNotes = notes.filter((n) => n.subjectId === subjectId)
        subjectNotes.forEach((n) => removeNote(n.id))
        setConfirmDialog(null)
      },
    })
  }

  // 统计全局数据
  const totalSessions = Object.keys(sessions).length
  const totalNotes = notes.length

  return (
    <div className="max-w-2xl">
      <h2 className="text-lg font-medium text-gray-800 mb-1">存储管理</h2>
      <p className="text-xs text-gray-400 mb-4">管理各科目的会话和笔记数据</p>

      {/* 全局概览 */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-blue-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-blue-600">{subjects.length}</p>
          <p className="text-xs text-blue-500 mt-0.5">科目</p>
        </div>
        <div className="bg-green-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-green-600">{totalSessions}</p>
          <p className="text-xs text-green-500 mt-0.5">会话</p>
        </div>
        <div className="bg-purple-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-purple-600">{totalNotes}</p>
          <p className="text-xs text-purple-500 mt-0.5">笔记</p>
        </div>
      </div>

      {selectedSubjectId && selectedSubject ? (
        /* 科目详情视图 */
        <div>
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => setSelectedSubjectId(null)}
              className="text-gray-500 hover:text-gray-700"
              aria-label="返回列表"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedSubject.color }} />
            <h3 className="font-medium text-gray-800">{selectedSubject.name}</h3>
          </div>

          {/* 子视图切换 */}
          <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-0.5">
            {(['overview', 'sessions', 'notes'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${
                  viewMode === mode ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {mode === 'overview' ? '概览' : mode === 'sessions' ? '会话' : '笔记'}
              </button>
            ))}
          </div>

          {viewMode === 'overview' && (
            <div className="space-y-3">
              {(() => {
                const stats = getSubjectStats(selectedSubjectId)
                return (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
                        <p className="text-xl font-bold text-gray-700">{stats.sessionCount}</p>
                        <p className="text-xs text-gray-400">会话</p>
                      </div>
                      <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
                        <p className="text-xl font-bold text-gray-700">{stats.noteCount}</p>
                        <p className="text-xs text-gray-400">笔记</p>
                      </div>
                      <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
                        <p className="text-xl font-bold text-gray-700">{stats.totalMessages}</p>
                        <p className="text-xs text-gray-400">消息</p>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={() => setViewMode('sessions')}
                        className="flex-1 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600"
                      >
                        管理会话
                      </button>
                      <button
                        onClick={() => setViewMode('notes')}
                        className="flex-1 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600"
                      >
                        管理笔记
                      </button>
                    </div>
                    <button
                      onClick={() => handleDeleteSubject(selectedSubjectId)}
                      className="w-full py-2 text-xs border border-red-200 text-red-500 rounded-lg hover:bg-red-50"
                    >
                      删除此科目及所有数据
                    </button>
                  </>
                )
              })()}
            </div>
          )}

          {viewMode === 'sessions' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500">
                  {subjectSessions.length} 个会话
                </span>
                <button
                  onClick={() => handleDeleteAllSessions(selectedSubjectId)}
                  className="text-xs text-red-500 hover:text-red-600"
                >
                  清空全部
                </button>
              </div>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {subjectSessions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between p-2.5 border border-gray-200 rounded-lg bg-white">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-gray-700 truncate">{s.name}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{s.messages.length} 条消息</p>
                    </div>
                    <button
                      onClick={() => deleteSession(s.id)}
                      className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded flex-shrink-0"
                      aria-label="删除会话"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
                {subjectSessions.length === 0 && (
                  <p className="text-center text-xs text-gray-400 py-6">暂无会话</p>
                )}
              </div>
            </div>
          )}

          {viewMode === 'notes' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500">
                  {subjectNotes.length} 条笔记
                </span>
                <button
                  onClick={() => handleDeleteAllNotes(selectedSubjectId)}
                  className="text-xs text-red-500 hover:text-red-600"
                >
                  清空全部
                </button>
              </div>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {subjectNotes.map((n) => (
                  <div key={n.id} className="flex items-center justify-between p-2.5 border border-gray-200 rounded-lg bg-white">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-medium text-gray-700 truncate">{n.title}</p>
                        <span className="text-[9px] px-1 py-0.5 rounded bg-gray-100 text-gray-500 flex-shrink-0">
                          {NOTE_CATEGORY_LABELS[n.category]}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-1">{n.content}</p>
                    </div>
                    <button
                      onClick={() => removeNote(n.id)}
                      className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded flex-shrink-0"
                      aria-label="删除笔记"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
                {subjectNotes.length === 0 && (
                  <p className="text-center text-xs text-gray-400 py-6">暂无笔记</p>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* 科目列表视图 */
        <div className="space-y-2">
          {subjects.map((subject) => {
            const stats = getSubjectStats(subject.id)
            const isExpanded = expandedSubject === subject.id
            return (
              <div key={subject.id} className="border border-gray-200 rounded-lg bg-white overflow-hidden">
                <div
                  onClick={() => setExpandedSubject(isExpanded ? null : subject.id)}
                  className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50"
                >
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: subject.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700">{subject.name}</p>
                    <p className="text-[10px] text-gray-400">
                      {stats.sessionCount} 会话 · {stats.noteCount} 笔记 · {stats.totalMessages} 消息
                    </p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelectedSubjectId(subject.id) }}
                    className="text-xs text-blue-500 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50"
                  >
                    管理
                  </button>
                  <svg
                    className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100 p-3 bg-gray-50 space-y-2">
                    {Object.values(sessions)
                      .filter((s) => s.subjectId === subject.id)
                      .slice(0, 3)
                      .map((s) => (
                        <div key={s.id} className="flex items-center justify-between text-xs">
                          <span className="text-gray-600 truncate flex-1">{s.name}</span>
                          <span className="text-gray-400 text-[10px] ml-2">{s.messages.length} 条</span>
                        </div>
                      ))}
                    {Object.values(sessions).filter((s) => s.subjectId === subject.id).length === 0 && (
                      <p className="text-xs text-gray-400">暂无会话</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {subjects.length === 0 && (
            <div className="text-center text-gray-400 py-10">
              <p className="text-sm">暂无科目数据</p>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDialog}
        title={confirmDialog?.title || ''}
        message={confirmDialog?.message || ''}
        confirmLabel="确认"
        danger
        onConfirm={() => confirmDialog?.onConfirm()}
        onCancel={() => setConfirmDialog(null)}
      />
    </div>
  )
}
