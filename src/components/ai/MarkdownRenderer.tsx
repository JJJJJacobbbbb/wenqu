import { useEffect, useRef } from 'react'
import { marked } from 'marked'
import katex from 'katex'
import DOMPurify from 'dompurify'

interface MarkdownRendererProps {
  content: string
}

const renderer = new marked.Renderer()

// marked v12+ 传 token 对象 { text, lang, escaped }，旧版传 (code, infostring, escaped)
renderer.code = function (args: any) {
  const text: string = args?.text ?? args ?? ''
  const lang: string | undefined = args?.lang ?? arguments[1]
  const language = (lang || 'text').replace(/[^a-zA-Z0-9_-]/g, '')
  // text 在 v12+ 已预转义，旧版需要手动转义
  const escaped = typeof args === 'string'
    ? args.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    : text
  return `<pre><code class="language-${language}">${escaped}</code></pre>`
}

marked.setOptions({
  renderer,
  gfm: true,
  breaks: true,
})

function renderMath(text: string): string {
  let result = text

  // $$...$$ — display math
  result = result.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => {
    try {
      return katex.renderToString(math.trim(), { displayMode: true, throwOnError: false })
    } catch {
      return math
    }
  })

  // \[...\] — display math
  result = result.replace(/\\\[([\s\S]+?)\\\]/g, (_, math) => {
    try {
      return katex.renderToString(math.trim(), { displayMode: true, throwOnError: false })
    } catch {
      return math
    }
  })

  // \(...\) — inline math
  result = result.replace(/\\\((.+?)\\\)/g, (_, math) => {
    try {
      return katex.renderToString(math.trim(), { displayMode: false, throwOnError: false })
    } catch {
      return math
    }
  })

  // $...$ — inline math
  result = result.replace(/\$([^\n$]+?)\$/g, (_, math) => {
    try {
      return katex.renderToString(math.trim(), { displayMode: false, throwOnError: false })
    } catch {
      return math
    }
  })

  return result
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return

    const withMath = renderMath(content)
    const result = marked.parse(withMath)

    const render = (html: string) => {
      if (!ref.current) return
      const finalHtml = DOMPurify.sanitize(html, {
        ADD_ATTR: ['class', 'style', 'aria-hidden'],
        ADD_TAGS: ['math', 'semantics', 'mrow', 'mi', 'mo', 'mn', 'msup', 'msub', 'mfrac', 'mtext', 'msqrt', 'mstyle', 'annotation', 'mglyph', 'mspace'],
      })
      // 流式更新时避免不必要的 innerHTML 替换，保留用户文本选区
      if (ref.current.innerHTML !== finalHtml) {
        ref.current.innerHTML = finalHtml
      }
    }

    // marked.parse may return string or Promise<string> depending on version
    if (typeof result === 'string') {
      render(result)
    } else {
      result.then(render)
    }
  }, [content])

  return <div ref={ref} className="markdown-content text-sm" />
}
