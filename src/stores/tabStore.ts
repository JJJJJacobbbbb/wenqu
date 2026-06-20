import { create } from 'zustand'

export type TabType = 'document' | 'settings' | 'notes'

interface TabState {
  activeTabType: TabType
  openDocument: () => void
  openSettings: () => void
  openNotes: () => void
  closeNotes: () => void
}

export const useTabStore = create<TabState>((set) => ({
  activeTabType: 'document',

  openDocument: () => set({ activeTabType: 'document' }),
  openSettings: () => set({ activeTabType: 'settings' }),
  openNotes: () => set({ activeTabType: 'notes' }),
  closeNotes: () => set({ activeTabType: 'document' }),
}))
