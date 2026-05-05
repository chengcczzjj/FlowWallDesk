import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { getMainWindow, createMainWindow } from '../windows/mainWindow'
import type { MainWindowNavTarget } from '../windows/mainWindow'
import { minimizeAllOtherWindows, refreshCanvasZOrder } from '../windows/canvasWindow'

function showMainWindow(target?: MainWindowNavTarget): void {
  const win = getMainWindow() ?? createMainWindow(target)
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  if (!target || win.webContents.isDestroyed()) return

  const sendNavigate = (): void => {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send(IPC.APP_NAVIGATE, target)
  }
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', sendNavigate)
  } else {
    sendNavigate()
  }
}

export function registerAppIpc(): void {
  ipcMain.handle(IPC.APP_GET_VERSION, () => app.getVersion())
  ipcMain.on(IPC.APP_QUIT, () => app.quit())
  ipcMain.on(IPC.APP_SHOW_MAIN, () => {
    showMainWindow()
  })
  ipcMain.handle(IPC.APP_OPEN_SETTINGS, () => {
    showMainWindow({ activity: 'settings', subPage: 'settings-general' })
    return true
  })
  ipcMain.handle(IPC.APP_OPEN_EXPLORER, async () => {
    const error = await shell.openPath(app.getPath('home'))
    return !error
  })
  ipcMain.handle(IPC.APP_SHOW_DESKTOP, () => {
    const main = getMainWindow()
    if (main && !main.isDestroyed()) main.minimize()
    minimizeAllOtherWindows()
    refreshCanvasZOrder()
    return true
  })

  ipcMain.on(IPC.WIN_MINIMIZE, (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize()
  })
  ipcMain.on(IPC.WIN_MAXIMIZE_TOGGLE, (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
  })
  ipcMain.on(IPC.WIN_CLOSE, (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close()
  })
}
