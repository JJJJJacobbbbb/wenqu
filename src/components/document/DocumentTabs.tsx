import { DocumentTab } from '../../stores/documentStore'

interface DocumentTabsProps {
  tabs: DocumentTab[]
  activeTabId: string | null
  onSelect: (tabId: string) => void
  onClose: (tabId: string) => void
}

export default function DocumentTabs({ tabs, activeTabId, onSelect, onClose }: DocumentTabsProps) {
  if (tabs.length === 0) {
    return null
  }

  return (
    <div className="h-10 bg-gray-100 border-b border-gray-200 flex overflow-x-auto">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`flex items-center gap-2 px-4 py-2 cursor-pointer border-r border-gray-200 min-w-0 ${
            activeTabId === tab.id
              ? 'bg-white text-gray-800'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
          onClick={() => onSelect(tab.id)}
        >
          <span className="truncate text-sm max-w-[120px]">{tab.fileName}</span>
          <button
            className="text-gray-400 hover:text-gray-600 flex-shrink-0"
            onClick={(e) => {
              e.stopPropagation()
              onClose(tab.id)
            }}
            aria-label="关闭标签"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}
