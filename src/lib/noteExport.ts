import type { Note } from '../stores/noteStore'
import { NOTE_CATEGORY_LABELS } from '../stores/noteStore'
import type { Subject } from '../stores/subjectStore'
import { getDesktopHost } from './desktopHost'

function noteToMarkdown(note: Note, subject?: Subject): string {
  const catLabel = NOTE_CATEGORY_LABELS[note.category] || '其他'
  const time = new Date(note.updatedAt).toLocaleString('zh-CN')
  const subjectName = subject?.name || '未分类'

  return [
    `### ${note.title}`,
    ``,
    `> 科目: ${subjectName} | 分类: ${catLabel} | 章节: ${note.chapter || '通用'} | 时间: ${time}`,
    ``,
    note.content,
    ``,
    `---`,
    ``,
  ].join('\n')
}

function notesToMarkdown(notes: Note[], subjects: Subject[]): string {
  let md = '# 问渠笔记\n\n'
  md += `> 导出时间: ${new Date().toLocaleString('zh-CN')}\n\n`

  const grouped = new Map<string, Note[]>()
  for (const note of notes) {
    const subject = subjects.find((s) => s.id === note.subjectId)
    const key = subject?.name || '未分类'
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(note)
  }

  for (const [subjectName, subjectNotes] of grouped) {
    md += `## ${subjectName}\n\n`
    for (const note of subjectNotes) {
      const subject = subjects.find((s) => s.id === note.subjectId)
      md += noteToMarkdown(note, subject)
    }
  }

  return md
}

async function saveMarkdown(content: string, defaultName: string): Promise<void> {
  const host = getDesktopHost()

  // Electron: 使用保存对话框
  if (host.kind === 'electron') {
    const filePath = await host.dialogs.save({
      title: '导出笔记',
      defaultPath: `${defaultName}_${new Date().toISOString().slice(0, 10)}.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    })
    if (filePath) {
      await host.file.write(filePath, content)
    }
    return
  }

  // 浏览器回退: 触发下载
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${defaultName}_${new Date().toISOString().slice(0, 10)}.md`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // 延迟释放 URL，确保浏览器有时间开始下载
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function exportSingleNote(note: Note, subjects: Subject[]): Promise<void> {
  const subject = subjects.find((s) => s.id === note.subjectId)
  const md = `# ${note.title}\n\n${noteToMarkdown(note, subject)}`
  await saveMarkdown(md, note.title.slice(0, 20).replace(/[\/\\?%*:|"<>]/g, '_'))
}

export async function exportNotes(notes: Note[], subjects: Subject[], filenamePrefix = '问渠笔记'): Promise<void> {
  if (notes.length === 0) return
  const md = notesToMarkdown(notes, subjects)
  await saveMarkdown(md, filenamePrefix)
}

async function saveFileToFolder(folderPath: string, fileName: string, content: string): Promise<void> {
  const host = getDesktopHost()
  if (host.kind === 'electron') {
    // 防止路径穿越：过滤 fileName 中的 .. 段
    const safeName = fileName.replace(/\.\./g, '_')
    const filePath = `${folderPath}\\${safeName}`
    await host.file.write(filePath, content)
  } else {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

async function pickFolder(): Promise<string | null> {
  const host = getDesktopHost()
  if (host.kind === 'electron') {
    const result = await host.dialogs.open({
      title: '选择导出目录',
      properties: ['openDirectory'],
    })
    return result[0] || null
  }
  return '__browser__' // 浏览器模式下直接触发下载
}

export async function exportBySubjectBatch(notes: Note[], subjects: Subject[]): Promise<void> {
  if (notes.length === 0) return
  const folder = await pickFolder()
  if (!folder) return

  const errors: string[] = []
  const subjectIds = [...new Set(notes.map((n) => n.subjectId))]
  for (const sid of subjectIds) {
    const subjectNotes = notes.filter((n) => n.subjectId === sid)
    if (subjectNotes.length === 0) continue
    const subject = subjects.find((s) => s.id === sid)
    const name = (subject?.name || '未分类').replace(/[\/\\?%*:|"<>]/g, '_')
    const md = notesToMarkdown(subjectNotes, subjects)
    try {
      await saveFileToFolder(folder, `问渠笔记_${name}.md`, md)
    } catch (e) {
      errors.push(`导出 ${name} 失败: ${e instanceof Error ? e.message : '未知错误'}`)
    }
  }
  if (errors.length > 0) throw new Error(errors.join('\n'))
}

export async function exportBySubjectCategoryBatch(notes: Note[], subjects: Subject[]): Promise<void> {
  if (notes.length === 0) return
  const folder = await pickFolder()
  if (!folder) return

  const errors: string[] = []
  const subjectIds = [...new Set(notes.map((n) => n.subjectId))]
  for (const sid of subjectIds) {
    const subject = subjects.find((s) => s.id === sid)
    const subjectName = (subject?.name || '未分类').replace(/[\/\\?%*:|"<>]/g, '_')
    const subjectNotes = notes.filter((n) => n.subjectId === sid)
    const categories = [...new Set(subjectNotes.map((n) => n.category))]
    for (const cat of categories) {
      const catNotes = subjectNotes.filter((n) => n.category === cat)
      if (catNotes.length === 0) continue
      const catLabel = (NOTE_CATEGORY_LABELS[cat] || '其他').replace(/[\/\\?%*:|"<>]/g, '_')
      const md = notesToMarkdown(catNotes, subjects)
      try {
        await saveFileToFolder(folder, `问渠笔记_${subjectName}_${catLabel}.md`, md)
      } catch (e) {
        errors.push(`导出 ${subjectName}/${catLabel} 失败: ${e instanceof Error ? e.message : '未知错误'}`)
      }
    }
  }
  if (errors.length > 0) throw new Error(errors.join('\n'))
}
