import { app, BrowserWindow, session } from 'electron'
import { mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { createMainWindow, getMainWindow } from './windows/mainWindow'
import { createWallpaperWindow } from './windows/wallpaperWindow'
import { createCanvasWindow } from './windows/canvasWindow'
import { createTray } from './tray'
import { registerAppIpc } from './ipc/appIpc'
import { registerWallpaperIpc, restoreWallpaper } from './ipc/wallpaperIpc'
import { registerWidgetIpc, restoreWidgets } from './ipc/widgetIpc'
import { registerDesktopIconIpc } from './ipc/desktopIconIpc'
import { registerDataIpc } from './ipc/dataIpc'
import { registerChatIpc } from './ipc/chatIpc'
import { allowAssetRoot, registerAssetProtocol, registerAssetSchemePrivileged } from './protocols'
import { getUserWallpapersRoot } from './runtime/userDataPaths'
import { initMemorySystem } from './memory'
import { isPreciseLocationPermissionAllowed } from './memory/tools/definitions/user-location'
import { applyLaunchAtLoginPreference } from './services/launch-at-login-service'
import { initializeAutoUpdate } from './services/update-service'

// 必须在 app.ready 之前注册
registerAssetSchemePrivileged()

// 开发模式下把 Chromium 会话缓存挪到临时目录，避免默认 profile 缓存权限冲突刷屏。
if (is.dev) {
  const sessionDataPath = join(app.getPath('temp'), 'LingyueDesk', `electron-session-${process.pid}`)
  const diskCachePath = join(sessionDataPath, 'Cache')
  try {
    mkdirSync(diskCachePath, { recursive: true })
    app.setPath('sessionData', sessionDataPath)
    app.commandLine.appendSwitch('disk-cache-dir', diskCachePath)
    app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')
    app.on('will-quit', () => {
      try {
        rmSync(sessionDataPath, { recursive: true, force: true })
      } catch {
        // ignore
      }
    })
  } catch (error) {
    console.warn('[startup] 开发缓存目录配置失败：', error)
  }
}

// 单实例
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

app.on('second-instance', () => {
  const main = getMainWindow() ?? createMainWindow()
  if (main.isMinimized()) main.restore()
  main.show()
  main.focus()
})

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.lingyue.desk')
  await allowAssetRoot(app.isPackaged
    ? join(process.resourcesPath, 'assets', 'wallpaper')
    : join(__dirname, '../../assets/wallpaper'))
  await allowAssetRoot(getUserWallpapersRoot())
  registerAssetProtocol()

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'geolocation') {
      const main = getMainWindow()
      callback(Boolean(main && !main.isDestroyed() && webContents.id === main.webContents.id && isPreciseLocationPermissionAllowed()))
      return
    }
    callback(false)
  })

  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    if (permission !== 'geolocation') return false
    const main = getMainWindow()
    return Boolean(webContents && main && !main.isDestroyed() && webContents.id === main.webContents.id && isPreciseLocationPermissionAllowed())
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 注册 IPC
  registerAppIpc()
  registerWallpaperIpc()
  registerWidgetIpc()
  registerDesktopIconIpc()
  registerDataIpc()
  registerChatIpc()

  // 初始化记忆系统（建库/建表）
  initMemorySystem()

  // 创建窗口 — canvas 先于 mainWindow 创建，确保透明合成正确
  createWallpaperWindow()
  createCanvasWindow()
  createTray()
  applyLaunchAtLoginPreference()
  initializeAutoUpdate()
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
