import { BrowserWindow, shell } from 'electron'
import { is } from '@electron-toolkit/utils'

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function isInternalNavigation(value: string): boolean {
  try {
    const url = new URL(value)
    if (is.dev && process.env.ELECTRON_RENDERER_URL) {
      return url.origin === new URL(process.env.ELECTRON_RENDERER_URL).origin
    }
    return url.protocol === 'file:'
  } catch {
    return false
  }
}

/** Keep privileged preload bridges attached only to application-owned documents. */
export function secureWindowNavigation(win: BrowserWindow, allowExternalLinks = false): void {
  win.webContents.on('will-navigate', (event, url) => {
    if (isInternalNavigation(url)) return
    event.preventDefault()
    if (allowExternalLinks && isHttpUrl(url)) void shell.openExternal(url)
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (allowExternalLinks && isHttpUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
}
