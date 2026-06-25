import { useEffect, useState, useRef } from 'react'

interface ToastProps {
  message: string
  type?: 'info' | 'success' | 'error'
  duration?: number
  onClose: () => void
}

export default function Toast({ message, type = 'info', duration = 3000, onClose }: ToastProps) {
  const [visible, setVisible] = useState(true)

  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    let alive = true
    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(() => { if (alive) onCloseRef.current() }, 300)
    }, duration)
    return () => { alive = false; clearTimeout(timer) }
  }, [duration])

  const colors = {
    info: 'bg-gray-800 text-white',
    success: 'bg-green-500 text-white',
    error: 'bg-red-500 text-white',
  }

  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg shadow-lg text-sm transition-all duration-300 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      } ${colors[type]}`}
    >
      {message}
    </div>
  )
}
