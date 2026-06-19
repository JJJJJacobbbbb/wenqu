import { useState, useMemo } from 'react'
import { useNoteStore, NOTE_CATEGORY_LABELS, type NoteCategory, type Note } from '../../stores/noteStore'
import { useSubjectStore } from '../../stores/subjectStore'
import { useTabStore } from '../../stores/tabStore'
import { exportNotes, exportBySubjectBatch, exportBySubjectCategoryBatch } from '../../lib/noteExport'
import NoteCard from './NoteCard'
import WinControls from '../shared/WinControls'

export default function NoteList() {
  const {
    notes, filterType, filterSubjectId, filterCategory, searchQuery,
    setFilter, setSearchQuery, getFilteredNotes,
  } = useNoteStore()
  const { subjects } = useSubjectStore()
  const { openDocument, collapseNotes } = useTabStore()

  const [showExportMenu, setShowExportMenu] = useState(false)

  const filteredNotes = useMemo(() => getFilteredNotes(), [notes, filterType, filterSubjectId, filterCategory, searchQuery])

  // 统计
  const stats = useMemo(() => {
    const bySubject: Record<string, number> = {}
    for (const note of notes) {
      if (note.subjectId) {
        bySubject[note.subjectId] = (bySubject[note.subjectId] || 0) + 1
      }
    }
    return { bySubject, total: notes.length }
  }, [notes])

  const subjectsWithNotes = subjects.filter((s) => stats.bySubject[s.id])

  // 按 subject → category 分组
  const grouped = useMemo(() => {
    const result: { subjectId: string | null; subjectName: string; subjectColor: string; categories: { category: NoteCategory; notes: Note[] }[] }[] = []
    const subjectIds = filterType === 'subject' && filterSubjectId
      ? [filterSubjectId]
      : [...new Set(filteredNotes.map((n) => n.subjectId))]

    for (const sid of subjectIds) {
      const subjectNotes = filteredNotes.filter((n) => n.subjectId === sid)
      if (subjectNotes.length === 0) continue
      const subject = subjects.find((s) => s.id === sid)
      const categories: { category: NoteCategory; notes: Note[] }[] = []
      for (const cat of ['knowledge', 'technique', 'other'] as NoteCategory[]) {
        const catNotes = subjectNotes.filter((n) => n.category === cat)
        if (catNotes.length > 0) categories.push({ category: cat, notes: catNotes })
      }
      result.push({
        subjectId: sid,
        subjectName: subject?.name || '未分类',
        subjectColor: subject?.color || '#9ca3af',
        categories,
      })
    }
    return result
  }, [filteredNotes, filterType, filterSubjectId, subjects])

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
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="h-10 flex items-center justify-between pl-4">
          <div className="flex items-center gap-3" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <button
              onClick={collapseNotes}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="收起笔记"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={openDocument}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="关闭笔记"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h1 className="font-semibold text-gray-800">笔记</h1>
          </div>

          <div className="flex items-center gap-1 h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
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
          <div className="px-4 pb-3" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
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
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}

        {/* 科目筛选 */}
        {notes.length > 0 && subjectsWithNotes.length > 0 && (
          <div className="px-4 pb-3" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <div className="flex items-center gap-2 overflow-x-auto">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1.5 text-xs rounded-full whitespace-nowrap transition-colors ${
                  filterType === 'all' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                全部
              </button>
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
                  className={`px-3 py-1.5 text-xs rounded-full whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                    filterType === 'subject' && filterSubjectId === s.id
                      ? 'text-white'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                  style={filterType === 'subject' && filterSubjectId === s.id ? { backgroundColor: s.color } : undefined}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: filterType === 'subject' && filterSubjectId === s.id ? 'white' : s.color }} />
                  {s.name}
                  <span className="text-[10px] opacity-70">{stats.bySubject[s.id]}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* 内容区 - 按科目→类型分组 */}
      <div className="flex-1 overflow-y-auto p-4">
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
            </div>
          </div>
        ) : filteredNotes.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-400">
            <div className="text-center">
              <p className="text-sm">没有匹配的笔记</p>
              <button
                onClick={() => { setSearchQuery(''); setFilter('all') }}
                className="mt-2 text-sm text-blue-500 hover:text-blue-600"
              >
                清除筛选条件
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map((group) => (
              <div key={group.subjectId || '__none'}>
                {/* 科目标题 */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: group.subjectColor }} />
                  <h2 className="text-sm font-semibold text-gray-700">{group.subjectName}</h2>
                  <span className="text-xs text-gray-400">
                    {group.categories.reduce((sum, c) => sum + c.notes.length, 0)} 条
                  </span>
                </div>

                {/* 分类子区域 */}
                {group.categories.map((catGroup) => (
                  <div key={catGroup.category} className="mb-4 ml-4">
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="text-xs font-medium text-gray-500">{NOTE_CATEGORY_LABELS[catGroup.category]}</span>
                      <span className="text-[10px] text-gray-400">{catGroup.notes.length}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {catGroup.notes.map((note) => (
                        <NoteCard key={note.id} note={note} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
