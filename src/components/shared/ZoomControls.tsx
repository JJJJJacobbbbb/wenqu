interface ZoomControlsProps {
  zoom: number
  minZoom?: number
  maxZoom?: number
  stepSmall?: number
  stepLarge?: number
  onChange: (z: number) => void
}

export default function ZoomControls({
  zoom,
  minZoom = 0.25,
  maxZoom = 5,
  stepSmall = 0.05,
  stepLarge = 0.25,
  onChange,
}: ZoomControlsProps) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(Math.max(minZoom, zoom - stepLarge))}
        className="w-7 h-7 flex items-center justify-center text-gray-600 hover:bg-gray-200 border border-gray-300 rounded-md text-sm"
        aria-label="大幅缩小"
      >−</button>
      <button
        onClick={() => onChange(Math.max(minZoom, zoom - stepSmall))}
        className="w-6 h-6 flex items-center justify-center text-gray-500 hover:bg-gray-200 border border-gray-200 rounded text-xs"
        aria-label="缩小"
      >−</button>
      <button
        onClick={() => onChange(1)}
        className="text-sm text-gray-600 hover:bg-gray-200 border border-gray-300 rounded-md px-2 py-0.5 min-w-[52px] text-center"
        aria-label="重置缩放"
      >{Math.round(zoom * 100)}%</button>
      <button
        onClick={() => onChange(Math.min(maxZoom, zoom + stepSmall))}
        className="w-6 h-6 flex items-center justify-center text-gray-500 hover:bg-gray-200 border border-gray-200 rounded text-xs"
        aria-label="放大"
      >+</button>
      <button
        onClick={() => onChange(Math.min(maxZoom, zoom + stepLarge))}
        className="w-7 h-7 flex items-center justify-center text-gray-600 hover:bg-gray-200 border border-gray-300 rounded-md text-sm"
        aria-label="大幅放大"
      >+</button>
    </div>
  )
}
