import type { DisplayBounds } from '@shared/types'

interface NativeDisplayIdentity {
  deviceName: string
  bounds: DisplayBounds
  primary: boolean
}

let koffi: any
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  koffi = require('koffi')
} catch {
  koffi = null
}

interface NativeMonitorApi {
  enumProc: any
  monitorInfo: any
  enumDisplayMonitors: (...args: any[]) => number
  getMonitorInfo: (...args: any[]) => number
}

let cachedApi: NativeMonitorApi | null | undefined

function loadNativeMonitorApi(): NativeMonitorApi | null {
  if (cachedApi !== undefined) return cachedApi
  if (process.platform !== 'win32' || !koffi) {
    cachedApi = null
    return cachedApi
  }
  try {
    const user32 = koffi.load('user32.dll')
    const rect = koffi.struct({ left: 'long', top: 'long', right: 'long', bottom: 'long' })
    const monitorInfo = koffi.struct({
      cbSize: 'uint32',
      rcMonitor: rect,
      rcWork: rect,
      dwFlags: 'uint32',
      szDevice: koffi.array('char16_t', 32, 'String'),
    })
    const enumProc = koffi.proto('__stdcall', 'LingyueMonitorEnumProc', 'int', [
      'intptr',
      'intptr',
      'intptr',
      'intptr',
    ])
    cachedApi = {
      enumProc,
      monitorInfo,
      enumDisplayMonitors: user32.func('__stdcall', 'EnumDisplayMonitors', 'int', [
        'intptr',
        'intptr',
        koffi.pointer(enumProc),
        'intptr',
      ]),
      getMonitorInfo: user32.func('__stdcall', 'GetMonitorInfoW', 'int', [
        'intptr',
        // MONITORINFOEX.cbSize is an input field. `out` zeroes it before the
        // call, which makes GetMonitorInfoW fail on every real machine.
        koffi.inout(koffi.pointer(monitorInfo)),
      ]),
    }
  } catch (error) {
    console.warn('[display] 加载 Win32 显示器 API 失败：', error)
    cachedApi = null
  }
  return cachedApi
}

/** Read the Win32 monitor device name (for example \\.\DISPLAY1). */
export function getNativeDisplayIdentities(): NativeDisplayIdentity[] {
  const api = loadNativeMonitorApi()
  if (!api || !koffi) return []
  try {
    const result: NativeDisplayIdentity[] = []
    const callback = koffi.register((monitor: number) => {
      const info = {
        cbSize: koffi.sizeof(api.monitorInfo),
        rcMonitor: { left: 0, top: 0, right: 0, bottom: 0 },
        rcWork: { left: 0, top: 0, right: 0, bottom: 0 },
        dwFlags: 0,
        szDevice: '',
      }
      if (api.getMonitorInfo(monitor, info)) {
        const deviceName = String(info.szDevice || '').replace(/\0.*$/, '').trim()
        result.push({
          deviceName,
          bounds: {
            x: info.rcMonitor.left,
            y: info.rcMonitor.top,
            width: info.rcMonitor.right - info.rcMonitor.left,
            height: info.rcMonitor.bottom - info.rcMonitor.top,
          },
          primary: (info.dwFlags & 1) !== 0,
        })
      }
      return 1
    }, koffi.pointer(api.enumProc))
    try {
      api.enumDisplayMonitors(0, 0, callback, 0)
    } finally {
      koffi.unregister(callback)
    }
    return result
  } catch (error) {
    console.warn('[display] 读取 Win32 显示器设备标识失败：', error)
    return []
  }
}
