import { useState, useMemo } from 'react'
import { useNoteStore, type NoteCategory } from '../../stores/noteStore'
import { useSubjectStore } from '../../stores/subjectStore'
import { useTabStore } from '../../stores/tabStore'
import { exportNotes, exportBySubjectBatch, exportBySubjectCategoryBatch } from '../../lib/noteExport'
import { dragRegion, noDragRegion } from '../../lib/styles'
import NoteCard from './NoteCard'
import WinControls from '../shared/WinControls'

const CATEGORY_FILTERS: { key: NoteCategory | null; label: string }[] = [
  { key: null, label: '全部' },
  { key: 'knowledge', label: '知识重点' },
  { key: 'technique', label: '解题技巧' },
  { key: 'other', label: '其他' },
]

const CATEGORY_COLORS: Record<NoteCategory, string> = {
  knowledge: '#8b5cf6',
  technique: '#f59e0b',
  other: '#6b7280',
}

export default function NoteList() {
  const {
    notes, filterType, filterSubjectId, searchQuery,
    setFilter, setSearchQuery, getFilteredNotes,
  } = useNoteStore()
  const { subjects } = useSubjectStore()
  const { closeNotes } = useTabStore()

  const [showExportMenu, setShowExportMenu] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<NoteCategory | null>(null)

  const filteredNotes = useMemo(() => {
    let result = getFilteredNotes()
    if (categoryFilter) {
      result = result.filter((n) => n.category === categoryFilter)
    }
    return result
  }, [notes, filterType, filterSubjectId, searchQuery, categoryFilter])

  // 统计
  const stats = useMemo(() => {
    const bySubject: Record<string, number> = {}
    const byCategory: Record<NoteCategory, number> = { knowledge: 0, technique: 0, other: 0 }
    for (const note of notes) {
      if (note.subjectId) {
        bySubject[note.subjectId] = (bySubject[note.subjectId] || 0) + 1
      }
      byCategory[note.category]++
    }
    return { bySubject, byCategory, total: notes.length }
  }, [notes])

  const subjectsWithNotes = subjects.filter((s) => stats.bySubject[s.id])

  const handleExportAll = async () => {
    setShowExportMenu(false)
    await exportNotes(notes, subjects, '问渠笔记_全部')
  }

  const handleExportBySubject = async () => {
    setShowExportMenu(false)
    await exportBySubjectBatch(notes, subjects)
  }

  const handleExportBySubjectCategory = async () => {
    setShowExportMenu(false)
    await exportBySubjectCategoryBatch(notes, subjects)
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <header
        className="bg-white border-b border-gray-200 shrink-0 select-none"
        style={dragRegion}
      >
        <div className="h-10 flex items-center justify-between pl-4">
          <div className="flex items-center gap-3" style={noDragRegion}>
            <button
              onClick={closeNotes}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="返回文档"
              aria-label="返回文档"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="font-semibold text-gray-800">笔记</h1>
          </div>

          <div className="flex items-center gap-1 h-full" style={noDragRegion}>
            {notes.length > 0 && (
              <div className="relative h-full">
                <button
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  className="h-full px-3 flex items-center gap-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 text-sm transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  导出
                </button>

                {showExportMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowExportMenu(false)} />
                    <div className="absolute right-0 top-full mt-0 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-20 overflow-hidden py-1">
                      <button
                        onClick={handleExportAll}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center justify-between"
                      >
                        <span>导出全部</span>
                        <span className="text-xs text-gray-400">{notes.length} 条</span>
                      </button>
                      <button
                        onClick={handleExportBySubject}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        按科目导出（每个科目一个文件）
                      </button>
                      <button
                        onClick={handleExportBySubjectCategory}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        按科目+类型导出
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            <WinControls />
          </div>
        </div>

        {/* 搜索栏 */}
        {notes.length > 0 && (
          <div className="px-4 pb-3" style={noDragRegion}>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索笔记..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-gray-100 border border-transparent rounded-lg focus:outline-none focus:bg-white focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label="清除搜索"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}

        {/* 类型筛选标签 */}
        {notes.length > 0 && (
          <div className="px-4 pb-3" style={noDragRegion}>
            <div className="flex items-center gap-2 overflow-x-auto">
              {CATEGORY_FILTERS.map((f) => {
                const isActive = categoryFilter === f.key
                const count = f.key ? stats.byCategory[f.key] : stats.total
                const color = f.key ? CATEGORY_COLORS[f.key] : '#3b82f6'
                return (
                  <button
                    key={f.key || 'all'}
                    onClick={() => setCategoryFilter(f.key)}
                    className={`px-3 py-1.5 text-xs rounded-full whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                      isActive ? 'text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                    style={isActive ? { backgroundColor: color } : undefined}
                  >
                    {f.key && (
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: isActive ? 'white' : color }} />
                    )}
                    {f.label}
                    <span className="text-[10px] opacity-70">{count}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </header>

      {/* Body: sidebar + content */}
      <div className="flex-1 flex min-h-0">
        {/* 左侧科目栏 */}
        {subjectsWithNotes.length > 0 && (
          <aside
            className="w-40 shrink-0 bg-white border-r border-gray-200 overflow-y-auto py-2 select-none"
            style={noDragRegion}
          >
            <button
              onClick={() => setFilter('all')}
              className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
                filterType === 'all' && !filterSubjectId
                  ? 'bg-blue-50 text-blue-600 font-medium'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span className="text-base">📚</span>
              所有科目
              <span className="ml-auto text-[10px] text-gray-400">{stats.total}</span>
            </button>
            <div className="h-px bg-gray-100 my-1" />
            {subjectsWithNotes.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  if (filterSubjectId === s.id && filterType === 'subject') {
                    setFilter('all')
                  } else {
                    setFilter('subject', s.id)
                  }
                }}
                className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
                  filterType === 'subject' && filterSubjectId === s.id
                    ? 'font-medium'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
                style={filterType === 'subject' && filterSubjectId === s.id
                  ? { backgroundColor: s.color + '15', color: s.color }
                  : undefined}
              >
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                <span className="truncate">{s.name}</span>
                <span className="ml-auto text-[10px] text-gray-400">{stats.bySubject[s.id]}</span>
              </button>
            ))}
          </aside>
        )}

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto p-3">
          {notes.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-400">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-base font-medium text-gray-500">暂无笔记</p>
                <p className="text-sm mt-1">在对话中生成笔记后会自动显示在这里</p>
                <button
                  onClick={closeNotes}
                  className="mt-3 px-4 py-2 text-sm text-blue-500 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                >
                  返回文档
                </button>
              </div>
            </div>
          ) : filteredNotes.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-400">
              <div className="text-center">
                <p className="text-sm">没有匹配的笔记</p>
                <button
                  onClick={() => { setSearchQuery(''); setCategoryFilter(null); setFilter('all') }}
                  className="mt-2 text-sm text-blue-500 hover:text-blue-600"
                >
                  清除筛选条件
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredNotes.map((note) => (
                <NoteCard key={note.id} note={note} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
