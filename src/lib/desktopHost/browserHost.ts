import {
  DesktopHost,
  DialogOpenOptions,
  DialogSaveOptions,
  ScreenBounds,
} from './types'
import { logger } from '../logger'

class BrowserHost implements DesktopHost {
  kind: 'browser' = 'browser'
  isDesktop = false
  capabilities = {
    screenshot: false,
    dialogs: false,
    window: false,
    clipboard: true,
    shell: false,
    file: false,
  }

  async invoke(_channel: string, ..._args: unknown[]): Promise<unknown> {
    logger.warn('BrowserHost: invoke not supported')
    return undefined
  }

  dialogs = {
    open: async (_options?: DialogOpenOptions): Promise<string[]> => {
      logger.warn('BrowserHost: dialogs.open not supported')
      return []
    },
    save: async (_options?: DialogSaveOptions): Promise<string> => {
      logger.warn('BrowserHost: dialogs.save not supported')
      return ''
    },
  }

  window = {
    minimize: async (): Promise<void> => {
      logger.warn('BrowserHost: window.minimize not supported')
    },
    toggleMaximize: async (): Promise<void> => {
      logger.warn('BrowserHost: window.toggleMaximize not supported')
    },
    close: async (): Promise<void> => {
      logger.warn('BrowserHost: window.close not supported')
    },
    isMaximized: async (): Promise<boolean> => {
      return false
    },
  }

  screenshot = {
    captureRegion: async (_bounds: ScreenBounds): Promise<string> => {
      logger.warn('BrowserHost: screenshot.captureRegion not supported')
      return ''
    },
    startRegionSelect: async (): Promise<ScreenBounds> => {
      logger.warn('BrowserHost: screenshot.startRegionSelect not supported')
      return { x: 0, y: 0, width: 0, height: 0 }
    },
  }

  clipboard = {
    readText: async (): Promise<string> => {
      return navigator.clipboard.readText()
    },
    writeText: async (text: string): Promise<void> => {
      await navigator.clipboard.writeText(text)
    },
  }

  events = {
    listen: async <T>(_eventName: string, _handler: (payload: T) => void): Promise<() => void> => {
      logger.warn('BrowserHost: events.listen not supported')
      return () => {}
    },
  }

  shell = {
    openExternal: async (url: string): Promise<void> => {
      if (!/^https?:\/\//i.test(url)) {
        logger.warn(`BrowserHost: blocked non-HTTP URL: ${url}`)
        return
      }
      window.open(url, '_blank')
    },
    openPath: async (_path: string): Promise<void> => {
      logger.warn('BrowserHost: shell.openPath not supported')
    },
  }

  file = {
    read: async (_filePath: string): Promise<ArrayBuffer> => {
      logger.warn('BrowserHost: file.read not supported')
      return new ArrayBuffer(0)
    },
    readText: async (_filePath: string): Promise<string> => {
      logger.warn('BrowserHost: file.readText not supported')
      return ''
    },
    write: async (_filePath: string, _data: ArrayBuffer | string): Promise<void> => {
      logger.warn('BrowserHost: file.write not supported')
    },
    list: async (_dirPath: string): Promise<string[]> => {
      logger.warn('BrowserHost: file.list not supported')
      return []
    },
  }
}

export const desktopHost = new BrowserHost()
