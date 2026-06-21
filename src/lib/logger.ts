const isDev = import.meta.env.DEV

export const logger = {
  error: (msg: string, err?: unknown) => {
    console.error(`[ERROR] ${msg}`, err)
  },
  warn: (msg: string) => {
    if (isDev) {
      console.warn(`[WARN] ${msg}`)
    }
  },
  debug: (msg: string) => {
    if (isDev) {
      console.debug(`[DEBUG] ${msg}`)
    }
  },
}
