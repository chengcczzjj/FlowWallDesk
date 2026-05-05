import { BrowserWindow, app, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { store } from '../store'

let mainWindow: BrowserWindow | null = null
/** 标记本次应用会话是否已经展示过主窗口（用于导航状态恢复） */
let hasShownMainWindow = false

export interface MainWindowNavTarget {
  activity: string
  subPage?: string
}

export function createMainWindow(target?: MainWindowNavTarget): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
    return mainWindow
  }

  const bounds = store.get('mainWindowBounds')

  mainWindow = new BrowserWindow({
    width: bounds?.width ?? 1200,
    height: bounds?.height ?? 780,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#1c1c1c',
    frame: false,
    titleBarStyle: 'hidden',
    title: '灵月 LingyueDesk',
    webPreferences: {
      preload: join(__dirname, '../preload/main-ui.js'),
      sandbox: false,
      contextIsolation: true,
    },
  })

  // 窗口加载完毕后自动显示（createMainWindow 只在用户主动操作时调用）
  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })

  mainWindow.on('close', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const b = mainWindow.getBounds()
      store.set('mainWindowBounds', b)
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 首次启动不传 restore 参数（回到首页），后续窗口重建传 restore=1（恢复上次页面）
  const shouldRestore = hasShownMainWindow
  hasShownMainWindow = true

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    const params = new URLSearchParams()
    if (shouldRestore) params.set('restore', '1')
    if (target?.activity) params.set('activity', target.activity)
    if (target?.subPage) params.set('subPage', target.subPage)
    const q = params.toString() ? `?${params.toString()}` : ''
    mainWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/main-ui/index.html${q}`)
  } else {
    const query: Record<string, string> = {}
    if (shouldRestore) query.restore = '1'
    if (target?.activity) query.activity = target.activity
    if (target?.subPage) query.subPage = target.subPage
    mainWindow.loadFile(join(__dirname, '../renderer/main-ui/index.html'), {
      query: Object.keys(query).length > 0 ? query : undefined,
    })
  }

  return mainWindow
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
}

// 防止 unused 警告
void app
