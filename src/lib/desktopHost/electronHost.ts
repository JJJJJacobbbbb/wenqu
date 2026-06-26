import {
  DesktopHost,
  DialogOpenOptions,
  DialogSaveOptions,
  ScreenBounds,
} from './types'

declare global {
  interface Window {
    desktopHost: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
      on: (channel: string, handler: (...args: unknown[]) => void) => () => void
    }
  }
}

class ElectronHost implements DesktopHost {
  kind: 'electron' = 'electron'
  isDesktop = true
  capabilities = {
    screenshot: true,
    dialogs: true,
    window: true,
    clipboard: true,
    shell: true,
    file: true,
  }

  private get host() {
    return window.desktopHost
  }

  async invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    return this.host.invoke(channel, ...args)
  }

  dialogs = {
    open: async (options?: DialogOpenOptions): Promise<string[]> => {
      return this.host.invoke('desktop:dialog:open', options) as Promise<string[]>
    },
    save: async (options?: DialogSaveOptions): Promise<string> => {
      return this.host.invoke('desktop:dialog:save', options) as Promise<string>
    },
  }

  window = {
    minimize: async (): Promise<void> => {
      await this.host.invoke('desktop:window:minimize')
    },
    toggleMaximize: async (): Promise<void> => {
      await this.host.invoke('desktop:window:toggle-maximize')
    },
    close: async (): Promise<void> => {
      await this.host.invoke('desktop:window:close')
    },
    isMaximized: async (): Promise<boolean> => {
      return this.host.invoke('desktop:window:is-maximized') as Promise<boolean>
    },
  }

  screenshot = {
    captureRegion: async (bounds: ScreenBounds): Promise<string> => {
      return this.host.invoke('desktop:screenshot:capture', bounds) as Promise<string>
    },
    startRegionSelect: async (): Promise<ScreenBounds> => {
      return this.host.invoke('desktop:screenshot:start-select') as Promise<ScreenBounds>
    },
  }

  clipboard = {
    readText: async (): Promise<string> => {
      return this.host.invoke('desktop:clipboard:read-text') as Promise<string>
    },
    writeText: async (text: string): Promise<void> => {
      await this.host.invoke('desktop:clipboard:write-text', text)
    },
  }

  events = {
    listen: async <T>(eventName: string, handler: (payload: T) => void): Promise<() => void> => {
      const cleanup = this.host.on(eventName, (...args: unknown[]) => handler(args[0] as T))
      return cleanup
    },
  }

  shell = {
    openExternal: async (url: string): Promise<void> => {
      await this.host.invoke('desktop:shell:open-external', url)
    },
    openPath: async (path: string): Promise<void> => {
      await this.host.invoke('desktop:shell:open-path', path)
    },
  }

  file = {
    read: async (filePath: string): Promise<ArrayBuffer> => {
      const base64 = await this.host.invoke('desktop:file:read', filePath) as string
      if (!base64) return new ArrayBuffer(0)
      // 使用 atob + Uint8Array 解码 base64，避免 Data URL 的 3x 内存开销
      const bin = atob(base64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      return bytes.buffer
    },
    readText: async (filePath: string): Promise<string> => {
      return this.host.invoke('desktop:file:read-text', filePath) as Promise<string>
    },
    write: async (filePath: string, data: ArrayBuffer | string): Promise<void> => {
      await this.host.invoke('desktop:file:write', filePath, data)
    },
    list: async (dirPath: string): Promise<string[]> => {
      return this.host.invoke('desktop:file:list', dirPath) as Promise<string[]>
    },
  }
}

export const desktopHost = new ElectronHost()
