import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        screenshot: path.resolve(__dirname, 'screenshot.html'),
        chat: path.resolve(__dirname, 'chat.html'),
      },
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          katex: ['katex'],
          markdown: ['marked', 'dompurify'],
        },
      },
    },
  },
})
