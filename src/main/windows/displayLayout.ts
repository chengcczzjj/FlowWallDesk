import { screen } from 'electron'
import type { DisplayBounds, DisplayDescriptor, WallpaperDisplayMode } from '@shared/types'
import { store } from '../store'

function rectFromElectron(rect: Electron.Rectangle): DisplayBounds {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
}

/** Stable display metadata used by settings and by the virtual desktop windows. */
export function getDisplayDescriptors(): DisplayDescriptor[] {
  const primaryId = screen.getPrimaryDisplay().id
  return screen.getAllDisplays()
    .sort((a, b) => (a.id === primaryId ? -1 : b.id === primaryId ? 1 : a.bounds.x - b.bounds.x))
    .map((display, index) => ({
      id: display.id,
      label: display.id === primaryId ? '主显示器' : `显示器 ${index + 1}`,
      primary: display.id === primaryId,
      bounds: rectFromElectron(display.bounds),
      workArea: rectFromElectron(display.workArea),
      scaleFactor: display.scaleFactor,
    }))
}

export function getWallpaperDisplayMode(): WallpaperDisplayMode {
  const mode = store.get('wallpaperDisplay')?.mode
  return mode === 'duplicate' || mode === 'per-display' || mode === 'span' ? mode : 'primary'
}

/** The union rectangle is the coordinate space of the single transparent window. */
export function getDesktopRenderBounds(mode = getWallpaperDisplayMode()): DisplayBounds {
  const displays = getDisplayDescriptors()
  if (displays.length === 0) return { x: 0, y: 0, width: 1, height: 1 }
  if (mode === 'primary') return displays.find((item) => item.primary)?.bounds ?? displays[0].bounds
  const left = Math.min(...displays.map((item) => item.bounds.x))
  const top = Math.min(...displays.map((item) => item.bounds.y))
  const right = Math.max(...displays.map((item) => item.bounds.x + item.bounds.width))
  const bottom = Math.max(...displays.map((item) => item.bounds.y + item.bounds.height))
  return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) }
}

/** Union of monitor work areas, expressed in the virtual render coordinate space. */
export function getDesktopRenderWorkArea(mode = getWallpaperDisplayMode()): DisplayBounds {
  const render = getDesktopRenderBounds(mode)
  const displays = getDisplayDescriptors()
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

