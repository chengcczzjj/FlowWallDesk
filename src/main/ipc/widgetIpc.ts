import { app, ipcMain, Menu, screen } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { IPC } from '@shared/ipc-channels'
import type { WidgetInstance } from '@shared/types'
import { store } from '../store'
import { getCanvasWindow, isCanvasEditMode, setCanvasEditMode, setCanvasMousePassthrough } from '../windows/canvasWindow'
import { getDesktopIconItems, restoreDesktopIconsForWidget } from './desktopIconIpc'

/* ===== 布局常量 ===== */
const GRID_GAP = 16        // 组件之间间距
const EDGE_PADDING = 24    // 距屏幕边缘间距
const BOTTOM_EDGE_PADDING = EDGE_PADDING
const DOCK_DEFAULT_WIDTH = 340
const DOCK_DEFAULT_HEIGHT = 88
const DOCK_MIN_RESTORED_WIDTH = 240
const DOCK_MIN_RESTORED_HEIGHT = 72
const DOCK_BOTTOM_MARGIN = 72
const GLOBAL_ICON_WIDGET_TYPES = ['desktop-icons-box', 'desktop-icons-horizontal', 'desktop-icons-adaptive', 'desktop-icons-dock']
const DEFAULT_DOCK_CONFIG: Record<string, unknown> = {
  items: [],
  dockStyle: 'glass',
  dockTint: '#ffffff',
  dockTintStrength: 0.1,
  dockOpacity: 0.18,
  dockBlur: 16,
  dockReflection: false,
  dockHoverScale: 1.58,
}

function canAddMultipleWidgetType(type: string): boolean {
  return ['desktop-icons-box', 'desktop-icons-horizontal', 'desktop-icons-adaptive'].includes(type)
}

function isGlobalIconWidgetType(type: string): boolean {
  return GLOBAL_ICON_WIDGET_TYPES.includes(type)
}

function withDefaultWidgetConfig(widget: WidgetInstance): WidgetInstance {
  if (widget.type !== 'desktop-icons-dock') return widget
  const config = widget.config ?? {}
  const widthInvalid = typeof widget.width !== 'number' || !Number.isFinite(widget.width) || widget.width < DOCK_MIN_RESTORED_WIDTH
  const heightInvalid = typeof widget.height !== 'number' || !Number.isFinite(widget.height) || widget.height < DOCK_MIN_RESTORED_HEIGHT
  const positionInvalid = typeof widget.x !== 'number' || !Number.isFinite(widget.x) || typeof widget.y !== 'number' || !Number.isFinite(widget.y)
  const width = widthInvalid ? DOCK_DEFAULT_WIDTH : widget.width
  const height = heightInvalid ? DOCK_DEFAULT_HEIGHT : widget.height
  const fallbackPlacement = widthInvalid || heightInvalid || positionInvalid ? getDockPlacement(width, height) : null
  return {
    ...widget,
    x: fallbackPlacement?.x ?? widget.x,
    y: fallbackPlacement?.y ?? widget.y,
    width,
    height,
    config: {
      ...DEFAULT_DOCK_CONFIG,
      ...config,
      items: Array.isArray(config.items) ? config.items : [],
    },
  }
}

function withDefaultWidgetConfigs(widgets: WidgetInstance[]): WidgetInstance[] {
  return widgets.map((widget) => withDefaultWidgetConfig(widget))
}

function getWallpaperScopedWidgets(widgets: WidgetInstance[]): WidgetInstance[] {
  return widgets.filter((widget) => !isGlobalIconWidgetType(widget.type))
}

function getIconWidgets(widgets: WidgetInstance[]): WidgetInstance[] {
  return widgets.filter((widget) => isGlobalIconWidgetType(widget.type))
}

function readStoredGlobalIconWidgets(): WidgetInstance[] | undefined {
  const stored = store.get('globalIconWidgets')
  return Array.isArray(stored) ? stored : undefined
}

function persistWidgets(widgets: WidgetInstance[]): void {
  store.set('widgets', widgets)
  store.set('globalIconWidgets', getIconWidgets(widgets))
}

async function readWallpaperWidgetConfig(wallpaperId: string): Promise<WidgetInstance[]> {
  const wpRoot = getWallpaperRoot()
  const configPath = join(wpRoot, wallpaperId, 'widget-config.json')
  const txt = await fs.readFile(configPath, 'utf-8')
  const data = JSON.parse(txt)
  return data.widgets && Array.isArray(data.widgets) ? data.widgets : []
}

function resolveGlobalIconWidgets(wallpaperWidgets: WidgetInstance[]): WidgetInstance[] {
  const storedGlobal = readStoredGlobalIconWidgets()
  if (storedGlobal) return storedGlobal

  const legacyRuntimeIcons = getIconWidgets(store.get('widgets'))
  const migrated = legacyRuntimeIcons.length > 0 ? legacyRuntimeIcons : getIconWidgets(wallpaperWidgets)
  store.set('globalIconWidgets', migrated)
  return migrated
}

export async function loadWidgetsForWallpaper(wallpaperId?: string): Promise<WidgetInstance[]> {
  let wallpaperWidgets: WidgetInstance[] = []
  if (wallpaperId) {
    try {
      wallpaperWidgets = await readWallpaperWidgetConfig(wallpaperId)
    } catch {
      wallpaperWidgets = []
    }
  }

  const merged = withDefaultWidgetConfigs([...getWallpaperScopedWidgets(wallpaperWidgets), ...resolveGlobalIconWidgets(wallpaperWidgets)])
  persistWidgets(merged)
  syncToCanvas()
  return merged
}

/** 根据 workArea 和已有组件，自动计算不重叠的放置位置 */
function findPlacement(
  w: number,
  h: number,
  existing: WidgetInstance[]
): { x: number; y: number } {
  const display = screen.getPrimaryDisplay()
  const area = display.bounds

  const maxX = area.width - EDGE_PADDING - w
  const maxY = area.height - BOTTOM_EDGE_PADDING - h

  // 检查 (x,y) 是否与已有组件重叠
  const overlaps = (x: number, y: number): boolean =>
    existing.some(
      (e) =>
        e.enabled &&
        x < e.x + e.width + GRID_GAP &&
        x + w + GRID_GAP > e.x &&
        y < e.y + e.height + GRID_GAP &&
        y + h + GRID_GAP > e.y
    )

  // 从左上角开始，按网格步进查找第一个空位
  for (let y = EDGE_PADDING; y <= maxY; y += GRID_GAP) {
    for (let x = EDGE_PADDING; x <= maxX; x += GRID_GAP) {
      if (!overlaps(x, y)) return { x, y }
    }
  }

  // 全满了就放到右下角
  return { x: Math.max(EDGE_PADDING, maxX), y: Math.max(EDGE_PADDING, maxY) }
}

function getDockPlacement(width: number, height: number): { x: number; y: number } {
  const display = screen.getPrimaryDisplay()
  const area = display.bounds
  const maxX = area.width - EDGE_PADDING - width
  const maxY = area.height - BOTTOM_EDGE_PADDING - height
  return {
    x: Math.max(EDGE_PADDING, Math.min(Math.round((area.width - width) / 2), Math.max(EDGE_PADDING, maxX))),
    y: Math.max(EDGE_PADDING, Math.min(Math.round(area.height - height - DOCK_BOTTOM_MARGIN), Math.max(EDGE_PADDING, maxY))),
  }
}

/** 将坐标对齐到网格 */
export function snapToGrid(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.round(x / GRID_GAP) * GRID_GAP,
    y: Math.round(y / GRID_GAP) * GRID_GAP,
  }
}

/**
 * 综合处理：网格吸附 → 屏幕边界约束 → 重叠自动避让。
 * 返回离期望位置最近的、不与其他组件重叠的合法坐标。
 */
function resolvePosition(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  allWidgets: WidgetInstance[],
  snapPosition = true
): { x: number; y: number } {
  const display = screen.getPrimaryDisplay()
  const area = display.bounds

  // 1. 网格吸附
  let sx = snapPosition ? Math.round(x / GRID_GAP) * GRID_GAP : x
  let sy = snapPosition ? Math.round(y / GRID_GAP) * GRID_GAP : y

  // 2. 屏幕边界约束
  const minX = EDGE_PADDING
  const minY = EDGE_PADDING
  const maxX = area.width - EDGE_PADDING - w
  const maxY = area.height - BOTTOM_EDGE_PADDING - h
  sx = Math.max(minX, Math.min(sx, Math.max(minX, maxX)))
  sy = Math.max(minY, Math.min(sy, Math.max(minY, maxY)))

  // 3. 检测重叠（排除自身，保留 GRID_GAP 间距）
  const others = allWidgets.filter((e) => e.id !== id && e.enabled)
  const hasOverlap = (px: number, py: number): boolean =>
    others.some(
      (e) =>
        px < e.x + e.width + GRID_GAP &&
        px + w + GRID_GAP > e.x &&
        py < e.y + e.height + GRID_GAP &&
        py + h + GRID_GAP > e.y
    )

  if (!hasOverlap(sx, sy)) return { x: sx, y: sy }

  // 4. 螺旋搜索：从期望位置向外扩展，找最近的空位
  const maxRadius = Math.max(area.width, area.height)
  for (let r = GRID_GAP; r <= maxRadius; r += GRID_GAP) {
    for (let dy = -r; dy <= r; dy += GRID_GAP) {
      for (let dx = -r; dx <= r; dx += GRID_GAP) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue // 只查外圈
        const cx = sx + dx
        const cy = sy + dy
        if (cx < minX || cx > maxX || cy < minY || cy > maxY) continue
        if (!hasOverlap(cx, cy)) return { x: cx, y: cy }
      }
    }
  }

  return { x: sx, y: sy }
}

function syncToCanvas(): void {
  const list = store.get('widgets')
  const win = getCanvasWindow()
  if (win) win.webContents.send(IPC.WIDGET_SYNC, list)
}

function getWallpaperRoot(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'assets', 'wallpaper')
  }
  return join(__dirname, '../../assets/wallpaper')
}

/** 自动保存组件配置到当前壁纸文件夹 */
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null

/** 取消尚未完成的防抖写入（切壁纸前调用，避免旧组件写到新壁纸目录） */
export function cancelPendingAutoSave(): void {
  if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null }
}

function autoSaveToWallpaper(): void {
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(async () => {
    try {
      const current = store.get('wallpaper')?.current
      if (!current) return
      const wpRoot = getWallpaperRoot()
      const folder = join(wpRoot, current.id)
      const widgets = getWallpaperScopedWidgets(store.get('widgets'))
      await fs.writeFile(
        join(folder, 'widget-config.json'),
        JSON.stringify({ widgets }, null, 2),
        'utf-8'
      )
    } catch { /* 写入失败静默忽略 */ }
  }, 500)
}

async function removeWidgetWithRestore(id: string): Promise<{ list: WidgetInstance[]; deleted: boolean }> {
  const widgets = store.get('widgets')
  const target = widgets.find((w) => w.id === id)
  if (!target) return { list: widgets, deleted: false }

  const restoreResult = await restoreDesktopIconsForWidget(target)
  if (!restoreResult.ok) {
    const restoredIds = new Set(restoreResult.restoredItemIds ?? [])
    const remainingItems = getDesktopIconItems(target).filter((item) => item.removedFromDesktop && !restoredIds.has(item.id))
    if (target.type !== 'desktop-icons-dock' && remainingItems.length > 0) {
      const retained = { ...target, config: { ...(target.config ?? {}), items: remainingItems } }
      const updated = widgets.map((widget) => (widget.id === id ? retained : widget))
      persistWidgets(updated)
      syncToCanvas()
      autoSaveToWallpaper()
      console.warn('[widget] desktop icon restore incomplete, keeping widget:', restoreResult.skipped)
      return { list: updated, deleted: false }
    }
    console.warn('[widget] desktop icon restore incomplete, removing widget:', restoreResult.skipped)
  }

  const list = widgets.filter((w) => w.id !== id)
  persistWidgets(list)
  syncToCanvas()
  autoSaveToWallpaper()
  return { list, deleted: true }
}

export function registerWidgetIpc(): void {
  ipcMain.handle(IPC.WIDGET_LIST, () => {
    const list = withDefaultWidgetConfigs(store.get('widgets'))
    persistWidgets(list)
    return list
  })

  ipcMain.handle(IPC.WIDGET_ADD, (_e, w: WidgetInstance) => {
    const list = store.get('widgets')
    // Most widget types are single-instance; icon storage containers can have multiple copies.
    if (!canAddMultipleWidgetType(w.type) && list.some((existing) => existing.type === w.type)) {
      return list
    }
    const widget = withDefaultWidgetConfig(w)
    const placement = widget.type === 'desktop-icons-dock'
      ? getDockPlacement(widget.width, widget.height)
      : findPlacement(widget.width, widget.height, list)
    widget.x = placement.x
    widget.y = placement.y
    list.push(widget)
    persistWidgets(list)
    syncToCanvas()
    autoSaveToWallpaper()
    if (!isCanvasEditMode()) setCanvasMousePassthrough(true)
    return list
  })

  ipcMain.handle(IPC.WIDGET_REMOVE, async (_e, id: string) => {
    const { list } = await removeWidgetWithRestore(id)
    return list
  })

  ipcMain.handle(IPC.WIDGET_UPDATE, (_e, w: WidgetInstance) => {
    const list = store.get('widgets')
    // 网格吸附 + 边界约束 + 重叠避让
    const resolved = resolvePosition(w.id, w.x, w.y, w.width, w.height, list, !canAddMultipleWidgetType(w.type))
    w.x = resolved.x
    w.y = resolved.y
    const updated = list.map((it) => (it.id === w.id ? { ...it, ...w } : it))
    persistWidgets(updated)
    syncToCanvas()
    autoSaveToWallpaper()
    return updated
  })

  // 仅更新组件 config，不触发位置吸附
  ipcMain.handle(IPC.WIDGET_UPDATE_CONFIG, (_e, id: string, config: Record<string, unknown>) => {
    const list = store.get('widgets')
    const updated = list.map((it) =>
      it.id === id ? { ...it, config: { ...(it.config || {}), ...config } } : it
    )
    persistWidgets(updated)
    syncToCanvas()
    autoSaveToWallpaper()
    return updated
  })

  // 画布鼠标穿透切换
  ipcMain.on(IPC.CANVAS_SET_IGNORE_MOUSE, (_e, ignore: boolean) => {
    const win = getCanvasWindow()
    if (!win) return
    if (ignore) {
      win.setIgnoreMouseEvents(true, { forward: true })
    } else {
      win.setIgnoreMouseEvents(false)
    }
  })

  // 原生右键菜单（避免 setIgnoreMouseEvents 冲突）
  ipcMain.handle(IPC.CANVAS_CONTEXT_MENU, (_e, widgetId: string) => {
    const win = getCanvasWindow()
    if (!win) return null

    return new Promise<'edit' | 'delete' | null>((resolve) => {
      let resolved = false
      const menu = Menu.buildFromTemplate([
        {
          label: '全局编辑',
          click: () => { resolved = true; resolve('edit') },
        },
        { type: 'separator' },
        {
          label: '删除',
          click: async () => {
            resolved = true
            const { deleted } = await removeWidgetWithRestore(widgetId)
            if (deleted && !isCanvasEditMode()) setCanvasMousePassthrough(true)
            resolve(deleted ? 'delete' : null)
          },
        },
      ])
      menu.popup({
        window: win,
        callback: () => { if (!resolved) resolve(null) },
      })
    })
  })

  // 编辑模式：z-order + 穿透 + 焦点统一切换
  ipcMain.on(IPC.CANVAS_SET_EDIT_MODE, (_e, on: boolean) => {
    setCanvasEditMode(on)
  })

  // 保存组件配置到当前壁纸文件夹
  ipcMain.handle(IPC.WIDGET_CONFIG_SAVE, async () => {
    try {
      const current = store.get('wallpaper')?.current
      if (!current) return false
      const wpRoot = getWallpaperRoot()
      const folder = join(wpRoot, current.id)
      const widgets = getWallpaperScopedWidgets(store.get('widgets'))
      await fs.writeFile(
        join(folder, 'widget-config.json'),
        JSON.stringify({ widgets }, null, 2),
        'utf-8'
      )
      return true
    } catch (e) {
      console.error('[widget] config save failed:', e)
      return false
    }
  })

  // 加载壁纸文件夹中的组件配置
  ipcMain.handle(IPC.WIDGET_CONFIG_LOAD, async (_e, wallpaperId: string) => {
    try {
      await loadWidgetsForWallpaper(wallpaperId)
      return true
    } catch {
      return false
    }
  })
}

/**
 * 组件标准尺寸（仿 macOS 桌面组件规范）
 * 基础单元 160px，间距 16px
 */
const UNIT = 160
/** 卡片组件的标准尺寸（悬浮组件使用 fit-content，不参与迁移） */
const WIDGET_SIZE_MAP: Record<string, { w: number; h: number }> = {
  stocks:     { w: UNIT * 2 + GRID_GAP, h: UNIT * 2 + GRID_GAP }, // 大 2×2
  news:       { w: UNIT,                h: UNIT * 2 + GRID_GAP }, // 中-竖 1×2
  calendar:   { w: UNIT,                h: UNIT },            // 小
  quicktools: { w: UNIT * 2 + GRID_GAP, h: UNIT },           // 中-横
  pet:        { w: UNIT,                h: UNIT },            // 小
  sysmonitor: { w: UNIT * 2 + GRID_GAP, h: UNIT },           // 中-横
}

export async function restoreWidgets(): Promise<void> {
  const current = store.get('wallpaper')?.current
  await loadWidgetsForWallpaper(current?.id)

  // 迁移旧版组件尺寸到标准尺寸
  const widgets = store.get('widgets') as WidgetInstance[]
  if (!widgets || widgets.length === 0) return
  let changed = false
  for (const w of widgets) {
    const std = WIDGET_SIZE_MAP[w.type]
    if (std && (w.width !== std.w || w.height !== std.h)) {
      w.width = std.w
      w.height = std.h
      changed = true
    }
  }
  if (changed) {
    persistWidgets(widgets)
    // 通知画布更新
    const canvas = getCanvasWindow()
    if (canvas && !canvas.isDestroyed()) {
      canvas.webContents.send(IPC.WIDGET_SYNC, widgets)
    }
  }
}
