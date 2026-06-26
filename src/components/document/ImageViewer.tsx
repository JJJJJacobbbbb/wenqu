import { useEffect, useState, useRef } from 'react'
import ZoomControls from '../shared/ZoomControls'

interface ImageViewerProps {
  content: ArrayBuffer
}

export default function ImageViewer({ content }: ImageViewerProps) {
  const [imageUrl, setImageUrl] = useState<string>('')
  const [scale, setScale] = useState(1)
  const prevUrlRef = useRef<string>('')

  useEffect(() => {
    const blob = new Blob([content])
    const url = URL.createObjectURL(blob)
    setImageUrl(url)
    setScale(1) // 内容变化时重置缩放

    // 清理上一张 URL（React effect cleanup 保证执行顺序安全）
    const prev = prevUrlRef.current
    prevUrlRef.current = url
    if (prev) URL.revokeObjectURL(prev)

    return () => {
      if (prevUrlRef.current) {
        URL.revokeObjectURL(prevUrlRef.current)
        prevUrlRef.current = ''
      }
    }
  }, [content])

  if (!imageUrl) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-gray-500">加载中...</div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="h-10 bg-gray-50 border-b border-gray-200 flex items-center justify-end px-4">
        <ZoomControls zoom={scale} onChange={setScale} />
      </div>
      <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-gray-100">
        <img
          src={imageUrl}
          alt="Document"
          style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}
          className="max-w-full h-auto"
        />
      </div>
    </div>
  )
}
