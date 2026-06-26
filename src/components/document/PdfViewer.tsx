import { useEffect, useState, useRef, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { logger } from '../../lib/logger'
import ZoomControls from '../shared/ZoomControls'

const RENDER_SCALE = 2.0
const BUFFER_PAGES = 2
const RELEASE_DISTANCE = BUFFER_PAGES * 3

interface PdfViewerProps {
  content: ArrayBuffer | Uint8Array | string | null
}

interface PageRatio {
  ratio: number
}

/** 将 content 统一转为 Uint8Array */
function toUint8Array(content: ArrayBuffer | Uint8Array | string): Uint8Array {
  if (content instanceof ArrayBuffer) {
    if (content.byteLength === 0) throw new Error('ArrayBuffer 为空')
    return new Uint8Array(content)
  }
  if (content instanceof Uint8Array) return content
  if (typeof content === 'string') {
    const bin = atob(content)
    return Uint8Array.from(bin, (c) => c.charCodeAt(0))
  }
  throw new Error('不支持的内容格式')
}

export default function PdfViewer({ content }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [baseWidth, setBaseWidth] = useState(0)
  const [pages, setPages] = useState<PageRatio[]>([])
  // pageSrcs 与 pages 分离：页面渲染/释放时只更新 src，不克隆整个 pages 数组（O(1) vs O(n²)）
  const [pageSrcs, setPageSrcs] = useState<Record<number, string>>({})
  const pageSrcsRef = useRef<Record<number, string>>({})
  const [totalPages, setTotalPages] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const pdfRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null)
  const renderingRef = useRef<Set<number>>(new Set())
  const pagesRef = useRef<PageRatio[]>([])

  // 容器宽度跟踪
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setBaseWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener('resize', update)
    return () => { ro.disconnect(); window.removeEventListener('resize', update) }
  }, [])

  // Ctrl+滚轮缩放 + Ctrl+/- 键盘缩放
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      setZoom((z) => Math.min(5, Math.max(0.25, z + (e.deltaY < 0 ? 0.1 : -0.1))))
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey || (e.key !== '+' && e.key !== '-' && e.key !== '=')) return
      e.preventDefault()
      setZoom((z) => Math.min(5, Math.max(0.25, z + (e.key === '-' ? -0.1 : 0.1))))
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      el.removeEventListener('wheel', handleWheel)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  // 加载 PDF：只提取每页宽高比
  useEffect(() => {
    let cancelled = false

    ;(async () => {
      setLoading(true)
      setError(null)
      setPages([])
      setPageSrcs({})
      pageSrcsRef.current = {}

      try {
        if (!content) throw new Error('文件内容为空')
        const raw = toUint8Array(content)
        if (raw.length === 0) throw new Error('文件内容为空')

        const pdf = await pdfjsLib.getDocument({ data: raw }).promise
        if (cancelled) return

        pdfRef.current = pdf
        setTotalPages(pdf.numPages)

        const result: PageRatio[] = []
        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelled) return
          const page = await pdf.getPage(i)
          const vp = page.getViewport({ scale: RENDER_SCALE })
          result.push({ ratio: vp.height / vp.width })
        }
        if (!cancelled) {
          setPages(result)
          pagesRef.current = result
        }
      } catch (err: unknown) {
        if (cancelled) return
        logger.error('PDF 加载失败', err)
        if (!cancelled) setError(err instanceof Error ? err.message : '未知错误')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
      renderingRef.current.clear()
      pdfRef.current?.destroy()
      pdfRef.current = null
    }
  }, [content])

  // 渲染单页为 data URL — 只更新 pageSrcs，O(1) 替换
  const renderPage = useCallback(async (pageIndex: number) => {
    const pdf = pdfRef.current
    if (!pdf || renderingRef.current.has(pageIndex)) return
    if (pageIndex < 0 || pageIndex >= pagesRef.current.length) return
    if (pageSrcsRef.current[pageIndex] !== undefined) return

    renderingRef.current.add(pageIndex)
    try {
      const page = await pdf.getPage(pageIndex + 1)
      const vp = page.getViewport({ scale: RENDER_SCALE })
      const canvas = document.createElement('canvas')
      canvas.width = vp.width
      canvas.height = vp.height
      const ctx = canvas.getContext('2d')
      if (ctx) await page.render({ canvasContext: ctx, viewport: vp }).promise
      const src = canvas.toDataURL('image/png')
      canvas.width = 0
      canvas.height = 0

      setPageSrcs((prev) => {
        const next = { ...prev, [pageIndex]: src }
        pageSrcsRef.current = next
        return next
      })
    } catch (err) {
      logger.error(`渲染第 ${pageIndex + 1} 页失败`, err)
    } finally {
      renderingRef.current.delete(pageIndex)
    }
  }, [])

  // IntersectionObserver: 懒加载 + 释放远距页面
  useEffect(() => {
    if (loading || pages.length === 0 || !containerRef.current) return

    const visiblePages = new Set<number>()

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const idx = Number((entry.target as HTMLElement).dataset.pageIndex)
        if (isNaN(idx)) continue

        if (entry.isIntersecting) {
          visiblePages.add(idx)
          for (let d = -BUFFER_PAGES; d <= BUFFER_PAGES; d++) renderPage(idx + d)
        } else {
          visiblePages.delete(idx)
        }
      }

      if (visiblePages.size === 0) return
      const min = Math.min(...visiblePages)
      setCurrentPage(min + 1)
      const max = Math.max(...visiblePages)

      // 释放远距页面：只删除 key，O(1) 每次
      setPageSrcs((prev) => {
        const next = { ...prev }
        let changed = false
        for (const key of Object.keys(next)) {
          const i = Number(key)
          if (i < min - RELEASE_DISTANCE || i > max + RELEASE_DISTANCE) {
            delete next[i]
            changed = true
          }
        }
        if (changed) { pageSrcsRef.current = next; return next }
        return prev
      })
    }, { root: containerRef.current, rootMargin: '200px 0px', threshold: 0 })

    containerRef.current.querySelectorAll('[data-page-index]').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, pages.length, renderPage])

  const displayW = (baseWidth || 600) * zoom

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-w-0">
      <div className="h-10 bg-gray-50 border-b border-gray-200 flex items-center justify-between px-4 flex-shrink-0">
        <span className="text-sm text-gray-500">
          {loading ? '加载中...' : error ? '加载失败' : `第 ${currentPage} / ${totalPages} 页`}
        </span>
        <ZoomControls zoom={zoom} onChange={setZoom} />
      </div>
      {/* containerRef 始终在 DOM 中，确保 ResizeObserver 生效 */}
      <div ref={containerRef} className="flex-1 overflow-auto bg-gray-100 p-4">
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-500">加载中...</div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-red-500">{error}</div>
        ) : (
          <div className="flex flex-col items-start gap-4">
            {pages.map((p, i) => (
              <div
                key={i}
                data-page-index={i}
                className="bg-white shadow-sm"
                style={{ width: displayW, height: displayW * p.ratio }}
              >
                {pageSrcs[i] ? (
                  <img src={pageSrcs[i]} alt={`第 ${i + 1} 页`} className="block w-full h-full" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300 text-sm">
                    第 {i + 1} 页
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
