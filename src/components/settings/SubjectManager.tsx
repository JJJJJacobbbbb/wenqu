import { useState } from 'react'
import { useSubjectStore } from '../../stores/subjectStore'

export default function SubjectManager() {
  const { subjects, addSubject, renameSubject } = useSubjectStore()
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const handleAdd = () => {
    const input = newName.trim()
    if (!input) return

    const names = input.split(/[,，、;；]/).map((s) => s.trim()).filter(Boolean)
    const existingNames = new Set(subjects.map((s) => s.name.toLowerCase()))
    let added = 0

    for (const name of names) {
      if (existingNames.has(name.toLowerCase())) continue
      addSubject(name)
      existingNames.add(name.toLowerCase())
      added++
    }

    if (added === 0 && names.length > 0) {
      setErrorMsg('这些学科已存在')
      setTimeout(() => setErrorMsg(''), 2000)
    }
    setNewName('')
  }

  const handleStartRename = (id: string, currentName: string) => {
    setEditingId(id)
    setEditingName(currentName)
  }

  const handleConfirmRename = () => {
    if (!editingId) return
    const name = editingName.trim()
    if (!name) return

    if (subjects.some((s) => s.id !== editingId && s.name.toLowerCase() === name.toLowerCase())) {
      setErrorMsg('该学科名称已存在')
      setTimeout(() => setErrorMsg(''), 2000)
      return
    }

    renameSubject(editingId, name)
    setEditingId(null)
    setEditingName('')
  }

  return (
    <div className="space-y-4">
      {/* 添加学科 */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-2">添加学科</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="输入学科名称（支持逗号分隔批量添加）"
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleAdd}
            className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            添加
          </button>
        </div>
        {errorMsg && (
          <p className="text-xs text-red-500 mt-1">{errorMsg}</p>
        )}
      </div>

      {/* 学科列表 */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-2">已有学科</h3>
        {subjects.length === 0 ? (
          <p className="text-sm text-gray-400">暂无学科，请先添加</p>
        ) : (
          <div className="space-y-2">
            {subjects.map((subject) => (
              <div
                key={subject.id}
                className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg"
              >
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: subject.color }}
                />
                {editingId === subject.id ? (
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleConfirmRename()
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    onBlur={handleConfirmRename}
                    className="flex-1 px-2 py-1 text-sm border border-blue-300 rounded focus:outline-none"
                    autoFocus
                  />
                ) : (
                  <span className="flex-1 text-sm text-gray-700">{subject.name}</span>
                )}
                {editingId !== subject.id && (
                  <button
                    onClick={() => handleStartRename(subject.id, subject.name)}
                    className="text-xs text-gray-400 hover:text-blue-500"
                  >
                    重命名
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
