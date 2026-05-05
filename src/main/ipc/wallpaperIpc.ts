import { app, dialog, ipcMain, screen } from 'electron'
import { promises as fs } from 'fs'
import { join, basename, extname, dirname } from 'path'
import { execFile } from 'child_process'
import { IPC } from '@shared/ipc-channels'
import type { WallpaperItem, WallpaperSettings } from '@shared/types'
import { store } from '../store'
import {
  getWallpaperWindow,
  isWallpaperAttached,
  ensureWallpaperAttached,
} from '../windows/wallpaperWindow'
import { refreshCanvasZOrder, getCanvasWindow, isDesktopOccluded } from '../windows/canvasWindow'
import { cancelPendingAutoSave, loadWidgetsForWallpaper } from './widgetIpc'

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

/** 保存单个壁纸的独立设置到其 FlowWallDeskInfo.json */
async function saveWallpaperSettings(
  folder: string,
  settings: WallpaperSettings
): Promise<void> {
  const infoPath = join(folder, 'FlowWallDeskInfo.json')
  try {
    const txt = await fs.readFile(infoPath, 'utf-8')
    const info = JSON.parse(txt)
    info.Settings = settings
    await fs.writeFile(infoPath, JSON.stringify(info, null, 2), 'utf-8')
  } catch {
    // 如果文件不存在，创建一个最小的
    await fs.writeFile(
      infoPath,
      JSON.stringify({ Settings: settings }, null, 2),
      'utf-8'
    )
  }
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

async function scanFolder(folder: string, id: string): Promise<WallpaperItem | null> {
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

    if (info?.FileName && files.includes(info.FileName)) {
      source = join(folder, info.FileName)
      type = mapType(info.Type, info.FileName)
    } else {
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
    if (type === 'video' && !preview) {
      // 先不阻塞扫描，异步生成后下次加载时就有了
      generateVideoPreviewGif(source, folder).then((gif) => {
        if (gif) console.log(`[wallpaper] 视频预览 GIF 已就绪: ${id}`)
      })
    }

    return {
      id,
      name: info?.Title || id,
      source,
      type,
      preview,
      meta: info as unknown as Record<string, unknown>,
      settings: info?.Settings,
    }
  } catch {
    return null
  }
}

async function listBuiltinWallpapers(): Promise<WallpaperItem[]> {
  const root = getWallpaperRoot()
  try {
    const entries = await fs.readdir(root, { withFileTypes: true })
    const items = await Promise.all(
      entries.filter((e) => e.isDirectory()).map((e) => scanFolder(join(root, e.name), e.name))
    )
    return items.filter((x): x is WallpaperItem => x !== null)
  } catch (err) {
    console.warn('[wallpaper] 扫描失败：', err)
    return []
  }
}

// ─── 壁纸帧捕获（用于组件毛玻璃效果）───
// video/image 类型由壁纸渲染进程 canvas 抽帧，通过 IPC 中转
// web 类型（iframe）无法用 canvas.drawImage，改用主进程 capturePage
let captureTimer: ReturnType<typeof setInterval> | null = null

function startMainCapture(): void {
  stopMainCapture()
  captureTimer = setInterval(async () => {
    if (isDesktopOccluded()) return
    const wp = getWallpaperWindow()
    const canvas = getCanvasWindow()
    if (!wp || wp.isDestroyed() || !canvas || canvas.isDestroyed()) return
    try {
      const img = await wp.webContents.capturePage()
      const display = screen.getPrimaryDisplay()
      const width = 768
      const height = Math.max(1, Math.round(width * display.bounds.height / Math.max(1, display.bounds.width)))
      const resized = img.resize({ width, height, quality: 'good' })
      const b64 = resized.toJPEG(50).toString('base64')
      const dataUrl = `data:image/jpeg;base64,${b64}`
      canvas.webContents.send(IPC.WALLPAPER_FRAME, dataUrl)
    } catch {
      // capturePage 可能在窗口销毁瞬间失败，忽略
    }
  }, 83) // ~12fps
}

function stopMainCapture(): void {
  if (captureTimer) {
    clearInterval(captureTimer)
    captureTimer = null
  }
}

export function registerWallpaperIpc(): void {
  ipcMain.handle(IPC.WALLPAPER_LIST, () => listBuiltinWallpapers())
  ipcMain.handle(IPC.WALLPAPER_GET_CURRENT, () => store.get('wallpaper'))
  ipcMain.handle(IPC.WALLPAPER_ATTACH_STATUS, () => isWallpaperAttached())

  // 壁纸抽帧中转：壁纸窗口 → 画布窗口（用于组件毛玻璃效果）
  // video/image 类型由渲染端抽帧发送，主进程只做中转
  ipcMain.on(IPC.WALLPAPER_FRAME, (_e, data: string) => {
    if (isDesktopOccluded()) return // 全屏遮挡时丢弃帧
    const canvas = getCanvasWindow()
    if (canvas && !canvas.isDestroyed()) {
      canvas.webContents.send(IPC.WALLPAPER_FRAME, data)
    }
  })

  ipcMain.handle(IPC.WALLPAPER_APPLY, async (_e, item: WallpaperItem) => {
    // 取消旧壁纸的未完成防抖保存，避免旧组件写入新壁纸目录
    cancelPendingAutoSave()

    // 若壁纸窗口还未贴合桌面，先尝试重新 attach
    if (!isWallpaperAttached()) {
      await ensureWallpaperAttached()
    }
    const win = getWallpaperWindow()
    if (win) win.webContents.send(IPC.WALLPAPER_LOAD, item)
    const state = store.get('wallpaper')
    store.set('wallpaper', { ...state, current: item })
    // 壁纸操作可能扰乱画布 z-order，刷新一次
    refreshCanvasZOrder()

    // web 类型壁纸无法在渲染端 canvas 抽帧（iframe 跨域），改用主进程 capturePage
    if (item.type === 'web') {
      // capturePage 需要等 iframe 加载完成，延迟启动
      setTimeout(() => startMainCapture(), 1000)
    } else {
      stopMainCapture() // video/image 由渲染端抽帧
    }

    await loadWidgetsForWallpaper(item.id)

    return true
  })

  // 保存单个壁纸的独立设置
  ipcMain.handle(
    IPC.WALLPAPER_SAVE_SETTINGS,
    async (_e, wallpaperId: string, settings: WallpaperSettings) => {
      const root = getWallpaperRoot()
      const folder = join(root, wallpaperId)
      await saveWallpaperSettings(folder, settings)
      return true
    }
  )

  // 实时更新壁纸窗口的某个设置（如音量、速度）
  ipcMain.handle(
    IPC.WALLPAPER_UPDATE_SETTING,
    async (_e, key: string, value: unknown) => {
      const win = getWallpaperWindow()
      if (win) win.webContents.send(IPC.WALLPAPER_UPDATE_SETTING, key, value)
      return true
    }
  )

  ipcMain.handle(IPC.WALLPAPER_PICK_FILE, async () => {
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

  // 导入壁纸：将文件复制到 wallpaper 文件夹，创建配置，生成预览
  // 支持：视频、图片、HTML（复制整个文件夹）、ZIP（解压为网页壁纸）
  ipcMain.handle(
    IPC.WALLPAPER_IMPORT,
    async (
      _e,
      filePath: string,
      meta: { name: string; desc: string; author: string; contact: string }
    ): Promise<{ ok: boolean; item?: WallpaperItem; error?: string }> => {
      try {
        const ext = extname(filePath).toLowerCase()
        const isZip = ext === '.zip'
        const isHtml = ext === '.html' || ext === '.htm'
        const type: WallpaperItem['type'] = VIDEO_EXT.has(ext)
          ? 'video'
          : isHtml || isZip
            ? 'web'
            : 'image'

        // 用壁纸名字做文件夹名（去掉非法字符）
        const safeName = meta.name.replace(/[<>:"/\\|?*]/g, '_').trim() || basename(filePath, ext)
        const root = getWallpaperRoot()
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
          Title: meta.name,
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
          id: folderName,
          name: meta.name,
          source: destSource,
          type,
          preview,
          meta: info as unknown as Record<string, unknown>,
        }

        return { ok: true, item }
      } catch (err) {
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
 * 解压 ZIP 文件到目标目录（使用 PowerShell Expand-Archive）
 */
function extractZip(zipPath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`
    execFile('powershell.exe', ['-NoProfile', '-Command', cmd], (err) => {
      if (err) reject(new Error(`ZIP 解压失败: ${err.message}`))
      else resolve()
    })
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
  const win = getWallpaperWindow()
  if (!win) return
  const send = () => {
    if (!win.isDestroyed()) {
      console.log('[wallpaper] restore 推送:', state.current?.name)
      win.webContents.send(IPC.WALLPAPER_LOAD, state.current)
      // web 类型壁纸启动主进程帧捕获
      if (state.current?.type === 'web') {
        setTimeout(() => startMainCapture(), 2000)
      }
    }
  }
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', send)
  } else {
    send()
  }
}
