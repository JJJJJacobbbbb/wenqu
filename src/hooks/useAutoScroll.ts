import { useRef, useCallback, useEffect, DependencyList } from 'react'

export function useAutoScroll(deps: DependencyList, sessionId?: string | null) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)

  const checkScrollPosition = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const threshold = 100
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
  }, [])

  const scrollToBottom = useCallback(() => {
    if (!isNearBottomRef.current) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

  // 消息变化时自动滚动
  useEffect(() => {
    requestAnimationFrame(scrollToBottom)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  // 切换会话时始终滚动到底部
  useEffect(() => {
    isNearBottomRef.current = true
    requestAnimationFrame(() => {
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
  }, [sessionId])

  return { scrollRef, checkScrollPosition, scrollToBottom }
}
