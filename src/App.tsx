import { useEffect } from 'react'
import { useTabStore } from './stores/tabStore'
import { useSettingsStore } from './stores/settingsStore'
import { useNoteStore } from './stores/noteStore'
import { useSubjectStore } from './stores/subjectStore'
import { useAiStore } from './stores/aiStore'
import { getDesktopHost } from './lib/desktopHost'
import { logger } from './lib/logger'
import DocumentViewer from './components/document/DocumentViewer'
import SettingsPage from './components/settings/SettingsPage'
import NoteList from './components/notes/NoteList'

function App() {
  const { activeTabType, notesCollapsed, expandNotes } = useTabStore()
  const openSettings = useTabStore((s) => s.openSettings)
  const loadSettings = useSettingsStore((s) => s.loadFromStorage)
  const loadNotes = useNoteStore((s) => s.loadFromStorage)
  const loadSubjects = useSubjectStore((s) => s.loadFromStorage)
  const loadSessions = useAiStore((s) => s.loadFromStorage)

  useEffect(() => {
    loadSettings()
    loadNotes()
    loadSubjects()
    loadSessions()

    const host = getDesktopHost()
    let unmounted = false
    let cleanup: (() => void) | undefined
    host.events.listen<string>('navigate-to', (page: string) => {
      if (page === 'settings') openSettings()
    }).then((cb) => {
      if (unmounted) { cb() } else { cleanup = cb }
    }).catch(() => logger.warn('导航事件监听失败'))
    return () => { unmounted = true; cleanup?.() }
  }, [])

  const isNotesActive = activeTabType === 'notes' && !notesCollapsed

  return (
    <div className="h-screen bg-gray-50 flex">
      {/* 笔记收起状态：左侧窄条 */}
      {activeTabType === 'notes' && notesCollapsed && (
        <button
          onClick={expandNotes}
          className="w-8 bg-blue-50 border-r border-blue-200 flex items-center justify-center hover:bg-blue-100 transition-colors flex-shrink-0"
          title="展开笔记"
        >
          <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </button>
      )}

      {/* 主内容区 */}
      <div className={`flex-1 flex flex-col min-w-0 ${isNotesActive ? 'hidden' : ''}`}>
        <div className={`flex-1 flex flex-col ${activeTabType !== 'document' && !notesCollapsed ? 'hidden' : ''}`}>
          <DocumentViewer />
        </div>
        {activeTabType === 'settings' && <SettingsPage />}
      </div>

      {/* 笔记展开状态：占满剩余空间 */}
      {isNotesActive && <div className="flex-1 min-w-0"><NoteList /></div>}
    </div>
  )
}

export default App
