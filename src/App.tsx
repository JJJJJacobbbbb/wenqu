import { useEffect, lazy, Suspense, useState } from 'react'
import { useTabStore } from './stores/tabStore'
import { useSettingsStore } from './stores/settingsStore'
import { useNoteStore } from './stores/noteStore'
import { useSubjectStore } from './stores/subjectStore'
import { useAiStore } from './stores/aiStore'
import { getDesktopHost } from './lib/desktopHost'
import { logger } from './lib/logger'
import DocumentViewer from './components/document/DocumentViewer'
import ErrorBoundary from './components/shared/ErrorBoundary'
import Toast from './components/shared/Toast'

const SettingsPage = lazy(() => import('./components/settings/SettingsPage'))
const NoteList = lazy(() => import('./components/notes/NoteList'))

function App() {
  const { activeTabType, openDocument } = useTabStore()
  const openSettings = useTabStore((s) => s.openSettings)
  const loadSettings = useSettingsStore((s) => s.loadFromStorage)
  const loadNotes = useNoteStore((s) => s.loadFromStorage)
  const loadSubjects = useSubjectStore((s) => s.loadFromStorage)
  const loadSessions = useAiStore((s) => s.loadFromStorage)
  const [storageWarning, setStorageWarning] = useState<string | null>(null)

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

  // 监听存储空间警告
  useEffect(() => {
    const handler = (e: Event) => {
      const msg = (e as CustomEvent).detail
      if (typeof msg === 'string') setStorageWarning(msg)
    }
    window.addEventListener('storage-warning', handler)
    return () => window.removeEventListener('storage-warning', handler)
  }, [])

  // Escape 键返回文档页（输入框内不触发）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || activeTabType === 'document') return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return
      openDocument()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeTabType, openDocument])

  const isNotesActive = activeTabType === 'notes'
  const isSettingsActive = activeTabType === 'settings'

  return (
    <ErrorBoundary>
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
            <Suspense fallback={<div className="h-full flex items-center justify-center text-gray-400">加载中...</div>}>
              <SettingsPage />
            </Suspense>
          </div>
        )}

        {/* 笔记页 */}
        {isNotesActive && (
          <div className="flex-1 min-w-0">
            <Suspense fallback={<div className="h-full flex items-center justify-center text-gray-400">加载中...</div>}>
              <NoteList />
            </Suspense>
          </div>
        )}
      </div>
      {storageWarning && (
        <Toast message={storageWarning} type="error" onClose={() => setStorageWarning(null)} />
      )}
    </ErrorBoundary>
  )
}

export default App
