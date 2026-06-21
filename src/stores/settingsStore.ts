import { create } from 'zustand'
import { logger } from '../lib/logger'
import { SETTINGS_DEBOUNCE_MS, DEFAULT_MAX_TOKENS } from '../lib/constants'
import { generateId } from '../lib/id'

export type ProviderCategory = 'official' | 'cn' | 'aggregator' | 'custom'

export interface ModelConfig {
  id: string
  name: string
  modelId: string
  hasVision: boolean
  maxContextTokens: number
  audioCapable?: boolean
  hasThinking?: boolean
}

export interface ApiConfig {
  id: string
  name: string
  apiUrl: string
  apiKey: string
  models: ModelConfig[]
  category?: ProviderCategory
}

export interface ShortcutConfig {
  screenshot: string
  voice: string
}

interface SettingsState {
  apiConfigs: ApiConfig[]
  activeApiConfigId: string | null
  defaultModelId: string | null
  shortcuts: ShortcutConfig

  addApiConfig: (config: Omit<ApiConfig, 'id'>) => string
  updateApiConfig: (id: string, config: Partial<ApiConfig>) => void
  removeApiConfig: (id: string) => void
  setActiveApiConfig: (id: string) => void
  getActiveApiConfig: () => ApiConfig | null

  addModelToConfig: (configId: string, model: Omit<ModelConfig, 'id'>) => string
  removeModelFromConfig: (configId: string, modelId: string) => void
  updateModelInConfig: (configId: string, modelId: string, updates: Partial<ModelConfig>) => void

  setDefaultModel: (modelConfigId: string | null) => void
  hasVisionModel: () => boolean
  hasAudioModel: () => boolean
  getModelConfigById: (modelConfigId: string) => { config: ApiConfig; model: ModelConfig } | null
  getActiveModel: () => { config: ApiConfig; model: ModelConfig } | null

  updateShortcut: (action: keyof ShortcutConfig, key: string) => void
  loadFromStorage: () => void
  saveToStorage: () => void
}

const STORAGE_KEY = 'student-assistant-settings'

let saveTimer: ReturnType<typeof setTimeout> | null = null
function debouncedSave(fn: () => void) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(fn, SETTINGS_DEBOUNCE_MS)
}

const defaultSettings = {
  apiConfigs: [] as ApiConfig[],
  activeApiConfigId: null as string | null,
  defaultModelId: null as string | null,
  shortcuts: {
    screenshot: 'Ctrl+Shift+X',
    voice: 'Ctrl+Shift+V',
  },
}

// 迁移旧格式 → 新格式
function migrateConfig(raw: Record<string, unknown>): ApiConfig {
  // 旧格式有 model + isMultimodal，新格式有 models[]
  if (typeof raw.model === 'string' && !Array.isArray(raw.models)) {
    return {
      id: raw.id as string,
      name: raw.name as string,
      apiUrl: raw.apiUrl as string,
      apiKey: raw.apiKey as string,
      category: raw.category as ProviderCategory | undefined,
      models: [{
        id: generateId('model'),
        name: raw.model as string,
        modelId: raw.model as string,
        hasVision: true,
        maxContextTokens: DEFAULT_MAX_TOKENS,
      }],
    }
  }
  // 迁移旧的 modalities 字段到 hasVision
  if (Array.isArray(raw.models)) {
    const models = (raw.models as Record<string, unknown>[]).map((m) => ({
      id: String(m.id || generateId('model')),
      name: String(m.name || ''),
      modelId: String(m.modelId || ''),
      hasVision: Array.isArray(m.modalities) ? (m.modalities as string[]).includes('vision') : Boolean(m.hasVision),
      maxContextTokens: Number(m.maxContextTokens) || DEFAULT_MAX_TOKENS,
      audioCapable: Boolean(m.audioCapable),
      hasThinking: Boolean(m.hasThinking),
    }))
    return {
      id: String(raw.id || generateId('api')),
      name: String(raw.name || ''),
      apiUrl: String(raw.apiUrl || ''),
      apiKey: String(raw.apiKey || ''),
      models,
      category: raw.category as ProviderCategory | undefined,
    }
  }
  return {
    id: raw.id ? String(raw.id) : generateId('api'),
    name: String(raw.name || ''),
    apiUrl: String(raw.apiUrl || ''),
    apiKey: String(raw.apiKey || ''),
    models: [],
    category: raw.category as ProviderCategory | undefined,
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...defaultSettings,

  addApiConfig: (config) => {
    const id = generateId('api')
    const newConfig: ApiConfig = { ...config, id }

    set((state) => ({
      apiConfigs: [...state.apiConfigs, newConfig],
      activeApiConfigId: state.activeApiConfigId || id,
    }))
    debouncedSave(() => get().saveToStorage())
    return id
  },

  updateApiConfig: (id, config) => {
    const { id: _ignored, ...safeConfig } = config
    set((state) => ({
      apiConfigs: state.apiConfigs.map((c) =>
        c.id === id ? { ...c, ...safeConfig } : c
      ),
    }))
    debouncedSave(() => get().saveToStorage())
  },

  removeApiConfig: (id) => {
    set((state) => {
      const newConfigs = state.apiConfigs.filter((c) => c.id !== id)
      const removedConfig = state.apiConfigs.find((c) => c.id === id)
      const removedModelIds = new Set(removedConfig?.models.map((m) => m.id) || [])
      const newDefaultModelId = state.defaultModelId && removedModelIds.has(state.defaultModelId) ? null : state.defaultModelId
      return {
        apiConfigs: newConfigs,
        activeApiConfigId:
          state.activeApiConfigId === id
            ? newConfigs.length > 0 ? newConfigs[0].id : null
            : state.activeApiConfigId,
        defaultModelId: newDefaultModelId,
      }
    })
    debouncedSave(() => get().saveToStorage())
  },

  setActiveApiConfig: (id) => {
    set({ activeApiConfigId: id })
    debouncedSave(() => get().saveToStorage())
  },

  getActiveApiConfig: () => {
    const { apiConfigs, activeApiConfigId } = get()
    return apiConfigs.find((c) => c.id === activeApiConfigId) || null
  },

  addModelToConfig: (configId, model) => {
    const modelId = generateId('model')
    const newModel: ModelConfig = { ...model, id: modelId }

    set((state) => ({
      apiConfigs: state.apiConfigs.map((c) =>
        c.id === configId ? { ...c, models: [...c.models, newModel] } : c
      ),
    }))
    debouncedSave(() => get().saveToStorage())
    return modelId
  },

  removeModelFromConfig: (configId, modelId) => {
    set((state) => {
      const newConfigs = state.apiConfigs.map((c) =>
        c.id === configId ? { ...c, models: c.models.filter((m) => m.id !== modelId) } : c
      )
      return {
        apiConfigs: newConfigs,
        defaultModelId: state.defaultModelId === modelId ? null : state.defaultModelId,
      }
    })
    debouncedSave(() => get().saveToStorage())
  },

  updateModelInConfig: (configId, modelId, updates) => {
    const { id: _id, ...safeUpdates } = updates
    set((state) => ({
      apiConfigs: state.apiConfigs.map((c) =>
        c.id === configId
          ? { ...c, models: c.models.map((m) => m.id === modelId ? { ...m, ...safeUpdates } : m) }
          : c
      ),
    }))
    debouncedSave(() => get().saveToStorage())
  },

  setDefaultModel: (modelConfigId) => {
    set({ defaultModelId: modelConfigId })
    debouncedSave(() => get().saveToStorage())
  },

  hasVisionModel: () => {
    const { apiConfigs } = get()
    return apiConfigs.some((c) => c.models.some((m) => m.hasVision))
  },

  hasAudioModel: () => {
    const { apiConfigs } = get()
    return apiConfigs.some((c) => c.models.some((m) => m.audioCapable))
  },

  getModelConfigById: (modelConfigId) => {
    const { apiConfigs } = get()
    for (const config of apiConfigs) {
      const model = config.models.find((m) => m.id === modelConfigId)
      if (model) return { config, model }
    }
    return null
  },

  getActiveModel: () => {
    const { defaultModelId, apiConfigs } = get()

    // 1. 优先使用默认模型
    if (defaultModelId) {
      const result = get().getModelConfigById(defaultModelId)
      if (result) return result
    }

    // 2. Fallback: 第一个可用模型
    for (const config of apiConfigs) {
      if (config.models.length > 0) return { config, model: config.models[0] }
    }

    return null
  },

  updateShortcut: (action, key) => {
    set((state) => ({
      shortcuts: {
        ...state.shortcuts,
        [action]: key,
      },
    }))
    debouncedSave(() => get().saveToStorage())
  },

  loadFromStorage: () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        // 迁移旧格式
        if (Array.isArray(parsed.apiConfigs)) {
          parsed.apiConfigs = parsed.apiConfigs.map(migrateConfig)
        }
        const loadedConfigs = Array.isArray(parsed.apiConfigs) ? parsed.apiConfigs : defaultSettings.apiConfigs
        const loadedActiveId = typeof parsed.activeApiConfigId === 'string' ? parsed.activeApiConfigId : defaultSettings.activeApiConfigId
        // 迁移旧的 defaultModels (per-modality) 到 defaultModelId (single)
        let defaultModelId = typeof parsed.defaultModelId === 'string' ? parsed.defaultModelId : null
        if (!defaultModelId && parsed.defaultModels && typeof parsed.defaultModels === 'object') {
          // 旧格式: { vision: 'xxx', document: 'yyy' }
          defaultModelId = parsed.defaultModels.vision || parsed.defaultModels.document || null
        }
        set({
          apiConfigs: loadedConfigs,
          activeApiConfigId: loadedActiveId && loadedConfigs.some((c: ApiConfig) => c.id === loadedActiveId) ? loadedActiveId : (loadedConfigs[0]?.id || null),
          defaultModelId,
          shortcuts: parsed.shortcuts && typeof parsed.shortcuts === 'object' ? { ...defaultSettings.shortcuts, ...parsed.shortcuts } : defaultSettings.shortcuts,
        })
      }
    } catch (e) {
      logger.error('加载设置失败', e)
    }
  },

  saveToStorage: () => {
    try {
      const state = get()
      const settings = {
        apiConfigs: state.apiConfigs,
        activeApiConfigId: state.activeApiConfigId,
        defaultModelId: state.defaultModelId,
        shortcuts: state.shortcuts,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch (e) {
      logger.error('保存设置失败', e)
    }
  },
}))
