import { ProviderCategory } from '../stores/settingsStore'

export interface PresetModel {
  name: string
  modelId: string
  hasVision: boolean
  maxContextTokens: number
  hasThinking?: boolean
}

export interface ProviderPreset {
  name: string
  apiUrl: string
  models: PresetModel[]
  category: ProviderCategory
  icon?: string
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    name: 'OpenAI',
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    models: [
      { name: 'GPT-4o', modelId: 'gpt-4o', hasVision: true, maxContextTokens: 128000 },
      { name: 'GPT-4o mini', modelId: 'gpt-4o-mini', hasVision: true, maxContextTokens: 128000 },
    ],
    category: 'official',
  },
  {
    name: 'DeepSeek',
    apiUrl: 'https://api.deepseek.com/chat/completions',
    models: [
      { name: 'DeepSeek Chat', modelId: 'deepseek-chat', hasVision: false, maxContextTokens: 64000 },
      { name: 'DeepSeek R1', modelId: 'deepseek-reasoner', hasVision: true, maxContextTokens: 64000, hasThinking: true },
    ],
    category: 'cn',
  },
  {
    name: '智谱 GLM',
    apiUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    models: [
      { name: 'GLM-4-Flash', modelId: 'glm-4-flash', hasVision: true, maxContextTokens: 128000 },
      { name: 'GLM-4V-Flash', modelId: 'glm-4v-flash', hasVision: true, maxContextTokens: 8000 },
      { name: 'GLM-4-Plus', modelId: 'glm-4-plus', hasVision: true, maxContextTokens: 128000 },
    ],
    category: 'cn',
  },
  {
    name: '通义 Qwen',
    apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    models: [
      { name: 'Qwen-Plus', modelId: 'qwen-plus', hasVision: true, maxContextTokens: 131072 },
      { name: 'Qwen-VL-Plus', modelId: 'qwen-vl-plus', hasVision: true, maxContextTokens: 8000 },
      { name: 'Qwen-Max', modelId: 'qwen-max', hasVision: true, maxContextTokens: 32000 },
    ],
    category: 'cn',
  },
  {
    name: 'Moonshot',
    apiUrl: 'https://api.moonshot.cn/v1/chat/completions',
    models: [
      { name: 'Moonshot v1 8K', modelId: 'moonshot-v1-8k', hasVision: false, maxContextTokens: 8000 },
      { name: 'Moonshot v1 32K', modelId: 'moonshot-v1-32k', hasVision: false, maxContextTokens: 32000 },
      { name: 'Moonshot v1 128K', modelId: 'moonshot-v1-128k', hasVision: false, maxContextTokens: 128000 },
    ],
    category: 'cn',
  },
  {
    name: '零一万物',
    apiUrl: 'https://api.lingyiwanwu.com/v1/chat/completions',
    models: [
      { name: 'Yi-Lightning', modelId: 'yi-lightning', hasVision: true, maxContextTokens: 16000 },
    ],
    category: 'cn',
  },
  {
    name: '百川',
    apiUrl: 'https://api.baichuan-ai.com/v1/chat/completions',
    models: [
      { name: 'Baichuan4', modelId: 'Baichuan4', hasVision: true, maxContextTokens: 32000 },
    ],
    category: 'cn',
  },
  {
    name: 'OpenRouter',
    apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
    models: [
      { name: 'GPT-4o (via OpenRouter)', modelId: 'openai/gpt-4o', hasVision: true, maxContextTokens: 128000 },
    ],
    category: 'aggregator',
  },
  {
    name: 'OneAPI / NewAPI',
    apiUrl: '',
    models: [
      { name: '自定义模型', modelId: 'gpt-4o', hasVision: true, maxContextTokens: 128000 },
    ],
    category: 'aggregator',
  },
]

export const CATEGORY_LABELS: Record<ProviderCategory, string> = {
  official: '国际官方',
  cn: '国产模型',
  aggregator: '聚合平台',
  custom: '自定义',
}

export const CATEGORY_COLORS: Record<ProviderCategory, string> = {
  official: '#10b981',
  cn: '#3b82f6',
  aggregator: '#f59e0b',
  custom: '#6b7280',
}
