import { selectAppWindowCandidate, type AppWindowCandidate } from '@shared/window-activation'

interface NativeForegroundApi {
  koffi: any
  enumWindows: (callback: (hwnd: number) => number, lParam: number) => number
  getWindowThreadProcessId: (hwnd: number, processId: Array<number | null>) => number
  getWindowText: (hwnd: number, buffer: Buffer, maxCount: number) => number
  getClassName: (hwnd: number, buffer: Buffer, maxCount: number) => number
  getWindowRect: (hwnd: number, rect: { left: number; top: number; right: number; bottom: number }) => number
  isWindowVisible: (hwnd: number) => number
  isWindowEnabled: (hwnd: number) => number
  isIconic: (hwnd: number) => number
  getWindow: (hwnd: number, command: number) => number
  getWindowLongPtr: (hwnd: number, index: number) => number
  getForegroundWindow: () => number
  showWindowAsync: (hwnd: number, command: number) => number
  bringWindowToTop: (hwnd: number) => number
  setForegroundWindow: (hwnd: number) => number
  setWindowPos: (hwnd: number, insertAfter: number, x: number, y: number, width: number, height: number, flags: number) => number
  switchToThisWindow: (hwnd: number, altTab: boolean) => void
  attachThreadInput: (sourceThread: number, targetThread: number, attach: boolean) => number
  getCurrentThreadId: () => number
  openProcess: (access: number, inherit: boolean, processId: number) => number
  queryProcessImageName: (process: number, flags: number, buffer: Buffer, size: number[]) => number
  closeHandle: (handle: number) => number
}

export interface ForegroundActivationResult {
  found: boolean
  activated: boolean
  processId?: number
  title?: string
  processPath?: string
  className?: string
  rect?: { left: number; top: number; right: number; bottom: number }
  error?: string
}

export interface AppWindowReadinessResult extends ForegroundActivationResult {
  waitedMs: number
  timedOut: boolean
}

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
const GW_OWNER = 4
const GWL_EXSTYLE = -20
const WS_EX_TOOLWINDOW = 0x00000080
const SW_RESTORE = 9
const SW_SHOW = 5
const HWND_TOPMOST = -1
const HWND_NOTOPMOST = -2
const SWP_NOSIZE = 0x0001
const SWP_NOMOVE = 0x0002
const SWP_SHOWWINDOW = 0x0040
let nativeApi: NativeForegroundApi | null | undefined

function loadNativeApi(): NativeForegroundApi | null {
  if (nativeApi !== undefined) return nativeApi
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi = require('koffi')
    const user32 = koffi.load('user32.dll')
    const kernel32 = koffi.load('kernel32.dll')
    const enumCallback = koffi.proto('__stdcall', 'LingyueEnumForegroundWindows', 'int', ['intptr', 'intptr'])
    const RECT = koffi.struct('LingyueForegroundRect', { left: 'long', top: 'long', right: 'long', bottom: 'long' })
    nativeApi = {
      koffi,
      enumWindows: user32.func('__stdcall', 'EnumWindows', 'int', [koffi.pointer(enumCallback), 'intptr']),
      getWindowThreadProcessId: user32.func('uint32 __stdcall GetWindowThreadProcessId(intptr hwnd, _Out_ uint32 *pid)'),
      getWindowText: user32.func('int __stdcall GetWindowTextW(intptr hwnd, _Out_ char16_t *text, int maxCount)'),
      getClassName: user32.func('int __stdcall GetClassNameW(intptr hwnd, _Out_ char16_t *text, int maxCount)'),
      getWindowRect: user32.func('__stdcall', 'GetWindowRect', 'int', ['intptr', koffi.out(koffi.pointer(RECT))]),
      isWindowVisible: user32.func('int __stdcall IsWindowVisible(intptr hwnd)'),
      isWindowEnabled: user32.func('int __stdcall IsWindowEnabled(intptr hwnd)'),
      isIconic: user32.func('int __stdcall IsIconic(intptr hwnd)'),
      getWindow: user32.func('intptr __stdcall GetWindow(intptr hwnd, uint command)'),
      getWindowLongPtr: user32.func('intptr __stdcall GetWindowLongPtrW(intptr hwnd, int index)'),
      getForegroundWindow: user32.func('intptr __stdcall GetForegroundWindow()'),
      showWindowAsync: user32.func('int __stdcall ShowWindowAsync(intptr hwnd, int command)'),
      bringWindowToTop: user32.func('int __stdcall BringWindowToTop(intptr hwnd)'),
      setForegroundWindow: user32.func('int __stdcall SetForegroundWindow(intptr hwnd)'),
      setWindowPos: user32.func(
        'int __stdcall SetWindowPos(intptr hwnd, intptr insertAfter, int x, int y, int width, int height, uint flags)'
      ),
      switchToThisWindow: user32.func('void __stdcall SwitchToThisWindow(intptr hwnd, bool altTab)'),
      attachThreadInput: user32.func('int __stdcall AttachThreadInput(uint32 source, uint32 target, bool attach)'),
      getCurrentThreadId: kernel32.func('uint32 __stdcall GetCurrentThreadId()'),
      openProcess: kernel32.func('intptr __stdcall OpenProcess(uint32 access, bool inherit, uint32 pid)'),
      queryProcessImageName: kernel32.func(
        'int __stdcall QueryFullProcessImageNameW(intptr process, uint32 flags, _Out_ char16_t *name, _Inout_ uint32 *size)'
      ),
      closeHandle: kernel32.func('int __stdcall CloseHandle(intptr handle)'),
    }
  } catch {
    nativeApi = null
  }
  return nativeApi
}

function readProcessPath(api: NativeForegroundApi, processId: number): string {
  const process = api.openProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, processId)
  if (!process) return ''
  try {
    const buffer = Buffer.alloc(65_536)
    const size = [32_768]
    if (!api.queryProcessImageName(process, 0, buffer, size)) return ''
    return api.koffi.decode(buffer, 'char16_t', size[0])
  } finally {
    api.closeHandle(process)
  }
}

function enumerateAppWindows(api: NativeForegroundApi): AppWindowCandidate[] {
  const result: AppWindowCandidate[] = []
  const processPathCache = new Map<number, string>()
  let zOrder = 0

  api.enumWindows((hwnd) => {
    const processIdOutput: Array<number | null> = [null]
    const threadId = api.getWindowThreadProcessId(hwnd, processIdOutput)
    const processId = processIdOutput[0] ?? 0
    if (!threadId || !processId) return 1

    let processPath = processPathCache.get(processId)
    if (processPath === undefined) {
      processPath = readProcessPath(api, processId)
      processPathCache.set(processId, processPath)
    }
    if (!processPath) return 1

    const titleBuffer = Buffer.alloc(1_024)
    const titleLength = api.getWindowText(hwnd, titleBuffer, 512)
    const classBuffer = Buffer.alloc(512)
    const classLength = api.getClassName(hwnd, classBuffer, 256)
    const rect = { left: 0, top: 0, right: 0, bottom: 0 }
    api.getWindowRect(hwnd, rect)
    result.push({
      hwnd,
      processId,
      processPath,
      title: titleLength > 0 ? api.koffi.decode(titleBuffer, 'char16_t', titleLength) : '',
      visible: Boolean(api.isWindowVisible(hwnd)),
      enabled: Boolean(api.isWindowEnabled(hwnd)),
      minimized: Boolean(api.isIconic(hwnd)),
      owned: Boolean(api.getWindow(hwnd, GW_OWNER)),
      toolWindow: Boolean(api.getWindowLongPtr(hwnd, GWL_EXSTYLE) & WS_EX_TOOLWINDOW),
      zOrder: zOrder++,
      className: classLength > 0 ? api.koffi.decode(classBuffer, 'char16_t', classLength) : '',
      rect,
    })
    return 1
  }, 0)
  return result
}

export function activateExistingAppWindow(targetPath: string): ForegroundActivationResult {
  const api = loadNativeApi()
  if (!api) return { found: false, activated: false, error: 'Windows activation API unavailable' }

  try {
    const candidate = selectAppWindowCandidate(targetPath, enumerateAppWindows(api))
    if (!candidate) return { found: false, activated: false }

    const foreground = api.getForegroundWindow()
    const foregroundThread = foreground ? api.getWindowThreadProcessId(foreground, [null]) : 0
    const targetThread = api.getWindowThreadProcessId(candidate.hwnd, [null])
    const currentThread = api.getCurrentThreadId()
    const attachedThreads: number[] = []
    let raised = false

    try {
      for (const threadId of new Set([foregroundThread, targetThread])) {
        if (threadId && threadId !== currentThread && api.attachThreadInput(currentThread, threadId, true)) {
          attachedThreads.push(threadId)
        }
      }
      if (candidate.minimized || !candidate.visible) {
        api.showWindowAsync(candidate.hwnd, candidate.minimized ? SW_RESTORE : SW_SHOW)
      }
      api.bringWindowToTop(candidate.hwnd)
      let requested = Boolean(api.setForegroundWindow(candidate.hwnd))
      if (!requested) {
        const positionFlags = SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW
        const topmost = Boolean(api.setWindowPos(candidate.hwnd, HWND_TOPMOST, 0, 0, 0, 0, positionFlags))
        const restored = Boolean(api.setWindowPos(candidate.hwnd, HWND_NOTOPMOST, 0, 0, 0, 0, positionFlags))
        raised = topmost && restored
        requested = Boolean(api.setForegroundWindow(candidate.hwnd))
      }
      if (!requested && !raised) api.switchToThisWindow(candidate.hwnd, true)
    } finally {
      for (const threadId of attachedThreads.reverse()) {
        api.attachThreadInput(currentThread, threadId, false)
      }
    }

    const activated = api.getForegroundWindow() === candidate.hwnd || raised
    return {
      found: true,
      activated,
      processId: candidate.processId,
      title: candidate.title,
      processPath: candidate.processPath,
      className: candidate.className,
      rect: candidate.rect,
    }
  } catch (error) {
    return {
      found: false,
      activated: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function waitForAppWindow(
  targetPath: string,
  timeoutMs = 15_000,
  pollIntervalMs = 250,
): Promise<AppWindowReadinessResult> {
  const startedAt = Date.now()
  while (Date.now() - startedAt <= timeoutMs) {
    const result = activateExistingAppWindow(targetPath)
    if (result.found || result.error) {
      return { ...result, waitedMs: Date.now() - startedAt, timedOut: false }
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }
  return {
    found: false,
    activated: false,
    waitedMs: Date.now() - startedAt,
    timedOut: true,
  }
}
