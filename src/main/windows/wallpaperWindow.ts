import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { IPC } from '@shared/ipc-channels'
import type { WallpaperWindowTarget } from '@shared/wallpaper-display-layout'
import { getWallpaperWindowTargets } from '@shared/wallpaper-display-layout'
import { attachWindowAsWallpaperNative } from './attachWallpaperNative'
import { secureWindowNavigation } from './navigationSecurity'
import { getDisplayDescriptors, getWallpaperDisplayMode } from './displayLayout'
import { getMainWindow } from './mainWindow'

interface ManagedWallpaperWindow {
  key: string
  target: WallpaperWindowTarget
  window: BrowserWindow
  attached: boolean
  attachHint: string
  refreshGeneration: number
  refreshTimer: ReturnType<typeof setTimeout> | null
}

const wallpaperWindows = new Map<string, ManagedWallpaperWindow>()
let boundsListenerRegistered = false
let topologyRefreshTimer: ReturnType<typeof setTimeout> | null = null

function getEntries(): ManagedWallpaperWindow[] {
  return [...wallpaperWindows.values()]
    .filter((entry) => !entry.window.isDestroyed())
    .sort((a, b) => Number(b.target.primary) - Number(a.target.primary))
}

export function getWallpaperWindows(): BrowserWindow[] {
  return getEntries().map((entry) => entry.window)
}

/** Primary monitor (or the span window) is the capture source used by legacy callers. */
export function getWallpaperWindow(): BrowserWindow | null {
  return getEntries()[0]?.window ?? null
}

export function getWallpaperWindowTarget(webContentsId: number): WallpaperWindowTarget | null {
  return getEntries().find((entry) => entry.window.webContents.id === webContentsId)?.target ?? null
}

export function isWallpaperWebContents(webContentsId: number): boolean {
  return getEntries().some((entry) => entry.window.webContents.id === webContentsId)
}

export function isWallpaperAttached(): boolean {
  const entries = getEntries()
  return entries.length > 0 && entries.every((entry) => entry.attached)
}

export function getAttachHint(): string {
  return getEntries().map((entry) => `${entry.key}:${entry.attachHint || 'pending'}`).join(', ')
}

function getAttachStagingBounds(entry: ManagedWallpaperWindow): Electron.Rectangle {
  try {
    const displays = screen.getAllDisplays()
    const maxRight = Math.max(...displays.map((display) => display.bounds.x + display.bounds.width))
    const maxBottom = Math.max(...displays.map((display) => display.bounds.y + display.bounds.height))
    return {
      x: maxRight + 96,
      y: maxBottom + 96,
      width: entry.target.bounds.width,
      height: entry.target.bounds.height,
    }
  } catch {
    return { x: 32_000, y: 32_000, width: entry.target.bounds.width, height: entry.target.bounds.height }
  }
}

function syncWallpaperBounds(entry: ManagedWallpaperWindow, force = false): void {
  const win = entry.window
  if (win.isDestroyed()) return
  const bounds = entry.target.bounds
  const current = win.getBounds()
  if (!force && current.x === bounds.x && current.y === bounds.y && current.width === bounds.width && current.height === bounds.height) return
  win.setBounds(bounds, false)
}

function refreshWallpaperComposition(entry: ManagedWallpaperWindow): void {
  const generation = ++entry.refreshGeneration
  if (entry.refreshTimer) clearTimeout(entry.refreshTimer)

  const repaint = (): void => {
    if (generation !== entry.refreshGeneration || entry.window.isDestroyed()) return
    syncWallpaperBounds(entry, true)
    if (!entry.window.webContents.isDestroyed()) entry.window.webContents.invalidate()
  }

  repaint()
  entry.refreshTimer = setTimeout(() => {
    entry.refreshTimer = null
    repaint()
  }, 240)
}

function loadWallpaperRenderer(win: BrowserWindow): void {
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/wallpaper/index.html`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/wallpaper/index.html'))
  }
}

function createManagedWallpaperWindow(target: WallpaperWindowTarget): ManagedWallpaperWindow {
  const { x, y, width, height } = target.bounds
  const win = new BrowserWindow({
    width,
    height,
    x,
    y,
    show: false,
    frame: false,
    transparent: true,
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
    paintWhenInitiallyHidden: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      additionalArguments: ['--lingyue-window-role=wallpaper', `--lingyue-wallpaper-target=${encodeURIComponent(target.key)}`],
      backgroundThrottling: false,
    },
  })

  const entry: ManagedWallpaperWindow = {
    key: target.key,
    target,
    window: win,
    attached: false,
    attachHint: '',
    refreshGeneration: 0,
    refreshTimer: null,
  }
  wallpaperWindows.set(target.key, entry)

  win.setMenu(null)
  secureWindowNavigation(win)
  if (is.dev) {
    win.webContents.on('console-message', (details) => {
      console.log(`[wallpaper:${target.key}:renderer] ${details.message}`)
    })
  }
  win.setAlwaysOnTop(false)
  win.setIgnoreMouseEvents(true, { forward: false })
  win.on('ready-to-show', () => syncWallpaperBounds(entry))
  win.on('closed', () => {
    entry.refreshGeneration += 1
    if (entry.refreshTimer) clearTimeout(entry.refreshTimer)
    if (wallpaperWindows.get(entry.key) === entry) wallpaperWindows.delete(entry.key)
  })
  loadWallpaperRenderer(win)
  return entry
}

function detachManagedWallpaperWindow(entry: ManagedWallpaperWindow): void {
  if (!entry.attached || entry.attachHint !== 'electron-as-wallpaper' || entry.window.isDestroyed()) return
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const eaw = require('electron-as-wallpaper')
    if (typeof eaw.detach === 'function') eaw.detach(entry.window)
  } catch (error) {
    console.warn(`[wallpaper:${entry.key}] detach 失败，将直接销毁窗口：`, error)
  }
  entry.attached = false
}

/** Keep native wallpaper windows aligned with the current display mode and topology. */
export function reconcileWallpaperWindows(): BrowserWindow[] {
  const targets = getWallpaperWindowTargets(getWallpaperDisplayMode(), getDisplayDescriptors())
  const wanted = new Set(targets.map((target) => target.key))

  for (const [key, entry] of wallpaperWindows) {
    if (wanted.has(key)) continue
    wallpaperWindows.delete(key)
    entry.refreshGeneration += 1
    if (entry.refreshTimer) clearTimeout(entry.refreshTimer)
    detachManagedWallpaperWindow(entry)
    if (!entry.window.isDestroyed()) entry.window.destroy()
  }

  for (const target of targets) {
    const existing = wallpaperWindows.get(target.key)
    if (existing && !existing.window.isDestroyed()) {
      existing.target = target
      syncWallpaperBounds(existing, true)
    } else {
      createManagedWallpaperWindow(target)
    }
  }
  return getWallpaperWindows()
}

function broadcastTopologyChanged(): void {
  for (const win of getWallpaperWindows()) {
    if (!win.webContents.isDestroyed()) win.webContents.send(IPC.WALLPAPER_DISPLAY_LAYOUT_CHANGED)
  }
  const main = getMainWindow()
  if (main && !main.isDestroyed() && !main.webContents.isDestroyed()) {
    main.webContents.send(IPC.WALLPAPER_DISPLAY_LAYOUT_CHANGED)
  }
}

function registerDisplayBoundsListener(): void {
  if (boundsListenerRegistered) return
  boundsListenerRegistered = true
  const scheduleSync = (): void => {
    if (topologyRefreshTimer) clearTimeout(topologyRefreshTimer)
    topologyRefreshTimer = setTimeout(() => {
      topologyRefreshTimer = null
      reconcileWallpaperWindows()
      refreshWallpaperAttach()
      broadcastTopologyChanged()
    }, 180)
  }
  screen.on('display-metrics-changed', scheduleSync)
  screen.on('display-added', scheduleSync)
  screen.on('display-removed', scheduleSync)
}

/** Create all wallpaper windows required by the persisted display mode. */
export function createWallpaperWindow(): BrowserWindow | null {
  registerDisplayBoundsListener()
  reconcileWallpaperWindows()
  return getWallpaperWindow()
}

/** Reconcile window count as well as bounds after a display mode change. */
export function refreshWallpaperBounds(): void {
  reconcileWallpaperWindows()
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function tryAttachToDesktop(entry: ManagedWallpaperWindow): Promise<boolean> {
  const win = entry.window
  if (process.platform !== 'win32') {
    entry.attachHint = 'non-windows'
    return false
  }

  let eaw: {
    attach: (
      window: BrowserWindow,
      options: { transparent: boolean; forwardMouseInput: boolean; forwardKeyboardInput: boolean },
    ) => void
    refresh?: () => void
  } | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    eaw = require('electron-as-wallpaper')
  } catch (error) {
    console.warn(`[wallpaper:${entry.key}] electron-as-wallpaper 加载失败：`, error)
  }

  if (eaw && typeof eaw.attach === 'function') {
    for (const [index, delay] of [0, 300].entries()) {
      if (delay > 0) await wait(delay)
      try {
        eaw.attach(win, {
          transparent: true,
          forwardKeyboardInput: false,
          forwardMouseInput: false,
        })
        syncWallpaperBounds(entry, true)
        entry.attachHint = 'electron-as-wallpaper'
        return true
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.warn(`[wallpaper:${entry.key}] eaw.attach #${index + 1} 失败: ${message}`)
        try { eaw.refresh?.() } catch { /* ignore */ }
      }
    }
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0) await wait(500)
    const result = await attachWindowAsWallpaperNative(win)
    entry.attachHint = `native:${result.hint}`
    if (result.ok) {
      syncWallpaperBounds(entry, true)
      return true
    }
    console.warn(`[wallpaper:${entry.key}] native attach #${attempt + 1} 失败: ${result.hint}`)
  }
  return false
}

async function ensureEntryAttached(entry: ManagedWallpaperWindow): Promise<boolean> {
  if (entry.attached && !entry.window.isDestroyed()) return true
  if (entry.window.isDestroyed()) return false
  entry.window.setBounds(getAttachStagingBounds(entry), false)
  entry.window.setOpacity(0)
  entry.window.showInactive()
  const ok = await tryAttachToDesktop(entry)
  if (ok) {
    syncWallpaperBounds(entry, true)
    entry.attached = true
    entry.window.setOpacity(1)
    refreshWallpaperComposition(entry)
    console.log(`[wallpaper:${entry.key}] 贴桌面成功 (${entry.attachHint})`)
  } else {
    entry.window.hide()
    entry.window.setOpacity(1)
    console.warn(`[wallpaper:${entry.key}] 贴桌面失败 (${entry.attachHint})`)
  }
  return ok
}

/** Attach one renderer after media readiness, or all windows for compatibility callers. */
export async function ensureWallpaperAttached(webContentsId?: number): Promise<boolean> {
  const entries = webContentsId === undefined
    ? getEntries()
    : getEntries().filter((entry) => entry.window.webContents.id === webContentsId)
  if (entries.length === 0) return false
  let ok = true
  for (const entry of entries) ok = (await ensureEntryAttached(entry)) && ok
  return ok
}

/** Refresh every attached wallpaper after Explorer/WorkerW z-order changes. */
export function refreshWallpaperAttach(): void {
  const entries = getEntries()
  if (entries.length === 0) return
  for (const entry of entries) syncWallpaperBounds(entry, true)
  if (!entries.some((entry) => entry.attached)) return
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const eaw = require('electron-as-wallpaper')
    if (typeof eaw.refresh === 'function') eaw.refresh()
  } catch {
    // Native attachment does not require the optional refresh helper.
  }
  for (const entry of entries) {
    if (!entry.attached) continue
    syncWallpaperBounds(entry, true)
    refreshWallpaperComposition(entry)
  }
}
