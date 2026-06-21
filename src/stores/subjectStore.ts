import { create } from 'zustand'
import { logger } from '../lib/logger'
import { generateId } from '../lib/id'
import { useAiStore } from './aiStore'
import { useNoteStore } from './noteStore'

export interface Subject {
  id: string
  name: string
  color: string
  createdAt: number
  updatedAt: number
}

const STORAGE_KEY = 'student-assistant-subjects'

const COLORS = [
  '#0ea5e9', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#6366f1', '#f43f5e', '#14b8a6',
]

function generateColor(): string {
  return COLORS[Math.floor(Math.random() * COLORS.length)]
}

interface SubjectState {
  subjects: Subject[]
  currentSubjectId: string | null

  addSubject: (name: string) => string
  removeSubject: (id: string) => void
  renameSubject: (id: string, newName: string) => void
  setCurrentSubject: (id: string | null) => void
  detectSubject: (content: string) => string | null
  loadFromStorage: () => void
  saveToStorage: () => void
}

export const useSubjectStore = create<SubjectState>((set, get) => ({
  subjects: [],
  currentSubjectId: 'main',

  addSubject: (name) => {
    const id = generateId('subject')
    const subject: Subject = {
      id,
      name,
      color: generateColor(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    set((state) => ({
      subjects: [...state.subjects, subject],
    }))
    get().saveToStorage()
    return id
  },

  removeSubject: (id) => {
    if (id === 'main') return // 不允许删除默认科目
    set((state) => ({
      subjects: state.subjects.filter((s) => s.id !== id),
      currentSubjectId: state.currentSubjectId === id ? null : state.currentSubjectId,
    }))
    // 清理关联的会话（将 subjectId 改为 'main'）
    try {
      const aiState = useAiStore.getState()
      for (const [sid, session] of Object.entries(aiState.sessions)) {
        if (session.subjectId === id) {
          useAiStore.setState((s) => ({
            sessions: {
              ...s.sessions,
              [sid]: { ...session, subjectId: 'main' },
            },
          }))
        }
      }
      aiState.saveToStorage()
    } catch { /* aiStore may not be initialized */ }
    // 清理关联的笔记（将 subjectId 改为 null）
    try {
      const noteState = useNoteStore.getState()
      for (const note of noteState.notes) {
        if (note.subjectId === id) {
          noteState.updateNote(note.id, { subjectId: null })
        }
      }
    } catch { /* noteStore may not be initialized */ }
    get().saveToStorage()
  },

  renameSubject: (id, newName) => {
    set((state) => ({
      subjects: state.subjects.map((s) =>
        s.id === id ? { ...s, name: newName, updatedAt: Date.now() } : s
      ),
    }))
    get().saveToStorage()
  },

  setCurrentSubject: (id) => {
    set({ currentSubjectId: id })
  },

  detectSubject: (content) => {
    const { subjects } = get()
    const lowerContent = content.toLowerCase()

    for (const subject of subjects) {
      if (lowerContent.includes(subject.name.toLowerCase())) {
        return subject.id
      }
    }

    const subjectKeywords: Record<string, string[]> = {
      '数学': ['数学', '函数', '方程', '几何', '代数', '微积分', '概率'],
      '物理': ['物理', '力学', '电磁', '光学', '热学', '牛顿'],
      '化学': ['化学', '元素', '反应', '分子', '原子', '有机'],
      '英语': ['英语', 'English', '单词', '语法', '翻译'],
      '语文': ['语文', '古诗', '作文', '阅读'],
      '生物': ['生物', '细胞', '基因', '遗传', '生态'],
      '历史': ['历史', '朝代', '战争', '革命'],
      '地理': ['地理', '气候', '地形', '地图'],
    }

    for (const [subject, keywords] of Object.entries(subjectKeywords)) {
      if (keywords.some((kw) => lowerContent.includes(kw))) {
        const existing = subjects.find(
          (s) => s.name.toLowerCase() === subject.toLowerCase()
        )
        if (existing) {
          return existing.id
        }
      }
    }

    return null
  },

  loadFromStorage: () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        let subjects = parsed.subjects || []
        // 确保存在默认的 'main' 学科
        if (!subjects.some((s: Subject) => s.id === 'main')) {
          subjects = [
            { id: 'main', name: '综合', color: '#0ea5e9', createdAt: Date.now(), updatedAt: Date.now() },
            ...subjects,
          ]
        }
        set({
          subjects,
          currentSubjectId: parsed.currentSubjectId !== undefined ? parsed.currentSubjectId : 'main',
        })
      } else {
        // 首次加载，创建默认学科
        set({
          subjects: [{ id: 'main', name: '综合', color: '#0ea5e9', createdAt: Date.now(), updatedAt: Date.now() }],
          currentSubjectId: 'main',
        })
      }
    } catch (e) {
      logger.error('加载学科失败', e)
    }
  },

  saveToStorage: () => {
    try {
      const { subjects, currentSubjectId } = get()
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ subjects, currentSubjectId })
      )
    } catch (e) {
      logger.error('保存学科失败', e)
    }
  },
}))
