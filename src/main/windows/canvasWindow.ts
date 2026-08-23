import { BrowserWindow, desktopCapturer, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { getWallpaperWindow, refreshWallpaperAttach } from './wallpaperWindow'
import { IPC } from '@shared/ipc-channels'
import { rectCoversDisplay, StableBooleanTransition } from '@shared/desktop-occlusion'
import {
  findInteractiveWidgetAtPoint,
  isDesktopIconWidgetType,
  shouldRepairCanvasInteraction,
  shouldIgnoreCanvasMouse,
} from '@shared/canvas-hit-test'
import { isNativeCanvasSurfaceHit, shouldFallbackNativeDockClick } from '@shared/native-dock-click'
import { secureWindowNavigation } from './navigationSecurity'
import { store } from '../store'
import { logDockDiagnostic } from '../runtime/diagnosticLog'
import { getDesktopRenderBounds } from './displayLayout'


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
    const POINT = koffi.struct('POINT', { x: 'long', y: 'long' })
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
      IsWindow: lib.func('__stdcall', 'IsWindow', 'int', ['intptr']),
      GetAncestor: lib.func('__stdcall', 'GetAncestor', 'intptr', ['intptr', 'uint']),
      GetForegroundWindow: lib.func('__stdcall', 'GetForegroundWindow', 'intptr', []),
      GetWindowRect: lib.func('__stdcall', 'GetWindowRect', 'int', ['intptr', koffi.out(koffi.pointer(RECT))]),
      GetClassNameA: lib.func('__stdcall', 'GetClassNameA', 'int', ['intptr', 'void*', 'int']),
      GetWindowTextA: lib.func('__stdcall', 'GetWindowTextA', 'int', ['intptr', 'void*', 'int']),
      GetWindowThreadProcessId: lib.func('__stdcall', 'GetWindowThreadProcessId', 'uint', ['intptr', 'void*']),
      GetAsyncKeyState: lib.func('__stdcall', 'GetAsyncKeyState', 'short', ['int']),
      GetCursorPos: lib.func('__stdcall', 'GetCursorPos', 'int', [koffi.out(koffi.pointer(POINT))]),
      WindowFromPoint: lib.func('__stdcall', 'WindowFromPoint', 'intptr', [POINT]),
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
// Windows may activate a launched application before Chromium delivers the
// matching pointerup. Do not let a lost gesture keep the transparent canvas
// intercepting the whole desktop indefinitely.
const RENDERER_POINTER_STALE_MS = 180
const INTERACTION_REPAIR_COOLDOWN_MS = 450
const INTERACTION_REPAIR_MAX_ATTEMPTS = 4

const GW_OWNER = 4
const GA_ROOT = 2
const SW_MINIMIZE = 6
const GWL_STYLE = -16
const GWL_EXSTYLE = -20
const WS_VISIBLE = 0x10000000
const GWLP_HWNDPARENT = -8

/** 缓存 SHELLDLL_DefView 句柄 */
let defViewHwnd = 0

/** 桌面是否被全屏窗口遮挡 */
let desktopOccluded = false
const occlusionTransition = new StableBooleanTransition(false, 2)
let lastOcclusionDiagnostic: Record<string, unknown> = { reason: 'not-sampled' }

function describeNativeWindow(hwnd: number): Record<string, unknown> {
  if (!u32 || !hwnd) return { hwnd }
  const rect = { left: 0, top: 0, right: 0, bottom: 0 }
  const classBuffer = Buffer.alloc(256)
  const titleBuffer = Buffer.alloc(512)
  const processBuffer = Buffer.alloc(4)
  const classLength = Number(u32.GetClassNameA(hwnd, classBuffer, classBuffer.length))
  const titleLength = Number(u32.GetWindowTextA(hwnd, titleBuffer, titleBuffer.length))
  u32.GetWindowThreadProcessId(hwnd, processBuffer)
  u32.GetWindowRect(hwnd, rect)
  return {
    hwnd,
    processId: processBuffer.readUInt32LE(0),
    className: classLength > 0 ? classBuffer.toString('utf8', 0, classLength) : '',
    title: titleLength > 0 ? titleBuffer.toString('utf8', 0, titleLength) : '',
    rect,
    style: Number(u32.GetWindowLongPtrA(hwnd, GWL_STYLE)),
    exStyle: Number(u32.GetWindowLongPtrA(hwnd, GWL_EXSTYLE)),
  }
}

/**
 * 检测前台窗口是否全屏覆盖整个屏幕。
 * 全屏游戏/应用遮挡桌面时，壁纸和组件不可见，无需抽帧。
 */
function checkDesktopOccluded(): boolean {
  loadUser32Fns()
  if (!u32) {
    lastOcclusionDiagnostic = { reason: 'native-api-unavailable' }
    return false
  }
  try {
    const fgHwnd = Number(u32.GetForegroundWindow())
    const finish = (occluded: boolean, reason: string, details: Record<string, unknown> = {}): boolean => {
      lastOcclusionDiagnostic = { ...describeNativeWindow(fgHwnd), reason, ...details }
      return occluded
    }
    if (!fgHwnd) return finish(false, 'no-foreground-window')
    // 跳过桌面 shell 窗口（Progman、WorkerW、任务栏）
    const progman = Number(u32.FindWindowExA(0, 0, 'Progman', 0))
    if (fgHwnd === progman) return finish(false, 'desktop-progman')
    const tray = Number(u32.FindWindowExA(0, 0, 'Shell_TrayWnd', 0))
    if (fgHwnd === tray) return finish(false, 'desktop-taskbar')
    // 跳过 DefView 的父 WorkerW
    const dv = findDefView()
    if (dv) {
      const desktopRoot = Number(u32.GetAncestor(dv, GA_ROOT))
      if (desktopRoot && fgHwnd === desktopRoot) return finish(false, 'desktop-root')
    }
    // 不计算 Electron 自身窗口
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) {
        try {
          if (Number(w.getNativeWindowHandle().readBigInt64LE(0)) === fgHwnd) return finish(false, 'lingyue-window')
        } catch { /* ignore */ }
      }
    }
    // 最大化窗口（WS_MAXIMIZE）的 GetWindowRect 因隐形边框会超出屏幕，
    // 但任务栏仍可见，桌面并未被真正遮挡，不应暂停
    const WS_MAXIMIZE = 0x01000000
    const style = Number(u32.GetWindowLongPtrA(fgHwnd, GWL_STYLE))
    if (style & WS_MAXIMIZE) return finish(false, 'maximized-with-taskbar')

    const rect = { left: 0, top: 0, right: 0, bottom: 0 }
    u32.GetWindowRect(fgHwnd, rect)
    const displays = screen.getAllDisplays()
    const dipRect = screen.screenToDipRect(null, {
      x: rect.left,
      y: rect.top,
      width: rect.right - rect.left,
      height: rect.bottom - rect.top,
    })
    // In a virtual multi-display canvas, pause only when every display is
    // covered. A fullscreen app on the secondary screen must not blank the
    // still-visible primary desktop.
    const coverage = {
      left: dipRect.x,
      top: dipRect.y,
      right: dipRect.x + dipRect.width,
      bottom: dipRect.y + dipRect.height,
    }
    const covered = displays.length > 1
      ? displays.every((display) => rectCoversDisplay(coverage, display.bounds))
      : rectCoversDisplay(coverage, displays[0]?.bounds ?? getDesktopRenderBounds())
    return finish(covered, 'display-coverage', { dipRect, displayCount: displays.length })
  } catch {
    lastOcclusionDiagnostic = { reason: 'occlusion-check-failed' }
    return false
  }
}

/** 查找 SHELLDLL_DefView 句柄 */
function findDefView(): number {
  loadUser32Fns()
  if (!u32) return 0
  if (defViewHwnd && u32.IsWindow(defViewHwnd)) return defViewHwnd
  defViewHwnd = 0
  try {
    const progman = Number(u32.FindWindowExA(0, 0, 'Progman', 0))
    if (!progman) return 0
    let dv = Number(u32.FindWindowExA(progman, 0, 'SHELLDLL_DefView', 0))
    // Win11 Raised Desktop may nest DefView inside a WorkerW child of Progman.
    let innerWorker = Number(u32.FindWindowExA(progman, 0, 'WorkerW', 0))
    while (!dv && innerWorker) {
      dv = Number(u32.FindWindowExA(innerWorker, 0, 'SHELLDLL_DefView', 0))
      innerWorker = Number(u32.FindWindowExA(progman, innerWorker, 'WorkerW', 0))
    }
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

function applyCanvasMousePassthrough(): void {
  const win = getCanvasWindow()
  if (!win) return
  const rendererHoverHint = !rendererMousePassthrough && Date.now() - rendererMousePassthroughAt < 250
  const ignore = shouldIgnoreCanvasMouse({
    desktopOccluded,
    recompositing: canvasRecompositing,
    editing: isEditing || canvasTextInputActive,
    pointerActive: rendererPointerActive,
    widgetUnderCursor: Boolean(cursorWidgetId) || rendererHoverHint,
  })
  if (nativeMousePassthrough === ignore) return
  nativeMousePassthrough = ignore
  nativeCaptureRequestedAt = ignore ? 0 : Date.now()
  if (ignore) {
    win.setIgnoreMouseEvents(true, { forward: true })
  } else {
    win.setIgnoreMouseEvents(false)
  }
  logDockDiagnostic('canvas.mouse-passthrough-changed', {
    ignore,
    desktopOccluded,
    recompositing: canvasRecompositing,
    editing: isEditing,
    textInputActive: canvasTextInputActive,
    pointerActive: rendererPointerActive,
    cursorWidgetId,
    rendererHoverHint,
  })
}

interface NativeCursorSurface {
  hitHwnd: number
  rootHwnd: number
  canvasHwnd: number
  canvasTopmost: boolean
  desktopSurface: boolean
  hitClassName: string
  rootClassName: string
  reason: string
}

function readNativeClassName(hwnd: number): string {
  if (!u32 || !hwnd) return ''
  const buffer = Buffer.alloc(128)
  const length = Number(u32.GetClassNameA(hwnd, buffer, buffer.length))
  return length > 0 ? buffer.toString('utf8', 0, length) : ''
}

function isDesktopShellSurface(hitHwnd: number, rootHwnd: number, rootClassName: string): boolean {
  if (!u32) return false
  const progman = Number(u32.FindWindowExA(0, 0, 'Progman', 0))
  const defView = findDefView()
  const desktopRoot = defView ? Number(u32.GetAncestor(defView, GA_ROOT)) : 0
  let wallpaperHwnd = 0
  const wallpaper = getWallpaperWindow()
  if (wallpaper && !wallpaper.isDestroyed()) {
    try {
      wallpaperHwnd = Number(wallpaper.getNativeWindowHandle().readBigInt64LE(0))
    } catch {
      wallpaperHwnd = 0
    }
  }
  return (
    hitHwnd === progman || rootHwnd === progman ||
    hitHwnd === defView || rootHwnd === desktopRoot ||
    (wallpaperHwnd !== 0 && (hitHwnd === wallpaperHwnd || rootHwnd === wallpaperHwnd)) ||
    rootClassName === 'Progman' || rootClassName === 'WorkerW'
  )
}

function inspectNativeCursorSurface(): NativeCursorSurface {
  loadUser32Fns()
  const unavailable = (reason: string): NativeCursorSurface => ({
    hitHwnd: 0,
    rootHwnd: 0,
    canvasHwnd: 0,
    canvasTopmost: false,
    desktopSurface: false,
    hitClassName: '',
    rootClassName: '',
    reason,
  })
  if (!u32) return unavailable('native-api-unavailable')
  const win = getCanvasWindow()
  if (!win) return unavailable('canvas-unavailable')

  try {
    const point = { x: 0, y: 0 }
    if (!u32.GetCursorPos(point)) return unavailable('cursor-unavailable')
    const hitHwnd = Number(u32.WindowFromPoint(point))
    const rootHwnd = hitHwnd ? Number(u32.GetAncestor(hitHwnd, GA_ROOT)) : 0
    const canvasHwnd = Number(win.getNativeWindowHandle().readBigInt64LE(0))
    const hitClassName = readNativeClassName(hitHwnd)
    const rootClassName = readNativeClassName(rootHwnd)
    return {
      hitHwnd,
      rootHwnd,
      canvasHwnd,
      canvasTopmost: isNativeCanvasSurfaceHit({ hitHwnd, rootHwnd, canvasHwnd }),
      desktopSurface: isDesktopShellSurface(hitHwnd, rootHwnd, rootClassName),
      hitClassName,
      rootClassName,
      reason: hitHwnd ? 'window-from-point' : 'no-window-at-cursor',
    }
  } catch {
    return unavailable('surface-check-failed')
  }
}

function refreshCanvasCursorHitTest(): void {
  const displayBounds = getDesktopRenderBounds()
  const cursor = screen.getCursorScreenPoint()
  const widgets = store.get('widgets')
  const widget = findInteractiveWidgetAtPoint(cursor, displayBounds, widgets)
  // Sample the native surface for every widget, not only Dock.  A fullscreen
  // transition can leave Chromium's renderer hover state looking healthy
  // while Windows still routes the point to the wallpaper/desktop surface.
  // Sticky notes have no native click fallback, so they otherwise remain
  // visibly present but completely inert until another Dock hover repairs the
  // shared canvas HWND.
  const widgetSurface = widget ? inspectNativeCursorSurface() : null
  const iconSurface = widget && isDesktopIconWidgetType(widget.type) ? widgetSurface : null
  const previousIconSurface = lastNativeIconSurfaceSample
  const nextWidgetId = widget?.id ?? null
  if (nextWidgetId !== cursorWidgetId) {
    cursorWidgetId = nextWidgetId
    nativeCaptureRequestedAt = nextWidgetId ? Date.now() : 0
    interactionRepairWidgetId = null
    interactionRepairAttempts = 0
    interactionRepairLastAt = 0
    logDockDiagnostic('canvas.cursor-region-changed', {
      widgetId: cursorWidgetId,
      widgetType: widget?.type ?? null,
      cursor,
    })
  }
  loadUser32Fns()
  if (u32) {
    const now = Date.now()
    const state = Number(u32.GetAsyncKeyState(0x01))
    const currentlyDown = (state & 0x8000) !== 0
    const pressedSinceLastSample = (state & 0x0001) !== 0
    if (currentlyDown !== nativeLeftButtonDown || pressedSinceLastSample) {
      logDockDiagnostic('canvas.native-left-button', {
        phase: currentlyDown ? 'down' : pressedSinceLastSample ? 'tap' : 'up',
        cursor,
        cursorWidgetId,
        nativeMousePassthrough,
        desktopOccluded,
      })
    }

    if (currentlyDown && !nativeLeftButtonDown) {
      nativeIconGesture = !desktopOccluded && !isEditing && widget && isDesktopIconWidgetType(widget.type)
        ? {
            widgetId: widget.id,
            startedAt: now,
            start: cursor,
            canvasTopmostAtStart: Boolean(iconSurface?.canvasTopmost),
            startSurface: iconSurface,
          }
        : null
    } else if (!currentlyDown && nativeLeftButtonDown) {
      finishNativeIconGesture(cursor, nextWidgetId, now, iconSurface)
    } else if (!currentlyDown && pressedSinceLastSample && !nativeLeftButtonDown) {
      // A complete fast click can happen between two polling samples.
      if (!desktopOccluded && !isEditing && widget && isDesktopIconWidgetType(widget.type)) {
        const priorSurfaceMatches = Boolean(
          previousIconSurface &&
          previousIconSurface.widgetId === widget.id &&
          now - previousIconSurface.sampledAt <= 100 &&
          previousIconSurface.surface.canvasTopmost
        )
        nativeIconGesture = {
          widgetId: widget.id,
          startedAt: now,
          start: cursor,
          canvasTopmostAtStart: priorSurfaceMatches,
          startSurface: previousIconSurface?.surface ?? null,
        }
        finishNativeIconGesture(cursor, widget.id, now, iconSurface)
      }
    }
    nativeLeftButtonDown = currentlyDown

    // GetAsyncKeyState is the final source of truth for the physical button.
    // If the renderer missed pointerup during an app/focus transition, repair
    // both sides of the gate instead of waiting for another user gesture.
    if (!currentlyDown && rendererPointerActive) {
      if (rendererPointerReleaseCandidateAt === 0) rendererPointerReleaseCandidateAt = now
      if (now - rendererPointerReleaseCandidateAt >= RENDERER_POINTER_STALE_MS) {
        resetCanvasPointerState('native-button-up-without-renderer-release')
      }
    } else if (currentlyDown) {
      rendererPointerReleaseCandidateAt = 0
    }
  }
  lastNativeIconSurfaceSample = iconSurface && widget
    ? { widgetId: widget.id, sampledAt: Date.now(), surface: iconSurface }
    : null
  applyCanvasMousePassthrough()
  const repairNow = Date.now()
  const repairCoolingDown = interactionRepairWidgetId === widget?.id && repairNow - interactionRepairLastAt < INTERACTION_REPAIR_COOLDOWN_MS
  const repairExhausted = interactionRepairWidgetId === widget?.id && interactionRepairAttempts >= INTERACTION_REPAIR_MAX_ATTEMPTS
  if (!rendererPointerActive && !repairCoolingDown && !repairExhausted && widget && widgetSurface && shouldRepairCanvasInteraction({
    desktopOccluded,
    recompositing: canvasRecompositing,
    nativeMousePassthrough,
    rendererMousePassthrough,
    captureRequestedAt: nativeCaptureRequestedAt,
    now: repairNow,
    canvasTopmost: widgetSurface.canvasTopmost,
    desktopSurface: widgetSurface.desktopSurface,
    alreadyAttempted: false,
  })) {
    interactionRepairWidgetId = widget.id
    interactionRepairAttempts = interactionRepairAttempts + 1
    interactionRepairLastAt = repairNow
    logDockDiagnostic('canvas.interaction-repair-requested', {
      widgetId: widget.id,
      widgetType: widget.type,
      attempt: interactionRepairAttempts,
      surface: widgetSurface,
    })
    refreshCanvasZOrder('missing-renderer-hover')
  }
}

function cancelCanvasZOrderRefresh(): void {
  zOrderRefreshGeneration += 1
  if (zOrderRefreshTimer) {
    clearTimeout(zOrderRefreshTimer)
    zOrderRefreshTimer = null
  }
  if (desktopReturnRecoveryTimer) {
    clearTimeout(desktopReturnRecoveryTimer)
    desktopReturnRecoveryTimer = null
  }
  const win = getCanvasWindow()
  if (win) win.setAlwaysOnTop(false)
  canvasRecompositing = false
}

function settleCanvasOnDesktop(win: BrowserWindow): void {
  disableShowDesktopMinimize(win)
  sendToBottom(win)
}

function recoverCanvasAfterDesktopReturn(): void {
  refreshWallpaperAttach()
  refreshCanvasZOrder('desktop-return')
  if (desktopReturnRecoveryTimer) clearTimeout(desktopReturnRecoveryTimer)
  desktopReturnRecoveryTimer = setTimeout(() => {
    desktopReturnRecoveryTimer = null
    if (cursorWidgetId || rendererPointerActive || canvasTextInputActive) return
    refreshCanvasZOrder('desktop-return-settled')
  }, 360)
}

function commitDesktopOcclusion(occluded: boolean): void {
  desktopOccluded = occluded
  nativeIconGesture = null
  rendererMousePassthrough = true
  rendererMousePassthroughAt = Date.now()
  rendererPointerActive = false
  rendererPointerReleaseCandidateAt = 0
  cursorWidgetId = null
  nativeCaptureRequestedAt = 0
  interactionRepairWidgetId = null
  interactionRepairAttempts = 0
  interactionRepairLastAt = 0
  lastNativeIconSurfaceSample = null
  lastRendererActionPointerDownAt = 0
  if (occluded) {
    cancelCanvasZOrderRefresh()
    canvasTextInputActive = false
    getCanvasWindow()?.setFocusable(false)
  }
  applyCanvasMousePassthrough()

  const wp = getWallpaperWindow()
  if (wp && !wp.isDestroyed() && !wp.webContents.isDestroyed()) {
    wp.webContents.send(IPC.WALLPAPER_PAUSE_CAPTURE, occluded)
  }
  const canvas = getCanvasWindow()
  if (canvas && !canvas.webContents.isDestroyed()) {
    canvas.webContents.send(IPC.CANVAS_OCCLUSION_CHANGED, {
      occluded,
      cursor: screen.getCursorScreenPoint(),
    })
  }

  if (!occluded) recoverCanvasAfterDesktopReturn()
  console.log(`[canvas] desktop ${occluded ? 'occluded' : 'visible'}; interaction state reset`)
  logDockDiagnostic('canvas.occlusion-changed', { occluded, foreground: lastOcclusionDiagnostic })
}

let canvasWindow: BrowserWindow | null = null
let isEditing = false
let canvasTextInputActive = false
let rendererMousePassthrough = true
let rendererMousePassthroughAt = 0
let rendererPointerActive = false
let rendererPointerReleaseCandidateAt = 0
let nativeMousePassthrough: boolean | null = null
let cursorWidgetId: string | null = null
let nativeLeftButtonDown = false
let lastRendererActionPointerDownAt = 0
let canvasRecompositing = false
let nativeCaptureRequestedAt = 0
let interactionRepairWidgetId: string | null = null
let interactionRepairAttempts = 0
let interactionRepairLastAt = 0
let nativeIconGesture: {
  widgetId: string
  startedAt: number
  start: { x: number; y: number }
  canvasTopmostAtStart: boolean
  startSurface: NativeCursorSurface | null
} | null = null
let lastNativeIconSurfaceSample: {
  widgetId: string
  sampledAt: number
  surface: NativeCursorSurface
} | null = null
let canvasHealthTimer: ReturnType<typeof setInterval> | null = null
let cursorHitTestTimer: ReturnType<typeof setInterval> | null = null
let zOrderRefreshTimer: ReturnType<typeof setTimeout> | null = null
let desktopReturnRecoveryTimer: ReturnType<typeof setTimeout> | null = null
let zOrderRefreshGeneration = 0
let boundsListenerRegistered = false

function resetCanvasPointerState(reason: string): void {
  const win = getCanvasWindow()
  if (!rendererPointerActive && !win) return
  rendererPointerActive = false
  rendererPointerReleaseCandidateAt = 0
  nativeIconGesture = null
  lastRendererActionPointerDownAt = 0
  logDockDiagnostic('canvas.pointer-state-reset', { reason })
  if (win && !win.webContents.isDestroyed()) win.webContents.send(IPC.CANVAS_POINTER_RESET)
  applyCanvasMousePassthrough()
}

function finishNativeIconGesture(
  cursor: { x: number; y: number },
  releaseWidgetId: string | null,
  endedAt: number,
  endSurface: NativeCursorSurface | null = inspectNativeCursorSurface(),
): void {
  const gesture = nativeIconGesture
  nativeIconGesture = null
  if (!gesture) return

  const fallback = !desktopOccluded && !isEditing && !canvasRecompositing && shouldFallbackNativeDockClick({
    ...gesture,
    endedAt,
    end: cursor,
    releaseWidgetId,
    rendererActionPointerDownAt: lastRendererActionPointerDownAt,
    canvasTopmostAtEnd: Boolean(endSurface?.canvasTopmost),
    desktopSurfaceAtStart: gesture.startSurface?.desktopSurface === true,
    desktopSurfaceAtEnd: endSurface?.desktopSurface === true,
  })
  logDockDiagnostic('canvas.native-icon-click-decision', {
    widgetId: gesture.widgetId,
    fallback,
    durationMs: endedAt - gesture.startedAt,
    movementPx: Math.round(Math.hypot(cursor.x - gesture.start.x, cursor.y - gesture.start.y)),
    rendererAckAgeMs: endedAt - lastRendererActionPointerDownAt,
    releaseWidgetId,
    canvasTopmostAtStart: gesture.canvasTopmostAtStart,
    canvasTopmostAtEnd: Boolean(endSurface?.canvasTopmost),
    startSurface: gesture.startSurface,
    endSurface,
    recompositing: canvasRecompositing,
  })
  if (!fallback) return

  const win = getCanvasWindow()
  if (!win || win.webContents.isDestroyed()) return
  win.webContents.send(IPC.CANVAS_NATIVE_DOCK_CLICK, {
    widgetId: gesture.widgetId,
    screenX: cursor.x,
    screenY: cursor.y,
    detectedAt: endedAt,
  })
  logDockDiagnostic('canvas.native-icon-click-sent', {
    widgetId: gesture.widgetId,
    cursor,
  })
}

function syncCanvasBoundsToPrimaryDisplay(): void {
  const win = getCanvasWindow()
  if (!win) return
  const bounds = getDesktopRenderBounds()
  const current = win.getBounds()
  if (
    current.x === bounds.x && current.y === bounds.y &&
    current.width === bounds.width && current.height === bounds.height
  ) return
  win.setBounds(bounds, false)
  if (!isEditing) sendToBottom(win)
}

function registerCanvasDisplayListener(): void {
  if (boundsListenerRegistered) return
  boundsListenerRegistered = true
  const sync = () => {
    syncCanvasBoundsToPrimaryDisplay()
    // Display topology can move the virtual desktop origin (e.g. a monitor
    // added on the left). Migrate persisted widget coordinates asynchronously
    // to avoid a static widgetIpc <-> canvasWindow import cycle.
    void import('../ipc/widgetIpc').then(({ ensureWidgetCoordinateOrigin }) => ensureWidgetCoordinateOrigin()).catch(() => undefined)
  }
  screen.on('display-metrics-changed', sync)
  screen.on('display-added', sync)
  screen.on('display-removed', sync)
}

/**
 * 组件画布窗口：全屏透明无边框。所有桌面组件在此一个窗口内渲染。
 * 鼠标穿透由渲染进程根据光标是否落在组件上动态切换：
 *   在组件上：setIgnoreMouseEvents(false)
 *   在空白：  setIgnoreMouseEvents(true, { forward: true })
 */
export function createCanvasWindow(): BrowserWindow {
  if (canvasWindow && !canvasWindow.isDestroyed()) return canvasWindow

  const { x, y, width, height } = getDesktopRenderBounds()

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
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      additionalArguments: ['--lingyue-window-role=canvas'],
      backgroundThrottling: false,
    },
  })

  canvasWindow.setMenu(null)
  secureWindowNavigation(canvasWindow)
  if (is.dev) {
    canvasWindow.webContents.on('console-message', (details) => {
      console.log(`[canvas:renderer] ${details.message}`)
    })
  }
  rendererMousePassthrough = true
  rendererMousePassthroughAt = Date.now()
  rendererPointerActive = false
  rendererPointerReleaseCandidateAt = 0
  canvasTextInputActive = false
  nativeMousePassthrough = null
  cursorWidgetId = null
  nativeLeftButtonDown = false
  canvasRecompositing = true
  nativeCaptureRequestedAt = 0
  interactionRepairWidgetId = null
  interactionRepairAttempts = 0
  interactionRepairLastAt = 0
  nativeIconGesture = null
  lastNativeIconSurfaceSample = null
  lastRendererActionPointerDownAt = 0
  applyCanvasMousePassthrough()
  registerCanvasDisplayListener()

  // 允许画布窗口捕获系统音频（无需用户弹窗选择）
  canvasWindow.webContents.session.setDisplayMediaRequestHandler(
    async (request, callback) => {
      if (!canvasWindow || request.frame !== canvasWindow.webContents.mainFrame) {
        callback({})
        return
      }
      const sources = await desktopCapturer.getSources({ types: ['screen'] })
      const source = sources[0]
      callback(source ? { video: source, audio: 'loopback' } : {})
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
      canvasRecompositing = false
      applyCanvasMousePassthrough()

      // Z-order 只在明确的窗口生命周期边界重建。反复 SetWindowPos
      // 会让 Windows/Chromium 在长时间运行后丢失透明窗口的命中状态。
      if (!canvasHealthTimer) {
        canvasHealthTimer = setInterval(() => {
          if (!canvasWindow || canvasWindow.isDestroyed()) {
            if (canvasHealthTimer) { clearInterval(canvasHealthTimer); canvasHealthTimer = null }
            return
          }
          const stableOcclusion = occlusionTransition.sample(checkDesktopOccluded())
          if (stableOcclusion !== null) commitDesktopOcclusion(stableOcclusion)
        }, 300)
      }
      if (!cursorHitTestTimer) {
        cursorHitTestTimer = setInterval(refreshCanvasCursorHitTest, 25)
      }
      refreshCanvasCursorHitTest()
      logDockDiagnostic('canvas.ready', { bounds: canvasWindow.getBounds() })
    }, 300)
  })
  // 编辑模式下 blur/focus 切换层级，允许开始菜单/通知中心弹出
  setupEditBlurFocus()

  canvasWindow.on('closed', () => {
    if (canvasHealthTimer) { clearInterval(canvasHealthTimer); canvasHealthTimer = null }
    if (cursorHitTestTimer) { clearInterval(cursorHitTestTimer); cursorHitTestTimer = null }
    cancelCanvasZOrderRefresh()
    rendererPointerActive = false
    rendererPointerReleaseCandidateAt = 0
    canvasTextInputActive = false
    nativeMousePassthrough = null
    cursorWidgetId = null
    nativeLeftButtonDown = false
    canvasRecompositing = false
    nativeCaptureRequestedAt = 0
    interactionRepairWidgetId = null
    interactionRepairAttempts = 0
    interactionRepairLastAt = 0
    nativeIconGesture = null
    lastNativeIconSurfaceSample = null
    lastRendererActionPointerDownAt = 0
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
  // 丢弃遮挡期间到达的旧 mouseenter 请求，避免恢复后整屏截获鼠标。
  if (desktopOccluded && !ignore) return
  rendererMousePassthrough = ignore
  rendererMousePassthroughAt = Date.now()
  applyCanvasMousePassthrough()
}

/** Re-apply the transparent canvas rectangle after switching display mode. */
export function refreshCanvasBounds(): void {
  syncCanvasBoundsToPrimaryDisplay()
}

export function setCanvasPointerActive(active: boolean): void {
  if (desktopOccluded && active) return
  if (rendererPointerActive === active) return
  rendererPointerActive = active
  rendererPointerReleaseCandidateAt = 0
  logDockDiagnostic('canvas.pointer-active-changed', { active, cursorWidgetId })
  applyCanvasMousePassthrough()
}

/** 只为桌面内联编辑临时开启键盘焦点，不改变组件层级或全局编辑状态。 */
export function setCanvasTextInputActive(active: boolean): boolean {
  const win = getCanvasWindow()
  if (!win || (desktopOccluded && active)) return false
  if (isEditing) return true
  if (canvasTextInputActive === active) {
    if (active) {
      win.setFocusable(true)
      win.focus()
      win.webContents.focus()
    }
    return true
  }

  canvasTextInputActive = active
  rendererMousePassthrough = !active
  rendererMousePassthroughAt = Date.now()
  if (active) {
    cancelCanvasZOrderRefresh()
    win.setFocusable(true)
    applyCanvasMousePassthrough()
    win.focus()
    win.webContents.focus()
  } else {
    win.setFocusable(false)
    applyCanvasMousePassthrough()
    settleCanvasOnDesktop(win)
  }
  logDockDiagnostic('canvas.text-input-active-changed', { active })
  return true
}

export function noteCanvasRendererActionPointerDown(): void {
  lastRendererActionPointerDownAt = Date.now()
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
  cancelCanvasZOrderRefresh()
  isEditing = on
  canvasTextInputActive = false
  if (on) {
    // 最小化其他所有普通窗口，露出桌面组件
    minimizeAllOtherWindows()
    rendererMousePassthrough = false
    applyCanvasMousePassthrough()
    canvasWindow.setFocusable(true)
    canvasWindow.setAlwaysOnTop(true, 'screen-saver')
    canvasWindow.focus()
  } else {
    rendererMousePassthrough = true
    canvasWindow.setFocusable(false)
    applyCanvasMousePassthrough()
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
export function refreshCanvasZOrder(reason = 'requested'): void {
  const win = getCanvasWindow()
  if (!win || desktopOccluded || isEditing || canvasTextInputActive) return

  const generation = ++zOrderRefreshGeneration
  if (zOrderRefreshTimer) clearTimeout(zOrderRefreshTimer)
  canvasRecompositing = true
  nativeIconGesture = null
  lastNativeIconSurfaceSample = null
  applyCanvasMousePassthrough()
  // Re-entering the top-level compositor briefly repairs transparent-window input
  // after Chromium/Windows marks the canvas as fully occluded.
  disableShowDesktopMinimize(win)
  win.showInactive()
  if (!win.webContents.isDestroyed()) win.webContents.invalidate()
  win.setAlwaysOnTop(true, 'screen-saver')
  logDockDiagnostic('canvas.z-order-refresh-started', { reason })
  zOrderRefreshTimer = setTimeout(() => {
    zOrderRefreshTimer = null
    if (generation !== zOrderRefreshGeneration) return
    const current = getCanvasWindow()
    if (!current) {
      canvasRecompositing = false
      return
    }
    if (desktopOccluded || isEditing || canvasTextInputActive) {
      canvasRecompositing = false
      applyCanvasMousePassthrough()
      return
    }
    current.setAlwaysOnTop(false)
    settleCanvasOnDesktop(current)
    if (!current.webContents.isDestroyed()) current.webContents.invalidate()
    canvasRecompositing = false
    // Full-screen transitions can invalidate Electron's cached click-through style.
    nativeMousePassthrough = null
    applyCanvasMousePassthrough()
    logDockDiagnostic('canvas.z-order-refresh-completed', { reason })
  }, 150)
}

export function isDesktopOccluded(): boolean {
  return desktopOccluded
}
