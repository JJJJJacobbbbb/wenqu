import { useEffect, useRef, useCallback } from 'react'
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

// 表格包裹在可滚动容器中
renderer.table = function (header: string, body: string) {
  return `<div class="table-wrap"><table><thead>${header}</thead><tbody>${body}</tbody></table></div>`
}

marked.setOptions({
  renderer,
  gfm: true,
  breaks: true,
})

// Unicode 数学符号（希腊字母 + 常用运算符）
const MATH_SYMBOL_RE = /[α-ωΑ-Ω×÷∂∇≈≤≥≥→↑↓∫∮∑∏√∞±≤≥≠∧∨∈∉⊂⊃∪∩∀∃]/

// 检测是否为 AI 输出的重复原始公式行（无定界符、含 Unicode 数学符号、紧跟 KaTeX 渲染块之后）
function removeDuplicateFormulas(text: string): string {
  const lines = text.split('\n')
  const result: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    // 检查上一行是否是 KaTeX 渲染的 HTML（<span class="katex">）
    const prevLine = result.length > 0 ? result[result.length - 1] : ''
    const prevIsKaTeX = prevLine.includes('class="katex')

    if (prevIsKaTeX && trimmed && !trimmed.startsWith('\\') && !trimmed.startsWith('$')) {
      // 当前行不是 LaTeX 定界符开头
      // 检查是否包含足够多的 Unicode 数学符号（超过 2 个不同符号）
      const symbols = trimmed.match(MATH_SYMBOL_RE) || []
      const uniqueSymbols = new Set(symbols)
      if (uniqueSymbols.size >= 2) {
        // 很可能是重复的原始公式行，跳过
        i++
        continue
      }
    }

    result.push(line)
    i++
  }

  return result.join('\n')
}

function renderKatex(text: string, regex: RegExp, displayMode: boolean): string {
  return text.replace(regex, (_, math) => {
    try {
      return katex.renderToString(math.trim(), { displayMode, throwOnError: false })
    } catch {
      return math
    }
  })
}

// KaTeX 输出的 HTML 中包含 * 字符，会被 marked 误解为强调标记
// 先提取 KaTeX HTML 占位，再跑 marked，最后还原
function renderMath(text: string): string {
  let result = text

  // $$...$$ — display math
  result = renderKatex(result, /\$\$([\s\S]+?)\$\$/g, true)

  // \\[...\] or \[...\] — display math (support both double and single backslash)
  result = renderKatex(result, /\\\\?\[([\s\S]+?)\\\\?\]/g, true)

  // \\(...\\) or \(...\) — inline math (support both double and single backslash)
  result = renderKatex(result, /\\\\?\((.+?)\\\\?\)/g, false)

  // $...$ — inline math
  result = renderKatex(result, /\$([^\n$]+?)\$/g, false)

  return result
}

// 提取 KaTeX HTML，替换为占位符，防止 marked 破坏数学内容
function extractKatexPlaceholders(text: string): { processed: string; restore: (s: string) => string } {
  const placeholders: string[] = []
  let result = text.replace(/<span class="katex">[\s\S]*?<\/span>/g, (match) => {
    const idx = placeholders.length
    placeholders.push(match)
    return `__KATEX_PLACEHOLDER_${idx}__`
  })
  return {
    processed: result,
    restore: (s: string) => s.replace(/__KATEX_PLACEHOLDER_(\d+)__/g, (_, idx) => placeholders[Number(idx)] || ''),
  }
}

const DEBOUNCE_MS = 80

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const ref = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastContentRef = useRef('')

  const doRender = useCallback((text: string) => {
    if (!ref.current) return
    const deduped = removeDuplicateFormulas(text)
    const withMath = renderMath(deduped)
    // 提取 KaTeX HTML 避免 marked 破坏数学内容
    const { processed, restore } = extractKatexPlaceholders(withMath)
    const result = marked.parse(processed)

    const render = (html: string) => {
      if (!ref.current) return
      const restored = restore(html)
      const finalHtml = DOMPurify.sanitize(restored, {
        ADD_ATTR: ['class', 'aria-hidden', 'encoding'],
        ADD_TAGS: ['math', 'semantics', 'mrow', 'mi', 'mo', 'mn', 'msup', 'msub', 'mfrac', 'mtext', 'msqrt', 'mstyle', 'annotation', 'mspace'],
      })
      if (ref.current.innerHTML !== finalHtml) {
        ref.current.innerHTML = finalHtml
      }
    }

    if (typeof result === 'string') {
      render(result)
    } else {
      result.then(render)
    }
  }, [])

  useEffect(() => {
    if (!ref.current) return
    lastContentRef.current = content

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      doRender(lastContentRef.current)
      timerRef.current = null
    }, DEBOUNCE_MS)

    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [content, doRender])

  return <div ref={ref} className="markdown-content text-sm" />
}
