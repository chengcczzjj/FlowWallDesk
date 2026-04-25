import { app, BrowserWindow, ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { getMainWindow, createMainWindow } from '../windows/mainWindow'

export function registerAppIpc(): void {
  ipcMain.handle(IPC.APP_GET_VERSION, () => app.getVersion())
  ipcMain.on(IPC.APP_QUIT, () => app.quit())
  ipcMain.on(IPC.APP_SHOW_MAIN, () => {
    const win = getMainWindow() ?? createMainWindow()
    win.show()
    win.focus()
  })

  ipcMain.on(IPC.WIN_MINIMIZE, (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize()
  })
  ipcMain.on(IPC.WIN_MAXIMIZE_TOGGLE, (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    win.isMaximized() ? win.unmaximize() : win.maximize()
  })
  ipcMain.on(IPC.WIN_CLOSE, (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close()
  })
}
