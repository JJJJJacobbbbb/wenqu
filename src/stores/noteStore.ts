import { create } from 'zustand'
import { useSettingsStore } from './settingsStore'
import { NOTE_PROMPTS, SIMILARITY_CHECK_PROMPT, MERGE_PROMPT, type GenerateNoteType } from '../config/notePrompts'
import { logger } from '../lib/logger'
import { generateId } from '../lib/id'

export type NoteCategory = 'knowledge' | 'technique' | 'other'

export const NOTE_CATEGORY_LABELS: Record<NoteCategory, string> = {
  knowledge: '知识重点',
  technique: '解题技巧',
  other: '其他',
}

const ALL_CATEGORIES: NoteCategory[] = ['knowledge', 'technique', 'other']

async function callAI(
  config: { apiUrl: string; apiKey: string },
  model: { modelId: string },
  systemPrompt: string,
  userContent: string,
): Promise<string | null> {
  let apiUrl = config.apiUrl.trim()
  if (!/\/chat\/completions\/?$/.test(apiUrl)) {
    apiUrl = apiUrl.replace(/\/$/, '') + '/chat/completions'
  }
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: model.modelId,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      stream: false,
    }),
  })
  if (!response.ok) return null
  const result = await response.json()
  return result.choices?.[0]?.message?.content || null
}

export interface Note {
  id: string
  title: string
  content: string
  subjectId: string | null
  category: NoteCategory
  chapter: string
  createdAt: number
  updatedAt: number
}

const STORAGE_KEY = 'student-assistant-notes'

export interface GeneratedNoteData {
  title: string
  content: string
  category: NoteCategory
  chapter: string
  existingNote?: Note // AI 检测到的相似笔记
}

interface NoteState {
  notes: Note[]
  filterSubjectId: string | null
  filterCategory: NoteCategory | null
  filterType: 'all' | 'subject'
  searchQuery: string

  addNote: (note: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>) => string
  updateNote: (id: string, updates: Partial<Pick<Note, 'title' | 'content' | 'subjectId' | 'category' | 'chapter'>>) => void
  removeNote: (id: string) => void
  setFilter: (type: 'all' | 'subject', subjectId?: string | null) => void
  setSearchQuery: (query: string) => void
  getFilteredNotes: () => Note[]

  generateNote: (userContent: string, assistantContent: string, subjectId: string | null, type: GenerateNoteType) => Promise<GeneratedNoteData | null>
  mergeNote: (existingNote: Note, newTitle: string, newContent: string) => Promise<{ title: string; content: string } | null>

  loadFromStorage: () => void
  saveToStorage: () => void
}

export const useNoteStore = create<NoteState>((set, get) => ({
  notes: [],
  filterSubjectId: null,
  filterCategory: null,
  filterType: 'all',
  searchQuery: '',

  addNote: (note) => {
    const id = generateId('note')
    const fullNote: Note = {
      ...note,
      id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    set((state) => ({
      notes: [fullNote, ...state.notes],
    }))
    get().saveToStorage()
    return id
  },

  updateNote: (id, updates) => {
    set((state) => ({
      notes: state.notes.map((note) =>
        note.id === id
          ? { ...note, ...updates, updatedAt: Date.now() }
          : note
      ),
    }))
    get().saveToStorage()
  },

  removeNote: (id) => {
    set((state) => ({
      notes: state.notes.filter((note) => note.id !== id),
    }))
    get().saveToStorage()
  },

  setFilter: (type, subjectId = null) => {
    set({ filterType: type, filterSubjectId: subjectId, filterCategory: null })
  },

  setSearchQuery: (query) => set({ searchQuery: query }),

  getFilteredNotes: () => {
    const { notes, filterType, filterSubjectId, filterCategory, searchQuery } = get()

    let filtered = [...notes]

    if (filterType === 'subject' && filterSubjectId) {
      filtered = filtered.filter((n) => n.subjectId === filterSubjectId)
    }

    if (filterCategory) {
      filtered = filtered.filter((n) => n.category === filterCategory)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q) ||
          (n.chapter && n.chapter.toLowerCase().includes(q))
      )
    }

    return filtered.sort((a, b) => b.updatedAt - a.updatedAt)
  },

  generateNote: async (userContent, assistantContent, subjectId, type) => {
    const settingsStore = useSettingsStore.getState()
    const modelInfo = settingsStore.getActiveModel()
    if (!modelInfo) return null

    const { config, model } = modelInfo

    try {
      // 1. 生成笔记
      const prompt = NOTE_PROMPTS[type]
      const text = await callAI(config, model, prompt, `学生的问题：\n${userContent}\n\nAI的回答：\n${assistantContent}`)
      if (!text) return null

      const category: NoteCategory = type === 'knowledge' ? 'knowledge' : type === 'technique' ? 'technique' : 'other'
      let title = ''
      let content = ''
      let chapter = '通用'

      const chapterMatch = text.match(/【章节】(.+)/)
      const titleMatch = text.match(/【标题】(.+)/)
      const contentMatch = text.match(/【内容】([\s\S]*)/)

      if (chapterMatch) chapter = chapterMatch[1].trim() || '通用'
      if (titleMatch) title = titleMatch[1].trim()
      if (contentMatch) content = contentMatch[1].trim()

      if (!title) title = userContent.slice(0, 20)
      if (!content) content = text

      // 2. AI 查重：在同科目+同分类的已有笔记中查找相似
      const { notes } = get()
      const candidates = notes.filter((n) => n.subjectId === subjectId && n.category === category)
      let existingNote: Note | undefined

      if (candidates.length > 0) {
        const candidateList = candidates
          .map((n) => `id: ${n.id} | 标题: ${n.title} | 内容摘要: ${n.content.slice(0, 100)}`)
          .join('\n')

        const checkResult = await callAI(
          config, model,
          SIMILARITY_CHECK_PROMPT,
          `【新笔记】\n标题：${title}\n内容：${content}\n\n【已有笔记列表】\n${candidateList}`
        )

        if (checkResult) {
          try {
            const match = checkResult.match(/\{[\s\S]*\}/)
            if (match) {
              const parsed = JSON.parse(match[0])
              if (parsed.similarId) {
                existingNote = candidates.find((n) => n.id === parsed.similarId)
              }
            }
          } catch { /* JSON 解析失败，视为无相似笔记 */ }
        }
      }

      return { title, content, category, chapter, existingNote }
    } catch (e) {
      logger.error('生成笔记失败', e)
      return null
    }
  },

  mergeNote: async (existingNote, newTitle, newContent) => {
    const settingsStore = useSettingsStore.getState()
    const modelInfo = settingsStore.getActiveModel()
    if (!modelInfo) return null

    const { config, model } = modelInfo

    try {
      const text = await callAI(
        config, model,
        MERGE_PROMPT,
        `【笔记A（已有）】\n标题：${existingNote.title}\n内容：${existingNote.content}\n\n【笔记B（新生成）】\n标题：${newTitle}\n内容：${newContent}`
      )
      if (!text) return null

      let title = newTitle
      let content = text

      const titleMatch = text.match(/【标题】(.+)/)
      const contentMatch = text.match(/【内容】([\s\S]*)/)

      if (titleMatch) title = titleMatch[1].trim()
      if (contentMatch) content = contentMatch[1].trim()

      return { title, content }
    } catch (e) {
      logger.error('整合笔记失败', e)
      return null
    }
  },

  loadFromStorage: () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        const notes = (parsed.notes || [])
          .filter((n: Record<string, unknown>) => n && n.id && n.title && n.content)
          .map((n: Record<string, unknown>) => {
            // 迁移旧分类: formula→knowledge, mistake→technique, custom→other
            let category = n.category || 'knowledge'
            if (!ALL_CATEGORIES.includes(category as NoteCategory)) {
              category = category === 'formula' ? 'knowledge' : category === 'custom' ? 'other' : 'technique'
            }
            return {
              ...n,
              category,
              chapter: n.chapter || '通用',
              createdAt: typeof n.createdAt === 'number' && !isNaN(n.createdAt as number) ? n.createdAt : Date.now(),
              updatedAt: typeof n.updatedAt === 'number' && !isNaN(n.updatedAt as number) ? n.updatedAt : Date.now(),
            }
          })
        set({ notes })
      }
    } catch (e) {
      logger.error('加载笔记失败', e)
    }
  },

  saveToStorage: () => {
    try {
      const { notes } = get()
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ notes }))
    } catch (e) {
      logger.error('保存笔记失败', e)
    }
  },
}))
