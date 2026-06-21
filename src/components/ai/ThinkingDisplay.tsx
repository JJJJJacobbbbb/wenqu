import { useRef, useEffect, useState } from 'react'

interface ThinkingDisplayProps {
  text: string
  isStreaming: boolean
  statusText?: string
}

const PREVIEW_LINES = 3

export default function ThinkingDisplay({ text, isStreaming, statusText }: ThinkingDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)

  // 思考结束时自动收起
  useEffect(() => {
    if (!isStreaming && text) {
      const t = setTimeout(() => setExpanded(false), 800)
      return () => clearTimeout(t)
    }
    // 流式开始时展开
    if (isStreaming) {
      setExpanded(true)
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
        {isStreaming ? '思考中...' : '思考过程'}
      </button>

      {expanded ? (
        /* 展开：显示全部 */
        <div
          ref={containerRef}
          className="mt-1 p-2 bg-purple-50 rounded text-xs text-gray-600 font-mono max-h-48 overflow-y-auto"
        >
          {lines.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap leading-relaxed">{line || '\u00A0'}</div>
          ))}
          {isStreaming && (
            <span className="inline-block w-1.5 h-3 bg-purple-400 animate-pulse ml-0.5" />
          )}
        </div>
      ) : (
        /* 收起：只显示最后几行预览 */
        lines.length > PREVIEW_LINES && (
          <div className="mt-1 p-2 bg-purple-50 rounded text-xs text-gray-500 font-mono">
            <div className="text-purple-300 text-[10px] mb-1">... 共 {lines.length} 行</div>
            {lines.slice(-PREVIEW_LINES).map((line, i) => (
              <div key={i} className="whitespace-pre-wrap leading-relaxed truncate">{line || '\u00A0'}</div>
            ))}
          </div>
        )
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
