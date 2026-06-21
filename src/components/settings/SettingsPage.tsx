import { useState } from 'react'
import ApiSettings from './ApiSettings'
import SubjectManager from './SubjectManager'
import MemoryManager from './MemoryManager'
import { useTabStore } from '../../stores/tabStore'
import { dragRegion, noDragRegion } from '../../lib/styles'
import WinControls from '../shared/WinControls'

type SettingsTab = 'api' | 'memory' | 'subjects'

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('api')
  const { openDocument } = useTabStore()

  const tabs = [
    { id: 'api' as const, label: 'AI 模型' },
    { id: 'memory' as const, label: '存储管理' },
    { id: 'subjects' as const, label: '学科添加' },
  ]

  return (
    <div className="h-screen flex flex-col">
      <header
        className="h-10 bg-white border-b border-gray-200 flex items-center pl-4 justify-between shrink-0 select-none"
        style={dragRegion}
      >
        <div className="flex items-center gap-2" style={noDragRegion}>
          <button
            onClick={openDocument}
            className="text-gray-500 hover:text-gray-700"
            aria-label="返回文档"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="font-semibold text-gray-800">设置</h1>
        </div>

        <WinControls />
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-48 bg-gray-50 border-r border-gray-200 py-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`w-full px-4 py-2 text-left text-sm ${
                activeTab === tab.id
                  ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-500'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'api' && <ApiSettings />}
          {activeTab === 'memory' && <MemoryManager />}
          {activeTab === 'subjects' && <SubjectManager />}
        </div>
      </div>
    </div>
  )
}
