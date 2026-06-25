import { useCallback, useState, useEffect, useRef, lazy, Suspense } from 'react'
import { useDocumentStore } from '../../stores/documentStore'
import { useTabStore } from '../../stores/tabStore'
import { useAiStore } from '../../stores/aiStore'

import { getDesktopHost } from '../../lib/desktopHost'
import { logger } from '../../lib/logger'
import { MIN_SELECTION_SIZE } from '../../lib/constants'
import { dragRegion, noDragRegion } from '../../lib/styles'
import DocumentTabs from './DocumentTabs'
import DocxViewer from './DocxViewer'
import ImageViewer from './ImageViewer'
import ChatView from '../ai/ChatView'
import WinControls from '../shared/WinControls'

const PdfViewer = lazy(() => import('./PdfViewer'))

export default function DocumentViewer() {
  const { tabs, activeTabId, closeTab, setActiveTab, getActiveDocument, openFile, selectionMode } = useDocumentStore()
  const { openSettings, openNotes } = useTabStore()

  const activeDocument = getActiveDocument()


  // 框选状态
  const [isSelecting, setIsSelecting] = useState(false)
  const [selStart, setSelStart] = useState<{ x: number; y: number } | null>(null)
  const [selEnd, setSelEnd] = useState<{ x: number; y: number } | null>(null)
  const docAreaRef = useRef<HTMLDivElement>(null)
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null)
  const DRAG_THRESHOLD = 5

  // 左键按下：记录起点（仅在框选模式下）
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    if (!activeDocument || !selectionMode) return
    e.preventDefault()
    mouseDownPosRef.current = { x: e.clientX, y: e.clientY }
  }, [activeDocument, selectionMode])

  // 鼠标移动：超过阈值后开始显示选区
  // 使用 refs 避免闭包捕获过期值
  const isSelectingRef = useRef(false)
  const selStartRef = useRef<{ x: number; y: number } | null>(null)
  useEffect(() => { isSelectingRef.current = isSelecting }, [isSelecting])
  useEffect(() => { selStartRef.current = selStart }, [selStart])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const downPos = mouseDownPosRef.current
    if (!downPos) return

    if (!isSelectingRef.current) {
      const dx = Math.abs(e.clientX - downPos.x)
      const dy = Math.abs(e.clientY - downPos.y)
      if (dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD) return
      setSelStart(downPos)
      setSelEnd(downPos)
      setIsSelecting(true)
      return
    }

    setSelEnd({ x: e.clientX, y: e.clientY })
  }, [])

  // 左键松开：发送到主进程裁剪
  const handleMouseUp = useCallback(async (e: MouseEvent) => {
    mouseDownPosRef.current = null

    if (!isSelectingRef.current) return
    setIsSelecting(false)

    const start = selStartRef.current
    const end = { x: e.clientX, y: e.clientY }
    setSelStart(null)
    setSelEnd(null)

    if (!start) return

    const selW = Math.abs(end.x - start.x)
    const selH = Math.abs(end.y - start.y)
    if (selW < MIN_SELECTION_SIZE || selH < MIN_SELECTION_SIZE) return

    const host = getDesktopHost()
    const croppedData = await host.invoke('desktop:screenshot:crop-selection', {
      viewportX: Math.min(start.x, end.x),
      viewportY: Math.min(start.y, end.y),
      width: selW,
      height: selH,
    })

    if (typeof croppedData === 'string' && croppedData) {
      useAiStore.getState().addPendingScreenshot(croppedData)
    }
  }, [])

  // 右键取消框选
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    if (isSelectingRef.current) {
      setIsSelecting(false)
      setSelStart(null)
      setSelEnd(null)
    }
  }, [])

  // 全局 mousemove/mouseup 监听（有 activeDocument 时始终监听，以检测拖动）
  useEffect(() => {
    if (!activeDocument) return
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [activeDocument, handleMouseMove, handleMouseUp])

  // ESC 键取消框选
  useEffect(() => {
    if (!isSelecting) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsSelecting(false)
        setSelStart(null)
        setSelEnd(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isSelecting])

  useEffect(() => {
    const host = getDesktopHost()
    let cleanup: (() => void) | undefined

    host.events.listen<{ filePath: string }>('open-file', (payload) => {
      openFile(payload.filePath)
    }).then((cb) => { cleanup = cb }).catch(() => logger.warn('文件打开事件监听失败'))

    return () => { cleanup?.() }
  }, [openFile])

  const handleOpenFile = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.pdf,.docx,.doc,.txt,.md,.jpg,.jpeg,.png,.gif,.bmp,.webp'
    input.multiple = true
    input.onchange = (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || [])
      useDocumentStore.getState().addLocalFiles(files)
    }
    input.click()
  }, [])

  const renderDocument = () => {
    if (!activeDocument) {
      return (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <svg
                className="w-16 h-16 mx-auto mb-4 text-gray-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <p className="text-lg font-medium">拖拽文件到此处打开</p>
              <p className="text-sm mt-2">或点击"打开文件"按钮</p>
              <p className="text-xs mt-1 text-gray-400">支持 PDF、Word、图片格式</p>
            </div>
        </div>
      )
    }

    if (activeDocument.content === null) {
      return (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <p className="text-sm">文件内容加载失败</p>
        </div>
      )
    }

    switch (activeDocument.fileType) {
      case 'pdf':
        return <Suspense fallback={<div className="h-full flex items-center justify-center text-gray-400">加载 PDF 查看器...</div>}>
          <PdfViewer content={activeDocument.content as ArrayBuffer} />
        </Suspense>
      case 'docx':
        return <DocxViewer content={activeDocument.content as ArrayBuffer} />
      case 'image':
        return <ImageViewer content={activeDocument.content as ArrayBuffer} />
      case 'text':
        return (
          <div className="flex-1 p-4 overflow-auto">
            <pre className="whitespace-pre-wrap font-mono text-sm">
              {activeDocument.content as string}
            </pre>
          </div>
        )
      default:
        return null
    }
  }

  const host = getDesktopHost()

  return (
    <div className="h-screen flex flex-col relative">
      <header
        className="h-10 bg-white border-b border-gray-200 flex items-center pl-4 justify-between shrink-0 select-none"
        style={dragRegion}
      >
        <div className="flex items-center gap-1" style={noDragRegion}>
          <span className="text-sm font-semibold text-gray-800 mr-2">问渠</span>
          <button
            onClick={() => host.invoke('chat:toggle')}
            className="h-6 px-2 text-[11px] font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded transition-colors"
            title="打开/关闭 AI 悬浮窗"
          >
            悬浮窗
          </button>
          <button
            onClick={handleOpenFile}
            className="h-7 px-3 text-xs text-gray-600 hover:bg-gray-100 rounded flex items-center gap-1"
            title="打开文件 (PDF/Word/图片)"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            打开文件
          </button>
          <button
            onClick={openNotes}
            className="h-7 px-2 text-xs rounded flex items-center gap-1 text-gray-600 hover:bg-gray-100"
            title="查看笔记"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            笔记
          </button>
          <button
            onClick={openSettings}
            className="h-7 px-2 text-xs text-gray-600 hover:bg-gray-100 rounded flex items-center gap-1"
            title="设置 (Escape 返回)"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            设置
          </button>
        </div>

        <WinControls />
      </header>

      <div className="flex-1 flex overflow-hidden min-w-0">
        <div
          ref={docAreaRef}
          className={`flex-1 min-w-0 flex flex-col border-r border-gray-200 relative ${selectionMode ? 'selection-mode' : ''}`}
          onContextMenu={handleContextMenu}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            const files = Array.from(e.dataTransfer.files)
            useDocumentStore.getState().addLocalFiles(files)
          }}
        >
          {/* 标签栏 - 阻止框选事件冒泡 */}
          <div onMouseDown={(e) => e.stopPropagation()}>
            <DocumentTabs
              tabs={tabs}
              activeTabId={activeTabId}
              onSelect={setActiveTab}
              onClose={closeTab}
            />
          </div>

          {/* 内容区域 - 框选只在此区域内生效 */}
          <div
            className={`flex-1 flex flex-col relative min-h-0 ${selectionMode ? 'selection-mode' : ''}`}
            onMouseDown={activeDocument ? handleMouseDown : undefined}
          >
            {renderDocument()}

            {/* 框选遮罩 - fixed 定位，不随内容滚动 */}
            {isSelecting && selStart && selEnd && (
              <div className="fixed inset-0 z-50 pointer-events-none">
                <div
                  className="absolute border-2 border-blue-500 bg-blue-500/10"
                  style={{
                    left: Math.min(selStart.x, selEnd.x),
                    top: Math.min(selStart.y, selEnd.y),
                    width: Math.abs(selEnd.x - selStart.x),
                    height: Math.abs(selEnd.y - selStart.y),
                  }}
                />
                <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-xs px-3 py-1 rounded-full shadow-lg whitespace-nowrap">
                  松开鼠标发送截图，到右侧输入问题
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="w-[384px] min-w-[280px] max-w-[480px] shrink flex flex-col border-l border-gray-200">
          <ChatView />
        </div>
      </div>
    </div>
  )
}
