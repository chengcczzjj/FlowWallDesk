import { BrowserWindow, desktopCapturer, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { getWallpaperWindow, refreshWallpaperAttach } from './wallpaperWindow'
import { IPC } from '@shared/ipc-channels'


let koffi: any
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  koffi = require('koffi')
} catch {
  koffi = null
}


let u32: Record<string, any> | null = null

function loadUser32Fns() {
  if (u32) return
  if (!koffi) return
  try {
    const lib = koffi.load('user32.dll')
    const enumCb = koffi.proto('__stdcall', 'EnumWindowsProc', 'int', ['intptr', 'intptr'])
    const RECT = koffi.struct('RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' })
    u32 = {
      SetWindowPos: lib.func('__stdcall', 'SetWindowPos', 'int', [
        'intptr', 'intptr', 'int', 'int', 'int', 'int', 'uint',
      ]),
      GetWindowLongPtrA: lib.func('__stdcall', 'GetWindowLongPtrA', 'intptr', ['intptr', 'int']),
      SetWindowLongPtrA: lib.func('__stdcall', 'SetWindowLongPtrA', 'intptr', ['intptr', 'int', 'intptr']),
      FindWindowExA: lib.func('__stdcall', 'FindWindowExA', 'intptr', ['intptr', 'intptr', 'str', 'intptr']),
      EnumWindows: lib.func('__stdcall', 'EnumWindows', 'int', [koffi.pointer(enumCb), 'intptr']),
      IsWindowVisible: lib.func('__stdcall', 'IsWindowVisible', 'int', ['intptr']),
      IsIconic: lib.func('__stdcall', 'IsIconic', 'int', ['intptr']),
      ShowWindow: lib.func('__stdcall', 'ShowWindow', 'int', ['intptr', 'int']),
      GetWindow: lib.func('__stdcall', 'GetWindow', 'intptr', ['intptr', 'uint']),
      GetForegroundWindow: lib.func('__stdcall', 'GetForegroundWindow', 'intptr', []),
      GetWindowRect: lib.func('__stdcall', 'GetWindowRect', 'int', ['intptr', koffi.out(koffi.pointer(RECT))]),
      GetClassNameA: lib.func('__stdcall', 'GetClassNameA', 'int', ['intptr', 'void*', 'int']),
    }
  } catch {
    // ignore
  }
}

const HWND_BOTTOM = 1
const SWP_NOMOVE = 0x0002
const SWP_NOSIZE = 0x0001
const SWP_NOACTIVATE = 0x0010
const WS_EX_TOOLWINDOW = 0x00000080

const GW_OWNER = 4
const SW_MINIMIZE = 6
const GWL_STYLE = -16
const GWL_EXSTYLE = -20
const WS_VISIBLE = 0x10000000
const GWLP_HWNDPARENT = -8

/** 缓存 SHELLDLL_DefView 句柄 */
let defViewHwnd = 0

/** 桌面是否被全屏窗口遮挡 */
let desktopOccluded = false

/**
 * 检测前台窗口是否全屏覆盖整个屏幕。
 * 全屏游戏/应用遮挡桌面时，壁纸和组件不可见，无需抽帧。
 */
function checkDesktopOccluded(): boolean {
  loadUser32Fns()
  if (!u32) return false
  try {
    const fgHwnd = Number(u32.GetForegroundWindow())
    if (!fgHwnd) return false
    // 跳过桌面 shell 窗口（Progman、WorkerW、任务栏）
    const progman = Number(u32.FindWindowExA(0, 0, 'Progman', 0))
    if (fgHwnd === progman) return false
    const tray = Number(u32.FindWindowExA(0, 0, 'Shell_TrayWnd', 0))
    if (fgHwnd === tray) return false
    // 跳过 DefView 的父 WorkerW
    const dv = findDefView()
    if (dv) {
      const dvOwner = Number(u32.GetWindow(dv, GW_OWNER))
      if (dvOwner && fgHwnd === dvOwner) return false
    }
    // 不计算 Electron 自身窗口
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) {
        try {
          if (Number(w.getNativeWindowHandle().readBigInt64LE(0)) === fgHwnd) return false
        } catch { /* ignore */ }
      }
    }
    // 最大化窗口（WS_MAXIMIZE）的 GetWindowRect 因隐形边框会超出屏幕，
    // 但任务栏仍可见，桌面并未被真正遮挡，不应暂停
    const WS_MAXIMIZE = 0x01000000
    const style = Number(u32.GetWindowLongPtrA(fgHwnd, GWL_STYLE))
    if (style & WS_MAXIMIZE) return false

    const rect = { left: 0, top: 0, right: 0, bottom: 0 }
    u32.GetWindowRect(fgHwnd, rect)
    const primary = screen.getPrimaryDisplay()
    const { width, height } = primary.size
    // 前台窗口尺寸 >= 屏幕尺寸 → 视为真正全屏（游戏/F11 等）
    return (rect.right - rect.left) >= width && (rect.bottom - rect.top) >= height
  } catch {
    return false
  }
}

/** 查找 SHELLDLL_DefView 句柄 */
function findDefView(): number {
  loadUser32Fns()
  if (!u32) return 0
  if (defViewHwnd) return defViewHwnd
  try {
    const progman = Number(u32.FindWindowExA(0, 0, 'Progman', 0))
    if (!progman) return 0
    let dv = Number(u32.FindWindowExA(progman, 0, 'SHELLDLL_DefView', 0))
    if (!dv) {
      u32.EnumWindows((hwnd: number) => {
        const found = Number(u32!.FindWindowExA(hwnd, 0, 'SHELLDLL_DefView', 0))
        if (found) { dv = found; return 0 }
        return 1
      }, 0)
    }
    defViewHwnd = dv
    return dv
  } catch {
    return 0
  }
}

/**
 * 把画布推到 z-order 最底层。
 * 因为 owner=DefView，Windows 会自动保证画布在 DefView 上方，
 * 所以 HWND_BOTTOM 实际效果 = DefView 正上方（图标之上，应用之下）。
 */
function sendToBottom(win: BrowserWindow): void {
  loadUser32Fns()
  if (!u32) return
  try {
    const hwnd = Number(win.getNativeWindowHandle().readBigInt64LE(0))
    u32.SetWindowPos(hwnd, HWND_BOTTOM, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE)
  } catch {
    // ignore
  }
}

/**
 * 将窗口的 owner 设为桌面的 SHELLDLL_DefView，
 * 使其成为桌面结构的一部分，Win+D / 显示桌面不会隐藏它。
 */
function disableShowDesktopMinimize(win: BrowserWindow): void {
  loadUser32Fns()
  if (!u32) return
  try {
    const dv = findDefView()
    if (!dv) return
    const hwnd = Number(win.getNativeWindowHandle().readBigInt64LE(0))
    u32.SetWindowLongPtrA(hwnd, GWLP_HWNDPARENT, dv)
  } catch {
    // ignore
  }
}

let canvasWindow: BrowserWindow | null = null
let isEditing = false
let zOrderTimer: ReturnType<typeof setInterval> | null = null

/**
 * 组件画布窗口：全屏透明无边框。所有桌面组件在此一个窗口内渲染。
 * 鼠标穿透由渲染进程根据光标是否落在组件上动态切换：
 *   在组件上：setIgnoreMouseEvents(false)
 *   在空白：  setIgnoreMouseEvents(true, { forward: true })
 */
export function createCanvasWindow(): BrowserWindow {
  if (canvasWindow && !canvasWindow.isDestroyed()) return canvasWindow

  const display = screen.getPrimaryDisplay()
  const { x, y, width, height } = display.bounds

  canvasWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    show: false,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    alwaysOnTop: false,
    resizable: false,
    movable: false,
    hasShadow: false,
    focusable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/canvas.js'),
      sandbox: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  })

  canvasWindow.setMenu(null)
  canvasWindow.setIgnoreMouseEvents(true, { forward: true })

  // 允许画布窗口捕获系统音频（无需用户弹窗选择）
  canvasWindow.webContents.session.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      const sources = await desktopCapturer.getSources({ types: ['screen'] })
      callback({ video: sources[0], audio: 'loopback' })
    }
  )

  // Workaround for Electron transparent window bug on Windows (#2170 / #40515).
  // DWM only composites transparency correctly when the window is visible and
  // not fully obscured. Fix: briefly set alwaysOnTop to force DWM to composite
  // with correct alpha, then use Win32 SetWindowPos(HWND_BOTTOM) to push the
  // canvas behind all normal windows (just above the desktop).
  canvasWindow.webContents.on('did-finish-load', () => {
    if (!canvasWindow) return
    canvasWindow.setBackgroundColor('#00000000')
    // Make window invisible during the alwaysOnTop phase to avoid flash
    canvasWindow.setOpacity(0)
    canvasWindow.setAlwaysOnTop(true, 'screen-saver')
    canvasWindow.showInactive()
    setTimeout(() => {
      if (!canvasWindow || canvasWindow.isDestroyed()) return
      canvasWindow.setAlwaysOnTop(false)
      // 先设 owner 再推底层，Windows 会确保画布在 DefView 上方但在应用下方
      disableShowDesktopMinimize(canvasWindow)
      sendToBottom(canvasWindow)
      // Restore visibility after window is behind other windows
      canvasWindow.setOpacity(1)

      // 低频轮询：每 300ms 推一次底层，确保画布始终在应用窗口下方
      // 同时检测全屏遮挡，暂停/恢复壁纸帧捕获
      if (!zOrderTimer) {
        zOrderTimer = setInterval(() => {
          if (!canvasWindow || canvasWindow.isDestroyed()) {
            if (zOrderTimer) { clearInterval(zOrderTimer); zOrderTimer = null }
            return
          }
          // 检测全屏遮挡状态变化
          const occluded = checkDesktopOccluded()
          if (occluded !== desktopOccluded) {
            desktopOccluded = occluded
            const wp = getWallpaperWindow()
            if (wp && !wp.isDestroyed()) {
              wp.webContents.send(IPC.WALLPAPER_PAUSE_CAPTURE, occluded)
            }
          }
          if (isEditing) return // 编辑模式需要在最前面
          if (canvasWindow.isMinimized()) return
          sendToBottom(canvasWindow)
        }, 300)
      }
    }, 300)
  })
  // 编辑模式下 blur/focus 切换层级，允许开始菜单/通知中心弹出
  setupEditBlurFocus()

  canvasWindow.on('closed', () => {
    if (zOrderTimer) { clearInterval(zOrderTimer); zOrderTimer = null }
    canvasWindow = null
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    canvasWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/canvas/index.html`)
  } else {
    canvasWindow.loadFile(join(__dirname, '../renderer/canvas/index.html'))
  }

  return canvasWindow
}

export function getCanvasWindow(): BrowserWindow | null {
  return canvasWindow && !canvasWindow.isDestroyed() ? canvasWindow : null
}

export function isCanvasEditMode(): boolean {
  return isEditing
}

export function setCanvasMousePassthrough(ignore: boolean): void {
  if (!canvasWindow || canvasWindow.isDestroyed()) return
  if (ignore) {
    canvasWindow.setIgnoreMouseEvents(true, { forward: true })
  } else {
    canvasWindow.setIgnoreMouseEvents(false)
  }
}

/** 编辑模式下画布 blur/focus 处理：失焦时降低层级让开始菜单/通知栏正常弹出 */
function setupEditBlurFocus(): void {
  if (!canvasWindow || canvasWindow.isDestroyed()) return
  canvasWindow.on('blur', () => {
    if (isEditing && canvasWindow && !canvasWindow.isDestroyed()) {
      canvasWindow.setAlwaysOnTop(false)
    }
  })
  canvasWindow.on('focus', () => {
    if (isEditing && canvasWindow && !canvasWindow.isDestroyed()) {
      canvasWindow.setAlwaysOnTop(true, 'screen-saver')
    }
  })
}

/** 编辑模式：拉到最前 + 可焦点 + 不穿透；可选最小化其他窗口 */
export function setCanvasEditMode(on: boolean): void {
  if (!canvasWindow || canvasWindow.isDestroyed()) return
  isEditing = on
  if (on) {
    // 最小化其他所有普通窗口，露出桌面组件
    minimizeAllOtherWindows()
    canvasWindow.setIgnoreMouseEvents(false)
    canvasWindow.setFocusable(true)
    canvasWindow.setAlwaysOnTop(true, 'screen-saver')
    canvasWindow.focus()
  } else {
    canvasWindow.setFocusable(false)
    canvasWindow.setIgnoreMouseEvents(true, { forward: true })
    canvasWindow.setAlwaysOnTop(false)
    // 先设 owner 再推底层
    disableShowDesktopMinimize(canvasWindow)
    sendToBottom(canvasWindow)
    // 编辑模式退出可能扰乱壁纸窗口的桌面层级，延迟刷新
    setTimeout(() => refreshWallpaperAttach(), 500)
  }
}

/** 用 Win32 EnumWindows 最小化所有非 Electron 的可见窗口 */
export function minimizeAllOtherWindows(): void {
  loadUser32Fns()
  if (!u32) return

  // 收集所有 Electron 窗口的 HWND，排除它们
  const electronHwnds = new Set<number>()
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) {
      try {
        electronHwnds.add(Number(w.getNativeWindowHandle().readBigInt64LE(0)))
      } catch { /* ignore */ }
    }
  }

  // 需要跳过的 shell / 系统窗口类名
  const shellClasses = new Set([
    'Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd',
    'Windows.UI.Core.CoreWindow',           // 开始菜单、搜索、通知中心等 UWP 核心窗口
    'ApplicationFrameWindow',               // UWP 宿主（设置、商店等）
    'Windows.UI.Composition.DesktopWindowContentBridge', // 系统合成层
    'ForegroundStaging',                    // 系统前台暂存窗口
    'Shell_InputSwitchTopLevelWindow',      // 输入法切换
    'XamlExplorerHostIslandWindow',         // Shell XAML 宿主
    'NotifyIconOverflowWindow',             // 系统托盘溢出窗口
  ])

  try {
    u32.EnumWindows((hwnd: number) => {
      try {
        // 跳过 Electron 自己的窗口
        if (electronHwnds.has(hwnd)) return 1
        // 只处理可见、非最小化、无 owner 的顶级窗口
        if (!u32!.IsWindowVisible(hwnd)) return 1
        if (u32!.IsIconic(hwnd)) return 1
        // 跳过有 owner 的窗口（弹窗、工具窗口等）
        const owner = Number(u32!.GetWindow(hwnd, GW_OWNER))
        if (owner !== 0) return 1
        // 跳过不可见样式的窗口
        const style = Number(u32!.GetWindowLongPtrA(hwnd, GWL_STYLE))
        if (!(style & WS_VISIBLE)) return 1
        // 跳过 WS_EX_TOOLWINDOW 窗口（系统工具窗口）
        const exStyle = Number(u32!.GetWindowLongPtrA(hwnd, GWL_EXSTYLE))
        if (exStyle & WS_EX_TOOLWINDOW) return 1
        // 跳过 shell / 系统窗口
        const cls = Buffer.alloc(128)
        const len = u32!.GetClassNameA(hwnd, cls, 128)
        if (len > 0) {
          const name = cls.toString('utf-8', 0, len)
          if (shellClasses.has(name)) return 1
        }
        u32!.ShowWindow(hwnd, SW_MINIMIZE)
      } catch {
        // 单个窗口处理失败不影响其他窗口
      }
      return 1
    }, 0)
  } catch {
    // ignore
  }
}

/**
 * 壁纸 attach 后画布的 HWND_BOTTOM 可能落到 WorkerW 下面导致无法交互。
 * 重新做一次 alwaysOnTop → sendToBottom 来修复 z-order。
 */
export function refreshCanvasZOrder(): void {
  if (!canvasWindow || canvasWindow.isDestroyed()) return
  canvasWindow.setAlwaysOnTop(true, 'screen-saver')
  setTimeout(() => {
    if (!canvasWindow || canvasWindow.isDestroyed()) return
    canvasWindow.setAlwaysOnTop(false)
    disableShowDesktopMinimize(canvasWindow)
    sendToBottom(canvasWindow)
  }, 150)
}

export function isDesktopOccluded(): boolean {
  return desktopOccluded
}
