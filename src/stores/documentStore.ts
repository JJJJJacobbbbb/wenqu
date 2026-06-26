import { create } from 'zustand'
import { getDesktopHost } from '../lib/desktopHost'
import { getFileType } from '../lib/utils/fileType'
import { logger } from '../lib/logger'
import { generateId } from '../lib/id'

const DOC_PREFS_KEY = 'student-assistant-doc-prefs'

export interface DocumentTab {
  id: string
  filePath: string
  fileName: string
  fileType: 'pdf' | 'docx' | 'image' | 'text'
  content: string | ArrayBuffer | null
  scrollPosition: number
}

interface DocumentState {
  tabs: DocumentTab[]
  activeTabId: string | null
  selectionMode: boolean

  openFile: (filePath: string) => Promise<void>
  addLocalFiles: (files: File[]) => void
  closeTab: (tabId: string) => void
  setActiveTab: (tabId: string) => void
  getActiveDocumentContent: () => string | null
  getActiveDocument: () => DocumentTab | null
  toggleSelectionMode: () => void
  setSelectionMode: (mode: boolean) => void
}

function loadSelectionMode(): boolean {
  try {
    const saved = localStorage.getItem(DOC_PREFS_KEY)
    if (saved) return !!JSON.parse(saved).selectionMode
  } catch { /* ignore */ }
  return false
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  selectionMode: loadSelectionMode(),

  toggleSelectionMode: () => {
    set((s) => {
      const next = !s.selectionMode
      localStorage.setItem(DOC_PREFS_KEY, JSON.stringify({ selectionMode: next }))
      return { selectionMode: next }
    })
  },
  setSelectionMode: (mode) => {
    set({ selectionMode: mode })
    localStorage.setItem(DOC_PREFS_KEY, JSON.stringify({ selectionMode: mode }))
  },

  openFile: async (filePath) => {
    // 去重：如果已有相同文件路径的标签，直接激活
    const existing = get().tabs.find((t) => t.filePath === filePath)
    if (existing) {
      set({ activeTabId: existing.id })
      return
    }

    const host = getDesktopHost()
    const fileName = filePath.split(/[/\\]/).pop() || filePath
    const fileType = getFileType(fileName)
    if (!fileType) return

    try {
      let content: string | ArrayBuffer | null = null

      if (fileType === 'text') {
        content = await host.file.readText(filePath)
      } else {
        content = await host.file.read(filePath)
      }

      const id = generateId('doc-tab')
      const tab: DocumentTab = { id, filePath, fileName, fileType, content, scrollPosition: 0 }
      set((state) => ({ tabs: [...state.tabs, tab], activeTabId: id }))
    } catch (error) {
      logger.error('打开文件失败', error)
    }
  },

  addLocalFiles: (files) => {
    const validFiles = files.filter((file) => {
      const type = getFileType(file.name)
      if (!type) return false
      // Deduplicate: skip if already open
      const existing = get().tabs.find((t) => t.fileName === file.name)
      if (existing) {
        set({ activeTabId: existing.id })
        return false
      }
      return true
    })

    if (validFiles.length === 0) return

    let loaded = 0
    const total = validFiles.length

    for (const file of validFiles) {
      const fileType = getFileType(file.name)
      if (!fileType) continue

      const reader = new FileReader()
      reader.onload = () => {
        const raw = reader.result
        const content = fileType === 'text' ? (raw as string) : raw
        const id = generateId('doc-tab')
        const tab: DocumentTab = { id, filePath: file.name, fileName: file.name, fileType, content, scrollPosition: 0 }
        loaded++
        set((state) => ({
          tabs: [...state.tabs, tab],
          activeTabId: loaded === total ? id : state.activeTabId,
        }))
      }
      reader.onerror = () => {
        logger.error('读取文件失败', file.name)
        loaded++
        if (loaded === total) {
          // 所有文件都加载失败，确保 activeTabId 不指向不存在的 tab
          set((state) => {
            const currentActive = state.activeTabId
            const hasTab = currentActive && state.tabs.some((t) => t.id === currentActive)
            return hasTab ? {} : { activeTabId: state.tabs.length > 0 ? state.tabs[state.tabs.length - 1].id : null }
          })
        }
      }

      if (fileType === 'text') {
        reader.readAsText(file)
      } else {
        reader.readAsArrayBuffer(file)
      }
    }
  },

  closeTab: (tabId) => {
    set((state) => {
      const newTabs = state.tabs.filter((t) => t.id !== tabId)
      const newActiveTabId =
        state.activeTabId === tabId
          ? newTabs.length > 0
            ? newTabs[newTabs.length - 1].id
            : null
          : state.activeTabId

      return {
        tabs: newTabs,
        activeTabId: newActiveTabId,
      }
    })
  },

  setActiveTab: (tabId) => {
    set({ activeTabId: tabId })
  },

  getActiveDocumentContent: () => {
    const { tabs, activeTabId } = get()
    const activeTab = tabs.find((t) => t.id === activeTabId)
    if (!activeTab) return null

    if (activeTab.fileType === 'text' && typeof activeTab.content === 'string') {
      return activeTab.content
    }

    return null
  },

  getActiveDocument: () => {
    const { tabs, activeTabId } = get()
    return tabs.find((t) => t.id === activeTabId) || null
  },
}))
