import type { DocumentTab } from '../../stores/documentStore'

const SUPPORTED_EXTENSIONS = new Set([
  'pdf', 'docx', 'doc',
  'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp',
  'txt', 'md',
])

export function getFileType(fileName: string): DocumentTab['fileType'] | null {
  const ext = fileName.split('.').pop()?.toLowerCase()
  if (!ext || !SUPPORTED_EXTENSIONS.has(ext)) return null
  switch (ext) {
    case 'pdf':
      return 'pdf'
    case 'docx':
    case 'doc':
      return 'docx'
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'bmp':
    case 'webp':
      return 'image'
    case 'txt':
    case 'md':
      return 'text'
    default:
      return null
  }
}
