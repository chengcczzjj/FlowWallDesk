import { app, dialog, ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import { promises as fs } from 'fs'
import { join, basename, extname, dirname, isAbsolute, relative, resolve } from 'path'
import { execFile } from 'child_process'
import { IPC } from '@shared/ipc-channels'
import type {
  WallpaperApplyTarget,
  WallpaperDisplayLayout,
  WallpaperDisplayMode,
  WallpaperDisplaySettings,
  WallpaperFrameSource,
  WallpaperItem,
  WallpaperSettings,
} from '@shared/types'
import {
  buildWallpaperLayoutForTarget,
  normalizeWallpaperDisplayMode,
  planWallpaperApplication,
} from '@shared/wallpaper-display-layout'
import { store } from '../store'
import {
  getWallpaperWindows,
  getWallpaperWindowEntries,
  getWallpaperWindowTarget,
  isWallpaperAttached,
  isWallpaperWebContents,
  ensureWallpaperAttached,
  onWallpaperWindowsReconciled,
  refreshWallpaperBounds,
} from '../windows/wallpaperWindow'
import { refreshCanvasBounds, refreshCanvasZOrder, getCanvasWindow, isDesktopOccluded } from '../windows/canvasWindow'
import { getDesktopRenderBounds, getDisplayDescriptors } from '../windows/displayLayout'
import { getMainWindow } from '../windows/mainWindow'
import {
  getUserWallpapersRoot,
  getRemoteWallpapersRoot,
  getUserWallpaperFolderName,
  getWallpaperSettingsOverridePath,
  getWallpaperOverrideDir,
  isUserWallpaperId,
  sanitizeUserDataSegment,
  toRemoteWallpaperId,
  toUserWallpaperId,
} from '../runtime/userDataPaths'
import { cancelPendingAutoSave, ensureWidgetCoordinateOrigin, loadWidgetsForWallpaper } from './widgetIpc'
import { allowUserSelectedAsset } from '../protocols'
import { assertTrustedIpcSender } from './ipcSecurity'
import { extractZipSafely } from '../services/safe-zip'

/**
 * 内置壁纸根目录：
 *   dev：g:\LingyueDesk\assets\wallpaper
 *   打包：<resources>/assets/wallpaper（见 electron-builder.yml extraResources）
 */
function getWallpaperRoot(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'assets', 'wallpaper')
  }
  return join(__dirname, '../../assets/wallpaper')
}

const VIDEO_EXT = new Set(['.mp4', '.webm', '.mkv', '.mov', '.avi'])
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'])
const MAX_IMPORTED_ZIP_BYTES = 2 * 1024 * 1024 * 1024

function isPathInside(rootPath: string, targetPath: string): boolean {
  const rel = relative(rootPath, targetPath)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function safeSendToWindow(
  win: BrowserWindow | null | undefined,
  channel: string,
  ...args: unknown[]
): boolean {
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return false
  try {
    win.webContents.send(channel, ...args)
    return true
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('Render frame was disposed')) return false
    console.warn(`[wallpaper] IPC 发送失败: ${channel}`, err)
    return false
  }
}

/**
 * FlowWallDeskInfo.json 中的 Type 字段：
 *   1  = web (HTML)
 *   7  = video
 *   11 = picture
 */
function mapType(type: unknown, fileName?: string): WallpaperItem['type'] {
  if (typeof type === 'number') {
    if (type === 1) return 'web'
    if (type === 7) return 'video'
    if (type === 11) return 'image'
  }
  if (fileName) {
    const ext = extname(fileName).toLowerCase()
    if (VIDEO_EXT.has(ext)) return 'video'
    if (IMAGE_EXT.has(ext)) return 'image'
    if (ext === '.html' || ext === '.htm') return 'web'
  }
  return 'image'
}

interface FlowWallDeskInfo {
  Title?: string
  Desc?: string
  Author?: string
  Contact?: string
  Type?: number
  FileName?: string
  Thumbnail?: string
  Preview?: string
  Tags?: string[]
  Id?: string
  // 壁纸独立设置
  Settings?: WallpaperSettings
}

function parseWallpaperSettingsOverride(data: unknown): WallpaperSettings | undefined {
  if (!data || typeof data !== 'object') return undefined
  const record = data as Record<string, unknown>
  if (record.settings && typeof record.settings === 'object') {
    return record.settings as WallpaperSettings
  }
  return data as WallpaperSettings
}

async function readWallpaperSettingsOverride(wallpaperId: string): Promise<WallpaperSettings | undefined> {
  try {
    const txt = await fs.readFile(getWallpaperSettingsOverridePath(wallpaperId), 'utf-8')
    return parseWallpaperSettingsOverride(JSON.parse(txt))
  } catch {
    return undefined
  }
}

/**
 * 用 ffmpeg 把视频前 3 秒生成 512x512 正方形 GIF 预览图。
 * 输出到同目录下 preview.gif。如果已存在则跳过。
 */
function generateVideoPreviewGif(videoPath: string, outputDir: string): Promise<string | undefined> {
  const outPath = join(outputDir, 'preview.gif')
  return new Promise((resolve) => {
    fs.access(outPath)
      .then(() => {
        // 已存在，直接返回
        resolve(outPath)
      })
      .catch(() => {
        // 不存在，用 ffmpeg 生成
        // 裁切为正方形（取中心）→ 缩放到 512x512 → 前 3 秒 → 10fps
        const args = [
          '-y',
          '-i',
          videoPath,
          '-t',
          '3',
          '-vf',
          'crop=min(iw\\,ih):min(iw\\,ih),scale=512:512,fps=10',
          '-loop',
          '0',
          outPath,
        ]
        execFile('ffmpeg', args, { timeout: 30000 }, (err) => {
          if (err) {
            console.warn(`[wallpaper] GIF 生成失败 (${basename(videoPath)}):`, err.message)
            resolve(undefined)
          } else {
            console.log(`[wallpaper] GIF 预览已生成: ${outPath}`)
            // 更新 FlowWallDeskInfo.json
            const infoPath = join(outputDir, 'FlowWallDeskInfo.json')
            fs.readFile(infoPath, 'utf-8')
              .then((txt) => {
                const info = JSON.parse(txt)
                info.Thumbnail = 'preview.gif'
                info.Preview = 'preview.gif'
                return fs.writeFile(infoPath, JSON.stringify(info, null, 2), 'utf-8')
              })
              .catch(() => {
                // ignore - 无法更新配置文件不影响使用
              })
            resolve(outPath)
          }
        })
      })
  })
}

/** 保存单个壁纸的独立设置到用户数据覆盖层 */
async function saveWallpaperSettings(wallpaperId: string, settings: WallpaperSettings): Promise<void> {
  const settingsPath = getWallpaperSettingsOverridePath(wallpaperId)
  await fs.mkdir(dirname(settingsPath), { recursive: true })
  await fs.writeFile(settingsPath, JSON.stringify({ settings }, null, 2), 'utf-8')
}

async function pickPreview(folder: string, info?: FlowWallDeskInfo): Promise<string | undefined> {
  const tryAccess = async (p: string) => {
    try {
      await fs.access(p)
      return p
    } catch {
      return undefined
    }
  }
  if (info?.Thumbnail) {
    const r = await tryAccess(join(folder, info.Thumbnail))
    if (r) return r
  }
  if (info?.Preview) {
    const r = await tryAccess(join(folder, info.Preview))
    if (r) return r
  }
  // 文件夹内匹配 thumbnail/preview/cover/封面
  const entries = await fs.readdir(folder).catch(() => [] as string[])
  for (const name of entries) {
    const ext = extname(name).toLowerCase()
    if (!IMAGE_EXT.has(ext)) continue
    if (/thumb|preview|cover|封面/i.test(name)) return join(folder, name)
  }
  // 嵌套 assets/images
  try {
    const inner = await fs.readdir(join(folder, 'assets', 'images'))
    const t = inner.find((n) => /thumbnail|preview|cover/i.test(n))
    if (t) return join(folder, 'assets', 'images', t)
  } catch {
    // ignore
  }
  return undefined
}

async function scanFolder(folder: string, id: string, options: { mutable?: boolean } = {}): Promise<WallpaperItem | null> {
  try {
    const entries = await fs.readdir(folder, { withFileTypes: true })
    const files = entries.filter((e) => e.isFile()).map((e) => e.name)

    let info: FlowWallDeskInfo | undefined
    if (files.includes('FlowWallDeskInfo.json')) {
      try {
        const txt = await fs.readFile(join(folder, 'FlowWallDeskInfo.json'), 'utf-8')
        info = JSON.parse(txt)
      } catch {
        // ignore
      }
    }

    let source: string | undefined
    let type: WallpaperItem['type'] = 'image'

    if (info?.FileName) {
      const configuredSource = resolve(folder, info.FileName)
      const configuredStat = isPathInside(resolve(folder), configuredSource)
        ? await fs.stat(configuredSource).catch(() => null)
        : null
      if (configuredStat?.isFile()) {
        source = configuredSource
        type = mapType(info.Type, info.FileName)
      }
    }
    if (!source) {
      const html = files.find((n) => /\.html?$/i.test(n))
      if (html) {
        source = join(folder, html)
        type = 'web'
      } else {
        const video = files.find((n) => VIDEO_EXT.has(extname(n).toLowerCase()))
        if (video) {
          source = join(folder, video)
          type = 'video'
        } else {
          const image = files.find((n) => IMAGE_EXT.has(extname(n).toLowerCase()))
          if (image) {
            source = join(folder, image)
            type = 'image'
          }
        }
      }
    }

    if (!source) return null

    const preview = await pickPreview(folder, info)

    // 视频壁纸没有预览图时，异步生成 GIF 预览
    if (type === 'video' && !preview && options.mutable) {
      // 先不阻塞扫描，异步生成后下次加载时就有了
      generateVideoPreviewGif(source, folder).then((gif) => {
        if (gif) console.log(`[wallpaper] 视频预览 GIF 已就绪: ${id}`)
      })
    }

    const settingsOverride = await readWallpaperSettingsOverride(id)

    return {
      id,
      name: info?.Title || id,
      source,
      type,
      preview,
      meta: info as unknown as Record<string, unknown>,
      settings: settingsOverride ?? info?.Settings,
    }
  } catch {
    return null
  }
}

async function listWallpapersFromRoot(
  root: string,
  options: { idPrefix?: 'user' | 'remote'; label: string; mutable?: boolean }
): Promise<WallpaperItem[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true })
    const items = await Promise.all(
      entries
        .filter((e) => e.isDirectory())
        .map((e) => {
          const id = options.idPrefix === 'user'
            ? toUserWallpaperId(e.name)
            : options.idPrefix === 'remote'
              ? toRemoteWallpaperId(e.name)
              : e.name
          return scanFolder(join(root, e.name), id, { mutable: options.mutable })
        })
    )
    return items.filter((x): x is WallpaperItem => x !== null)
  } catch (err) {
    const code = typeof err === 'object' && err !== null && 'code' in err ? (err as { code?: string }).code : undefined
    if (code === 'ENOENT') return []
    console.warn(`[wallpaper] ${options.label}扫描失败：`, err)
    return []
  }
}

async function listBuiltinWallpapers(): Promise<WallpaperItem[]> {
  return listWallpapersFromRoot(getWallpaperRoot(), { label: '内置壁纸', mutable: false })
}

async function listUserWallpapers(): Promise<WallpaperItem[]> {
  return listWallpapersFromRoot(getUserWallpapersRoot(), { idPrefix: 'user', label: '用户壁纸', mutable: true })
}

function sendToWallpaperWindows(channel: string, ...args: unknown[]): void {
  for (const win of getWallpaperWindows()) safeSendToWindow(win, channel, ...args)
}

function notifyDisplaySettingsChanged(): void {
  safeSendToWindow(getMainWindow(), IPC.WALLPAPER_DISPLAY_LAYOUT_CHANGED)
}

async function buildWallpaperDisplayLayout(webContentsId: number): Promise<WallpaperDisplayLayout | null> {
  const current = store.get('wallpaper').current
  if (!current) return null
  const settings = store.get('wallpaperDisplay')
  const mode = normalizeWallpaperDisplayMode(settings?.mode)
  const catalog = await listAllWallpapers()
  const displays = getDisplayDescriptors()
  const target = getWallpaperWindowTarget(webContentsId)
  if (!target) return null
  return buildWallpaperLayoutForTarget({
    mode,
    target,
    displays,
    assignments: settings?.assignments ?? {},
    catalog,
    current,
  })
}

/** Which wallpaper a wallpaper window currently shows (per-display assignments win in that mode). */
function getDisplayedWallpaperId(webContentsId: number): string | undefined {
  const target = getWallpaperWindowTarget(webContentsId)
  if (!target) return undefined
  const current = store.get('wallpaper').current
  const settings = store.get('wallpaperDisplay')
  if (normalizeWallpaperDisplayMode(settings?.mode) === 'per-display' && target.displayId !== undefined) {
    return settings?.assignments?.[String(target.displayId)] ?? current?.id
  }
  return current?.id
}

export async function getWallpaperDisplaySettings(): Promise<WallpaperDisplaySettings> {
  const settings = store.get('wallpaperDisplay')
  return {
    mode: normalizeWallpaperDisplayMode(settings?.mode),
    assignments: { ...(settings?.assignments ?? {}) },
    displays: getDisplayDescriptors(),
  }
}

async function broadcastWallpaperDisplayLayout(): Promise<void> {
  for (const win of getWallpaperWindows()) {
    const layout = await buildWallpaperDisplayLayout(win.webContents.id)
    if (layout) safeSendToWindow(win, IPC.WALLPAPER_DISPLAY_LAYOUT, layout)
  }
}

async function listRemoteWallpapers(): Promise<WallpaperItem[]> {
  return listWallpapersFromRoot(getRemoteWallpapersRoot(), { idPrefix: 'remote', label: '在线壁纸', mutable: true })
}

async function listAllWallpapers(): Promise<WallpaperItem[]> {
  const [builtin, user, remote] = await Promise.all([
    listBuiltinWallpapers(),
    listUserWallpapers(),
    listRemoteWallpapers(),
  ])
  return [...builtin, ...user, ...remote]
}

// ─── 壁纸帧捕获（用于组件毛玻璃效果）───
// video/image 类型由各壁纸窗口渲染进程 canvas 抽帧，通过 IPC 中转；
// web 类型与渲染端断帧场景由主进程 capturePage 兜底。多显示器下每个
// 壁纸窗口独立一路帧，画布按窗口区域对齐毛玻璃。
let captureTimer: ReturnType<typeof setInterval> | null = null
let captureInFlight = false
let wallpaperFrameDemanded = false
/** Per wallpaper window: last renderer frame time and what kind of media produced it. */
const rendererFrameState = new Map<string, { at: number; mediaType?: 'video' | 'image' }>()
let frameWatchdogStartedAt = 0
const fallbackCaptureKeys = new Set<string>()
const RENDERER_FRAME_STALE_MS = 1_250
const FRAME_WIDTH = 768

function resetFrameWatchdog(): void {
  rendererFrameState.clear()
  fallbackCaptureKeys.clear()
  frameWatchdogStartedAt = Date.now()
}

/** Wallpaper windows expressed in canvas client coordinates. */
export function getWallpaperFrameSources(): WallpaperFrameSource[] {
  const canvasBounds = getDesktopRenderBounds()
  return getWallpaperWindowEntries().map(({ target }) => ({
    key: target.key,
    bounds: {
      x: target.bounds.x - canvasBounds.x,
      y: target.bounds.y - canvasBounds.y,
      width: target.bounds.width,
      height: target.bounds.height,
    },
  }))
}

function broadcastWallpaperFrameSources(): void {
  safeSendToWindow(getCanvasWindow(), IPC.WALLPAPER_FRAME_SOURCES, getWallpaperFrameSources())
}

function needsFallbackCapture(key: string, now: number): boolean {
  const state = rendererFrameState.get(key)
  // A static image only needs its renderer frame again when the wallpaper
  // changes; polling capturePage() for it every 250ms was pure overhead.
  if (state?.mediaType === 'image') return false
  return now - (state?.at ?? frameWatchdogStartedAt) >= RENDERER_FRAME_STALE_MS
}

async function captureWallpaperFrameFallback(): Promise<void> {
  if (captureInFlight || !wallpaperFrameDemanded || isDesktopOccluded()) return
  const canvas = getCanvasWindow()
  if (!canvas || canvas.isDestroyed() || canvas.webContents.isDestroyed()) return
  const now = Date.now()
  const targets = getWallpaperWindowEntries().filter(({ window, target }) => (
    !window.isDestroyed() && !window.webContents.isDestroyed() && needsFallbackCapture(target.key, now)
  ))
  if (targets.length === 0) return
  captureInFlight = true
  try {
    for (const { window, target } of targets) {
      if (!fallbackCaptureKeys.has(target.key)) {
        fallbackCaptureKeys.add(target.key)
        console.warn(`[wallpaper:${target.key}] renderer frames unavailable; using main capture fallback`)
      }
      try {
        const img = await window.webContents.capturePage()
        const height = Math.max(1, Math.round(FRAME_WIDTH * target.bounds.height / Math.max(1, target.bounds.width)))
        const resized = img.resize({ width: FRAME_WIDTH, height, quality: 'good' })
        const b64 = resized.toJPEG(48).toString('base64')
        safeSendToWindow(canvas, IPC.WALLPAPER_FRAME, { key: target.key, data: `data:image/jpeg;base64,${b64}` })
      } catch {
        // capturePage can fail while a window or frame is being replaced.
      }
    }
  } finally {
    captureInFlight = false
  }
}

function startMainCapture(): void {
  if (!wallpaperFrameDemanded || captureTimer) return
  void captureWallpaperFrameFallback()
  captureTimer = setInterval(() => void captureWallpaperFrameFallback(), 250)
}

function stopMainCapture(): void {
  if (captureTimer) {
    clearInterval(captureTimer)
    captureTimer = null
  }
}

export function registerWallpaperIpc(): void {
  ipcMain.handle(IPC.WALLPAPER_LIST, (event) => { assertTrustedIpcSender(event, ['main']); return listAllWallpapers() })
  ipcMain.handle(IPC.WALLPAPER_GET_CURRENT, (event) => { assertTrustedIpcSender(event, ['main', 'wallpaper']); return store.get('wallpaper') })
  ipcMain.handle(IPC.WALLPAPER_ATTACH_STATUS, (event) => { assertTrustedIpcSender(event, ['main']); return isWallpaperAttached() })
  ipcMain.handle(IPC.WALLPAPER_DISPLAY_GET_SETTINGS, (event) => {
    assertTrustedIpcSender(event, ['main'])
    return getWallpaperDisplaySettings()
  })
  ipcMain.handle(IPC.WALLPAPER_DISPLAY_GET_LAYOUT, (event) => {
    assertTrustedIpcSender(event, ['wallpaper'])
    return buildWallpaperDisplayLayout(event.sender.id)
  })
  ipcMain.handle(IPC.WALLPAPER_DISPLAY_SET_MODE, async (event, mode: WallpaperDisplayMode) => {
    assertTrustedIpcSender(event, ['main'])
    if (mode !== 'primary' && mode !== 'duplicate' && mode !== 'per-display' && mode !== 'span') {
      throw new Error('不支持的显示器壁纸模式')
    }
    store.set('wallpaperDisplay', { ...store.get('wallpaperDisplay'), mode })
    refreshWallpaperBounds()
    refreshCanvasBounds()
    ensureWidgetCoordinateOrigin()
    await broadcastWallpaperDisplayLayout()
    notifyDisplaySettingsChanged()
    return getWallpaperDisplaySettings()
  })
  ipcMain.handle(IPC.WALLPAPER_DISPLAY_SET_ASSIGNMENT, async (event, displayId: number, wallpaperId: string | null) => {
    assertTrustedIpcSender(event, ['main'])
    if (!Number.isInteger(displayId)) throw new Error('无效的显示器')
    const display = getDisplayDescriptors().find((item) => item.id === displayId)
    if (!display) throw new Error('显示器不存在')
    const assignments = { ...(store.get('wallpaperDisplay')?.assignments ?? {}) }
    if (wallpaperId === null || wallpaperId === '') delete assignments[String(displayId)]
    else {
      const selected = (await listAllWallpapers()).find((item) => item.id === wallpaperId)
      if (!selected) throw new Error('壁纸不存在')
      assignments[String(displayId)] = wallpaperId
      if (display.primary) {
        const state = store.get('wallpaper')
        store.set('wallpaper', { ...state, current: selected })
        await loadWidgetsForWallpaper(selected.id)
      }
    }
    // Choosing a wallpaper for one monitor is an explicit switch to independent mode.
    store.set('wallpaperDisplay', { mode: 'per-display', assignments })
    refreshWallpaperBounds()
    refreshCanvasBounds()
    ensureWidgetCoordinateOrigin()
    await broadcastWallpaperDisplayLayout()
    notifyDisplaySettingsChanged()
    return getWallpaperDisplaySettings()
  })

  // 壁纸抽帧中转：壁纸窗口 → 画布窗口（用于组件毛玻璃效果）
  // video/image 类型由渲染端抽帧发送，主进程只做中转并标注来源窗口
  ipcMain.on(IPC.WALLPAPER_FRAME, (_e, data: string, mediaType?: unknown) => {
    const target = getWallpaperWindowTarget(_e.sender.id)
    if (!target) return
    if (typeof data !== 'string' || data.length > 5 * 1024 * 1024 || !data.startsWith('data:image/jpeg;base64,')) return
    if (!wallpaperFrameDemanded || isDesktopOccluded()) return
    const previous = rendererFrameState.get(target.key)
    rendererFrameState.set(target.key, {
      at: Date.now(),
      mediaType: mediaType === 'image' || mediaType === 'video' ? mediaType : undefined,
    })
    if (!previous) console.log(`[wallpaper:${target.key}] renderer frame stream active`)
    if (fallbackCaptureKeys.delete(target.key)) {
      console.log(`[wallpaper:${target.key}] renderer frame stream recovered; fallback idle`)
    }
    safeSendToWindow(getCanvasWindow(), IPC.WALLPAPER_FRAME, { key: target.key, data })
  })

  ipcMain.handle(IPC.WALLPAPER_FRAME_SOURCES_GET, (event) => {
    assertTrustedIpcSender(event, ['canvas'])
    return getWallpaperFrameSources()
  })

  onWallpaperWindowsReconciled(() => {
    broadcastWallpaperFrameSources()
    resetFrameWatchdog()
    if (wallpaperFrameDemanded) sendToWallpaperWindows(IPC.WALLPAPER_CAPTURE_DEMAND, true)
  })

  ipcMain.on(IPC.WALLPAPER_CAPTURE_DEMAND, (event, enabled: boolean) => {
    if (event.sender.id !== getCanvasWindow()?.webContents.id || typeof enabled !== 'boolean') return
    wallpaperFrameDemanded = enabled
    sendToWallpaperWindows(IPC.WALLPAPER_CAPTURE_DEMAND, enabled)
    resetFrameWatchdog()
    if (!enabled) {
      stopMainCapture()
    } else {
      broadcastWallpaperFrameSources()
      startMainCapture()
    }
  })

  ipcMain.on(IPC.WALLPAPER_READY, async (_e, payload?: { itemId?: string; source?: string }) => {
    if (!isWallpaperWebContents(_e.sender.id)) return
    if (payload?.itemId && (typeof payload.itemId !== 'string' || payload.itemId.length > 1024)) return
    if (payload?.source && (typeof payload.source !== 'string' || payload.source.length > 32_768)) return
    const layout = await buildWallpaperDisplayLayout(_e.sender.id)
    const expected = layout?.displays[0]?.item
    if (!expected) return
    if (payload?.itemId && payload.itemId !== expected.id) return
    if (payload?.source && payload.source !== expected.source) return
    const senderWindow = getWallpaperWindows().find((win) => win.webContents.id === _e.sender.id)
    if (!senderWindow) return
    // Every monitor's wallpaper window feeds the glass behind widgets on that monitor.
    safeSendToWindow(senderWindow, IPC.WALLPAPER_CAPTURE_DEMAND, wallpaperFrameDemanded)
    // READY may arrive after the edge-triggered occlusion event, so always resync it.
    safeSendToWindow(senderWindow, IPC.WALLPAPER_PAUSE_CAPTURE, isDesktopOccluded())
    if (wallpaperFrameDemanded) startMainCapture()
    if (!isWallpaperAttached()) {
      await ensureWallpaperAttached(_e.sender.id)
      refreshCanvasZOrder()
    }
  })

  ipcMain.handle(IPC.WALLPAPER_APPLY, async (_e, item: WallpaperItem, target: WallpaperApplyTarget = 'current') => {
    assertTrustedIpcSender(_e, ['main'])
    if (target !== 'current' && target !== 'all' && !Number.isInteger(target)) {
      throw new Error('无效的壁纸显示目标')
    }
    // 取消旧壁纸的未完成防抖保存，避免旧组件写入新壁纸覆盖层
    cancelPendingAutoSave()

    const state = store.get('wallpaper')
    const displays = getDisplayDescriptors()
    const displaySettings = store.get('wallpaperDisplay')
    let applicationPlan: ReturnType<typeof planWallpaperApplication>
    try {
      applicationPlan = planWallpaperApplication({
        target,
        mode: displaySettings?.mode ?? 'primary',
        assignments: displaySettings?.assignments ?? {},
        displays,
        currentId: state.current?.id,
        itemId: item.id,
      })
    } catch {
      throw new Error('显示器不存在，请刷新显示器列表后重试')
    }

    const nextCurrent = applicationPlan.currentId === item.id ? item : state.current ?? item
    store.set('wallpaper', { ...state, current: nextCurrent })
    store.set('wallpaperDisplay', {
      mode: applicationPlan.mode,
      assignments: applicationPlan.assignments,
    })
    refreshWallpaperBounds()
    refreshCanvasBounds()
    // Applying to one monitor can switch the layout to per-display, which moves
    // the canvas origin; migrate widget coordinates with it.
    ensureWidgetCoordinateOrigin()
    await broadcastWallpaperDisplayLayout()
    notifyDisplaySettingsChanged()
    // Changing media inside already attached wallpaper windows does not touch
    // the desktop z-order. The old unconditional always-on-top refresh here
    // flashed every widget over the settings window on each apply; newly
    // created windows still refresh the canvas after they attach (READY).

    // 主进程定时器同时负责 web 抽帧与 video/image 断帧看门狗。
    resetFrameWatchdog()
    if (wallpaperFrameDemanded) startMainCapture()

    if (state.current?.id !== nextCurrent.id) await loadWidgetsForWallpaper(nextCurrent.id)

    return true
  })

  // 保存单个壁纸的独立设置
  ipcMain.handle(
    IPC.WALLPAPER_SAVE_SETTINGS,
    async (_e, wallpaperId: string, settings: WallpaperSettings) => {
      assertTrustedIpcSender(_e, ['main'])
      await saveWallpaperSettings(wallpaperId, settings)
      // The applied item is cached in the store; keep it in step so the next
      // layout broadcast does not carry the pre-edit settings back.
      const state = store.get('wallpaper')
      if (state.current?.id === wallpaperId) {
        store.set('wallpaper', { ...state, current: { ...state.current, settings: { ...settings } } })
      }
      await broadcastWallpaperDisplayLayout()
      return true
    }
  )

  // 实时更新壁纸窗口的某个设置（如音量、速度），只发给正在显示该壁纸的窗口
  ipcMain.handle(
    IPC.WALLPAPER_UPDATE_SETTING,
    async (_e, key: string, value: unknown, wallpaperId?: unknown) => {
      assertTrustedIpcSender(_e, ['main'])
      if (!['volume', 'speed', 'scaling', 'flip'].includes(key)) return false
      for (const win of getWallpaperWindows()) {
        if (typeof wallpaperId === 'string' && getDisplayedWallpaperId(win.webContents.id) !== wallpaperId) continue
        safeSendToWindow(win, IPC.WALLPAPER_UPDATE_SETTING, key, value)
      }
      // No layout broadcast here: the layout still carries the last *saved*
      // settings (the sidebar saves 500ms later) and re-sending it snapped the
      // slider value on the desktop straight back.
      return true
    }
  )

  ipcMain.handle(IPC.WALLPAPER_PICK_FILE, async (_event) => {
    assertTrustedIpcSender(_event, ['main'])
    const result = await dialog.showOpenDialog({
      title: '选择本地壁纸',
      properties: ['openFile'],
      filters: [
        {
          name: 'Media',
          extensions: [
            'mp4', 'webm', 'mkv', 'mov',
            'jpg', 'jpeg', 'png', 'gif', 'webp',
            'html', 'zip',
          ],
        },
      ],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const file = result.filePaths[0]
    await allowUserSelectedAsset(file)
    const ext = extname(file).toLowerCase()
    const type: WallpaperItem['type'] = VIDEO_EXT.has(ext)
      ? 'video'
      : ext === '.html' || ext === '.htm'
        ? 'web'
        : 'image'
    const item: WallpaperItem = {
      id: `local:${file}`,
      name: basename(file),
      source: file,
      type,
    }
    return item
  })

  ipcMain.handle(IPC.WALLPAPER_GRANT_PREVIEW, async (_event, filePath: string) => {
    assertTrustedIpcSender(_event, ['main'])
    try {
      const extension = extname(filePath).toLowerCase()
      if (!VIDEO_EXT.has(extension) && !IMAGE_EXT.has(extension)) return false
      await allowUserSelectedAsset(filePath)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle(IPC.WALLPAPER_REMOVE, async (_event, wallpaperId: string) => {
    assertTrustedIpcSender(_event, ['main'])
    if (!isUserWallpaperId(wallpaperId)) {
      return { ok: false, error: '只能删除用户导入的本地壁纸' }
    }
    if (store.get('wallpaper').current?.id === wallpaperId) {
      return { ok: false, error: '当前正在使用这张壁纸，请先切换到其他壁纸' }
    }
    try {
      await fs.rm(join(getUserWallpapersRoot(), getUserWallpaperFolderName(wallpaperId)), {
        recursive: true,
        force: true,
      })
      await fs.rm(getWallpaperOverrideDir(wallpaperId), { recursive: true, force: true })
      const displaySettings = store.get('wallpaperDisplay')
      const assignments = Object.fromEntries(
        Object.entries(displaySettings?.assignments ?? {}).filter(([, assignedId]) => assignedId !== wallpaperId),
      )
      if (Object.keys(assignments).length !== Object.keys(displaySettings?.assignments ?? {}).length) {
        store.set('wallpaperDisplay', {
          mode: normalizeWallpaperDisplayMode(displaySettings?.mode),
          assignments,
        })
        await broadcastWallpaperDisplayLayout()
        notifyDisplaySettingsChanged()
      }
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  // 导入壁纸：将文件复制到用户数据目录，创建配置，生成预览
  // 支持：视频、图片、HTML（复制整个文件夹）、ZIP（解压为网页壁纸）
  ipcMain.handle(
    IPC.WALLPAPER_IMPORT,
    async (
      _e,
      filePath: string,
      meta: { name: string; desc: string; author: string; contact: string }
    ): Promise<{ ok: boolean; item?: WallpaperItem; error?: string }> => {
      assertTrustedIpcSender(_e, ['main'])
      let createdFolder: string | undefined
      try {
        const ext = extname(filePath).toLowerCase()
        const isZip = ext === '.zip'
        const isHtml = ext === '.html' || ext === '.htm'
        const type: WallpaperItem['type'] = VIDEO_EXT.has(ext)
          ? 'video'
          : isHtml || isZip
            ? 'web'
            : 'image'

        // 用壁纸名字做用户数据目录下的文件夹名
        const displayName = meta.name.trim() || basename(filePath, ext)
        const safeName = sanitizeUserDataSegment(displayName, 'wallpaper')
        const root = getUserWallpapersRoot()
        let folderName = safeName
        let folder = join(root, folderName)

        // 避免重名
        let counter = 1
        while (true) {
          try {
            await fs.access(folder)
            folderName = `${safeName}_${counter++}`
            folder = join(root, folderName)
          } catch {
            break
          }
        }

        await fs.mkdir(folder, { recursive: true })
        createdFolder = folder

        let mainFileName: string

        if (isZip) {
          // ZIP 解压到目标文件夹
          await extractZip(filePath, folder)
          // 在解压后的文件中查找 index.html 或第一个 .html
          mainFileName = await findHtmlEntry(folder) || 'index.html'
        } else if (isHtml) {
          // HTML 壁纸：复制整个所在文件夹的内容
          const srcDir = dirname(filePath)
          await copyDirContents(srcDir, folder)
          mainFileName = basename(filePath)
        } else {
          // 视频/图片：单文件复制
          mainFileName = basename(filePath)
          const destFile = join(folder, mainFileName)
          await fs.copyFile(filePath, destFile)
        }

        // 创建 FlowWallDeskInfo.json
        const typeNum = type === 'web' ? 1 : type === 'video' ? 7 : 11
        const info: FlowWallDeskInfo = {
          Title: displayName,
          Desc: meta.desc || '',
          Author: meta.author || '',
          Contact: meta.contact || '',
          Type: typeNum,
          FileName: mainFileName,
          Tags: [type],
          Id: folderName,
        }

        // 如果是图片类型，源文件本身就是预览
        if (type === 'image') {
          info.Thumbnail = mainFileName
          info.Preview = mainFileName
        }

        await fs.writeFile(
          join(folder, 'FlowWallDeskInfo.json'),
          JSON.stringify(info, null, 2),
          'utf-8'
        )

        const destSource = join(folder, mainFileName)

        // 如果是视频，生成 GIF 预览
        let preview: string | undefined
        if (type === 'video') {
          preview = await generateVideoPreviewGif(destSource, folder)
        } else if (type === 'image') {
          preview = destSource
        }

        const item: WallpaperItem = {
          id: toUserWallpaperId(folderName),
          name: displayName,
          source: destSource,
          type,
          preview,
          meta: info as unknown as Record<string, unknown>,
        }

        return { ok: true, item }
      } catch (err) {
        if (createdFolder) await fs.rm(createdFolder, { recursive: true, force: true }).catch(() => undefined)
        console.error('[wallpaper] 导入失败:', err)
        return { ok: false, error: String(err) }
      }
    }
  )
}

/**
 * 递归复制目录内容（不含源目录本身）
 */
async function copyDirContents(src: string, dest: string): Promise<void> {
  const entries = await fs.readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = join(src, entry.name)
    const destPath = join(dest, entry.name)
    if (entry.isDirectory()) {
      await fs.mkdir(destPath, { recursive: true })
      await copyDirContents(srcPath, destPath)
    } else {
      await fs.copyFile(srcPath, destPath)
    }
  }
}

/**
 * 安全解压用户选择的 ZIP，规则与在线壁纸包保持一致。
 */
function extractZip(zipPath: string, destDir: string): Promise<void> {
  return extractZipSafely(zipPath, destDir, {
    maxEntries: 100_000,
    maxUncompressedBytes: MAX_IMPORTED_ZIP_BYTES,
  })
}

/**
 * 在目录中查找 HTML 入口文件
 */
async function findHtmlEntry(dir: string): Promise<string | null> {
  // 先在当前层查找
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const htmlFiles = entries.filter(
    (e) => e.isFile() && /\.(html|htm)$/i.test(e.name)
  )
  // 优先 index.html
  const idx = htmlFiles.find((e) => e.name.toLowerCase() === 'index.html')
  if (idx) return idx.name

  // 如果当前层只有一个子目录且无 HTML，进入子目录
  const dirs = entries.filter((e) => e.isDirectory())
  if (htmlFiles.length === 0 && dirs.length === 1) {
    const subEntries = await fs.readdir(join(dir, dirs[0].name), { withFileTypes: true })
    const subHtml = subEntries.filter(
      (e) => e.isFile() && /\.(html|htm)$/i.test(e.name)
    )
    const subIdx = subHtml.find((e) => e.name.toLowerCase() === 'index.html')
    if (subIdx) return join(dirs[0].name, subIdx.name)
    if (subHtml[0]) return join(dirs[0].name, subHtml[0].name)
  }

  if (htmlFiles[0]) return htmlFiles[0].name
  return null
}

/** 应用启动时恢复上次的壁纸 */
export async function restoreWallpaper(): Promise<void> {
  const state = store.get('wallpaper')
  if (!state.current) return
  if (!/^[a-z]+:\/\//i.test(state.current.source)) {
    try {
      await allowUserSelectedAsset(state.current.source)
    } catch {
      // 内置和 userData 壁纸已由根目录授权，不需要额外授权。
    }
  }
  const windows = getWallpaperWindows()
  if (windows.length === 0) return
  const send = (win: BrowserWindow) => {
    if (win.isDestroyed() || win.webContents.isDestroyed()) return
    console.log(`[wallpaper] restore 布局到 renderer ${win.webContents.id}:`, state.current?.name)
    void broadcastWallpaperDisplayLayout()
    resetFrameWatchdog()
    if (wallpaperFrameDemanded) startMainCapture()
  }
  for (const win of windows) {
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', () => send(win))
    else send(win)
  }
}
