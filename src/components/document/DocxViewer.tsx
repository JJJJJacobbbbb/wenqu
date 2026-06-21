import { useEffect, useState, useRef } from 'react'
import { logger } from '../../lib/logger'
import ZoomControls from '../shared/ZoomControls'

interface DocxViewerProps {
  content: ArrayBuffer
}

export default function DocxViewer({ content }: DocxViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [zoom, setZoom] = useState(1)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const renderDoc = async () => {
      setLoading(true)
      setError(null)

      try {
        const { renderAsync } = await import('docx-preview')
        if (cancelled || !containerRef.current) return

        // 清空容器
        containerRef.current.innerHTML = ''

        await renderAsync(content, containerRef.current, undefined, {
          className: 'docx-body',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: false,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
        })
      } catch (err) {
        logger.error('DOCX 渲染失败', err)
        const errorMessage = err instanceof Error ? err.message : '未知错误'
        if (!cancelled) setError(`加载文档失败: ${errorMessage}`)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    renderDoc()
    return () => { cancelled = true }
  }, [content])

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-red-500"><p>{error}</p></div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 工具栏 */}
      <div className="h-10 bg-gray-50 border-b border-gray-200 flex items-center justify-between px-4 flex-shrink-0">
        <span className="text-sm text-gray-500">Word 文档</span>
        <ZoomControls zoom={zoom} onChange={setZoom} />
      </div>
      {/* 内容区 */}
      <div className="flex-1 overflow-auto bg-gray-100 p-4">
        <div className="flex justify-center">
          <div
            ref={containerRef}
            className="docx-viewer-container bg-white shadow-sm"
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'top center',
            }}
          />
        </div>
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="text-gray-500">加载中...</div>
          </div>
        )}
      </div>
    </div>
  )
}
