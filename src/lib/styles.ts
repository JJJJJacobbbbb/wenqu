import React from 'react'

// WebkitAppRegion is an Electron-specific CSS property not in standard types
interface ElectronCSSProperties extends React.CSSProperties {
  WebkitAppRegion?: 'drag' | 'no-drag'
}

export const dragRegion: ElectronCSSProperties = { WebkitAppRegion: 'drag' }
export const noDragRegion: ElectronCSSProperties = { WebkitAppRegion: 'no-drag' }
