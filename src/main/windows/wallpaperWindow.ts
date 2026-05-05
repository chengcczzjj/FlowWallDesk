import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { attachWindowAsWallpaperNative } from './attachWallpaperNative'

let wallpaperWindow: BrowserWindow | null = null
let attached = false
let attachHint = ''
let boundsListenerRegistered = false

export function isWallpaperAttached(): boolean {
  return attached && !!getWallpaperWindow()
}
export function getAttachHint(): string {
  return attachHint
}

function getPrimaryDisplayBounds(): { x: number; y: number; width: number; height: number } {
  const display = screen.getPrimaryDisplay()
  const { x, y, width, height } = display.bounds
  return { x, y, width, height }
}

function syncWallpaperBoundsToPrimaryDisplay(force = false): void {
  const win = getWallpaperWindow()
  if (!win) return
  const bounds = getPrimaryDisplayBounds()
  const current = win.getBounds()
  if (
    !force &&
    current.x === bounds.x &&
    current.y === bounds.y &&
    current.width === bounds.width &&
    current.height === bounds.height
  ) {
    return
  }
  win.setBounds(bounds, false)
}

function registerDisplayBoundsListener(): void {
  if (boundsListenerRegistered) return
  boundsListenerRegistered = true
  const sync = (): void => {
    syncWallpaperBoundsToPrimaryDisplay(true)
    refreshWallpaperAttach()
  }
  screen.on('display-metrics-changed', sync)
  screen.on('display-added', sync)
  screen.on('display-removed', sync)
}

/**
 * 创建壁纸窗口：全屏无边框。
 * 时序：ready-to-show → show() → attach()。
 * 若 attach 失败 → 立即 hide()，绝不挡桌面。
 */
export function createWallpaperWindow(): BrowserWindow {
  if (wallpaperWindow && !wallpaperWindow.isDestroyed()) return wallpaperWindow

  const { x, y, width, height } = getPrimaryDisplayBounds()

  wallpaperWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    show: false,
    frame: false,
    transparent: false,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    hasShadow: false,
    thickFrame: false,
    type: 'toolbar',
    backgroundColor: '#FF00FF',
    webPreferences: {
      preload: join(__dirname, '../preload/wallpaper.js'),
      sandbox: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  })

  wallpaperWindow.setMenu(null)
  wallpaperWindow.setAlwaysOnTop(false)
  wallpaperWindow.setIgnoreMouseEvents(true, { forward: false })
  registerDisplayBoundsListener()

  wallpaperWindow.on('ready-to-show', async () => {
    if (!wallpaperWindow) return
    syncWallpaperBoundsToPrimaryDisplay()
    // 先把窗口显示出来（不显示的窗口 SetParent 后会被系统当不可见处理）
    wallpaperWindow.showInactive()
    const ok = await tryAttachToDesktop(wallpaperWindow)
    if (ok) {
      syncWallpaperBoundsToPrimaryDisplay()
      attached = true
      console.log(`[wallpaper] 已贴到桌面 (${attachHint})`)
    } else {
      attached = false
      // 贴失败立即隐藏，不允许它浮在桌面上挡其他窗口/桌面图标
      wallpaperWindow.hide()
      console.warn(`[wallpaper] 贴桌面失败 (${attachHint})：壁纸窗口已隐藏，配置仍会保存`)
    }
  })

  wallpaperWindow.on('closed', () => {
    wallpaperWindow = null
    attached = false
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    wallpaperWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/wallpaper/index.html`)
  } else {
    wallpaperWindow.loadFile(join(__dirname, '../renderer/wallpaper/index.html'))
  }

  return wallpaperWindow
}

export function getWallpaperWindow(): BrowserWindow | null {
  return wallpaperWindow && !wallpaperWindow.isDestroyed() ? wallpaperWindow : null
}

/**
 * 若壁纸窗口存在但未贴合桌面（如启动时 attach 失败），重新尝试 attach。
 * 返回是否成功。
 */
export async function ensureWallpaperAttached(): Promise<boolean> {
  if (attached) return true
  const win = getWallpaperWindow()
  if (!win) return false
  syncWallpaperBoundsToPrimaryDisplay()
  win.showInactive()
  const ok = await tryAttachToDesktop(win)
  if (ok) {
    syncWallpaperBoundsToPrimaryDisplay()
    attached = true
    console.log(`[wallpaper] 重新贴桌面成功 (${attachHint})`)
  } else {
    win.hide()
    console.warn(`[wallpaper] 重新贴桌面失败 (${attachHint})`)
  }
  return ok
}

/**
 * 编辑模式退出后轻量刷新壁纸层级：
 * 只调用 eaw.refresh() 修复 WorkerW z-order，不做完整 re-attach，避免闪黑。
 */
export function refreshWallpaperAttach(): void {
  const win = getWallpaperWindow()
  if (!win || win.isDestroyed()) return
  syncWallpaperBoundsToPrimaryDisplay()
  if (!attached) return
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const eaw = require('electron-as-wallpaper')
    if (typeof eaw.refresh === 'function') {
      eaw.refresh()
      syncWallpaperBoundsToPrimaryDisplay()
      console.log('[wallpaper] 轻量刷新完成')
    }
  } catch {
    // ignore – 若 eaw 不可用则跳过
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * 把窗口嵌入桌面图标层下方。
 * 先尝试 electron-as-wallpaper，再退到我们自己的 native 实现。
 */
async function tryAttachToDesktop(win: BrowserWindow): Promise<boolean> {
  if (process.platform !== 'win32') {
    attachHint = 'non-windows'
    return false
  }

  let eaw: {
    attach: (
      w: BrowserWindow,
      opts: { transparent: boolean; forwardMouseInput: boolean; forwardKeyboardInput: boolean }
    ) => void
    refresh?: () => void
  } | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    eaw = require('electron-as-wallpaper')
  } catch (err) {
    console.warn('[wallpaper] electron-as-wallpaper 加载失败：', err)
  }

  // 第一轮：electron-as-wallpaper（快速尝试，若 WorkerW 不存在则不浪费时间重试）
  if (eaw && typeof eaw.attach === 'function') {
    const delays = [0, 300]
    for (let i = 0; i < delays.length; i++) {
      if (delays[i] > 0) await wait(delays[i])
      try {
        eaw.attach(win, {
          transparent: false,
          forwardKeyboardInput: false,
          forwardMouseInput: false,
        })
        syncWallpaperBoundsToPrimaryDisplay()
        attachHint = 'electron-as-wallpaper'
        return true
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[wallpaper] eaw.attach #${i + 1} 失败: ${msg}`)
        try {
          eaw.refresh?.()
        } catch {
          // ignore
        }
      }
    }
  }

  // 第二轮：原生 koffi 实现
  console.log('[wallpaper] 尝试原生 SetParent 回退...')
  for (let i = 0; i < 2; i++) {
    if (i > 0) await wait(500)
    const r = await attachWindowAsWallpaperNative(win)
    attachHint = `native:${r.hint}`
    if (r.ok) {
      syncWallpaperBoundsToPrimaryDisplay()
      return true
    }
    console.warn(`[wallpaper] native attach #${i + 1} 失败: ${r.hint}`)
  }
  return false
}
