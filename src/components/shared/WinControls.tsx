import { getDesktopHost } from '../../lib/desktopHost'
import { noDragRegion } from '../../lib/styles'

interface WinControlsProps {
  className?: string
}

export default function WinControls({ className = '' }: WinControlsProps) {
  const host = getDesktopHost()

  return (
    <div className={`flex h-full ${className}`} style={noDragRegion}>
      <button
        onClick={() => host.window.minimize()}
        className="w-12 h-full flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors"
        aria-label="最小化"
      >
        <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
          <line x1="2" y1="6" x2="10" y2="6" />
        </svg>
      </button>
      <button
        onClick={() => host.window.toggleMaximize()}
        className="w-12 h-full flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors"
        aria-label="最大化"
      >
        <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
          <rect x="2" y="2" width="8" height="8" rx="0.5" />
        </svg>
      </button>
      <button
        onClick={() => host.window.close()}
        className="w-12 h-full flex items-center justify-center text-gray-400 hover:bg-red-500 hover:text-white transition-colors"
        aria-label="关闭"
      >
        <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
          <line x1="2" y1="2" x2="10" y2="10" />
          <line x1="10" y1="2" x2="2" y2="10" />
        </svg>
      </button>
    </div>
  )
}
