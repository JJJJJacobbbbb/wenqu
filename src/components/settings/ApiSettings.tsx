import { useState, useRef, useCallback } from 'react'
import { logger } from '../../lib/logger'
import { useClickOutside } from '../../hooks/useClickOutside'
import { useSettingsStore, type ModelConfig, type ProviderCategory } from '../../stores/settingsStore'
import { PROVIDER_PRESETS, CATEGORY_LABELS, CATEGORY_COLORS, type ProviderPreset } from '../../config/providerPresets'
import { DEFAULT_MAX_TOKENS } from '../../lib/constants'
import { generateId } from '../../lib/id'
import ConfirmDialog from '../shared/ConfirmDialog'

type View = 'list' | 'presets' | 'form'

function DefaultModelSelect({ models, activeModelId, onSelect }: {
  models: { configId: string; configName: string; modelId: string; modelName: string }[]
  activeModelId: string | null
  onSelect: (modelId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, useCallback(() => setOpen(false), []))
  const active = models.find((m) => m.modelId === activeModelId)
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="w-full px-2 py-1 text-xs border border-gray-200 rounded flex items-center justify-between hover:bg-gray-50">
        <span className="truncate">{active ? active.modelName : '未选择'}</span>
        <svg className="w-3 h-3 text-gray-400 ml-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[180px] max-h-[160px] overflow-y-auto py-1">
          {models.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">无可用</div>
          ) : models.map((m) => (
            <button key={m.modelId} onClick={() => { onSelect(m.modelId); setOpen(false) }}
              className={`w-full px-3 py-1.5 text-xs text-left flex items-center justify-between hover:bg-gray-50 ${m.modelId === activeModelId ? 'text-blue-600 bg-blue-50' : 'text-gray-600'}`}>
              <span className="truncate">{m.modelName}</span>
              <span className="text-[10px] text-gray-400 ml-1">{m.configName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ThinkingTestButton({ config, model, onResult }: {
  config: { apiUrl: string; apiKey: string }
  model: { modelId: string; hasThinking?: boolean }
  onResult: (ok: boolean) => void
}) {
  const [testing, setTesting] = useState(false)

  const handleTest = async () => {
    if (testing) return
    setTesting(true)
    try {
      const res = await fetch(config.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({
          model: model.modelId,
          messages: [{ role: 'user', content: '1+1=?' }],
          stream: true,
        }),
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const reader = res.body?.getReader()
      if (!reader) throw new Error('No body')
      const decoder = new TextDecoder()
      let hasThinking = false
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') break
          try {
            const parsed = JSON.parse(data)
            const delta = parsed.choices?.[0]?.delta
            if (delta?.reasoning_content || delta?.thinking_content) {
              hasThinking = true
              break
            }
          } catch { /* ignore */ }
        }
        if (hasThinking) break
      }
      reader.cancel()
      onResult(hasThinking)
    } catch (err) {
      logger.error('思考模式测试失败', err)
      onResult(false)
    } finally {
      setTesting(false)
    }
  }

  return (
    <button
      onClick={handleTest}
      disabled={testing}
      className="text-[9px] px-1.5 py-0.5 rounded transition-colors"
      style={{
        backgroundColor: model.hasThinking ? '#22c55e20' : testing ? '#f3f4f6' : '#f3f4f6',
        color: model.hasThinking ? '#16a34a' : '#9ca3af',
      }}
      title={model.hasThinking ? '已支持思考，点击重新测试' : '点击测试模型是否支持思考模式'}
    >
      {testing ? '测试中...' : model.hasThinking ? '思考 ✓' : '测试思考'}
    </button>
  )
}

export default function ApiSettings() {
  const {
    apiConfigs,
    activeApiConfigId,
    addApiConfig,
    updateApiConfig,
    removeApiConfig,
    setActiveApiConfig,
    addModelToConfig,
    removeModelFromConfig,
    updateModelInConfig,
    defaultModelId,
    setDefaultModel,
    getActiveModel,
  } = useSettingsStore()

  const [modelList, setModelList] = useState<string[]>([])
  const [modelListLoading, setModelListLoading] = useState(false)
  const [modelError, setModelError] = useState('')
  const [fetchTargetId, setFetchTargetId] = useState<string | null>(null)
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({})
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const fetchModels = async (apiUrl: string, apiKey: string, configId: string) => {
    if (!apiUrl || !apiKey) return
    setModelListLoading(true)
    setModelError('')
    setFetchTargetId(configId)
    try {
      let modelsUrl = apiUrl.trim()
        .replace(/\/chat\/completions\/?$/, '')
        .replace(/\/completions\/?$/, '')
        .replace(/\/$/, '')
      if (!/\/models$/.test(modelsUrl)) modelsUrl += '/models'
      const res = await fetch(modelsUrl, { headers: { Authorization: `Bearer ${apiKey}` } })
      if (!res.ok) throw new Error(`${res.status}`)
      const data = await res.json()
      const ids = (data.data || []).map((m: { id: string }) => m.id).filter(Boolean).sort()
      setModelList(ids)
      if (ids.length === 0) setModelError('未返回任何模型')
    } catch {
      setModelError('获取失败，请检查 API 地址和 Key')
    } finally {
      setModelListLoading(false)
    }
  }

  const [view, setView] = useState<View>('list')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    apiUrl: '',
    apiKey: '',
    category: '' as string,
    preselectedModels: [] as string[],
  })

  const handlePresetSelect = (preset: ProviderPreset) => {
    setFormData({
      name: preset.name,
      apiUrl: preset.apiUrl,
      apiKey: '',
      category: preset.category,
      preselectedModels: preset.models.map((m) => m.modelId),
    })
    setView('form')
  }

  const handleCustom = () => {
    setFormData({
      name: '',
      apiUrl: '',
      apiKey: '',
      category: 'custom',
      preselectedModels: [],
    })
    setView('form')
  }

  const handleSave = () => {
    if (!formData.name || !formData.apiKey || !formData.apiUrl) return

    const preset = PROVIDER_PRESETS.find((p) => p.name === formData.name)
    const models: ModelConfig[] = []

    if (preset) {
      for (const pm of preset.models) {
        if (formData.preselectedModels.includes(pm.modelId)) {
          models.push({
            id: generateId('model'),
            name: pm.name,
            modelId: pm.modelId,
            hasVision: pm.hasVision,
            maxContextTokens: pm.maxContextTokens,
            hasThinking: pm.hasThinking,
          })
        }
      }
    }

    if (models.length === 0) {
      models.push({
        id: `model-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: '默认模型',
        modelId: 'gpt-4o',
        hasVision: true,
        maxContextTokens: DEFAULT_MAX_TOKENS,
      })
    }

    addApiConfig({
      name: formData.name,
      apiUrl: formData.apiUrl.trim(),
      apiKey: formData.apiKey,
      category: (formData.category || 'custom') as ProviderCategory,
      models,
    })
    setView('list')
  }

  const handleDelete = (id: string) => {
    setDeleteConfirmId(id)
  }

  const handleAddModelFromList = (configId: string, modelId: string) => {
    const config = apiConfigs.find((c) => c.id === configId)
    if (config?.models.some((m) => m.modelId === modelId)) return
    addModelToConfig(configId, {
      name: modelId,
      modelId,
      hasVision: true,
      maxContextTokens: DEFAULT_MAX_TOKENS,
    })
  }

  // ---- 列表视图 ----
  if (view === 'list') {
    const allModels = apiConfigs.flatMap((c) =>
      c.models.map((m) => ({ configId: c.id, configName: c.name, modelId: m.id, modelName: m.name }))
    )
    const active = getActiveModel()

    return (
      <>
      <div className="max-w-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-gray-800">AI 供应商</h2>
          <button onClick={() => setView('presets')} className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600">
            + 添加供应商
          </button>
        </div>

        {/* 默认模型选择 */}
        {apiConfigs.length > 0 && (
          <div className="mb-4 border border-gray-200 rounded-lg p-4 bg-white">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-700">默认模型</h3>
              <span className="text-xs text-blue-500 bg-blue-50 px-2 py-1 rounded">所有对话使用此模型</span>
            </div>
            <DefaultModelSelect
              models={allModels}
              activeModelId={defaultModelId}
              onSelect={(modelId) => setDefaultModel(modelId)}
            />
            {active && (
              <div className="mt-2 text-[10px] text-gray-400">
                当前: {active.config.name} / {active.model.name}
              </div>
            )}
          </div>
        )}

        {apiConfigs.length === 0 ? (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800">尚未配置任何供应商，点击上方按钮添加。</p>
          </div>
        ) : (
          <div className="space-y-3">
            {apiConfigs.map((config) => {
              const isActive = activeApiConfigId === config.id
              const cat = config.category || 'custom'
              const isEditing = editingId === config.id
              return (
                <div
                  key={config.id}
                  onClick={() => setActiveApiConfig(config.id)}
                  className={`border rounded-lg p-4 cursor-pointer transition-all ${
                    isActive ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200' : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${isActive ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`}>
                        {isActive && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-medium text-gray-800 truncate">{config.name}</h3>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full text-white flex-shrink-0" style={{ backgroundColor: CATEGORY_COLORS[cat] || CATEGORY_COLORS.custom }}>
                            {CATEGORY_LABELS[cat] || '自定义'}
                          </span>
                          <span className="text-[10px] text-gray-400">{config.models.length} 个模型</span>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {config.models.map((m) => (
                            <span key={m.id} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{m.name}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditingId(isEditing ? null : config.id)
                          setModelList([])
                          setFetchTargetId(null)
                          setModelError('')
                        }}
                        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                        title="编辑"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(config.id) }}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                        title="删除"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>

                  {/* 内联编辑 - 模型列表 */}
                  {isEditing && (
                    <div className="mt-3 pt-3 border-t border-gray-200 space-y-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={config.name}
                        onChange={(e) => updateApiConfig(config.id, { name: e.target.value })}
                        className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm"
                        placeholder="名称"
                      />
                      <input
                        type="text"
                        value={config.apiUrl}
                        onChange={(e) => updateApiConfig(config.id, { apiUrl: e.target.value })}
                        onBlur={(e) => updateApiConfig(config.id, { apiUrl: e.target.value.trim() })}
                        className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm"
                        placeholder="API URL"
                      />
                      <div className="relative">
                        <input
                          type={showApiKey[config.id] ? 'text' : 'password'}
                          value={config.apiKey}
                          onChange={(e) => updateApiConfig(config.id, { apiKey: e.target.value })}
                          onBlur={(e) => {
                            const trimmed = e.target.value.trim()
                            if (trimmed) updateApiConfig(config.id, { apiKey: trimmed })
                          }}
                          className="w-full px-3 py-1.5 pr-8 border border-gray-300 rounded text-sm"
                          placeholder="API Key"
                        />
                        <button
                          type="button"
                          onClick={() => setShowApiKey((prev) => ({ ...prev, [config.id]: !prev[config.id] }))}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          title={showApiKey[config.id] ? '隐藏' : '显示'}
                          aria-label={showApiKey[config.id] ? '隐藏 API Key' : '显示 API Key'}
                        >
                          {showApiKey[config.id] ? (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          )}
                        </button>
                      </div>

                      {/* 模型列表 */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-sm font-medium text-gray-700">模型列表</label>
                          <button
                            onClick={() => fetchModels(config.apiUrl, config.apiKey, config.id)}
                            disabled={modelListLoading || !config.apiUrl || !config.apiKey}
                            className="px-2 py-1 border border-gray-300 rounded text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                          >
                            {modelListLoading && fetchTargetId === config.id ? '获取中...' : '+ 获取模型列表'}
                          </button>
                        </div>

                        {config.models.map((m) => (
                          <div key={m.id} className="flex items-center gap-2 py-1.5 border-b border-gray-100 last:border-0">
                            <input
                              type="text"
                              value={m.name}
                              onChange={(e) => updateModelInConfig(config.id, m.id, { name: e.target.value })}
                              className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs"
                              placeholder="显示名称"
                            />
                            <input
                              type="text"
                              value={m.modelId}
                              onChange={(e) => updateModelInConfig(config.id, m.id, { modelId: e.target.value })}
                              className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs"
                              placeholder="模型 ID"
                            />
                            <input
                              type="number"
                              min={1}
                              value={m.maxContextTokens}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10)
                                updateModelInConfig(config.id, m.id, { maxContextTokens: isNaN(val) || val < 1 ? DEFAULT_MAX_TOKENS : val })
                              }}
                              className="w-20 px-2 py-1 border border-gray-200 rounded text-xs"
                              placeholder="Token"
                            />
                            <div className="flex gap-0.5">
                              <button
                                onClick={() => updateModelInConfig(config.id, m.id, { hasVision: !m.hasVision })}
                                className="text-[9px] px-1 py-0.5 rounded transition-colors"
                                style={{
                                  backgroundColor: m.hasVision ? '#8b5cf620' : '#f3f4f6',
                                  color: m.hasVision ? '#8b5cf6' : '#9ca3af',
                                }}
                                title="支持图片识别"
                              >
                                视觉
                              </button>
                              <button
                                onClick={() => updateModelInConfig(config.id, m.id, { audioCapable: !m.audioCapable })}
                                className="text-[9px] px-1 py-0.5 rounded transition-colors"
                                style={{
                                  backgroundColor: m.audioCapable ? '#f59e0b20' : '#f3f4f6',
                                  color: m.audioCapable ? '#f59e0b' : '#9ca3af',
                                }}
                                title="支持音频转文字"
                              >
                                音频
                              </button>
                            </div>
                            <ThinkingTestButton
                              config={config}
                              model={m}
                              onResult={(ok) => updateModelInConfig(config.id, m.id, { hasThinking: ok })}
                            />
                            <button
                              onClick={() => removeModelFromConfig(config.id, m.id)}
                              className="text-gray-400 hover:text-red-500 p-0.5"
                              aria-label="删除模型"
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </div>
                        ))}

                        {/* 手动添加模型 */}
                        <button
                          onClick={() => addModelToConfig(config.id, { name: '', modelId: '', hasVision: false, maxContextTokens: DEFAULT_MAX_TOKENS })}
                          className="mt-1 text-xs text-blue-500 hover:text-blue-600"
                        >
                          + 手动添加模型
                        </button>

                        {/* 从获取的列表中添加 */}
                        {fetchTargetId === config.id && modelList.length > 0 && (
                          <div className="mt-2 border border-gray-200 rounded max-h-32 overflow-auto bg-white">
                            {modelList.map((mId) => {
                              const exists = config.models.some((m) => m.modelId === mId)
                              return (
                                <button
                                  key={mId}
                                  onClick={() => !exists && handleAddModelFromList(config.id, mId)}
                                  disabled={exists}
                                  className={`w-full text-left px-2 py-1 text-xs flex items-center justify-between ${
                                    exists ? 'text-gray-300 cursor-default' : 'text-gray-700 hover:bg-blue-50'
                                  }`}
                                >
                                  <span>{mId}</span>
                                  {exists && <span className="text-[10px]">已添加</span>}
                                </button>
                              )
                            })}
                          </div>
                        )}
                        {modelError && fetchTargetId === config.id && <p className="text-xs text-red-500 mt-1">{modelError}</p>}
                      </div>

                      {/* 确认按钮 */}
                      <div className="flex justify-end pt-2">
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-4 py-1.5 bg-blue-500 text-white rounded-lg text-xs font-medium hover:bg-blue-600 transition-colors"
                        >
                          完成
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteConfirmId}
        title="删除配置"
        message="确定要删除此 API 配置吗？"
        confirmLabel="删除"
        danger
        onConfirm={() => { if (deleteConfirmId) removeApiConfig(deleteConfirmId); setDeleteConfirmId(null) }}
        onCancel={() => setDeleteConfirmId(null)}
      />
      </>
    )
  }

  // ---- 预设选择视图 ----
  if (view === 'presets') {
    const categories = [...new Set(PROVIDER_PRESETS.map((p) => p.category))]
    return (
      <div className="max-w-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-gray-800">选择供应商</h2>
          <button onClick={() => setView('list')} className="text-sm text-gray-500 hover:text-gray-700">← 返回</button>
        </div>

        {categories.map((cat) => (
          <div key={cat} className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[cat] }} />
              <h3 className="text-sm font-medium text-gray-600">{CATEGORY_LABELS[cat]}</h3>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {PROVIDER_PRESETS.filter((p) => p.category === cat).map((preset, i) => (
                <button
                  key={i}
                  onClick={() => handlePresetSelect(preset)}
                  className="text-left border border-gray-200 rounded-lg p-3 hover:border-blue-400 hover:bg-blue-50 transition-colors"
                >
                  <div className="font-medium text-gray-800 text-sm">{preset.name}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">{preset.models.length} 个模型</div>
                </button>
              ))}
            </div>
          </div>
        ))}

        <button onClick={handleCustom} className="w-full border border-dashed border-gray-300 rounded-lg p-3 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-600">
          + 自定义供应商
        </button>
      </div>
    )
  }

  // ---- 表单视图 ----
  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-gray-800">
          {formData.category === 'custom' ? '自定义供应商' : `添加 ${formData.name}`}
        </h2>
        <button onClick={() => setView('presets')} className="text-sm text-gray-500 hover:text-gray-700">← 返回</button>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">名称</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            placeholder="如：我的 DeepSeek"
            maxLength={100}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">API 地址</label>
          <input
            type="text"
            value={formData.apiUrl}
            onChange={(e) => setFormData({ ...formData, apiUrl: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            placeholder="https://api.example.com/v1/chat/completions"
            maxLength={500}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">API Key *</label>
          <input
            type="password"
            value={formData.apiKey}
            onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            placeholder="sk-..."
            autoFocus
            maxLength={500}
          />
        </div>

        {/* 模型选择 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">模型</label>
          <p className="text-xs text-gray-400 mb-2">添加后可在编辑中修改参数</p>
          <div className="flex flex-wrap gap-1.5">
            {formData.preselectedModels.map((modelId) => (
              <button
                key={modelId}
                onClick={() => setFormData({ ...formData, preselectedModels: formData.preselectedModels.filter((m) => m !== modelId) })}
                className="px-2 py-1 text-xs bg-blue-100 text-blue-600 rounded-full flex items-center gap-1"
              >
                {modelId}
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={handleSave} className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600">
            保存
          </button>
          <button onClick={() => setView('list')} className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200">
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
