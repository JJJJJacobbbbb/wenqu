import { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, clipboard } from 'electron'
import path from 'path'

function validateFilePath(filePath: string): string {
  if (!filePath || typeof filePath !== 'string') throw new Error('Invalid file path')
  // 拒绝空字节（防止路径截断攻击）
  if (filePath.includes('\0')) throw new Error('Invalid file path: null byte')
  // 拒绝 UNC 设备路径（\\.\, \\?\）防止直接访问物理磁盘
  if (/^\\\\[.?]/.test(filePath)) throw new Error('Access to device path is blocked')
  const resolved = path.resolve(filePath)
  // 检查 Windows 保留设备名
  const basename = path.basename(resolved).split('.')[0].toUpperCase()
  const reserved = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9']
  if (reserved.includes(basename)) throw new Error('Access to reserved device name is blocked')
  const blocked = [
    process.env.SystemRoot || 'C:\\Windows',
    '/etc', '/bin', '/sbin', '/usr/bin', '/usr/sbin',
  ]
  for (const prefix of blocked) {
    if (resolved.toLowerCase().startsWith(prefix.toLowerCase())) {
      throw new Error('Access to system directory is blocked')
    }
  }
  return resolved
}

// 去掉默认菜单栏，但保留 Edit 菜单以支持 Ctrl+C/V/Z/X/A
Menu.setApplicationMenu(Menu.buildFromTemplate([
  {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
    ],
  },
]))

let mainWindow: BrowserWindow | null = null
let chatWindow: BrowserWindow | null = null
let chatWindowCreating = false
let tray: Tray | null = null

const isDev = process.env.NODE_ENV === 'development'

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function createChatWindow() {
  if (chatWindow && !chatWindow.isDestroyed()) {
    chatWindow.show()
    chatWindow.focus()
    return
  }
  if (chatWindowCreating) return
  chatWindowCreating = true

  try {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize
  const chatWidth = 360
  const chatHeight = 500

  chatWindow = new BrowserWindow({
    width: chatWidth,
    height: chatHeight,
    x: Math.max(0, screenWidth - chatWidth - 40),
    y: Math.max(0, Math.floor(screenHeight / 2 - chatHeight / 2)),
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    maximizable: false,
    minWidth: 280,
    minHeight: 300,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Windows 下 alwaysOnTop 默认级别不够高，设置 'floating' 确保真正置顶
  chatWindow.setAlwaysOnTop(true, 'floating')

  if (isDev) {
    chatWindow.loadURL('http://localhost:5173/chat.html')
  } else {
    chatWindow.loadFile(path.join(__dirname, '../dist/chat.html'))
  }

  chatWindow.once('ready-to-show', () => {
    chatWindow?.show()
    chatWindowCreating = false
  })

  chatWindow.on('closed', () => {
    chatWindow = null
    chatWindowCreating = false
  })

  chatWindow.webContents.on('did-fail-load', () => {
    chatWindowCreating = false
  })

  // 超时保护：10 秒内未 ready 则重置标志，防止死锁
  setTimeout(() => {
    if (chatWindowCreating && chatWindow && !chatWindow.isDestroyed()) {
      chatWindowCreating = false
    }
  }, 10000)
  } catch (err) {
    chatWindowCreating = false
    throw err
  }
}

function createTray() {
  // 生成 16x16 蓝色圆形托盘图标 (BGRA 位图)
  const size = 16
  const buffer = Buffer.alloc(size * size * 4)
  const cx = size / 2
  const cy = size / 2
  const radius = size / 2 - 1
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4
      const dist = Math.sqrt((x - cx + 0.5) ** 2 + (y - cy + 0.5) ** 2)
      if (dist <= radius) {
        buffer[offset] = 233     // B (BGRA)
        buffer[offset + 1] = 165 // G
        buffer[offset + 2] = 14  // R
        buffer[offset + 3] = 255 // A
      }
    }
  }
  const icon = nativeImage.createFromBitmap(buffer, { width: size, height: size })

  tray = new Tray(icon)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '打开主窗口',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
        } else {
          createMainWindow()
        }
      },
    },
    {
      label: '退出',
      click: () => {
        app.quit()
      },
    },
  ])

  tray.setToolTip('问渠')
  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.show()
    } else {
      createMainWindow()
    }
  })
}

function registerIpcHandlers() {
  ipcMain.handle('desktop:window:minimize', () => {
    mainWindow?.minimize()
  })

  ipcMain.handle('desktop:window:toggle-maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })

  ipcMain.handle('desktop:window:close', () => {
    mainWindow?.close()
  })

  ipcMain.handle('desktop:window:is-maximized', () => {
    return mainWindow?.isMaximized() || false
  })

  let isScreenshotActive = false

  ipcMain.handle('desktop:screenshot:start-select', async () => {
    if (isScreenshotActive) return null
    isScreenshotActive = true

    return new Promise((resolve) => {
      const { width, height } = screen.getPrimaryDisplay().bounds

      const selectWindow = new BrowserWindow({
        width,
        height,
        x: 0,
        y: 0,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        webPreferences: {
          preload: path.join(__dirname, 'preload.js'),
          contextIsolation: true,
          nodeIntegration: false,
        },
      })

      selectWindow.setIgnoreMouseEvents(false)

      if (isDev) {
        selectWindow.loadURL('http://localhost:5173/screenshot.html')
      } else {
        selectWindow.loadFile(path.join(__dirname, '../dist/screenshot.html'))
      }

      let resolved = false
      let timeoutId: ReturnType<typeof setTimeout> | null = null
      const cleanup = () => {
        isScreenshotActive = false
        if (timeoutId) { clearTimeout(timeoutId); timeoutId = null }
        try { ipcMain.removeHandler('screenshot:complete') } catch { /* already removed */ }
        try { ipcMain.removeHandler('screenshot:cancel') } catch { /* already removed */ }
      }

      // Use handle() not once() because renderer uses invoke() (ipcRenderer.invoke)
      ipcMain.handle('screenshot:complete', (_event, bounds) => {
        if (resolved) return
        resolved = true
        cleanup()
        if (!selectWindow.isDestroyed()) selectWindow.close()
        resolve(bounds)
      })

      ipcMain.handle('screenshot:cancel', () => {
        if (resolved) return
        resolved = true
        cleanup()
        if (!selectWindow.isDestroyed()) selectWindow.close()
        resolve(null)
      })

      // 窗口异常关闭时也要清理（GPU 崩溃、OOM 等）
      selectWindow.on('closed', () => {
        if (!resolved) {
          resolved = true
          cleanup()
          resolve(null)
        }
      })

      timeoutId = setTimeout(() => {
        if (resolved) return
        resolved = true
        cleanup()
        if (!selectWindow.isDestroyed()) {
          try { selectWindow.close() } catch { /* already destroyed */ }
        }
        resolve(null)
      }, 30000)
    })
  })

  ipcMain.handle('desktop:file:read-text', async (_event, filePath: string) => {
    const resolved = validateFilePath(filePath)
    const fs = await import('fs/promises')
    return fs.readFile(resolved, 'utf-8')
  })

  ipcMain.handle('desktop:file:read', async (_event, filePath: string) => {
    const resolved = validateFilePath(filePath)
    const fs = await import('fs/promises')
    const buffer = await fs.readFile(resolved)
    return buffer.toString('base64')
  })

  ipcMain.handle('desktop:file:write', async (_event, filePath: string, data: ArrayBuffer | string) => {
    const resolved = validateFilePath(filePath)
    const fs = await import('fs/promises')
    const buffer = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data)
    await fs.writeFile(resolved, buffer)
  })

  ipcMain.handle('desktop:file:list', async (_event, dirPath: string) => {
    const resolved = validateFilePath(dirPath)
    const fs = await import('fs/promises')
    return fs.readdir(resolved)
  })

  ipcMain.handle('desktop:dialog:open', async (_event, options) => {
    const { dialog } = await import('electron')
    if (!mainWindow) return []
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: options?.properties || ['openFile'],
      filters: options?.filters,
    })
    return result.filePaths
  })

  ipcMain.handle('desktop:dialog:save', async (_event, options) => {
    const { dialog } = await import('electron')
    if (!mainWindow) return ''
    const result = await dialog.showSaveDialog(mainWindow, {
      filters: options?.filters,
    })
    return result.filePath
  })

  ipcMain.handle('desktop:clipboard:read-text', async () => {
    return clipboard.readText()
  })

  ipcMain.handle('desktop:clipboard:write-text', async (_event, text: string) => {
    clipboard.writeText(text)
  })

  ipcMain.handle('desktop:shell:open-external', async (_event, url: string) => {
    if (!url || typeof url !== 'string') throw new Error('Invalid URL')
    // Only allow http/https protocols for security
    if (!/^https?:\/\//i.test(url)) throw new Error('Only http/https URLs allowed')
    const { shell } = await import('electron')
    await shell.openExternal(url)
  })

  ipcMain.handle('desktop:shell:open-path', async (_event, openPath: string) => {
    const resolved = validateFilePath(openPath)
    const { shell } = await import('electron')
    const result = await shell.openPath(resolved)
    if (result) throw new Error(result)
  })

  ipcMain.handle('desktop:open-file', async (_event, filePath: string) => {
    mainWindow?.webContents.send('open-file', { filePath })
  })

  ipcMain.handle('desktop:app:quit', () => {
    app.quit()
  })

  // 文档区域截图裁剪：接收视口 CSS 坐标，在主进程完成裁剪
  // 所有坐标转换在主进程完成，避免渲染进程和主进程之间的 DPI 不一致
  ipcMain.handle('desktop:screenshot:crop-selection', async (_event, selection: {
    viewportX: number; viewportY: number; width: number; height: number
  }) => {
    try {
      const { desktopCapturer, nativeImage } = await import('electron')
      if (!mainWindow) return null

      const primaryDisplay = screen.getPrimaryDisplay()
      const scaleFactor = primaryDisplay.scaleFactor // e.g., 1.0, 1.25, 1.5, 2.0
      const { width: screenW, height: screenH } = primaryDisplay.size // 逻辑像素

      // 捕获全屏（按物理像素）
      const physW = Math.round(screenW * scaleFactor)
      const physH = Math.round(screenH * scaleFactor)
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: physW, height: physH },
      })
      if (!sources[0]) return null

      const fullImage = sources[0].thumbnail
      const imgW = fullImage.getSize().width
      const imgH = fullImage.getSize().height

      // 获取主窗口位置（逻辑像素，屏幕坐标）
      const winBounds = mainWindow.getBounds()

      // 视口 CSS 坐标 → 屏幕物理像素
      // viewportX/Y 是相对于浏览器视口的 CSS 像素
      // winBounds.x/y 是窗口在屏幕上的逻辑像素位置
      const screenPhysX = Math.round((selection.viewportX + winBounds.x) * scaleFactor)
      const screenPhysY = Math.round((selection.viewportY + winBounds.y) * scaleFactor)

      // 计算截图图片与物理屏幕的比例（desktopCapturer 可能不完全按请求尺寸）
      const ratioX = imgW / physW
      const ratioY = imgH / physH

      // 选区物理尺寸
      const selW = Math.round(selection.width * scaleFactor * ratioX)
      const selH = Math.round(selection.height * scaleFactor * ratioY)

      if (selW < 1 || selH < 1) return null

      // 裁剪
      const cropped = fullImage.crop({
        x: Math.round(screenPhysX * ratioX),
        y: Math.round(screenPhysY * ratioY),
        width: selW,
        height: selH,
      })

      return cropped.toDataURL()
    } catch (err) {
      console.error('Selection crop failed:', err)
      return null
    }
  })

  // 文档区域截图：捕获全屏并返回 base64 图片
  ipcMain.handle('desktop:screenshot:capture-screen', async () => {
    try {
      const { desktopCapturer } = await import('electron')
      const primaryDisplay = screen.getPrimaryDisplay()
      const { width, height } = primaryDisplay.size
      const scaleFactor = primaryDisplay.scaleFactor

      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: Math.round(width * scaleFactor), height: Math.round(height * scaleFactor) },
      })

      if (sources.length > 0) {
        return sources[0].thumbnail.toDataURL()
      }
      return null
    } catch (err) {
      console.error('Screenshot capture failed:', err)
      return null
    }
  })

  // 截取指定区域的屏幕截图
  ipcMain.handle('desktop:screenshot:capture', async (_event, bounds: { x: number; y: number; width: number; height: number }) => {
    try {
      const { desktopCapturer } = await import('electron')
      const primaryDisplay = screen.getPrimaryDisplay()
      const { width: screenW, height: screenH } = primaryDisplay.size
      const scaleFactor = primaryDisplay.scaleFactor

      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: Math.round(screenW * scaleFactor), height: Math.round(screenH * scaleFactor) },
      })

      if (sources.length > 0) {
        const thumbnail = sources[0].thumbnail
        const imgW = thumbnail.getSize().width
        const imgH = thumbnail.getSize().height
        const ratioX = imgW / Math.round(screenW * scaleFactor)
        const ratioY = imgH / Math.round(screenH * scaleFactor)
        const cropped = thumbnail.crop({
          x: Math.round(bounds.x * scaleFactor * ratioX),
          y: Math.round(bounds.y * scaleFactor * ratioY),
          width: Math.round(bounds.width * scaleFactor * ratioX),
          height: Math.round(bounds.height * scaleFactor * ratioY),
        })
        return cropped.toDataURL()
      }
      return null
    } catch (err) {
      console.error('Screenshot region capture failed:', err)
      return null
    }
  })

  // 获取主窗口位置和尺寸
  ipcMain.handle('desktop:window:get-bounds', () => {
    if (!mainWindow) return null
    return mainWindow.getBounds()
  })

  // 悬浮对话窗口
  ipcMain.handle('chat:open', () => {
    createChatWindow()
  })

  ipcMain.handle('chat:close', () => {
    if (chatWindow && !chatWindow.isDestroyed()) {
      chatWindow.close()
    }
  })

  // 切换悬浮模式：隐藏主窗口，显示悬浮窗
  ipcMain.handle('chat:toggle', () => {
    createChatWindow()
    if (mainWindow) {
      mainWindow.hide()
    }
  })

  // 返回主窗口
  ipcMain.handle('chat:show-main', () => {
    if (chatWindow && !chatWindow.isDestroyed()) {
      chatWindow.close()
    }
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  // 设置悬浮窗置顶
  ipcMain.handle('chat:set-always-on-top', (_event, alwaysOnTop: boolean) => {
    if (chatWindow && !chatWindow.isDestroyed()) {
      chatWindow.setAlwaysOnTop(alwaysOnTop, 'floating')
    }
  })

  // 从悬浮窗打开设置
  ipcMain.handle('chat:open-settings', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
      mainWindow.webContents.send('navigate-to', 'settings')
    }
  })
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createMainWindow()
  createTray()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow()
  }
})
