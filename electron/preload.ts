import { contextBridge, ipcRenderer } from 'electron'

const ALLOWED_INVOKE_CHANNELS = [
  'desktop:window:minimize',
  'desktop:window:toggle-maximize',
  'desktop:window:close',
  'desktop:window:is-maximized',
  'desktop:window:get-bounds',
  'desktop:screenshot:start-select',
  'desktop:screenshot:crop-selection',
  'desktop:screenshot:capture-screen',
  'desktop:screenshot:capture',
  'desktop:file:read-text',
  'desktop:file:read',
  'desktop:file:write',
  'desktop:file:list',
  'desktop:dialog:open',
  'desktop:dialog:save',
  'desktop:clipboard:read-text',
  'desktop:clipboard:write-text',
  'desktop:shell:open-external',
  'desktop:shell:open-path',
  'desktop:open-file',
  'desktop:app:quit',
  'chat:open',
  'chat:close',
  'chat:toggle',
  'chat:show-main',
  'chat:set-always-on-top',
  'chat:open-settings',
  'screenshot:complete',
  'screenshot:cancel',
]

const ALLOWED_ON_CHANNELS = [
  'open-file',
  'navigate-to',
]

// IPC 参数最大 10MB（防止恶意渲染进程发送超大 payload）
const MAX_IPC_ARGS_SIZE = 10 * 1024 * 1024

function checkArgsSize(args: unknown[]): boolean {
  try {
    const json = JSON.stringify(args)
    return json.length <= MAX_IPC_ARGS_SIZE
  } catch {
    return false
  }
}

contextBridge.exposeInMainWorld('desktopHost', {
  invoke: (channel: string, ...args: unknown[]) => {
    if (!ALLOWED_INVOKE_CHANNELS.includes(channel)) {
      return Promise.reject(new Error(`Blocked IPC invoke on channel: ${channel}`))
    }
    if (!checkArgsSize(args)) {
      return Promise.reject(new Error('IPC payload too large'))
    }
    return ipcRenderer.invoke(channel, ...args)
  },
  on: (channel: string, handler: (...args: unknown[]) => void) => {
    if (!ALLOWED_ON_CHANNELS.includes(channel)) {
      console.warn(`Blocked IPC on listener for channel: ${channel}`)
      return () => {}
    }
    const wrapper = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => handler(...args)
    ipcRenderer.on(channel, wrapper)
    return () => {
      ipcRenderer.removeListener(channel, wrapper)
    }
  },
})
