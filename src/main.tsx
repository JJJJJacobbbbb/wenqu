import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Must be imported BEFORE any module that imports pdfjs-dist.
// This registers the fake worker so pdfjs-dist doesn't try to spawn a real Web Worker.
import './pdfSetup'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
