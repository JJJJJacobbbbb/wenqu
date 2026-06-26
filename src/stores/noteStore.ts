import { create } from 'zustand'
import { useSettingsStore } from './settingsStore'
import { NOTE_PROMPTS, type GenerateNoteType } from '../config/notePrompts'
import { logger } from '../lib/logger'
import { generateId } from '../lib/id'
import { NOTES_DEBOUNCE_MS } from '../lib/constants'

export type NoteCategory = 'knowledge' | 'technique' | 'other'

export const NOTE_CATEGORY_LABELS: Record<NoteCategory, string> = {
  knowledge: '知识重点',
  technique: '解题技巧',
  other: '其他',
}

const ALL_CATEGORIES: NoteCategory[] = ['knowledge', 'technique', 'other']

const NOTE_MAX_CHARS = 8000 // 限制输入字符数，避免上下文过长

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
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60000)
  try {
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
        stream: true,
        max_tokens: 2048,
      }),
      signal: controller.signal,
    })
    if (!response.ok) return null
    if (!response.body) return null

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let fullText = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6)
        if (data === '[DONE]') break
        try {
          const parsed = JSON.parse(data)
          const content = parsed.choices?.[0]?.delta?.content
          if (content) fullText += content
        } catch {}
      }
    }

    return fullText || null
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
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
}

interface NoteState {
  notes: Note[]
  filterSubjectId: string | null
  filterType: 'all' | 'subject'
  searchQuery: string

  addNote: (note: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>) => string
  updateNote: (id: string, updates: Partial<Pick<Note, 'title' | 'content' | 'subjectId' | 'category' | 'chapter'>>) => void
  removeNote: (id: string) => void
  setFilter: (type: 'all' | 'subject', subjectId?: string | null) => void
  setSearchQuery: (query: string) => void
  getFilteredNotes: () => Note[]

  generateNote: (userContent: string, assistantContent: string, subjectId: string | null, type: GenerateNoteType, extraInstructions?: string) => Promise<GeneratedNoteData | null>
  generateNoteStream: (userContent: string, assistantContent: string, subjectId: string | null, type: GenerateNoteType, onChunk: (text: string) => void, extraInstructions?: string, signal?: AbortSignal) => Promise<GeneratedNoteData | null>

  loadFromStorage: () => void
  saveToStorage: () => void
}

export const useNoteStore = create<NoteState>((set, get) => {
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  const debouncedSave = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      get().saveToStorage()
    }, NOTES_DEBOUNCE_MS)
  }

  return {
    notes: [],
    filterSubjectId: null,
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
    debouncedSave()
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
    debouncedSave()
  },

  removeNote: (id) => {
    set((state) => ({
      notes: state.notes.filter((note) => note.id !== id),
    }))
    debouncedSave()
  },

  setFilter: (type, subjectId = null) => {
    set({ filterType: type, filterSubjectId: subjectId })
  },

  setSearchQuery: (query) => set({ searchQuery: query }),

  getFilteredNotes: () => {
    const { notes, filterType, filterSubjectId, searchQuery } = get()

    let filtered = [...notes]

    if (filterType === 'subject' && filterSubjectId) {
      filtered = filtered.filter((n) => n.subjectId === filterSubjectId)
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

  generateNote: async (userContent, assistantContent, _subjectId, type, extraInstructions) => {
    const settingsStore = useSettingsStore.getState()
    const modelInfo = settingsStore.getActiveModel()
    if (!modelInfo) return null

    const { config, model } = modelInfo

    try {
      // 1. 截断过长输入，避免上下文超限
      const truncatedUser = userContent.length > NOTE_MAX_CHARS
        ? userContent.slice(0, NOTE_MAX_CHARS) + '\n...[内容过长已截断]'
        : userContent
      const truncatedAssistant = assistantContent.length > NOTE_MAX_CHARS
        ? assistantContent.slice(0, NOTE_MAX_CHARS) + '\n...[内容过长已截断]'
        : assistantContent

      // 2. 生成笔记
      const prompt = NOTE_PROMPTS[type]
      let userMsg = `学生的问题：\n${truncatedUser}\n\nAI的回答：\n${truncatedAssistant}`
      if (extraInstructions) {
        userMsg += `\n\n用户补充要求：${extraInstructions}`
      }
      const text = await callAI(config, model, prompt, userMsg)
      if (!text) return null

      // 3. 解析笔记结构
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

      return { title, content, category, chapter }
    } catch (e) {
      logger.error('生成笔记失败', e)
      return null
    }
  },

  generateNoteStream: async (userContent, assistantContent, _subjectId, type, onChunk, extraInstructions, signal) => {
    const settingsStore = useSettingsStore.getState()
    const modelInfo = settingsStore.getActiveModel()
    if (!modelInfo) return null

    const { config, model } = modelInfo

    try {
      const truncatedUser = userContent.length > NOTE_MAX_CHARS
        ? userContent.slice(0, NOTE_MAX_CHARS) + '\n...[内容过长已截断]'
        : userContent
      const truncatedAssistant = assistantContent.length > NOTE_MAX_CHARS
        ? assistantContent.slice(0, NOTE_MAX_CHARS) + '\n...[内容过长已截断]'
        : assistantContent

      const prompt = NOTE_PROMPTS[type]
      let userMsg = `学生的问题：\n${truncatedUser}\n\nAI的回答：\n${truncatedAssistant}`
      if (extraInstructions) {
        userMsg += `\n\n用户补充要求：${extraInstructions}`
      }

      let apiUrl = config.apiUrl.trim()
      if (!/\/chat\/completions\/?$/.test(apiUrl)) {
        apiUrl = apiUrl.replace(/\/$/, '') + '/chat/completions'
      }
      const controller = new AbortController()
      // 合并外部 signal 和内部超时 signal
      if (signal) {
        if (signal.aborted) controller.abort()
        else signal.addEventListener('abort', () => controller.abort(), { once: true })
      }
      const timeout = setTimeout(() => controller.abort(), 60000)

      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: model.modelId,
            messages: [
              { role: 'system', content: prompt },
              { role: 'user', content: userMsg },
            ],
            stream: true,
            max_tokens: 2048,
          }),
          signal: controller.signal,
        })

        if (!response.ok) return null
        if (!response.body) return null

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let fullText = ''
        let buffer = ''
        let dataLines: string[] = []

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              dataLines.push(line.slice(6))
            } else if (line.trim() === '' && dataLines.length > 0) {
              const data = dataLines.join('\n')
              dataLines = []
              if (data === '[DONE]') break
              try {
                const parsed = JSON.parse(data)
                const content = parsed.choices?.[0]?.delta?.content
                if (content) {
                  fullText += content
                  onChunk(fullText)
                }
              } catch { /* ignore parse errors */ }
            }
          }
        }
        // 处理 buffer 中残留的 data
        if (dataLines.length > 0) {
          const data = dataLines.join('\n')
          if (data !== '[DONE]') {
            try {
              const parsed = JSON.parse(data)
              const content = parsed.choices?.[0]?.delta?.content
              if (content) {
                fullText += content
                onChunk(fullText)
              }
            } catch { /* ignore parse errors */ }
          }
        }

        if (!fullText) return null

        const category: NoteCategory = type === 'knowledge' ? 'knowledge' : type === 'technique' ? 'technique' : 'other'
        let title = ''
        let content = ''
        let chapter = '通用'

        const chapterMatch = fullText.match(/【章节】(.+)/)
        const titleMatch = fullText.match(/【标题】(.+)/)
        const contentMatch = fullText.match(/【内容】([\s\S]*)/)

        if (chapterMatch) chapter = chapterMatch[1].trim() || '通用'
        if (titleMatch) title = titleMatch[1].trim()
        if (contentMatch) content = contentMatch[1].trim()

        if (!title) title = userContent.slice(0, 20)
        if (!content) content = fullText

        return { title, content, category, chapter }
      } finally {
        clearTimeout(timeout)
      }
    } catch (e) {
      if (signal?.aborted) return null
      logger.error('流式生成笔记失败', e)
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
            // 迁移旧分类: formula→knowledge, custom→other, 其他未知→other
            let category = n.category || 'knowledge'
            if (!ALL_CATEGORIES.includes(category as NoteCategory)) {
              category = category === 'formula' ? 'knowledge' : 'other'
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
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        logger.error('localStorage 空间不足，尝试清理旧笔记')
        window.dispatchEvent(new CustomEvent('storage-warning', { detail: '存储空间不足，已自动清理最早的笔记' }))
        try {
          const { notes } = get()
          // 删除最旧的笔记直到数量减半
          const sorted = [...notes].sort((a, b) => a.updatedAt - b.updatedAt)
          const toRemove = new Set(sorted.slice(0, Math.ceil(sorted.length / 2)).map(n => n.id))
          set({ notes: notes.filter(n => !toRemove.has(n.id)) })
          get().saveToStorage()
        } catch { /* give up */ }
      } else {
        logger.error('保存笔记失败', e)
      }
    }
  },
}})
