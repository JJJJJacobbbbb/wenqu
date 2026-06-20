import { create } from 'zustand'
import { useSettingsStore } from './settingsStore'
import { useSubjectStore } from './subjectStore'
import { logger } from '../lib/logger'
import { SESSION_DEBOUNCE_MS } from '../lib/constants'
import { generateId } from '../lib/id'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  type: 'text' | 'screenshot' | 'file'
  screenshotData?: string
  fileName?: string
}

export interface AiSession {
  id: string
  subjectId: string
  name: string
  messages: Message[]
  contextWindow: Message[]  // 当前题目的上下文（用于 API 调用）
  chatState: 'idle' | 'thinking' | 'streaming' | 'error'
  streamingText: string
  error: string | null
  createdAt: number
  updatedAt: number
}

interface AiState {
  sessions: Record<string, AiSession>
  activeSessionId: string | null
  abortController: AbortController | null
  pendingScreenshots: string[]
  thinkingMode: boolean
  messageDropped: boolean

  getActiveSession: () => AiSession | null
  createSession: () => string
  switchSession: (sessionId: string) => void
  deleteSession: (sessionId: string) => void
  listSessionsBySubject: (subjectId: string) => AiSession[]

  sendMessage: (content: string, screenshotData?: string | string[]) => Promise<void>
  stopGeneration: () => void
  clearError: (sessionId: string) => void

  addPendingScreenshot: (data: string) => void
  removePendingScreenshot: (index: number) => void
  clearPendingScreenshots: () => void
  setThinkingMode: (on: boolean) => void
  setMessageDropped: (v: boolean) => void

  loadFromStorage: () => void
  saveToStorage: () => void
}

const SESSION_STORAGE_KEY = 'student-assistant-sessions'

let sessionSaveTimer: ReturnType<typeof setTimeout> | null = null
function debouncedSessionSave() {
  if (sessionSaveTimer) clearTimeout(sessionSaveTimer)
  sessionSaveTimer = setTimeout(() => {
    useAiStore.getState().saveToStorage()
  }, SESSION_DEBOUNCE_MS)
}

function generateSessionName(content: string): string {
  const clean = content.replace(/\n/g, ' ').trim()
  return clean.length > 20 ? clean.slice(0, 20) + '...' : clean
}

let sendMessageLock = false

export const useAiStore = create<AiState>((set, get) => ({
  sessions: {},
  activeSessionId: null,
  abortController: null,
  pendingScreenshots: [],
  thinkingMode: false,
  messageDropped: false,

  getActiveSession: () => {
    const { sessions, activeSessionId } = get()
    if (!activeSessionId) return null
    return sessions[activeSessionId] || null
  },

  createSession: () => {
    const subjectStore = useSubjectStore.getState()
    let subjectId = subjectStore.currentSubjectId

    if (!subjectId) {
      subjectId = subjectStore.addSubject('默认学科')
      subjectStore.setCurrentSubject(subjectId)
    }

    const id = generateId('session')
    const session: AiSession = {
      id,
      subjectId,
      name: '新会话',
      messages: [],
      contextWindow: [],
      chatState: 'idle',
      streamingText: '',
      error: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    set((state) => ({
      sessions: { ...state.sessions, [id]: session },
      activeSessionId: id,
    }))
    debouncedSessionSave()

    return id
  },

  switchSession: (sessionId) => {
    set({ activeSessionId: sessionId })
    debouncedSessionSave()
  },

  deleteSession: (sessionId) => {
    const { abortController, activeSessionId } = get()
    if (sessionId === activeSessionId && abortController) {
      abortController.abort()
      set({ abortController: null })
    }
    set((state) => {
      const newSessions = { ...state.sessions }
      delete newSessions[sessionId]
      return {
        sessions: newSessions,
        activeSessionId:
          state.activeSessionId === sessionId ? null : state.activeSessionId,
      }
    })
    debouncedSessionSave()
  },

  listSessionsBySubject: (subjectId) => {
    const { sessions } = get()
    return Object.values(sessions)
      .filter((s) => s.subjectId === subjectId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
  },

  sendMessage: async (content, screenshotData) => {
    if (sendMessageLock) {
      set({ messageDropped: true })
      setTimeout(() => set({ messageDropped: false }), 2000)
      return
    }
    sendMessageLock = true
    const screenshots = Array.isArray(screenshotData) ? screenshotData : screenshotData ? [screenshotData] : []
    const subjectStore = useSubjectStore.getState()
    const settingsStore = useSettingsStore.getState()

    let subjectId = subjectStore.currentSubjectId
    if (!subjectId) {
      const detectedId = subjectStore.detectSubject(content)
      if (detectedId) {
        subjectStore.setCurrentSubject(detectedId)
        subjectId = detectedId
      } else {
        let main = subjectStore.subjects.find((s) => s.id === 'main')
        if (!main) {
          subjectId = subjectStore.addSubject('综合')
          main = subjectStore.subjects.find((s) => s.id === subjectId)!
        }
        subjectId = main.id
        subjectStore.setCurrentSubject(subjectId)
      }
    }

    // 确保有活跃会话
    let { activeSessionId } = get()
    if (!activeSessionId || !get().sessions[activeSessionId]) {
      activeSessionId = get().createSession()
    }

    const userMessage: Message = {
      id: generateId('msg'),
      role: 'user',
      content,
      timestamp: Date.now(),
      type: screenshots.length > 0 ? 'screenshot' : 'text',
      screenshotData: screenshots[0],
    }

    // 添加用户消息到当前会话
    set((state) => {
      const session = state.sessions[activeSessionId!]
      if (!session) return state
      return {
        sessions: {
          ...state.sessions,
          [activeSessionId!]: {
            ...session,
            messages: [...session.messages, userMessage],
            chatState: 'thinking',
            streamingText: '',
            error: null,
            name: session.messages.length === 0 ? generateSessionName(content) : session.name,
            updatedAt: Date.now(),
          },
        },
      }
    })

    // 确定模态：有截图时需要视觉模型，否则任意模型
    const needsVision = screenshots.length > 0
    let modelInfo = needsVision
      ? settingsStore.getActiveModelForModality('vision')
      : settingsStore.getActiveModelForModality('vision') || settingsStore.getActiveModelForModality('document')

    // 回退：找第一个可用模型（含 modalities 为空的纯文本模型）
    if (!modelInfo) {
      for (const config of settingsStore.apiConfigs) {
        if (config.models.length > 0) { modelInfo = { config, model: config.models[0] }; break }
      }
    }

    if (!modelInfo) {
      set((state) => {
        const session = state.sessions[activeSessionId!]
        if (!session) return state
        return {
          sessions: {
            ...state.sessions,
            [activeSessionId!]: {
              ...session,
              chatState: 'error',
              error: '请先在设置中配置AI模型。点击右上角"设置"按钮添加。',
            },
          },
        }
      })
      sendMessageLock = false
      return
    }

    // 需要视觉能力但当前模型不支持视觉
    if (needsVision && !modelInfo.model.modalities.includes('vision')) {
      set((state) => {
        const session = state.sessions[activeSessionId!]
        if (!session) return state
        return {
          sessions: {
            ...state.sessions,
            [activeSessionId!]: {
              ...session,
              chatState: 'error',
              error: '需要视觉模型来处理图片，但当前模型不支持视觉。请前往设置添加视觉模型。',
            },
          },
        }
      })
      sendMessageLock = false
      return
    }

    const { config, model } = modelInfo

    let controller: AbortController | null = null
    try {
      const session = get().sessions[activeSessionId!]
      if (!session) return

      // 上下文管理：识别新题目清空上下文，单题内用压缩
      // 判断是否为新题目：不含追问关键词 且 长度 > 15 字符
      const followUpWords = ['这', '那', '上面', '刚才', '继续', '为什么', '怎么', '如何', '请解释', '详细', '例子', '不懂', '明白', '还是', '可是', '但是', '然后', '接着', '补充', '具体']
      const isFollowUp = session.contextWindow.length > 0 && (
        content.length < 15 ||
        followUpWords.some((w) => content.includes(w))
      )

      let contextMessages: Message[]
      if (isFollowUp) {
        // 追问：在当前上下文基础上添加
        const updated = [...session.contextWindow, userMessage]
        // 按 64k token 估算（≈128k 字符），超过则让 AI 总结压缩
        const MAX_CHARS = 128000
        const totalChars = updated.reduce((sum, m) => sum + m.content.length + (m.screenshotData ? 500 : 0), 0)

        if (totalChars <= MAX_CHARS) {
          contextMessages = updated
        } else {
          // 需要压缩：保留首条 + 最近几条，中间让 AI 总结
          const RECENT_KEEP = 6
          const first = updated[0]
          const middle = updated.slice(1, -(RECENT_KEEP))
          const tail = updated.slice(-RECENT_KEEP)

          // 用同一模型总结中间部分
          const summaryText = middle.map((m) => `${m.role === 'user' ? '学生' : '老师'}：${m.content}`).join('\n')
          const summarizeBody = {
            model: model.modelId,
            messages: [
              { role: 'system', content: '请用中文简要总结以下对话的核心内容，保留关键问题、解题步骤和结论，控制在500字以内。只输出总结内容，不要多余的话。' },
              { role: 'user', content: summaryText },
            ],
            stream: false,
          }

          try {
            const res = await fetch(config.apiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
              body: JSON.stringify(summarizeBody),
              signal: AbortSignal.timeout(15000),
            })
            if (res.ok) {
              const data = await res.json()
              const summary = data.choices?.[0]?.message?.content || '（摘要生成失败）'
              const summaryMsg: Message = { id: generateId('msg'), role: 'assistant', content: `[对话摘要] ${summary}`, timestamp: Date.now(), type: 'text' }
              contextMessages = [first, summaryMsg, ...tail]
            } else {
              // 总结失败，fallback 为首条 + 最近几条
              contextMessages = [first, ...tail]
            }
          } catch {
            contextMessages = [first, ...tail]
          }
        }
      } else {
        // 新题目：清空上一题上下文，从当前消息开始
        contextMessages = [userMessage]
      }

      // 更新 session 的 contextWindow
      set((state) => {
        const s = state.sessions[activeSessionId!]
        if (!s) return state
        return {
          sessions: {
            ...state.sessions,
            [activeSessionId!]: { ...s, contextWindow: contextMessages },
          },
        }
      })

      const systemPrompt = `你是一个智能学习助手，帮助学生解决学习中的各种问题。

回答原则：
- 直接回答问题，不废话
- 复杂问题分步骤说明
- 如果学生问的是题目，先分析再给解法
- 不确定的内容如实说明，不要编造
- 默认用中文回答，除非用户明确要求用其他语言

数学公式格式要求（严格遵守）：
1. 行内公式用 \\(...\\) 包裹，独立公式用 \\[...\\] 包裹
2. 每个公式只写一次，不要用任何其他格式重复输出
3. 不要用 Unicode 数学符号（如 ×、÷、∂、∇、≈、→），必须用 LaTeX 命令（\\times、\\div、\\partial、\\nabla、\\approx、\\rightarrow）
4. 不要用普通括号、星号或其他方式包裹公式
5. 不要用 $...$ 格式

正确示例：
麦克斯韦方程：\\[\\nabla \\times \\boldsymbol{B} = \\mu_0 \\boldsymbol{J} + \\mu_0 \\varepsilon_0 \\frac{\\partial \\boldsymbol{E}}{\\partial t}\\]
其中 \\(\\boldsymbol{E}\\) 表示电场强度，\\(\\boldsymbol{B}\\) 表示磁感应强度。`

      const apiMessages = [{ role: 'system', content: systemPrompt }, ...contextMessages.map((msg) => {
        const msgScreenshots = msg === userMessage ? screenshots : (msg.screenshotData ? [msg.screenshotData] : [])
        if (msgScreenshots.length > 0) {
          return {
            role: msg.role,
            content: [
              { type: 'text', text: msg.content },
              ...msgScreenshots.map((url) => ({ type: 'image_url', image_url: { url } })),
            ],
          }
        }
        return { role: msg.role, content: msg.content }
      })]

      let apiUrl = config.apiUrl.trim()
      const apiKey = config.apiKey.trim()
      // 自动补全 /chat/completions 端点
      if (!/\/chat\/completions\/?$/.test(apiUrl)) {
        apiUrl = apiUrl.replace(/\/$/, '') + '/chat/completions'
      }
      if (!apiUrl || !apiKey) {
        set((state) => {
          const session = state.sessions[activeSessionId!]
          if (!session) return state
          return {
            sessions: {
              ...state.sessions,
              [activeSessionId!]: { ...session, chatState: 'error', error: 'API 地址或 Key 为空，请检查设置' },
            },
          }
        })
        return
      }

      const prevController = get().abortController
      if (prevController) prevController.abort()

      controller = new AbortController()
      set({ abortController: controller })

      const { thinkingMode } = get()
      const body: Record<string, unknown> = {
        model: model.modelId,
        messages: apiMessages,
        stream: true,
      }
      if (thinkingMode) body.think = true

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => '')
        let errorMsg = `请求失败 (${response.status})`
        if (response.status === 401) errorMsg = 'API Key 无效，请检查设置中的配置'
        else if (response.status === 403) errorMsg = 'API Key 权限不足或已过期'
        else if (response.status === 404) errorMsg = 'API 地址错误或模型不存在'
        else if (response.status === 429) errorMsg = '请求过于频繁，请稍后再试'
        else if (response.status === 500) errorMsg = '服务器错误，请稍后再试'
        else if (errorText) errorMsg += `: ${errorText.slice(0, 100)}`
        throw new Error(errorMsg)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('无法读取响应流')

      const decoder = new TextDecoder()
      let fullText = ''
      let buffer = ''
      let done = false
      let dataLines: string[] = []

      while (!done) {
        const result = await reader.read()
        done = result.done
        if (result.value) buffer += decoder.decode(result.value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        // SSE 规范：多行 data 字段用换行拼接，空行分隔事件
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            dataLines.push(line.slice(6))
          } else if (line.trim() === '' && dataLines.length > 0) {
            // 空行：处理累积的 data
            const data = dataLines.join('\n')
            dataLines = []
            if (data === '[DONE]') { done = true; break }

            try {
              const parsed = JSON.parse(data)
              const delta = parsed.choices?.[0]?.delta?.content
              if (delta) {
                fullText += delta
                set((state) => {
                  const s = state.sessions[activeSessionId!]
                  if (!s) return state
                  return {
                    sessions: {
                      ...state.sessions,
                      [activeSessionId!]: { ...s, chatState: 'streaming', streamingText: fullText },
                    },
                  }
                })
              }
            } catch { /* ignore parse errors */ }
          }
        }
        // 处理 buffer 中残留的 data（无尾部空行的情况）
        if (dataLines.length > 0) {
          const data = dataLines.join('\n')
          if (data === '[DONE]') { done = true }
          else {
            try {
              const parsed = JSON.parse(data)
              const delta = parsed.choices?.[0]?.delta?.content
              if (delta) {
                fullText += delta
                set((state) => {
                  const s = state.sessions[activeSessionId!]
                  if (!s) return state
                  return {
                    sessions: {
                      ...state.sessions,
                      [activeSessionId!]: { ...s, chatState: 'streaming', streamingText: fullText },
                    },
                  }
                })
              }
            } catch { /* ignore parse errors */ }
          }
        }
      }

      const assistantMessage: Message = {
        id: generateId('msg'),
        role: 'assistant',
        content: fullText || '(无响应内容)',
        timestamp: Date.now(),
        type: 'text',
      }

      set((state) => {
        const s = state.sessions[activeSessionId!]
        if (!s) return state
        return {
          sessions: {
            ...state.sessions,
            [activeSessionId!]: {
              ...s,
              messages: [...s.messages, assistantMessage],
              chatState: 'idle',
              streamingText: '',
              updatedAt: Date.now(),
            },
          },
          abortController: null,
        }
      })
      debouncedSessionSave()
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        set((state) => {
          const s = state.sessions[activeSessionId!]
          if (!s) return state
          return {
            sessions: {
              ...state.sessions,
              [activeSessionId!]: { ...s, chatState: 'idle', streamingText: '' },
            },
            // Only clear controller if it's still ours (not replaced by a newer send)
            abortController: state.abortController === controller ? null : state.abortController,
          }
        })
        debouncedSessionSave()
        return
      }

      logger.error('AI 请求失败', error)
      // Only clear controller if it's still ours
      if (get().abortController === controller) set({ abortController: null })

      let errorMsg = '未知错误'
      if (error instanceof Error) {
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
          errorMsg = '无法连接到AI服务。请检查网络连接和API地址是否正确。'
        } else {
          errorMsg = error.message
        }
      }

      set((state) => {
        const s = state.sessions[activeSessionId!]
        if (!s) return state
        return {
          sessions: {
            ...state.sessions,
            [activeSessionId!]: { ...s, chatState: 'error', error: errorMsg },
          },
        }
      })
      debouncedSessionSave()
    } finally {
      sendMessageLock = false
    }
  },

  stopGeneration: () => {
    const { activeSessionId, abortController } = get()
    if (!activeSessionId) return

    if (abortController) {
      abortController.abort()
      set({ abortController: null })
    }

    set((state) => {
      const session = state.sessions[activeSessionId]
      if (!session) return state

      const lastMessage = session.messages[session.messages.length - 1]

      // Case 1: Last message is assistant with streaming text → save partial content
      if (lastMessage && lastMessage.role === 'assistant' && session.streamingText) {
        const completedMessage: Message = { ...lastMessage, content: session.streamingText }
        return {
          sessions: {
            ...state.sessions,
            [activeSessionId]: {
              ...session,
              messages: [...session.messages.slice(0, -1), completedMessage],
              chatState: 'idle',
              streamingText: '',
              contextWindow: [...session.contextWindow, completedMessage],
            },
          },
        }
      }

      // Case 2: Streaming text exists but last message is NOT assistant (just started streaming)
      // → create a new assistant message with the partial content
      if (session.streamingText) {
        const partialMessage: Message = {
          id: generateId('msg'),
          role: 'assistant',
          content: session.streamingText,
          timestamp: Date.now(),
          type: 'text',
        }
        return {
          sessions: {
            ...state.sessions,
            [activeSessionId]: {
              ...session,
              messages: [...session.messages, partialMessage],
              chatState: 'idle',
              streamingText: '',
              contextWindow: [...session.contextWindow, partialMessage],
            },
          },
        }
      }

      // Case 3: No streaming text → just reset state
      return {
        sessions: {
          ...state.sessions,
          [activeSessionId]: { ...session, chatState: 'idle', streamingText: '' },
        },
      }
    })
    debouncedSessionSave()
  },

  clearError: (sessionId) => {
    set((state) => {
      const session = state.sessions[sessionId]
      if (!session) return state
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...session, chatState: 'idle', error: null },
        },
      }
    })
    debouncedSessionSave()
  },

  addPendingScreenshot: (data) => set((s) => {
    const MAX_PENDING = 5
    const next = [...s.pendingScreenshots, data]
    return { pendingScreenshots: next.length > MAX_PENDING ? next.slice(-MAX_PENDING) : next }
  }),
  removePendingScreenshot: (index) => set((s) => ({
    pendingScreenshots: s.pendingScreenshots.filter((_, i) => i !== index),
  })),
  clearPendingScreenshots: () => set({ pendingScreenshots: [] }),
  setThinkingMode: (on) => set({ thinkingMode: on }),
  setMessageDropped: (v) => set({ messageDropped: v }),

  loadFromStorage: () => {
    try {
      const saved = localStorage.getItem(SESSION_STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        const sessions: Record<string, AiSession> = {}
        for (const [id, raw] of Object.entries(parsed.sessions || {})) {
          const s = raw as Record<string, unknown>
          // Validate required fields
          if (!s.id || !s.subjectId || !Array.isArray(s.messages)) continue
          sessions[id] = {
            id: String(s.id),
            subjectId: String(s.subjectId),
            name: String(s.name || '新会话'),
            messages: s.messages as Message[],
            contextWindow: (s.contextWindow as Message[]) || [],
            chatState: 'idle',
            streamingText: '',
            error: null,
            createdAt: Number(s.createdAt) || Date.now(),
            updatedAt: Number(s.updatedAt) || Date.now(),
          }
        }
        const loadedActiveId = parsed.activeSessionId || null
        set({
          sessions,
          activeSessionId: loadedActiveId && sessions[loadedActiveId] ? loadedActiveId : null,
        })
      }
    } catch (e) {
      logger.error('加载会话失败', e)
    }
  },

  saveToStorage: () => {
    try {
      const { sessions, activeSessionId } = get()
      const saveableSessions: Record<string, AiSession> = {}
      for (const [id, session] of Object.entries(sessions)) {
        // 流式中的会话保存为 idle，避免丢失
        const base = session.chatState === 'streaming' || session.chatState === 'thinking'
          ? { ...session, chatState: 'idle' as const, streamingText: '' }
          : session
        // contextWindow 中的截图已在 messages 中保存，去掉避免 localStorage 双倍占用
        saveableSessions[id] = {
          ...base,
          contextWindow: base.contextWindow.map((m) =>
            m.screenshotData ? { ...m, screenshotData: undefined } : m
          ),
        }
      }
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
        sessions: saveableSessions,
        activeSessionId,
      }))
    } catch (e) {
      logger.error('保存会话失败', e)
    }
  },
}))
