import { app, ipcMain, Menu, screen } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { IPC } from '@shared/ipc-channels'
import type { WidgetInstance } from '@shared/types'
import { store } from '../store'
import { getCanvasWindow, setCanvasEditMode } from '../windows/canvasWindow'

/* ===== 布局常量 ===== */
const GRID_GAP = 16        // 组件之间间距
const EDGE_PADDING = 24    // 距屏幕边缘间距
const TASKBAR_MARGIN = 56  // 屏幕底部预留（开始菜单/任务栏）

/** 根据 workArea 和已有组件，自动计算不重叠的放置位置 */
function findPlacement(
  w: number,
  h: number,
  existing: WidgetInstance[]
): { x: number; y: number } {
  const display = screen.getPrimaryDisplay()
  const area = display.workAreaSize

  const maxX = area.width - EDGE_PADDING - w
  const maxY = area.height - TASKBAR_MARGIN - h

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

/** 将坐标对齐到网格 */
export function snapToGrid(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.round(x / GRID_GAP) * GRID_GAP,
    y: Math.round(y / GRID_GAP) * GRID_GAP,
  }
}

/**
 * 综合处理：网格吸附 → 屏幕边界约束 → 重叠自动避让。
 * 返回离期望位置最近的、不与其他组件或任务栏重叠的合法坐标。
 */
function resolvePosition(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  allWidgets: WidgetInstance[]
): { x: number; y: number } {
  const display = screen.getPrimaryDisplay()
  const area = display.workAreaSize

  // 1. 网格吸附
  let sx = Math.round(x / GRID_GAP) * GRID_GAP
  let sy = Math.round(y / GRID_GAP) * GRID_GAP

  // 2. 屏幕边界约束
  const minX = EDGE_PADDING
  const minY = EDGE_PADDING
  const maxX = area.width - EDGE_PADDING - w
  const maxY = area.height - TASKBAR_MARGIN - h
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
      const widgets = store.get('widgets')
      await fs.writeFile(
        join(folder, 'widget-config.json'),
        JSON.stringify({ widgets }, null, 2),
        'utf-8'
      )
    } catch { /* 写入失败静默忽略 */ }
  }, 500)
}

export function registerWidgetIpc(): void {
  ipcMain.handle(IPC.WIDGET_LIST, () => store.get('widgets'))

  ipcMain.handle(IPC.WIDGET_ADD, (_e, w: WidgetInstance) => {
    const list = store.get('widgets')
    // Each widget type can only have one instance
    if (list.some((existing) => existing.type === w.type)) {
      return list
    }
    // Auto-place: find non-overlapping position from top-left
    const { x, y } = findPlacement(w.width, w.height, list)
    w.x = x
    w.y = y
    list.push(w)
    store.set('widgets', list)
    syncToCanvas()
    autoSaveToWallpaper()
    return list
  })

  ipcMain.handle(IPC.WIDGET_REMOVE, (_e, id: string) => {
    const list = store.get('widgets').filter((w) => w.id !== id)
    store.set('widgets', list)
    syncToCanvas()
    autoSaveToWallpaper()
    return list
  })

  ipcMain.handle(IPC.WIDGET_UPDATE, (_e, w: WidgetInstance) => {
    const list = store.get('widgets')
    // 网格吸附 + 边界约束 + 重叠避让
    const resolved = resolvePosition(w.id, w.x, w.y, w.width, w.height, list)
    w.x = resolved.x
    w.y = resolved.y
    const updated = list.map((it) => (it.id === w.id ? { ...it, ...w } : it))
    store.set('widgets', updated)
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
    store.set('widgets', updated)
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
          click: () => {
            resolved = true
            const list = store.get('widgets').filter((w) => w.id !== widgetId)
            store.set('widgets', list)
            syncToCanvas()
            resolve('delete')
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
      const widgets = store.get('widgets')
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
      const wpRoot = getWallpaperRoot()
      const configPath = join(wpRoot, wallpaperId, 'widget-config.json')
      const txt = await fs.readFile(configPath, 'utf-8')
      const data = JSON.parse(txt)
      if (data.widgets && Array.isArray(data.widgets)) {
        store.set('widgets', data.widgets)
        syncToCanvas()
        return true
      }
      return false
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
const WIDGET_SIZE_MAP: Record<string, { w: number; h: number }> = {
  clock:      { w: UNIT * 2 + GRID_GAP, h: UNIT },           // 中-横
  audio:      { w: UNIT * 2 + GRID_GAP, h: UNIT },           // 中-横
  text:       { w: UNIT * 2 + GRID_GAP, h: UNIT },           // 中-横
  weather:    { w: UNIT * 2 + GRID_GAP, h: UNIT * 2 + GRID_GAP }, // 大
  stocks:     { w: UNIT * 2 + GRID_GAP, h: UNIT * 2 + GRID_GAP }, // 大 2×2
  news:       { w: UNIT,                h: UNIT * 2 + GRID_GAP }, // 中-竖 1×2
  calendar:   { w: UNIT,                h: UNIT },            // 小
  quicktools: { w: UNIT * 2 + GRID_GAP, h: UNIT },           // 中-横
  pet:        { w: UNIT,                h: UNIT },            // 小
  sysmonitor: { w: UNIT * 2 + GRID_GAP, h: UNIT },           // 中-横
}

export async function restoreWidgets(): Promise<void> {
  // 尝试从当前壁纸文件夹加载组件配置
  let loaded = false
  try {
    const current = store.get('wallpaper')?.current
    if (current) {
      const wpRoot = getWallpaperRoot()
      const configPath = join(wpRoot, current.id, 'widget-config.json')
      const txt = await fs.readFile(configPath, 'utf-8')
      const data = JSON.parse(txt)
      if (data.widgets && Array.isArray(data.widgets)) {
        store.set('widgets', data.widgets)
        loaded = true
      }
    }
  } catch {
    // 没有壁纸级配置
  }

  // 如果壁纸目录没有 widget-config.json，清空组件
  if (!loaded) {
    store.set('widgets', [])
  }

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
    store.set('widgets', widgets)
    // 通知画布更新
    const canvas = getCanvasWindow()
    if (canvas && !canvas.isDestroyed()) {
      canvas.webContents.send(IPC.WIDGET_SYNC, widgets)
    }
  }
}
