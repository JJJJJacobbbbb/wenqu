import { useState, useRef, useCallback } from 'react'
import { useSubjectStore } from '../../stores/subjectStore'
import { useClickOutside } from '../../hooks/useClickOutside'
import { noDragRegion } from '../../lib/styles'

export default function SubjectPicker() {
  const { subjects, currentSubjectId, setCurrentSubject, addSubject } = useSubjectStore()
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [dupError, setDupError] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const closeDropdown = useCallback(() => { setOpen(false); setNewName(''); setDupError(false) }, [])
  useClickOutside(dropdownRef, closeDropdown)

  const currentSubject = subjects.find((s) => s.id === currentSubjectId) || subjects[0]

  const handleAdd = () => {
    const name = newName.trim()
    if (!name) return
    if (subjects.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      setDupError(true)
      return
    }
    const id = addSubject(name)
    setCurrentSubject(id)
    setNewName('')
    setDupError(false)
    setOpen(false)
  }

  if (!currentSubject) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-400">
        <span>无学科</span>
      </div>
    )
  }

  return (
    <div className="relative" ref={dropdownRef} style={noDragRegion}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1 text-xs rounded hover:bg-gray-100 transition-colors"
      >
        <span
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: currentSubject.color }}
        />
        <span className="font-medium text-gray-600">{currentSubject.name}</span>
        <svg className={`w-3 h-3 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[150px] py-1">
          {subjects.map((s) => (
            <button
              key={s.id}
              onClick={() => { setCurrentSubject(s.id); setOpen(false) }}
              className={`w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 transition-colors ${
                s.id === currentSubjectId ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: s.color }}
              />
              <span className="truncate">{s.name}</span>
              {s.id === 'main' && <span className="text-[9px] text-gray-400 ml-auto">默认</span>}
              {s.id === currentSubjectId && (
                <svg className="w-3 h-3 ml-auto text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ))}
          <div className="border-t border-gray-100 mt-1 pt-1 px-2">
            <div className="flex gap-1">
              <input
                ref={inputRef}
                type="text"
                value={newName}
                onChange={(e) => { setNewName(e.target.value); setDupError(false) }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
                placeholder={dupError ? '学科已存在' : '新建学科'}
                className={`flex-1 px-2 py-1 text-xs border rounded focus:outline-none ${dupError ? 'border-red-300 focus:border-red-400 text-red-600' : 'border-gray-200 focus:border-blue-300'}`}
                onClick={(e) => e.stopPropagation()}
              />
              <button
                onClick={handleAdd}
                disabled={!newName.trim()}
                className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 flex-shrink-0"
                aria-label="添加学科"
              >
                +
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
