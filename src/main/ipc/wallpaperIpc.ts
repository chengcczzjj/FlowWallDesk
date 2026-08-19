import { app, dialog, ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import { promises as fs } from 'fs'
import { join, basename, extname, dirname, isAbsolute, relative, resolve } from 'path'
import { execFile } from 'child_process'
import { IPC } from '@shared/ipc-channels'
import type { WallpaperItem, WallpaperSettings, WallpaperDisplayLayout, WallpaperDisplayMode, WallpaperDisplaySettings } from '@shared/types'
import { store } from '../store'
import {
  getWallpaperWindow,
  isWallpaperAttached,
  ensureWallpaperAttached,
  refreshWallpaperBounds,
} from '../windows/wallpaperWindow'
import { refreshCanvasBounds, refreshCanvasZOrder, getCanvasWindow, isDesktopOccluded } from '../windows/canvasWindow'
import { getDesktopRenderBounds, getDisplayDescriptors } from '../windows/displayLayout'
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

async function buildWallpaperDisplayLayout(): Promise<WallpaperDisplayLayout | null> {
  const current = store.get('wallpaper').current
  if (!current) return null
  const settings = store.get('wallpaperDisplay')
  const mode: WallpaperDisplayMode = settings?.mode ?? 'primary'
  const catalog = await listAllWallpapers()
  const byId = new Map(catalog.map((item) => [item.id, item]))
  const render = getDesktopRenderBounds(mode)
  const displays = getDisplayDescriptors()
  const visible = mode === 'primary'
    ? displays.filter((display) => display.primary)
    : displays
  const segments = visible.map((display) => ({
    displayId: display.id,
    bounds: display.bounds,
    localBounds: {
      x: display.bounds.x - render.x,
      y: display.bounds.y - render.y,
      width: display.bounds.width,
      height: display.bounds.height,
    },
    item: mode === 'per-display'
      ? (byId.get(settings?.assignments?.[String(display.id)] ?? '') ?? current)
      : current,
  }))
  if (mode === 'span') {
    return {
      mode,
      virtualBounds: render,
      displays: [{
        displayId: -1,
        bounds: render,
        localBounds: { x: 0, y: 0, width: render.width, height: render.height },
        item: current,
      }],
    }
  }
  return { mode, virtualBounds: render, displays: segments }
}

export async function getWallpaperDisplaySettings(): Promise<WallpaperDisplaySettings> {
  const settings = store.get('wallpaperDisplay')
  return {
    mode: settings?.mode ?? 'primary',
    assignments: { ...(settings?.assignments ?? {}) },
    displays: getDisplayDescriptors(),
  }
}

async function broadcastWallpaperDisplayLayout(): Promise<void> {
  const layout = await buildWallpaperDisplayLayout()
  if (layout) safeSendToWindow(getWallpaperWindow(), IPC.WALLPAPER_DISPLAY_LAYOUT, layout)
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
// video/image 类型由壁纸渲染进程 canvas 抽帧，通过 IPC 中转
// web 类型与渲染端断帧场景由主进程 capturePage 兜底
let captureTimer: ReturnType<typeof setInterval> | null = null
let captureInFlight = false
let wallpaperFrameDemanded = false
let lastRendererFrameAt = 0
let rendererFrameSeen = false
let fallbackCaptureActive = false
const RENDERER_FRAME_STALE_MS = 1_250

async function captureWallpaperFrameFallback(): Promise<void> {
  if (captureInFlight || !wallpaperFrameDemanded || isDesktopOccluded()) return
  const wallpaperType = store.get('wallpaper').current?.type
  if (wallpaperType !== 'web' && Date.now() - lastRendererFrameAt < RENDERER_FRAME_STALE_MS) return
  if (!fallbackCaptureActive) {
    fallbackCaptureActive = true
    console.warn(`[wallpaper] renderer frames stale; using main capture fallback (${wallpaperType ?? 'unknown'})`)
  }
  const wp = getWallpaperWindow()
  const canvas = getCanvasWindow()
  if (
    !wp || wp.isDestroyed() || wp.webContents.isDestroyed() ||
    !canvas || canvas.isDestroyed() || canvas.webContents.isDestroyed()
  ) return
  captureInFlight = true
  try {
    const img = await wp.webContents.capturePage()
    const width = 768
    const bounds = getDesktopRenderBounds()
    const height = Math.max(1, Math.round(width * bounds.height / Math.max(1, bounds.width)))
    const resized = img.resize({ width, height, quality: 'good' })
    const b64 = resized.toJPEG(48).toString('base64')
    safeSendToWindow(canvas, IPC.WALLPAPER_FRAME, `data:image/jpeg;base64,${b64}`)
  } catch {
    // capturePage can fail while a window or frame is being replaced.
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
    return buildWallpaperDisplayLayout()
  })
  ipcMain.handle(IPC.WALLPAPER_DISPLAY_SET_MODE, async (event, mode: WallpaperDisplayMode) => {
    assertTrustedIpcSender(event, ['main'])
    if (mode !== 'primary' && mode !== 'duplicate' && mode !== 'per-display' && mode !== 'span') {
      throw new Error('不支持的显示器壁纸模式')
    }
    store.set('wallpaperDisplay', { ...store.get('wallpaperDisplay'), mode })
    ensureWidgetCoordinateOrigin()
    refreshWallpaperBounds()
    refreshCanvasBounds()
    await broadcastWallpaperDisplayLayout()
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
      const exists = (await listAllWallpapers()).some((item) => item.id === wallpaperId)
      if (!exists) throw new Error('壁纸不存在')
      assignments[String(displayId)] = wallpaperId
    }
    store.set('wallpaperDisplay', { ...store.get('wallpaperDisplay'), assignments })
    await broadcastWallpaperDisplayLayout()
    return getWallpaperDisplaySettings()
  })

  // 壁纸抽帧中转：壁纸窗口 → 画布窗口（用于组件毛玻璃效果）
  // video/image 类型由渲染端抽帧发送，主进程只做中转
  ipcMain.on(IPC.WALLPAPER_FRAME, (_e, data: string) => {
    if (_e.sender.id !== getWallpaperWindow()?.webContents.id) return
    if (typeof data !== 'string' || data.length > 5 * 1024 * 1024 || !data.startsWith('data:image/jpeg;base64,')) return
    if (!wallpaperFrameDemanded || isDesktopOccluded()) return
    lastRendererFrameAt = Date.now()
    if (!rendererFrameSeen) {
      rendererFrameSeen = true
      console.log('[wallpaper] renderer frame stream active')
    }
    if (fallbackCaptureActive) {
      fallbackCaptureActive = false
      console.log('[wallpaper] renderer frame stream recovered; fallback idle')
    }
    const canvas = getCanvasWindow()
    safeSendToWindow(canvas, IPC.WALLPAPER_FRAME, data)
  })

  ipcMain.on(IPC.WALLPAPER_CAPTURE_DEMAND, (event, enabled: boolean) => {
    if (event.sender.id !== getCanvasWindow()?.webContents.id || typeof enabled !== 'boolean') return
    wallpaperFrameDemanded = enabled
    safeSendToWindow(getWallpaperWindow(), IPC.WALLPAPER_CAPTURE_DEMAND, enabled)
    if (!enabled) {
      stopMainCapture()
      rendererFrameSeen = false
      fallbackCaptureActive = false
    } else {
      lastRendererFrameAt = Date.now()
      startMainCapture()
    }
  })

  ipcMain.on(IPC.WALLPAPER_READY, async (_e, payload?: { itemId?: string; source?: string }) => {
    if (_e.sender.id !== getWallpaperWindow()?.webContents.id) return
    if (payload?.itemId && (typeof payload.itemId !== 'string' || payload.itemId.length > 1024)) return
    if (payload?.source && (typeof payload.source !== 'string' || payload.source.length > 32_768)) return
    const current = store.get('wallpaper').current
    if (!current) return
    if (payload?.itemId && payload.itemId !== current.id) return
    if (payload?.source && payload.source !== current.source) return
    safeSendToWindow(getWallpaperWindow(), IPC.WALLPAPER_CAPTURE_DEMAND, wallpaperFrameDemanded)
    // READY may arrive after the edge-triggered occlusion event, so always resync it.
    safeSendToWindow(getWallpaperWindow(), IPC.WALLPAPER_PAUSE_CAPTURE, isDesktopOccluded())
    if (wallpaperFrameDemanded) startMainCapture()
    if (!isWallpaperAttached()) {
      await ensureWallpaperAttached()
      refreshCanvasZOrder()
    }
  })

  ipcMain.handle(IPC.WALLPAPER_APPLY, async (_e, item: WallpaperItem) => {
    assertTrustedIpcSender(_e, ['main'])
    // 取消旧壁纸的未完成防抖保存，避免旧组件写入新壁纸覆盖层
    cancelPendingAutoSave()

    const state = store.get('wallpaper')
    store.set('wallpaper', { ...state, current: item })
    const displaySettings = store.get('wallpaperDisplay')
    if (displaySettings?.mode === 'per-display') {
      const primaryId = getDisplayDescriptors().find((display) => display.primary)?.id
      if (primaryId !== undefined) {
        store.set('wallpaperDisplay', {
          ...displaySettings,
          assignments: { ...displaySettings.assignments, [String(primaryId)]: item.id },
        })
      }
    }
    const win = getWallpaperWindow()
    safeSendToWindow(win, IPC.WALLPAPER_LOAD, item)
    await broadcastWallpaperDisplayLayout()
    // 壁纸操作可能扰乱画布 z-order，刷新一次
    refreshCanvasZOrder()

    // 主进程定时器同时负责 web 抽帧与 video/image 断帧看门狗。
    lastRendererFrameAt = Date.now()
    rendererFrameSeen = false
    fallbackCaptureActive = false
    if (wallpaperFrameDemanded) startMainCapture()

    await loadWidgetsForWallpaper(item.id)

    return true
  })

  // 保存单个壁纸的独立设置
  ipcMain.handle(
    IPC.WALLPAPER_SAVE_SETTINGS,
    async (_e, wallpaperId: string, settings: WallpaperSettings) => {
      assertTrustedIpcSender(_e, ['main'])
      await saveWallpaperSettings(wallpaperId, settings)
      return true
    }
  )

  // 实时更新壁纸窗口的某个设置（如音量、速度）
  ipcMain.handle(
    IPC.WALLPAPER_UPDATE_SETTING,
    async (_e, key: string, value: unknown) => {
      assertTrustedIpcSender(_e, ['main'])
      const win = getWallpaperWindow()
      safeSendToWindow(win, IPC.WALLPAPER_UPDATE_SETTING, key, value)
      await broadcastWallpaperDisplayLayout()
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
  const win = getWallpaperWindow()
  if (!win) return
  const send = () => {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      console.log('[wallpaper] restore 推送:', state.current?.name)
      safeSendToWindow(win, IPC.WALLPAPER_LOAD, state.current)
      void broadcastWallpaperDisplayLayout()
      lastRendererFrameAt = Date.now()
      if (wallpaperFrameDemanded) startMainCapture()
    }
  }
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', send)
  } else {
    send()
  }
}
