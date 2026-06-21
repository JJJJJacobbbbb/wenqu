import { useRef, useEffect, useState } from 'react'

interface ThinkingDisplayProps {
  text: string
  isStreaming: boolean
  statusText?: string
}

const STREAM_LINES = 6

export default function ThinkingDisplay({ text, isStreaming, statusText }: ThinkingDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(true)

  // 思考结束时自动收起
  useEffect(() => {
    if (!isStreaming && text) {
      const t = setTimeout(() => setExpanded(false), 300)
      return () => clearTimeout(t)
    }
  }, [isStreaming, text])

  // 流式+展开时自动滚动到底部
  useEffect(() => {
    if (isStreaming && expanded && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [text, isStreaming, expanded])

  if (!text && !statusText) return null

  const lines = text.split('\n')

  // 流式+展开：最后 6 行；结束后+展开：全部；收起：不显示内容
  const displayLines = isStreaming && expanded
    ? lines.slice(-STREAM_LINES)
    : expanded ? lines : []
  const hiddenCount = isStreaming && expanded ? lines.length - displayLines.length : 0

  return (
    <div className="mb-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-purple-500 hover:text-purple-600 select-none"
      >
        <svg
          className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        {isStreaming ? '思考中...' : '已思考'}
      </button>

      {expanded && displayLines.length > 0 && (
        <div
          ref={containerRef}
          className="mt-1 p-2 bg-purple-50 rounded text-xs text-gray-600 font-mono max-h-48 overflow-y-auto"
        >
          {hiddenCount > 0 && (
            <div className="text-purple-300 text-[10px] mb-1">... 已省略 {hiddenCount} 行</div>
          )}
          {displayLines.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap leading-relaxed">{line || '\u00A0'}</div>
          ))}
          {isStreaming && (
            <span className="inline-block w-1.5 h-3 bg-purple-400 animate-pulse ml-0.5" />
          )}
        </div>
      )}

      {/* 状态提示（无思考内容时） */}
      {statusText && isStreaming && !text && (
        <div className="mt-1 flex items-center gap-2 text-xs text-purple-500">
          <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse" />
          {statusText}
        </div>
      )}
    </div>
  )
}
