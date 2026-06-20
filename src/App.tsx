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
  const { activeTabType } = useTabStore()
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

  const isNotesActive = activeTabType === 'notes'
  const isSettingsActive = activeTabType === 'settings'

  return (
    <div className="h-screen bg-gray-50 flex">
      {/* 主内容区：文档 */}
      {!isNotesActive && !isSettingsActive && (
        <div className="flex-1 min-w-0">
          <DocumentViewer />
        </div>
      )}

      {/* 设置页 */}
      {isSettingsActive && (
        <div className="flex-1 min-w-0">
          <SettingsPage />
        </div>
      )}

      {/* 笔记页 */}
      {isNotesActive && (
        <div className="flex-1 min-w-0">
          <NoteList />
        </div>
      )}
    </div>
  )
}

export default App
