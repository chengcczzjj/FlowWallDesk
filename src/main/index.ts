import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createMainWindow, getMainWindow } from './windows/mainWindow'
import { createWallpaperWindow } from './windows/wallpaperWindow'
import { createCanvasWindow } from './windows/canvasWindow'
import { createTray } from './tray'
import { registerAppIpc } from './ipc/appIpc'
import { registerWallpaperIpc, restoreWallpaper } from './ipc/wallpaperIpc'
import { registerWidgetIpc, restoreWidgets } from './ipc/widgetIpc'
import { registerDataIpc } from './ipc/dataIpc'
import { registerAssetProtocol, registerAssetSchemePrivileged } from './protocols'

// 必须在 app.ready 之前注册
registerAssetSchemePrivileged()

// 单实例
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

app.on('second-instance', () => {
  const main = getMainWindow()
  if (main) {
    if (main.isMinimized()) main.restore()
    main.show()
    main.focus()
  }
})

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.lingyue.desk')
  registerAssetProtocol()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 注册 IPC
  registerAppIpc()
  registerWallpaperIpc()
  registerWidgetIpc()
  registerDataIpc()

  // 创建窗口 — canvas 先于 mainWindow 创建，确保透明合成正确
  createWallpaperWindow()
  createCanvasWindow()
  createTray()
  // mainWindow 延迟创建：用户点击托盘时才创建，节省一个渲染进程（~50-80MB）

  // 恢复上次状态
  await restoreWallpaper()
  await restoreWidgets()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

// 关闭主界面不退出应用（壁纸/画布/托盘仍在运行）
app.on('window-all-closed', () => {
  // 桌面伴侣应用，保持后台。仅在显式调用 app.quit() 时退出。
})
