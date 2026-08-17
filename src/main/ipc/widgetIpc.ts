import { app, ipcMain, Menu, screen } from 'electron'
import { randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import { dirname, join } from 'path'
import { IPC } from '@shared/ipc-channels'
import { z } from 'zod'
import type { DesktopIconItem, WidgetInstance } from '@shared/types'
import type { DesktopSceneLayoutPlan } from '@shared/desktop-scene-layout'
import { findSmartWidgetPlacement } from '@shared/widget-placement'
import { migrateTodoWidgetInstance } from '@shared/todo'
import {
  DEFAULT_WIDGET_SIZE_BY_TYPE,
  WIDGET_TYPES,
  getWidgetCapability,
  type DesktopSceneSnapshot,
  type LayoutPatch,
  type WidgetPatch,
} from '@shared/desktop-scene'
import { store } from '../store'
import {
  getCanvasWindow,
  isCanvasEditMode,
  noteCanvasRendererActionPointerDown,
  setCanvasEditMode,
  setCanvasMousePassthrough,
  setCanvasPointerActive,
  setCanvasTextInputActive,
} from '../windows/canvasWindow'
import {
  getUserWallpaperFolderName,
  getUserWallpapersRoot,
  getRemoteWallpaperFolderName,
  getRemoteWallpapersRoot,
  getWallpaperWidgetOverridePath,
  isRemoteWallpaperId,
  isUserWallpaperId,
} from '../runtime/userDataPaths'
import { getDesktopIconItems, restoreDesktopIconsForWidget } from './desktopIconIpc'
import { assertTrustedIpcSender } from './ipcSecurity'
import { logDockDiagnostic } from '../runtime/diagnosticLog'

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
const MAX_DESKTOP_SCENE_SNAPSHOTS = 20
const STICKY_NOTE_GRAB_EDGE = 42
const DEFAULT_DOCK_CONFIG: Record<string, unknown> = {
  items: [],
  dockStyle: 'glass',
  dockTint: '#ffffff',
  dockTintStrength: 0.1,
  dockOpacity: 0.18,
  dockBlur: 16,
  dockReflection: false,
  dockHoverScale: 1.72,
}

function canAddMultipleWidgetType(type: string): boolean {
  return ['desktop-icons-box', 'desktop-icons-horizontal', 'desktop-icons-adaptive', 'generated-widget', 'todo-board'].includes(type)
}

function isFreeformStickyNote(type: string): boolean {
  return type === 'todo-board'
}

const widgetConfigSchema = z.record(z.string().max(120), z.unknown()).superRefine((value, context) => {
  try {
    if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 512 * 1024) {
      context.addIssue({ code: 'custom', message: '组件配置不能超过 512KB。' })
    }
  } catch {
    context.addIssue({ code: 'custom', message: '组件配置必须可以序列化。' })
  }
})
const widgetInstanceSchema = z.object({
  id: z.string().min(1).max(160).regex(/^[\w.-]+$/),
  type: z.enum(WIDGET_TYPES),
  x: z.number().finite().min(-32_768).max(32_768),
  y: z.number().finite().min(-32_768).max(32_768),
  width: z.number().finite().min(0).max(4096),
  height: z.number().finite().min(0).max(4096),
  enabled: z.boolean(),
  config: widgetConfigSchema.optional(),
})

function parseWidgetList(value: unknown): WidgetInstance[] {
  const parsed = z.array(widgetInstanceSchema).max(200).safeParse(value)
  return parsed.success ? parsed.data : []
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
  return widgets.flatMap((widget) => migrateTodoWidgetInstance(withDefaultWidgetConfig(widget)))
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

function hasConfigKey(config: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(config, key)
}

function normalizeDesktopIconItems(items: DesktopIconItem[]): DesktopIconItem[] {
  return items.map((item, index) => ({ ...item, order: index, x: undefined, y: undefined }))
}

function mergeDesktopIconItemsForConfig(
  currentWidget: WidgetInstance,
  incomingConfig: Record<string, unknown>
): DesktopIconItem[] {
  const incomingItems = getDesktopIconItems({ ...currentWidget, config: { items: incomingConfig.items } })
  const incomingIds = new Set(incomingItems.map((item) => item.id))
  const retainedItems = getDesktopIconItems(currentWidget).filter((item) => !incomingIds.has(item.id))
  return normalizeDesktopIconItems([...incomingItems, ...retainedItems])
}

function mergeConfigUpdate(currentWidget: WidgetInstance, incomingConfig: Record<string, unknown>): Record<string, unknown> {
  const nextConfig = { ...(currentWidget.config ?? {}), ...incomingConfig }
  if (!isGlobalIconWidgetType(currentWidget.type) || !hasConfigKey(incomingConfig, 'items')) return nextConfig
  return {
    ...nextConfig,
    items: mergeDesktopIconItemsForConfig(currentWidget, incomingConfig),
  }
}

function mergeWidgetUpdate(currentWidget: WidgetInstance, incomingWidget: WidgetInstance): WidgetInstance {
  const nextWidget = { ...currentWidget, ...incomingWidget }
  if (!isGlobalIconWidgetType(currentWidget.type) && !isGlobalIconWidgetType(incomingWidget.type)) return nextWidget

  const incomingConfig = incomingWidget.config ?? {}
  const nextConfig = { ...(currentWidget.config ?? {}), ...incomingConfig }
  const hasCurrentItems = hasConfigKey(currentWidget.config ?? {}, 'items')
  const items = hasCurrentItems
    ? getDesktopIconItems(currentWidget)
    : getDesktopIconItems({ ...currentWidget, config: incomingConfig })

  return {
    ...nextWidget,
    config: {
      ...nextConfig,
      items: normalizeDesktopIconItems(items),
    },
  }
}

async function readWidgetConfigFile(configPath: string): Promise<WidgetInstance[]> {
  const txt = await fs.readFile(configPath, 'utf-8')
  const data = JSON.parse(txt) as { widgets?: unknown }
  return parseWidgetList(data.widgets)
}

async function tryReadWidgetConfigFile(configPath: string): Promise<WidgetInstance[] | null> {
  try {
    return await readWidgetConfigFile(configPath)
  } catch {
    return null
  }
}

function getWallpaperDefaultWidgetConfigPath(wallpaperId: string): string {
  if (isUserWallpaperId(wallpaperId)) {
    return join(getUserWallpapersRoot(), getUserWallpaperFolderName(wallpaperId), 'widget-config.json')
  }
  if (isRemoteWallpaperId(wallpaperId)) {
    return join(getRemoteWallpapersRoot(), getRemoteWallpaperFolderName(wallpaperId), 'widget-config.json')
  }
  return join(getWallpaperRoot(), wallpaperId, 'widget-config.json')
}

async function readWallpaperWidgetConfig(wallpaperId: string): Promise<WidgetInstance[]> {
  const override = await tryReadWidgetConfigFile(getWallpaperWidgetOverridePath(wallpaperId))
  if (override) return override
  return readWidgetConfigFile(getWallpaperDefaultWidgetConfigPath(wallpaperId))
}

async function writeWallpaperWidgetOverride(wallpaperId: string, widgets: WidgetInstance[]): Promise<void> {
  const configPath = getWallpaperWidgetOverridePath(wallpaperId)
  await fs.mkdir(dirname(configPath), { recursive: true })
  await fs.writeFile(configPath, JSON.stringify({ widgets }, null, 2), 'utf-8')
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
  const bounds = display.bounds
  const workArea = display.workArea
  return findSmartWidgetPlacement(w, h, existing, {
    x: workArea.x - bounds.x,
    y: workArea.y - bounds.y,
    width: workArea.width,
    height: workArea.height,
  }, {
    gap: GRID_GAP,
    edgePadding: EDGE_PADDING,
    grid: GRID_GAP,
  })
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

function clampStickyNotePosition(x: number, y: number, width: number, height: number): { x: number; y: number } {
  const area = screen.getPrimaryDisplay().bounds
  return {
    x: Math.round(Math.max(-width + STICKY_NOTE_GRAB_EDGE, Math.min(x, area.width - STICKY_NOTE_GRAB_EDGE))),
    y: Math.round(Math.max(-height + STICKY_NOTE_GRAB_EDGE, Math.min(y, area.height - STICKY_NOTE_GRAB_EDGE))),
  }
}

/** 新便利贴有意错落叠放，避免把“可重叠”又退化成普通组件自动排版。 */
function findStickyNotePlacement(width: number, height: number, existing: WidgetInstance[]): { x: number; y: number } {
  const display = screen.getPrimaryDisplay()
  const area = display.workArea
  const bounds = display.bounds
  const count = existing.filter((widget) => widget.type === 'todo-board' && widget.enabled).length
  const column = count % 6
  const row = Math.floor(count / 6) % 3
  const x = Math.round(area.x - bounds.x + area.width * 0.66 - width / 2 + column * 28 - row * 36)
  const y = Math.round(area.y - bounds.y + Math.min(150, area.height * 0.17) + column * 22 + row * 34)
  return clampStickyNotePosition(x, y, width, height)
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

export function showDesktopScenePreviewForTool(plan: DesktopSceneLayoutPlan): void {
  const win = getCanvasWindow()
  if (!win || win.isDestroyed()) return
  win.webContents.send(IPC.DESKTOP_SCENE_PREVIEW_SHOW, plan)
}

export function clearDesktopScenePreviewForTool(): void {
  const win = getCanvasWindow()
  if (!win || win.isDestroyed()) return
  win.webContents.send(IPC.DESKTOP_SCENE_PREVIEW_CLEAR)
}

function cloneWidgets(widgets: WidgetInstance[]): WidgetInstance[] {
  return JSON.parse(JSON.stringify(widgets)) as WidgetInstance[]
}

function readDesktopSceneSnapshots(): DesktopSceneSnapshot[] {
  const snapshots = store.get('desktopSceneSnapshots')
  if (!Array.isArray(snapshots)) return []
  return snapshots
    .filter((snapshot): snapshot is DesktopSceneSnapshot => Boolean(snapshot && typeof snapshot.id === 'string'))
    .sort((left, right) => right.createdAt - left.createdAt)
}

function persistDesktopSceneSnapshots(snapshots: DesktopSceneSnapshot[]): void {
  store.set('desktopSceneSnapshots', snapshots.slice(0, MAX_DESKTOP_SCENE_SNAPSHOTS))
}

function createDesktopSceneSnapshot(params: {
  reason: string
  beforeWidgets: WidgetInstance[]
  afterWidgets?: WidgetInstance[]
}): DesktopSceneSnapshot {
  const currentWallpaper = store.get('wallpaper')?.current
  return {
    id: `scene-${Date.now()}-${randomUUID().slice(0, 8)}`,
    createdAt: Date.now(),
    wallpaperId: currentWallpaper?.id ?? '',
    reason: params.reason,
    source: 'ai-scene',
    beforeWidgets: cloneWidgets(params.beforeWidgets),
    afterWidgets: params.afterWidgets ? cloneWidgets(params.afterWidgets) : undefined,
    beforeWallpaperSettings: currentWallpaper?.settings,
    afterWallpaperSettings: currentWallpaper?.settings,
  }
}

function applyLayoutPatch(widget: WidgetInstance, layout: LayoutPatch): WidgetInstance {
  return {
    ...widget,
    x: typeof layout.x === 'number' ? layout.x : widget.x,
    y: typeof layout.y === 'number' ? layout.y : widget.y,
    width: typeof layout.width === 'number' ? layout.width : widget.width,
    height: typeof layout.height === 'number' ? layout.height : widget.height,
    config: typeof layout.opacity === 'number'
      ? { ...(widget.config ?? {}), opacity: layout.opacity }
      : widget.config,
  }
}

function createWidgetFromScenePatch(patch: Extract<WidgetPatch, { op: 'create' }>): WidgetInstance {
  const size = DEFAULT_WIDGET_SIZE_BY_TYPE[patch.type]
  return withDefaultWidgetConfig({
    id: `${patch.type}-${Date.now()}-${randomUUID().slice(0, 8)}`,
    type: patch.type,
    x: typeof patch.layout.x === 'number' ? patch.layout.x : 0,
    y: typeof patch.layout.y === 'number' ? patch.layout.y : 0,
    width: typeof patch.layout.width === 'number' ? patch.layout.width : size.width,
    height: typeof patch.layout.height === 'number' ? patch.layout.height : size.height,
    enabled: true,
    config: patch.config ?? {},
  })
}

function summarizeScenePatch(patch: WidgetPatch): string {
  if (patch.op === 'create') return `create:${patch.type}`
  if ('id' in patch) return `${patch.op}:${patch.id}`
  return 'patch'
}

export function applyDesktopScenePlanForTool(params: {
  plan: DesktopSceneLayoutPlan
  reason?: string
}): {
  ok: boolean
  snapshot?: DesktopSceneSnapshot
  widgets: WidgetInstance[]
  appliedPatches: string[]
  skippedPatches: string[]
  error?: string
} {
  const before = withDefaultWidgetConfigs(store.get('widgets'))
  let next = cloneWidgets(before)
  const appliedPatches: string[] = []
  const skippedPatches: string[] = []

  for (const patch of params.plan.widgetPatches) {
    if (patch.op === 'create') {
      const existing = !canAddMultipleWidgetType(patch.type)
        ? next.find((widget) => widget.type === patch.type)
        : undefined
      if (existing) {
        next = next.map((widget) => (
          widget.id === existing.id
            ? {
                ...applyLayoutPatch(widget, patch.layout),
                config: mergeConfigUpdate(widget, patch.config ?? {}),
                enabled: true,
              }
            : widget
        ))
        appliedPatches.push(`restore-existing:${existing.id}`)
      } else {
        next.push(createWidgetFromScenePatch(patch))
        appliedPatches.push(summarizeScenePatch(patch))
      }
      continue
    }

    if (patch.op === 'update-layout') {
      const target = next.find((widget) => widget.id === patch.id)
      if (!target) {
        skippedPatches.push(`${summarizeScenePatch(patch)}:missing`)
        continue
      }
      next = next.map((widget) => widget.id === patch.id ? applyLayoutPatch(widget, patch.layout) : widget)
      appliedPatches.push(summarizeScenePatch(patch))
      continue
    }

    if (patch.op === 'update-config') {
      const target = next.find((widget) => widget.id === patch.id)
      if (!target) {
        skippedPatches.push(`${summarizeScenePatch(patch)}:missing`)
        continue
      }
      next = next.map((widget) => (
        widget.id === patch.id
          ? { ...widget, config: mergeConfigUpdate(widget, patch.config) }
          : widget
      ))
      appliedPatches.push(summarizeScenePatch(patch))
      continue
    }

    if (patch.op === 'hide') {
      const target = next.find((widget) => widget.id === patch.id)
      const capability = target ? getWidgetCapability(target.type) : null
      if (!target) {
        skippedPatches.push(`${summarizeScenePatch(patch)}:missing`)
        continue
      }
      if (capability?.persistent) {
        skippedPatches.push(`${summarizeScenePatch(patch)}:persistent-protected`)
        continue
      }
      next = next.map((widget) => widget.id === patch.id ? { ...widget, enabled: false } : widget)
      appliedPatches.push(summarizeScenePatch(patch))
      continue
    }

    if (patch.op === 'restore') {
      const target = next.find((widget) => widget.id === patch.id)
      if (!target) {
        skippedPatches.push(`${summarizeScenePatch(patch)}:missing`)
        continue
      }
      next = next.map((widget) => widget.id === patch.id ? { ...widget, enabled: true } : widget)
      appliedPatches.push(summarizeScenePatch(patch))
      continue
    }

    skippedPatches.push(`${summarizeScenePatch(patch)}:unsupported`)
  }

  const snapshot = createDesktopSceneSnapshot({
    reason: params.reason ?? params.plan.sceneName,
    beforeWidgets: before,
    afterWidgets: next,
  })
  persistWidgets(next)
  persistDesktopSceneSnapshots([snapshot, ...readDesktopSceneSnapshots().filter((item) => item.id !== snapshot.id)])
  syncToCanvas()
  autoSaveToWallpaper()
  clearDesktopScenePreviewForTool()
  if (!isCanvasEditMode()) setCanvasMousePassthrough(true)

  return { ok: true, snapshot, widgets: next, appliedPatches, skippedPatches }
}

export function rollbackDesktopSceneForTool(snapshotId?: string): {
  ok: boolean
  snapshot?: DesktopSceneSnapshot
  widgets: WidgetInstance[]
  error?: string
} {
  const snapshots = readDesktopSceneSnapshots()
  const snapshot = snapshotId
    ? snapshots.find((item) => item.id === snapshotId)
    : snapshots[0]
  if (!snapshot) {
    return { ok: false, widgets: store.get('widgets'), error: 'snapshot-not-found' }
  }

  const restored = withDefaultWidgetConfigs(cloneWidgets(snapshot.beforeWidgets))
  persistWidgets(restored)
  syncToCanvas()
  autoSaveToWallpaper()
  clearDesktopScenePreviewForTool()
  if (!isCanvasEditMode()) setCanvasMousePassthrough(true)
  return { ok: true, snapshot, widgets: restored }
}

function getWallpaperRoot(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'assets', 'wallpaper')
  }
  return join(__dirname, '../../assets/wallpaper')
}

/** 自动保存组件配置到用户数据覆盖层 */
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null

/** 取消尚未完成的防抖写入（切壁纸前调用，避免旧组件写到新壁纸覆盖层） */
export function cancelPendingAutoSave(): void {
  if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null }
}

function autoSaveToWallpaper(): void {
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(async () => {
    try {
      const current = store.get('wallpaper')?.current
      if (!current) return
      const widgets = getWallpaperScopedWidgets(store.get('widgets'))
      await writeWallpaperWidgetOverride(current.id, widgets)
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
  ipcMain.handle(IPC.WIDGET_LIST, (event) => {
    assertTrustedIpcSender(event, ['main', 'canvas'])
    const list = withDefaultWidgetConfigs(parseWidgetList(store.get('widgets')))
    persistWidgets(list)
    return list
  })

  ipcMain.handle(IPC.WIDGET_ADD, (_e, w: WidgetInstance) => {
    assertTrustedIpcSender(_e, ['main'])
    w = widgetInstanceSchema.parse(w)
    const list = store.get('widgets')
    // Most widget types are single-instance; icon storage containers can have multiple copies.
    if (!canAddMultipleWidgetType(w.type) && list.some((existing) => existing.type === w.type)) {
      return list
    }
    const widget = withDefaultWidgetConfig(w)
    const placement = widget.type === 'desktop-icons-dock'
      ? getDockPlacement(widget.width, widget.height)
      : isFreeformStickyNote(widget.type)
        ? findStickyNotePlacement(widget.width, widget.height, list)
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
    assertTrustedIpcSender(_e, ['main', 'canvas'])
    id = z.string().min(1).max(160).parse(id)
    const { list } = await removeWidgetWithRestore(id)
    return list
  })

  ipcMain.handle(IPC.WIDGET_UPDATE, (_e, w: WidgetInstance) => {
    assertTrustedIpcSender(_e, ['main', 'canvas'])
    w = widgetInstanceSchema.parse(w)
    const list = store.get('widgets')
    const resolved = isFreeformStickyNote(w.type)
      ? clampStickyNotePosition(w.x, w.y, w.width, w.height)
      : resolvePosition(w.id, w.x, w.y, w.width, w.height, list, !canAddMultipleWidgetType(w.type))
    w.x = resolved.x
    w.y = resolved.y
    const updated = isFreeformStickyNote(w.type)
      ? [...list.filter((item) => item.id !== w.id), mergeWidgetUpdate(list.find((item) => item.id === w.id) ?? w, w)]
      : list.map((it) => (it.id === w.id ? mergeWidgetUpdate(it, w) : it))
    persistWidgets(updated)
    syncToCanvas()
    autoSaveToWallpaper()
    return updated
  })

  // 仅更新组件 config，不触发位置吸附
  ipcMain.handle(IPC.WIDGET_UPDATE_CONFIG, (_e, id: string, config: Record<string, unknown>) => {
    assertTrustedIpcSender(_e, ['main', 'canvas'])
    id = z.string().min(1).max(160).parse(id)
    config = widgetConfigSchema.parse(config)
    const list = store.get('widgets')
    const updated = list.map((it) => (it.id === id ? { ...it, config: mergeConfigUpdate(it, config) } : it))
    persistWidgets(updated)
    syncToCanvas()
    autoSaveToWallpaper()
    return updated
  })

  // 画布鼠标穿透切换
  ipcMain.on(IPC.CANVAS_SET_IGNORE_MOUSE, (_e, ignore: boolean) => {
    assertTrustedIpcSender(_e, ['canvas'])
    if (typeof ignore !== 'boolean') return
    setCanvasMousePassthrough(ignore)
  })

  ipcMain.on(IPC.CANVAS_SET_POINTER_ACTIVE, (_e, active: boolean) => {
    assertTrustedIpcSender(_e, ['canvas'])
    if (typeof active !== 'boolean') return
    setCanvasPointerActive(active)
  })

  ipcMain.handle(IPC.CANVAS_SET_TEXT_INPUT_ACTIVE, (_e, active: boolean) => {
    assertTrustedIpcSender(_e, ['canvas'])
    active = z.boolean().parse(active)
    return setCanvasTextInputActive(active)
  })

  ipcMain.on(IPC.CANVAS_DIAGNOSTIC, (_e, event: string, details: Record<string, unknown>) => {
    assertTrustedIpcSender(_e, ['canvas'])
    if (typeof event !== 'string' || event.length === 0 || event.length > 100) return
    const safeDetails = details && typeof details === 'object' ? details : {}
    try {
      if (JSON.stringify(safeDetails).length > 4_096) return
    } catch {
      return
    }
    if (
      event === 'dock-icon-pointer-down' ||
      (event === 'pointer-down-observed' && safeDetails.action === true)
    ) {
      noteCanvasRendererActionPointerDown()
    }
    logDockDiagnostic(`renderer.${event}`, safeDetails)
  })

  // 原生右键菜单（避免 setIgnoreMouseEvents 冲突）
  ipcMain.handle(IPC.CANVAS_CONTEXT_MENU, (_e, widgetId: string) => {
    assertTrustedIpcSender(_e, ['canvas'])
    widgetId = z.string().min(1).max(160).parse(widgetId)
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
    assertTrustedIpcSender(_e, ['canvas'])
    if (typeof on !== 'boolean') return
    setCanvasEditMode(on)
  })

  // 保存组件配置到用户数据覆盖层
  ipcMain.handle(IPC.WIDGET_CONFIG_SAVE, async (event) => {
    assertTrustedIpcSender(event, ['main', 'canvas'])
    try {
      const current = store.get('wallpaper')?.current
      if (!current) return false
      const widgets = getWallpaperScopedWidgets(store.get('widgets'))
      await writeWallpaperWidgetOverride(current.id, widgets)
      return true
    } catch (e) {
      console.error('[widget] config save failed:', e)
      return false
    }
  })

  // 加载壁纸文件夹中的组件配置
  ipcMain.handle(IPC.WIDGET_CONFIG_LOAD, async (_e, wallpaperId: string) => {
    assertTrustedIpcSender(_e, ['main'])
    wallpaperId = z.string().min(1).max(160).parse(wallpaperId)
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
export function listWidgetsForTool(): WidgetInstance[] {
  const list = withDefaultWidgetConfigs(store.get('widgets'))
  persistWidgets(list)
  return list
}

export function addWidgetForTool(widget: WidgetInstance): { ok: boolean; added: boolean; widget: WidgetInstance; list: WidgetInstance[]; reason?: string } {
  const list = store.get('widgets')
  const existing = !canAddMultipleWidgetType(widget.type)
    ? list.find((item) => item.type === widget.type)
    : undefined
  if (existing) {
    return { ok: true, added: false, widget: existing, list, reason: 'already-exists' }
  }

  const normalized = withDefaultWidgetConfig(widget)
  const placement = normalized.type === 'desktop-icons-dock'
    ? getDockPlacement(normalized.width, normalized.height)
    : isFreeformStickyNote(normalized.type)
      ? findStickyNotePlacement(normalized.width, normalized.height, list)
    : findPlacement(normalized.width, normalized.height, list)
  normalized.x = placement.x
  normalized.y = placement.y
  list.push(normalized)
  persistWidgets(list)
  syncToCanvas()
  autoSaveToWallpaper()
  if (!isCanvasEditMode()) setCanvasMousePassthrough(true)
  return { ok: true, added: true, widget: normalized, list }
}

function findWidgetByIdOrType(params: { id?: string; type?: string }): WidgetInstance | undefined {
  const list = store.get('widgets')
  if (params.id) return list.find((item) => item.id === params.id)
  if (params.type) return list.find((item) => item.type === params.type)
  return undefined
}

export function updateWidgetConfigForTool(params: { id?: string; type?: string; config: Record<string, unknown> }): { ok: boolean; widget?: WidgetInstance; list: WidgetInstance[]; error?: string } {
  const list = store.get('widgets')
  const target = findWidgetByIdOrType(params)
  if (!target) return { ok: false, list, error: 'widget-not-found' }

  const updated = list.map((item) => (
    item.id === target.id
      ? { ...item, config: mergeConfigUpdate(item, params.config) }
      : item
  ))
  persistWidgets(updated)
  syncToCanvas()
  autoSaveToWallpaper()
  return { ok: true, widget: updated.find((item) => item.id === target.id), list: updated }
}

export function updateWidgetForTool(params: {
  id: string
  config?: Record<string, unknown>
  enabled?: boolean
}): { ok: boolean; widget?: WidgetInstance; list: WidgetInstance[]; error?: string } {
  const list = withDefaultWidgetConfigs(store.get('widgets'))
  const target = list.find((item) => item.id === params.id)
  if (!target) return { ok: false, list, error: 'widget-not-found' }

  const nextWidget: WidgetInstance = {
    ...target,
    enabled: params.enabled ?? target.enabled,
    config: params.config ? mergeConfigUpdate(target, params.config) : target.config,
  }
  const updated = list.map((item) => item.id === target.id ? nextWidget : item)
  persistWidgets(updated)
  syncToCanvas()
  autoSaveToWallpaper()
  return { ok: true, widget: nextWidget, list: updated }
}

export async function removeWidgetForTool(params: { id?: string; type?: string }): Promise<{ ok: boolean; deleted: boolean; list: WidgetInstance[]; error?: string }> {
  const target = findWidgetByIdOrType(params)
  if (!target) return { ok: false, deleted: false, list: store.get('widgets'), error: 'widget-not-found' }
  const result = await removeWidgetWithRestore(target.id)
  return { ok: true, deleted: result.deleted, list: result.list }
}

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
    autoSaveToWallpaper()
    // 通知画布更新
    const canvas = getCanvasWindow()
    if (canvas && !canvas.isDestroyed()) {
      canvas.webContents.send(IPC.WIDGET_SYNC, widgets)
    }
  }
}
