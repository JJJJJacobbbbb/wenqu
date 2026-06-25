import { useEffect, useState, useRef, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { logger } from '../../lib/logger'
import ZoomControls from '../shared/ZoomControls'

const RENDER_SCALE = 2.0
const BUFFER_PAGES = 2 // 提前渲染上下各2页

interface PdfViewerProps {
  content: ArrayBuffer | Uint8Array | string | null
}

interface PageInfo {
  src: string | null // null = 未渲染
  ratio: number
}

export default function PdfViewer({ content }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [baseWidth, setBaseWidth] = useState(0)
  const [pages, setPages] = useState<PageInfo[]>([])
  const [totalPages, setTotalPages] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const pdfRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null)
  const renderingRef = useRef<Set<number>>(new Set())
  const pagesRef = useRef<PageInfo[]>([])

  const measure = useCallback(() => {
    if (containerRef.current) {
      setBaseWidth(containerRef.current.clientWidth)
    }
  }, [])

  useEffect(() => {
    measure()
    const onResize = () => requestAnimationFrame(measure)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [measure])

  // 加载 PDF 并获取页信息（不渲染）
  useEffect(() => {
    let cancelled = false

    const run = async () => {
      setLoading(true)
      setError(null)
      setPages([])

      try {
        let raw: Uint8Array
        if (content instanceof ArrayBuffer) {
          if (content.byteLength === 0) throw new Error('ArrayBuffer 为空')
          raw = new Uint8Array(content)
        } else if (content instanceof Uint8Array) {
          raw = content
        } else if (typeof content === 'string') {
          // base64 字符串
          const binary = atob(content)
          raw = Uint8Array.from(binary, (c) => c.charCodeAt(0))
        } else {
          throw new Error('不支持的内容格式')
        }

        if (raw.length === 0) throw new Error('文件内容为空')

        const buf = new ArrayBuffer(raw.byteLength)
        new Uint8Array(buf).set(raw)
        const data = new Uint8Array(buf)

        const pdf = await pdfjsLib.getDocument({ data }).promise
        if (cancelled) return

        pdfRef.current = pdf
        setTotalPages(pdf.numPages)

        // 只获取每页的宽高比，不渲染
        const result: PageInfo[] = []
        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelled) return
          const page = await pdf.getPage(i)
          const viewport = page.getViewport({ scale: RENDER_SCALE })
          result.push({
            src: null,
            ratio: viewport.height / viewport.width,
          })
        }
        if (!cancelled) {
          setPages(result)
          pagesRef.current = result
        }
      } catch (err: unknown) {
        logger.error('PDF 加载失败', err)
        const errorMessage = err instanceof Error ? err.message : '未知错误'
        if (!cancelled) setError(`加载PDF失败: ${errorMessage}`)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()
    return () => {
      cancelled = true
      renderingRef.current.clear()
      if (pdfRef.current) {
        pdfRef.current.destroy()
        pdfRef.current = null
      }
    }
  }, [content])

  // 渲染指定页面
  const renderPage = useCallback(async (pageIndex: number) => {
    const pdf = pdfRef.current
    if (!pdf || renderingRef.current.has(pageIndex)) return
    const currentPages = pagesRef.current
    if (pageIndex < 0 || pageIndex >= currentPages.length) return
    if (currentPages[pageIndex]?.src !== null) return // 已渲染

    renderingRef.current.add(pageIndex)

    try {
      const page = await pdf.getPage(pageIndex + 1)
      const viewport = page.getViewport({ scale: RENDER_SCALE })
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d')
      if (ctx) {
        await page.render({ canvasContext: ctx, viewport }).promise
      }
      const src = canvas.toDataURL('image/png')

      setPages((prev) => {
        const next = [...prev]
        next[pageIndex] = { ...next[pageIndex], src }
        pagesRef.current = next
        return next
      })
    } catch (err) {
      logger.error(`渲染第 ${pageIndex + 1} 页失败`, err)
    } finally {
      renderingRef.current.delete(pageIndex)
    }
  }, [])

  // IntersectionObserver: 懒加载可见页面
  useEffect(() => {
    if (loading || pages.length === 0 || !containerRef.current) return

    const visiblePages = new Set<number>()

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const idx = Number((entry.target as HTMLElement).dataset.pageIndex)
          if (isNaN(idx)) continue

          if (entry.isIntersecting) {
            visiblePages.add(idx)
            // 预渲染附近页面
            for (let d = -BUFFER_PAGES; d <= BUFFER_PAGES; d++) {
              renderPage(idx + d)
            }
          } else {
            visiblePages.delete(idx)
          }
        }

        // 释放远离视口的页面，节省内存
        if (visiblePages.size === 0) return
        const minVisible = Math.min(...visiblePages)
        const maxVisible = Math.max(...visiblePages)
        const RELEASE_DISTANCE = BUFFER_PAGES * 3
        setPages((prev) => {
          let changed = false
          const next = prev.map((p, i) => {
            if (p.src && (i < minVisible - RELEASE_DISTANCE || i > maxVisible + RELEASE_DISTANCE)) {
              changed = true
              return { ...p, src: null }
            }
            return p
          })
          if (changed) {
            pagesRef.current = next
            return next
          }
          return prev
        })
      },
      {
        root: containerRef.current,
        rootMargin: '200px 0px',
        threshold: 0,
      }
    )

    const pageEls = containerRef.current.querySelectorAll('[data-page-index]')
    pageEls.forEach((el) => observer.observe(el))

    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, pages.length, renderPage])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-gray-500">加载中...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-red-500"><p>{error}</p></div>
      </div>
    )
  }

  const displayW = (baseWidth || 600) * zoom

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 工具栏 */}
      <div className="h-10 bg-gray-50 border-b border-gray-200 flex items-center justify-between px-4 flex-shrink-0">
        <span className="text-sm text-gray-500">共 {totalPages} 页</span>
        <ZoomControls zoom={zoom} onChange={setZoom} />
      </div>
      {/* 内容区 */}
      <div ref={containerRef} className="flex-1 overflow-auto bg-gray-100 p-4">
        <div className="flex flex-col items-start gap-4">
          {pages.map((p, i) => (
            <div
              key={i}
              data-page-index={i}
              className="bg-white shadow-sm"
              style={{ width: displayW, height: displayW * p.ratio }}
            >
              {p.src ? (
                <img
                  src={p.src}
                  alt={`第 ${i + 1} 页`}
                  className="block w-full h-full"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-300 text-sm">
                  第 {i + 1} 页
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
