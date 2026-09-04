/**
 * Windows 桌面贴合（壁纸）原生实现
 *
 * 参考 Lively Wallpaper（WinDesktopCore.cs）的方案：
 *
 * 经典模式（Win10 / 早期 Win11）：
 *   1. SendMessage(Progman, 0x052C) 触发 Explorer 产生 WorkerW
 *   2. EnumWindows 找到含 SHELLDLL_DefView 的窗口，取其兄弟 WorkerW
 *   3. SetParent(hwnd, workerW)
 *
 * Raised Desktop 模式（Win11 24H2+ / build 26002+）：
 *   Progman 带 WS_EX_NOREDIRECTIONBITMAP，DefView 是 WS_EX_LAYERED 子窗口。
 *   1. 给壁纸窗口加 WS_CHILD 样式
 *   2. 给壁纸窗口加 WS_EX_LAYERED + SetLayeredWindowAttributes(alpha=255)
 *   3. SetParent(hwnd, progman)
 *   4. SetWindowPos(hwnd, defView, ...) —— z-order 在 DefView 之后（图标下方）
 *
 * 所有 HWND 用 koffi 'intptr'（8 字节），避免 64 位截断。
 */
import { screen, type BrowserWindow } from 'electron'


let koffi: any
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  koffi = require('koffi')
} catch {
  koffi = null
}

interface User32 {
  FindWindowExA: (parent: number, after: number, cls: string | null, name: string | null) => number
  SendMessageA: (hwnd: number, msg: number, wp: number, lp: number) => number
  SetParent: (child: number, parent: number) => number
  GetParent: (child: number) => number
  GetWindowRect: (hwnd: number, rect: { left: number; top: number; right: number; bottom: number }) => number
  EnumWindows: (cb: unknown, lparam: number) => number
  GetClassNameA: (hwnd: number, buf: Uint8Array, max: number) => number
  IsWindowVisible: (hwnd: number) => number
  SetWindowPos: (
    hwnd: number,
    after: number,
    x: number,
    y: number,
    cx: number,
    cy: number,
    flags: number
  ) => number
  GetWindowLongPtrA: (hwnd: number, index: number) => number
  SetWindowLongPtrA: (hwnd: number, index: number, newLong: number) => number
  SetLayeredWindowAttributes: (hwnd: number, crKey: number, bAlpha: number, dwFlags: number) => number
}

interface Kernel32 {
  GetLastError: () => number
  SetLastError: (err: number) => void
}

let user32: User32 | null = null
let kernel32: Kernel32 | null = null

let enumProto: any = null

function loadUser32(): User32 | null {
  if (user32) return user32
  if (!koffi) return null
  try {
    const lib = koffi.load('user32.dll')
    const RECT = koffi.struct('WallpaperRect', { left: 'long', top: 'long', right: 'long', bottom: 'long' })
    user32 = {
      FindWindowExA: lib.func('__stdcall', 'FindWindowExA', 'intptr', [
        'intptr',
        'intptr',
        'str',
        'str',
      ]),
      SendMessageA: lib.func('__stdcall', 'SendMessageA', 'intptr', [
        'intptr',
        'uint',
        'uintptr',
        'intptr',
      ]),
      SetParent: lib.func('__stdcall', 'SetParent', 'intptr', ['intptr', 'intptr']),
      GetParent: lib.func('__stdcall', 'GetParent', 'intptr', ['intptr']),
      GetWindowRect: lib.func('__stdcall', 'GetWindowRect', 'int', ['intptr', koffi.out(koffi.pointer(RECT))]),
      EnumWindows: lib.func('__stdcall', 'EnumWindows', 'int', ['void*', 'intptr']),
      GetClassNameA: lib.func('__stdcall', 'GetClassNameA', 'int', ['intptr', 'void*', 'int']),
      IsWindowVisible: lib.func('__stdcall', 'IsWindowVisible', 'int', ['intptr']),
      SetWindowPos: lib.func('__stdcall', 'SetWindowPos', 'int', [
        'intptr',
        'intptr',
        'int',
        'int',
        'int',
        'int',
        'uint',
      ]),
      GetWindowLongPtrA: lib.func('__stdcall', 'GetWindowLongPtrA', 'intptr', ['intptr', 'int']),
      SetWindowLongPtrA: lib.func('__stdcall', 'SetWindowLongPtrA', 'intptr', [
        'intptr',
        'int',
        'intptr',
      ]),
      SetLayeredWindowAttributes: lib.func('__stdcall', 'SetLayeredWindowAttributes', 'int', [
        'intptr',
        'uint',
        'uint8',
        'uint',
      ]),
    }
    enumProto = koffi.proto('EnumProc', 'int', ['intptr', 'intptr'])
    const k = koffi.load('kernel32.dll')
    kernel32 = {
      GetLastError: k.func('__stdcall', 'GetLastError', 'uint', []),
      SetLastError: k.func('__stdcall', 'SetLastError', 'void', ['uint']),
    }
    return user32
  } catch (err) {
    console.warn('[attach-native] 加载 user32.dll 失败：', err)
    return null
  }
}

/**
 * 从 BrowserWindow.getNativeWindowHandle() 返回的 Buffer 中读 HWND。
 * Win64 下 Buffer 长度 8（HWND 是 8 字节指针）。
 * HWND 值通常 fits in Number 安全范围（实际上是用户句柄表索引）。
 */
function hwndFromBuffer(buf: Buffer): number {
  if (buf.length >= 8) {
    const big = buf.readBigUInt64LE(0)
    return Number(big)
  }
  return buf.readUInt32LE(0)
}

const SWP_CHILD_NOZORDER = 0x0004
const SWP_CHILD_NOACTIVATE = 0x0010

/**
 * BrowserWindow.setBounds uses screen coordinates while an attached wallpaper
 * becomes a WS_CHILD. Positioning it through Electron afterwards interprets a
 * secondary display's absolute x/y as parent-local and can clip half the image.
 * Convert the target DIP rectangle to native pixels and position it relative to
 * the actual desktop host window instead.
 */
export function setAttachedWallpaperBounds(
  win: BrowserWindow,
  bounds: { x: number; y: number; width: number; height: number },
): boolean {
  const u = loadUser32()
  if (!u) return false
  try {
    const hwnd = hwndFromBuffer(win.getNativeWindowHandle())
    const parent = Number(u.GetParent(hwnd))
    if (!hwnd || !parent) return false
    const parentRect = { left: 0, top: 0, right: 0, bottom: 0 }
    if (!u.GetWindowRect(parent, parentRect)) return false
    // Electron owns the DIP -> physical pixel conversion for the display the
    // BrowserWindow currently occupies (including per-monitor scaling).
    const screenRect = screen.dipToScreenRect(win, {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    })
    return Boolean(u.SetWindowPos(
      hwnd,
      0,
      screenRect.x - parentRect.left,
      screenRect.y - parentRect.top,
      screenRect.width,
      screenRect.height,
      SWP_CHILD_NOZORDER | SWP_CHILD_NOACTIVATE,
    ))
  } catch {
    return false
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

interface FindResult {
  defViewHost: number
  /** Progman 内部第一个 WorkerW 子窗口（很多 Win11 直接放这里） */
  progmanInnerWorker: number
  /** host 之后的兄弟 WorkerW（标准 spawn 之后结构） */
  siblingWorker: number
  workerCount: number
  workers: number[]
}

function readClass(u: User32, hwnd: number): string {
  const cls = Buffer.alloc(64)
  u.GetClassNameA(hwnd, cls, 64)
  const end = cls.indexOf(0)
  return cls.toString('utf-8', 0, end < 0 ? cls.length : end)
}

function findWallpaperWorker(u: User32): FindResult {
  let defViewHost = 0
  const workers: number[] = []
  const cb1 = koffi.register((hwnd: number) => {
    const name = readClass(u, hwnd)
    if (name === 'WorkerW') {
      workers.push(hwnd)
      const v = u.FindWindowExA(hwnd, 0, 'SHELLDLL_DefView', null)
      if (v) defViewHost = hwnd
    } else if (name === 'Progman') {
      const v = u.FindWindowExA(hwnd, 0, 'SHELLDLL_DefView', null)
      if (v) defViewHost = hwnd
    }
    return 1
  }, koffi.pointer(enumProto))
  u.EnumWindows(cb1, 0)
  koffi.unregister(cb1)

  let siblingWorker = 0
  if (defViewHost) {
    siblingWorker = u.FindWindowExA(0, defViewHost, 'WorkerW', null)
  }

  let progmanInnerWorker = 0
  const progman = u.FindWindowExA(0, 0, 'Progman', null)
  if (progman) {
    // 只接受包含 SHELLDLL_DefView 的 progman 子 WorkerW（证明是梣了桌面图标层的那个）
    let inner = u.FindWindowExA(progman, 0, 'WorkerW', null)
    while (inner) {
      const v = u.FindWindowExA(inner, 0, 'SHELLDLL_DefView', null)
      if (v) {
        progmanInnerWorker = inner
        break
      }
      inner = u.FindWindowExA(progman, inner, 'WorkerW', null)
    }
  }

  return {
    defViewHost,
    siblingWorker,
    progmanInnerWorker,
    workerCount: workers.length,
    workers,
  }
}

export function isNativeAttachAvailable(): boolean {
  return process.platform === 'win32' && !!koffi
}

// ── Win32 常量 ──
const GWL_STYLE = -16
const GWL_EXSTYLE = -20
const WS_CHILD = 0x40000000
const WS_EX_LAYERED = 0x00080000
const WS_EX_NOREDIRECTIONBITMAP = 0x00200000
const LWA_ALPHA = 0x02
const SWP_NOMOVE = 0x0002
const SWP_NOSIZE = 0x0001
const SWP_NOACTIVATE = 0x0010
const SWP_FLAGS = SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE // 0x0013
const HWND_BOTTOM = 1

/** 检测 Progman 是否是新版 Raised Desktop（WS_EX_NOREDIRECTIONBITMAP） */
function isRaisedDesktop(u: User32, progman: number): boolean {
  const exStyle = u.GetWindowLongPtrA(progman, GWL_EXSTYLE)
  return (exStyle & WS_EX_NOREDIRECTIONBITMAP) !== 0
}

/** 给窗口添加 WS_CHILD 样式 */
function addChildStyle(u: User32, hwnd: number): void {
  const style = u.GetWindowLongPtrA(hwnd, GWL_STYLE)
  u.SetWindowLongPtrA(hwnd, GWL_STYLE, style | WS_CHILD)
}

/** 给窗口添加 WS_EX_LAYERED 并设置 alpha=255（完全不透明） */
function setLayeredOpaque(u: User32, hwnd: number): void {
  const exStyle = u.GetWindowLongPtrA(hwnd, GWL_EXSTYLE)
  if ((exStyle & WS_EX_LAYERED) === 0) {
    u.SetWindowLongPtrA(hwnd, GWL_EXSTYLE, exStyle | WS_EX_LAYERED)
  }
  u.SetLayeredWindowAttributes(hwnd, 0, 255, LWA_ALPHA)
}

/** 尝试把 BrowserWindow 贴到桌面壁纸层。 */
export async function attachWindowAsWallpaperNative(
  win: BrowserWindow
): Promise<{ ok: boolean; hint: string }> {
  if (process.platform !== 'win32') return { ok: false, hint: 'non-windows' }
  const u = loadUser32()
  if (!u) return { ok: false, hint: 'no-koffi' }
  try {
    const buf = win.getNativeWindowHandle()
    const hwnd = hwndFromBuffer(buf)
    if (!hwnd) return { ok: false, hint: 'no-hwnd' }
    console.log(`[attach-native] our hwnd=0x${hwnd.toString(16)} bufLen=${buf.length}`)

    const progman = u.FindWindowExA(0, 0, 'Progman', null)
    if (!progman) return { ok: false, hint: 'no-progman' }
    console.log(`[attach-native] progman=0x${progman.toString(16)}`)

    // 检测是否为 Win11 24H2+ Raised Desktop
    const raisedDesktop = isRaisedDesktop(u, progman)
    console.log(`[attach-native] raisedDesktop=${raisedDesktop}`)

    // 触发 spawn WorkerW
    u.SendMessageA(progman, 0x052c, 0x0000000d, 0x00000000)
    u.SendMessageA(progman, 0x052c, 0x0000000d, 0x00000001)

    // 查找窗口层次
    let result: FindResult = {
      defViewHost: 0,
      siblingWorker: 0,
      progmanInnerWorker: 0,
      workerCount: 0,
      workers: [],
    }
    for (const delay of [50, 100, 200, 400, 800]) {
      await wait(delay)
      result = findWallpaperWorker(u)
      console.log(
        `[attach-native] poll: workers=${result.workerCount} defViewHost=0x${result.defViewHost.toString(16)} siblingWorker=0x${result.siblingWorker.toString(16)} progmanInner=0x${result.progmanInnerWorker.toString(16)}`
      )
      if (result.siblingWorker) break
      if (result.defViewHost === progman) break
    }

    // ─── Raised Desktop 模式（Win11 24H2+） ───
    // 参考 Lively Wallpaper 的 TryAttachToDesktop:
    //   1. 设 WS_CHILD
    //   2. 设 WS_EX_LAYERED + alpha=255（必须在 SetParent 之前）
    //   3. SetParent(hwnd, progman)
    //   4. SetWindowPos(hwnd, defView, ...) — 放在 DefView 之后
    //   5. 确保 WorkerW 在最底层
    if (raisedDesktop) {
      console.log('[attach-native] 使用 Raised Desktop 方案（Lively 方式）')

      const defView = u.FindWindowExA(progman, 0, 'SHELLDLL_DefView', null)
      const progmanWorkerW = u.FindWindowExA(progman, 0, 'WorkerW', null)
      console.log(
        `[attach-native] defView=0x${(defView || 0).toString(16)} progmanWorkerW=0x${(progmanWorkerW || 0).toString(16)}`
      )

      // Step 1: 添加 WS_CHILD 样式
      addChildStyle(u, hwnd)
      // Step 2: 添加 WS_EX_LAYERED + alpha=255（在 SetParent 之前！）
      setLayeredOpaque(u, hwnd)

      // Step 3: SetParent 到 Progman
      kernel32?.SetLastError(0)
      const prev = u.SetParent(hwnd, progman)
      const err = kernel32?.GetLastError() ?? 0
      console.log(`[attach-native] SetParent(progman) prev=0x${prev.toString(16)} err=${err}`)

      if (prev === 0 && err !== 0) {
        return { ok: false, hint: `setparent-failed(err=${err})` }
      }

      // Step 4: z-order 放在 DefView 之后（视觉上在桌面图标下方）
      if (defView) {
        u.SetWindowPos(hwnd, defView, 0, 0, 0, 0, SWP_FLAGS)
      } else {
        u.SetWindowPos(hwnd, HWND_BOTTOM, 0, 0, 0, 0, SWP_FLAGS)
      }

      // Step 5: 确保 WorkerW 在最底层
      if (progmanWorkerW) {
        u.SetWindowPos(progmanWorkerW, HWND_BOTTOM, 0, 0, 0, 0, SWP_FLAGS)
      }

      return {
        ok: true,
        hint: `raised-desktop(defView=0x${(defView || 0).toString(16)}, workerW=0x${(progmanWorkerW || 0).toString(16)})`,
      }
    }

    // ─── 经典模式（Win10 / 早期 Win11）───
    // SetParent 到兄弟 WorkerW 或 Progman 内部 WorkerW
    const candidates: { hwnd: number; tag: string }[] = []
    if (result.siblingWorker)
      candidates.push({ hwnd: result.siblingWorker, tag: 'sibling-of-host' })
    if (result.progmanInnerWorker)
      candidates.push({ hwnd: result.progmanInnerWorker, tag: 'progman-inner' })

    for (const c of candidates) {
      kernel32?.SetLastError(0)
      const prev = u.SetParent(hwnd, c.hwnd)
      const err = kernel32?.GetLastError() ?? 0
      console.log(
        `[attach-native] try SetParent ${c.tag}=0x${c.hwnd.toString(16)} -> prev=0x${prev.toString(16)} err=${err}`
      )
      if (prev !== 0 || err === 0) {
        u.SetWindowPos(hwnd, HWND_BOTTOM, 0, 0, 0, 0, SWP_FLAGS)
        return { ok: true, hint: `${c.tag}=0x${c.hwnd.toString(16)}` }
      }
    }

    return {
      ok: false,
      hint: `all-failed(workers=${result.workerCount})`,
    }
  } catch (err) {
    console.warn('[attach-native] 异常:', err)
    return { ok: false, hint: 'exception' }
  }
}
