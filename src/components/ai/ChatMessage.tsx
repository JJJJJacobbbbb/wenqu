import React, { useState, useCallback, useRef, useEffect } from 'react'
import { Message } from '../../stores/aiStore'
import MarkdownRenderer from './MarkdownRenderer'

interface ChatMessageProps {
  message: Message
  isStreaming?: boolean
}

const ChatMessage = React.memo(function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    return () => { if (copyTimerRef.current) clearTimeout(copyTimerRef.current) }
  }, [])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true)
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      copyTimerRef.current = setTimeout(() => setCopied(false), 1500)
    })
  }, [message.content])

  // 验证截图数据格式，防止 XSS
  const hasValidScreenshot = message.screenshotData &&
    typeof message.screenshotData === 'string' &&
    message.screenshotData.startsWith('data:image/')

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} group`}>
      <div
        className={`max-w-[85%] rounded-lg px-4 py-2 ${
          isUser
            ? 'bg-blue-500 text-white'
            : 'bg-white text-gray-800 border border-gray-200'
        }`}
      >
        {/* 思考过程（仅 AI 消息） */}
        {!isUser && message.thinkingContent && (
          <details className="mb-2">
            <summary className="text-xs text-purple-500 cursor-pointer hover:text-purple-600 select-none">
              查看思考过程
            </summary>
            <div className="mt-1 p-2 bg-purple-50 rounded text-xs text-gray-600 whitespace-pre-wrap max-h-48 overflow-y-auto">
              {message.thinkingContent}
            </div>
          </details>
        )}

        {hasValidScreenshot && (
          <div className="mb-2">
            <img
              src={message.screenshotData}
              alt="截图"
              className="rounded max-w-full h-auto max-h-40"
            />
          </div>
        )}

        {message.type === 'text' && (
          <div className={isUser ? 'text-white' : 'text-gray-800'}>
            {isUser ? (
              <p className="whitespace-pre-wrap">{message.content}</p>
            ) : (
              <MarkdownRenderer content={message.content} />
            )}
          </div>
        )}

        {isStreaming && (
          <span className={`inline-block w-2 h-4 ml-1 animate-pulse ${isUser ? 'bg-white' : 'bg-blue-500'}`} />
        )}

        {/* AI 消息复制按钮 */}
        {!isUser && !isStreaming && message.content && (
          <button
            onClick={handleCopy}
            className="mt-1 opacity-0 group-hover:opacity-100 transition-opacity text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
            title="复制"
          >
            {copied ? (
              <>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                已复制
              </>
            ) : (
              <>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                复制
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
})

export default ChatMessage
