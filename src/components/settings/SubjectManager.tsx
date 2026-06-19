import { useState } from 'react'
import { useSubjectStore } from '../../stores/subjectStore'

export default function SubjectManager() {
  const { subjects, addSubject, renameSubject } = useSubjectStore()
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const handleAdd = () => {
    const input = newName.trim()
    if (!input) return

    // 支持逗号、顿号、分号分隔的批量添加
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
      alert('这些学科已存在')
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
      alert('该学科名称已存在')
      return
    }

    renameSubject(editingId, name)
    setEditingId(null)
    setEditingName('')
  }

  return (
    <div className="max-w-xl">
      <h2 className="text-lg font-medium text-gray-800 mb-4">学科添加</h2>
      <p className="text-sm text-gray-500 mb-6">
        添加学科分类，AI会根据对话内容自动识别学科。支持逗号分隔批量添加。
      </p>

      <div className="flex gap-2 mb-6">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="输入学科名称，多个用逗号隔开"
        />
        <button
          onClick={handleAdd}
          disabled={!newName.trim()}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
        >
          添加
        </button>
      </div>

      {subjects.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-8 text-center text-gray-500">
          <p>暂无学科</p>
          <p className="text-sm mt-1">添加学科后，AI会自动将对话归类到对应学科</p>
        </div>
      ) : (
        <div className="space-y-2">
          {subjects.map((subject) => (
            <div
              key={subject.id}
              className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span
                  className="w-4 h-4 rounded-full flex-shrink-0"
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
                    autoFocus
                    className="px-2 py-0.5 border border-blue-400 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                ) : (
                  <span className="font-medium text-gray-800">{subject.name}</span>
                )}
              </div>
              {editingId !== subject.id && (
                <button
                  onClick={() => handleStartRename(subject.id, subject.name)}
                  className="text-gray-400 hover:text-blue-500"
                  title="重命名"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
