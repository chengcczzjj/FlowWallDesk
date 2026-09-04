import { screen } from 'electron'
import type { DisplayBounds, DisplayDescriptor, WallpaperDisplayMode } from '@shared/types'
import { normalizeWallpaperDisplayMode, unionDisplayBounds } from '@shared/wallpaper-display-layout'
import { store } from '../store'

/**
 * The first multi-display implementation persisted coordinates in a different
 * space.  Treat an unversioned layout as unsafe once, and boot on the primary
 * display.  The user can still opt into any other layout from Display Settings;
 * explicit choices are marked as configured and survive future restarts.
 */
export const WALLPAPER_DISPLAY_SCHEMA_VERSION = 2

export function normalizePersistedWallpaperDisplay(): void {
  const persisted = store.get('wallpaperDisplay')
  if (persisted?.schemaVersion === WALLPAPER_DISPLAY_SCHEMA_VERSION) return

  store.set('wallpaperDisplay', {
    mode: 'primary',
    assignments: {},
    schemaVersion: WALLPAPER_DISPLAY_SCHEMA_VERSION,
    userConfigured: false,
  })
  try {
    const primary = screen.getPrimaryDisplay().bounds
    // The migration intentionally treats existing widget positions as
    // primary-local. Do not apply a stale virtual-desktop origin delta during
    // the same startup, otherwise every component moves by the old secondary
    // monitor offset before the user gets a chance to inspect the safe layout.
    store.set('widgetCoordinateOrigin', { x: primary.x, y: primary.y })
  } catch {
    // screen can briefly be unavailable during an Explorer restart.
  }
  console.warn('[display] 已将旧版显示器布局安全恢复为主显示器模式')
}

function rectFromElectron(rect: Electron.Rectangle): DisplayBounds {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
}

/** Stable display metadata used by settings and by the virtual desktop windows. */
export function getDisplayDescriptors(): DisplayDescriptor[] {
  try {
    const primaryId = screen.getPrimaryDisplay().id
    return screen.getAllDisplays()
      .sort((a, b) => (a.id === primaryId ? -1 : b.id === primaryId ? 1 : a.bounds.x - b.bounds.x))
      .map((display, index) => ({
        id: display.id,
        label: `显示器 ${index + 1}`,
        name: display.label?.trim() || undefined,
        primary: display.id === primaryId,
        bounds: rectFromElectron(display.bounds),
        workArea: rectFromElectron(display.workArea),
        scaleFactor: display.scaleFactor,
      }))
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
