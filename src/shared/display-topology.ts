import type { DisplayBounds, DisplayDescriptor, WallpaperDisplayMode } from './types'

export interface TopologyRect {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Lay the Windows monitor arrangement into a preview box with one uniform
 * scale, centred. Scaling x and y independently drew a 16:9 monitor at about
 * 4.7:1 and portrait monitors as landscape.
 */
export function layoutDisplayTopology<T extends { id: number; bounds: DisplayBounds }>(
  displays: readonly T[],
  box: { width: number; height: number },
  padding = 16,
): Array<T & { rect: TopologyRect }> {
  if (displays.length === 0 || box.width <= 0 || box.height <= 0) return []
  const left = Math.min(...displays.map((display) => display.bounds.x))
  const top = Math.min(...displays.map((display) => display.bounds.y))
  const right = Math.max(...displays.map((display) => display.bounds.x + display.bounds.width))
  const bottom = Math.max(...displays.map((display) => display.bounds.y + display.bounds.height))
  const virtualWidth = Math.max(1, right - left)
  const virtualHeight = Math.max(1, bottom - top)
  const availableWidth = Math.max(1, box.width - padding * 2)
  const availableHeight = Math.max(1, box.height - padding * 2)
  const scale = Math.min(availableWidth / virtualWidth, availableHeight / virtualHeight)
  const offsetX = (box.width - virtualWidth * scale) / 2
  const offsetY = (box.height - virtualHeight * scale) / 2
  // A 2px inset keeps the borders of adjacent monitors from merging.
  const gap = 2
  return displays.map((display) => ({
    ...display,
    rect: {
      left: Math.round(offsetX + (display.bounds.x - left) * scale + gap),
      top: Math.round(offsetY + (display.bounds.y - top) * scale + gap),
      width: Math.max(1, Math.round(display.bounds.width * scale - gap * 2)),
      height: Math.max(1, Math.round(display.bounds.height * scale - gap * 2)),
    },
  }))
}

/** Windows reports DIP bounds; users know their monitor by its pixel resolution. */
export function formatDisplayResolution(display: Pick<DisplayDescriptor, 'bounds' | 'scaleFactor'>): string {
  const scale = Number.isFinite(display.scaleFactor) && display.scaleFactor > 0 ? display.scaleFactor : 1
  return `${Math.round(display.bounds.width * scale)} × ${Math.round(display.bounds.height * scale)}`
}

/** One wording for the layout modes, shared by the wallpaper library and the display settings page. */
export const DISPLAY_MODE_OPTIONS: ReadonlyArray<{ value: WallpaperDisplayMode; label: string; description: string }> = [
  { value: 'primary', label: '仅主显示器', description: '壁纸与桌面组件只显示在 Windows 主显示器。' },
  { value: 'duplicate', label: '复制到每台显示器', description: '同一张壁纸在每台显示器上独立铺满。' },
  { value: 'per-display', label: '每台显示器单独设置', description: '为每台显示器分别选择壁纸，未指定时使用当前壁纸。' },
  { value: 'span', label: '跨屏延展', description: '一张壁纸铺满整个 Windows 虚拟桌面。' },
]

export function getDisplayModeOption(mode: WallpaperDisplayMode): { value: WallpaperDisplayMode; label: string; description: string } {
  return DISPLAY_MODE_OPTIONS.find((option) => option.value === mode) ?? DISPLAY_MODE_OPTIONS[0]
}
