import { screen } from 'electron'
import type { DisplayBounds, DisplayDescriptor, WallpaperDisplayMode } from '@shared/types'
import { normalizeWallpaperDisplayMode, unionDisplayBounds } from '@shared/wallpaper-display-layout'
import { store } from '../store'
import { getNativeDisplayIdentities } from './nativeDisplayIdentity'

/**
 * The first multi-display implementation persisted coordinates in a different
 * space.  Treat an unversioned layout as unsafe once, and boot on the primary
 * display.  The user can still opt into any other layout from Display Settings;
 * explicit choices are marked as configured and survive future restarts.
 */
export const WALLPAPER_DISPLAY_SCHEMA_VERSION = 3

export function normalizePersistedWallpaperDisplay(): void {
  const persisted = store.get('wallpaperDisplay')
  if (persisted?.schemaVersion === WALLPAPER_DISPLAY_SCHEMA_VERSION) return

  const displays = getDisplayDescriptors()
  const assignments: Record<string, string> = {}
  for (const [key, wallpaperId] of Object.entries(persisted?.assignments ?? {})) {
    const electronKey = /^electron:(-?\d+)$/.exec(key)
    const legacyId = electronKey ? Number(electronKey[1]) : Number(key)
    const display = Number.isInteger(legacyId)
      ? displays.find((candidate) => candidate.id === legacyId)
      : displays.find((candidate) => candidate.key.toLowerCase() === key.toLowerCase())
    if (display) assignments[display.key] = wallpaperId
    else if (key.toLowerCase().startsWith('win32:')) assignments[key.toLowerCase()] = wallpaperId
  }
  store.set('wallpaperDisplay', {
    mode: 'primary',
    assignments,
    schemaVersion: WALLPAPER_DISPLAY_SCHEMA_VERSION,
    userConfigured: false,
  })
  console.warn('[display] 已将旧版显示器布局安全恢复为主显示器模式')
}

function rectFromElectron(rect: Electron.Rectangle): DisplayBounds {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
}

function overlapArea(left: DisplayBounds, right: DisplayBounds): number {
  const width = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x))
  const height = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y))
  return width * height
}

/** Stable display metadata used by settings and by the virtual desktop windows. */
export function getDisplayDescriptors(): DisplayDescriptor[] {
  try {
    const primaryId = screen.getPrimaryDisplay().id
    const nativeDisplays = getNativeDisplayIdentities()
    const unmatchedNativeDisplays = [...nativeDisplays]
    return screen.getAllDisplays()
      .sort((a, b) => (a.id === primaryId ? -1 : b.id === primaryId ? 1 : a.bounds.x - b.bounds.x))
      .map((display, index) => {
        const bounds = rectFromElectron(display.bounds)
        let nativeBounds: DisplayBounds
        try {
          nativeBounds = rectFromElectron(screen.dipToScreenRect(null, display.bounds))
        } catch {
          nativeBounds = {
            x: Math.round(bounds.x * display.scaleFactor),
            y: Math.round(bounds.y * display.scaleFactor),
            width: Math.round(bounds.width * display.scaleFactor),
            height: Math.round(bounds.height * display.scaleFactor),
          }
        }
        const native = unmatchedNativeDisplays
          .map((candidate, candidateIndex) => ({
            candidate,
            candidateIndex,
            score: overlapArea(nativeBounds, candidate.bounds),
          }))
          .sort((left, right) => right.score - left.score)[0]
        const matchedNative = native?.score > 0 ? native.candidate : undefined
        if (matchedNative && native) unmatchedNativeDisplays.splice(native.candidateIndex, 1)
        const deviceName = matchedNative?.deviceName || undefined
        return {
          id: display.id,
          key: deviceName ? `win32:${deviceName.toLowerCase()}` : `electron:${display.id}`,
          label: `显示器 ${index + 1}`,
          name: display.label?.trim() || undefined,
          deviceName,
          primary: display.id === primaryId,
          bounds,
          nativeBounds: matchedNative?.bounds ?? nativeBounds,
          workArea: rectFromElectron(display.workArea),
          scaleFactor: display.scaleFactor,
        }
      })
  } catch {
    // The screen module can briefly be unavailable during startup or display
    // topology changes. Callers can safely render an empty selector meanwhile.
    return []
  }
}

export function getWallpaperDisplayMode(): WallpaperDisplayMode {
  return normalizeWallpaperDisplayMode(store.get('wallpaperDisplay')?.mode)
}

/** The union rectangle is the coordinate space of the single transparent window. */
export function getDesktopRenderBounds(mode = getWallpaperDisplayMode()): DisplayBounds {
  const displays = getDisplayDescriptors()
  if (displays.length === 0) return { x: 0, y: 0, width: 1, height: 1 }
  if (mode === 'primary') return displays.find((item) => item.primary)?.bounds ?? displays[0].bounds
  return unionDisplayBounds(displays)
}

/** Union of monitor work areas, expressed in the virtual render coordinate space. */
export function getDesktopRenderWorkArea(mode = getWallpaperDisplayMode()): DisplayBounds {
  const render = getDesktopRenderBounds(mode)
  const displays = getDisplayDescriptors()
  if (displays.length === 0) return render
  if (mode === 'primary') {
    const primary = displays.find((item) => item.primary) ?? displays[0]
    return {
      x: primary.workArea.x - render.x,
      y: primary.workArea.y - render.y,
      width: primary.workArea.width,
      height: primary.workArea.height,
    }
  }
  const left = Math.min(...displays.map((item) => item.workArea.x))
  const top = Math.min(...displays.map((item) => item.workArea.y))
  const right = Math.max(...displays.map((item) => item.workArea.x + item.workArea.width))
  const bottom = Math.max(...displays.map((item) => item.workArea.y + item.workArea.height))
  return { x: left - render.x, y: top - render.y, width: right - left, height: bottom - top }
}
