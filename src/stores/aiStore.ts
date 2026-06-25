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
  thinkingContent?: string
}

export interface AiSession {
  id: string
  subjectId: string
  name: string
  messages: Message[]
  contextWindow: Message[]  // 当前题目的上下文（用于 API 调用）
  chatState: 'idle' | 'thinking' | 'streaming' | 'error'
  streamingText: string
  thinkingText: string
  statusText: string  // 状态提示：正在分析图片、正在深入思考等
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
  setStatus: (text: string) => void

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
      thinkingText: '',
      statusText: '',
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
    if (!get().sessions[sessionId]) return
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
    if (!content.trim() && !(Array.isArray(screenshotData) ? screenshotData : screenshotData ? [screenshotData] : []).length) return
    if (sendMessageLock) {
      set({ messageDropped: true })
      setTimeout(() => set({ messageDropped: false }), 2000)
      return
    }
    const screenshots = Array.isArray(screenshotData) ? screenshotData : screenshotData ? [screenshotData] : []
    const subjectStore = useSubjectStore.getState()
    const settingsStore = useSettingsStore.getState()
    const { thinkingMode } = get()

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
            thinkingText: '',
            statusText: screenshots.length > 0 ? '正在分析图片...' : (thinkingMode ? '正在深入思考...' : '正在思考...'),
            error: null,
            name: session.messages.length === 0 ? generateSessionName(content) : session.name,
            updatedAt: Date.now(),
          },
        },
      }
    })

    // 确定模态：有截图时需要视觉模型，否则任意模型
    const needsVision = screenshots.length > 0
    let modelInfo = settingsStore.getActiveModel()

    sendMessageLock = true
    try {
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
      return
    }

    // 需要视觉能力但当前模型不支持视觉
    if (needsVision && !modelInfo.model.hasVision) {
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
      return
    }

    const { config, model } = modelInfo

    let controller: AbortController | null = null
    try {
      const session = get().sessions[activeSessionId!]
      if (!session) return

      // 上下文管理：滑动窗口，保留首条消息
      // 用模型上限的 60% 作为实际阈值，避免"中间遗失"导致注意力下降
      const modelLimit = model.maxContextTokens || 128000
      const maxChars = modelLimit * 2 * 0.6 // ≈2字符/token × 60%

      // 追加新消息到上下文
      const updated = [...session.contextWindow, userMessage]

      // 滑动窗口截断：保留首条（index 0），从旧消息开始丢弃
      let contextMessages = updated
      let totalChars = contextMessages.reduce((sum, m) => sum + m.content.length + (m.screenshotData ? 500 : 0), 0)

      while (totalChars > maxChars && contextMessages.length > 2) {
        const removed = contextMessages[1] // 跳过 index 0（首条消息）
        contextMessages = [contextMessages[0], ...contextMessages.slice(2)]
        totalChars -= removed.content.length + (removed.screenshotData ? 500 : 0)
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

数学公式格式（必须严格遵守，违反会导致显示错误）：
- 行内公式用 \\(...\\) 包裹
- 独立公式用 \\[...\\] 包裹
- 每个公式只输出一次，用 \\(...\\) 或 \\[...\\] 包裹即可，系统会自动渲染为专业数学排版
- 绝不要把公式再用纯文本、Unicode符号或普通括号重复写一遍
- 绝不用 Unicode 数学符号（×÷∂∇≈≤≥→↑↓∫），必须用 LaTeX 命令
- 绝不用 $...$ 格式

关键：公式只需要写一次（用 \\(...\\) 或 \\[...\\] 包裹），后面的中文是解释说明，不是公式的另一种写法。

示例（注意：公式只出现一次，后面是文字解释，不是公式的重复）：

\\[\\nabla \\times \\boldsymbol{B} = \\mu_0 \\boldsymbol{J} + \\mu_0 \\varepsilon_0 \\frac{\\partial \\boldsymbol{E}}{\\partial t}\\]

这是安培-麦克斯韦定律，其中 \\(\\mu_0\\) 是真空磁导率，\\(\\varepsilon_0\\) 是真空介电常数。最后一项 \\(\\mu_0 \\varepsilon_0 \\frac{\\partial \\boldsymbol{E}}{\\partial t}\\) 是位移电流项，预言了电磁波的存在。`

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
      // HTTPS 安全提示
      if (apiUrl && !apiUrl.startsWith('http://localhost') && !apiUrl.startsWith('http://127.') && !apiUrl.startsWith('https://')) {
        logger.warn('API 地址未使用 HTTPS，API Key 可能被截获')
      }
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
      let fullThinkingText = ''
      let buffer = ''
      let done = false
      let dataLines: string[] = []

      const updateStreamState = () => {
        set((state) => {
          const s = state.sessions[activeSessionId!]
          if (!s) return state
          // 如果正在思考中且还没开始流式输出，更新状态
          const newStatus = fullThinkingText && !fullText ? '正在深入思考...' : (fullText ? '' : s.statusText)
          return {
            sessions: {
              ...state.sessions,
              [activeSessionId!]: { ...s, chatState: 'streaming', streamingText: fullText, thinkingText: fullThinkingText, statusText: newStatus },
            },
          }
        })
      }

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
              const delta = parsed.choices?.[0]?.delta
              const reasoning = delta?.reasoning_content || delta?.thinking_content
              const content = delta?.content
              if (reasoning) { fullThinkingText += reasoning; updateStreamState() }
              if (content) { fullText += content; updateStreamState() }
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
              const delta = parsed.choices?.[0]?.delta
              const reasoning = delta?.reasoning_content || delta?.thinking_content
              const content = delta?.content
              if (reasoning) { fullThinkingText += reasoning; updateStreamState() }
              if (content) { fullText += content; updateStreamState() }
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
        thinkingContent: fullThinkingText || undefined,
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
              thinkingText: fullThinkingText,
              statusText: '',
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
              [activeSessionId!]: { ...s, chatState: 'idle', streamingText: '', thinkingText: s.thinkingText, statusText: '' },
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
        const completedMessage: Message = { ...lastMessage, content: session.streamingText, thinkingContent: session.thinkingText || undefined }
        return {
          sessions: {
            ...state.sessions,
            [activeSessionId]: {
              ...session,
              messages: [...session.messages.slice(0, -1), completedMessage],
              chatState: 'idle',
              streamingText: '',
              thinkingText: session.thinkingText,
              statusText: '',
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
          thinkingContent: session.thinkingText || undefined,
        }
        return {
          sessions: {
            ...state.sessions,
            [activeSessionId]: {
              ...session,
              messages: [...session.messages, partialMessage],
              chatState: 'idle',
              streamingText: '',
              thinkingText: session.thinkingText,
              statusText: '',
              contextWindow: [...session.contextWindow, partialMessage],
            },
          },
        }
      }

      // Case 3: No streaming text → just reset state
      return {
        sessions: {
          ...state.sessions,
          [activeSessionId]: { ...session, chatState: 'idle', streamingText: '', thinkingText: session.thinkingText, statusText: '' },
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
  setStatus: (text) => {
    const { activeSessionId } = get()
    if (!activeSessionId) return
    set((state) => {
      const s = state.sessions[activeSessionId]
      if (!s) return state
      return {
        sessions: {
          ...state.sessions,
          [activeSessionId]: { ...s, statusText: text },
        },
      }
    })
  },

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
            thinkingText: '',
            statusText: '',
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
          ? { ...session, chatState: 'idle' as const, streamingText: '', thinkingText: '', statusText: '' }
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
