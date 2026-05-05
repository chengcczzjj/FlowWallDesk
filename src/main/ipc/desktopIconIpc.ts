import { app, ipcMain, nativeImage, shell } from 'electron'
import { promises as fs } from 'fs'
import { dirname, extname, join, normalize, parse } from 'path'
import { randomUUID } from 'crypto'
import { spawn } from 'child_process'
import { IPC } from '@shared/ipc-channels'
import type {
  DesktopIconImportResult,
  DesktopIconItem,
  DesktopIconLaunchResult,
  DesktopIconRestoreResult,
  WidgetInstance,
} from '@shared/types'
import { store } from '../store'
import { getCanvasWindow } from '../windows/canvasWindow'

const ICON_WIDGET_TYPES = new Set([
  'desktop-icons-box',
  'desktop-icons-horizontal',
  'desktop-icons-adaptive',
  'desktop-icons-dock',
])

export function isDesktopIconWidgetType(type: string): boolean {
  return ICON_WIDGET_TYPES.has(type)
}

function getWallpaperRoot(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'assets', 'wallpaper')
  }
  return join(__dirname, '../../assets/wallpaper')
}

function syncToCanvas(list: WidgetInstance[]): void {
  const win = getCanvasWindow()
  if (win && !win.isDestroyed()) win.webContents.send(IPC.WIDGET_SYNC, list)
}

async function saveWidgetsToWallpaper(): Promise<void> {
  try {
    const current = store.get('wallpaper')?.current
    if (!current) return
    const folder = join(getWallpaperRoot(), current.id)
    const widgets = store.get('widgets').filter((widget) => !isDesktopIconWidgetType(widget.type))
    await fs.writeFile(join(folder, 'widget-config.json'), JSON.stringify({ widgets }, null, 2), 'utf-8')
  } catch {
    /* ignore */
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object')
}

function isDesktopIconItem(value: unknown): value is DesktopIconItem {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.originalPath === 'string' &&
    typeof value.managedPath === 'string' &&
    typeof value.removedFromDesktop === 'boolean'
  )
}

function getDesktopIconItems(widget: WidgetInstance): DesktopIconItem[] {
  const config = widget.config
  if (!isRecord(config) || !Array.isArray(config.items)) return []
  return config.items.filter(isDesktopIconItem)
}

function safeSegment(value: string): string {
  const normalized = Array.from(value)
    .map((char) => {
      const code = char.charCodeAt(0)
      return code < 32 || '<>:"/\\|?*'.includes(char) ? '_' : char
    })
    .join('')
  return normalized.slice(0, 140) || 'item'
}

function expandWindowsEnv(value?: string): string | undefined {
  if (!value) return undefined
  return value.replace(/%([^%]+)%/g, (match, key: string) => process.env[key] ?? match)
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function nextAvailablePath(folder: string, fileName: string): Promise<string> {
  const parsed = parse(fileName)
  const base = safeSegment(parsed.name)
  const ext = safeSegment(parsed.ext).replace(/^_+/, '.')
  for (let i = 0; i < 1000; i += 1) {
    const suffix = i === 0 ? '' : ` (${i})`
    const candidate = join(folder, `${base}${suffix}${ext}`)
    if (!(await pathExists(candidate))) return candidate
  }
  return join(folder, `${base}-${Date.now()}${ext}`)
}

function getManagedDir(widgetId: string): string {
  return join(app.getPath('userData'), 'desktop-icons', safeSegment(widgetId))
}

function getDesktopRoots(): string[] {
  const roots = [app.getPath('desktop')]
  const publicDesktop = process.env.PUBLIC ? join(process.env.PUBLIC, 'Desktop') : 'C:\\Users\\Public\\Desktop'
  roots.push(publicDesktop)
  return roots.map((root) => normalize(root).toLowerCase())
}

function isFromDesktop(filePath: string): boolean {
  const normalized = normalize(filePath).toLowerCase()
  return getDesktopRoots().some((root) => {
    const prefix = root.endsWith('\\') ? root : `${root}\\`
    return normalized === root || normalized.startsWith(prefix)
  })
}

async function movePath(sourcePath: string, targetPath: string): Promise<void> {
  try {
    await fs.rename(sourcePath, targetPath)
    return
  } catch {
    const stat = await fs.stat(sourcePath)
    if (stat.isDirectory()) {
      await fs.cp(sourcePath, targetPath, { recursive: true })
      await fs.rm(sourcePath, { recursive: true, force: true })
    } else {
      await fs.copyFile(sourcePath, targetPath)
      await fs.unlink(sourcePath)
    }
  }
}

interface IconCandidate {
  path?: string
  index?: number
}

type IconCandidateInput = string | IconCandidate | undefined

async function readIconData(candidates: IconCandidateInput[]): Promise<string | undefined> {
  for (const candidate of candidates) {
    for (const { path: filePath } of iconFilePathCandidates(candidate)) {
      if (!filePath) continue
      if (!(await pathExists(filePath))) continue
      try {
        const directImage = readImageFileIcon(filePath)
        if (directImage) return directImage
        const image = await app.getFileIcon(filePath, { size: 'large' })
        if (!image.isEmpty()) return image.toDataURL()
      } catch {
        /* try next candidate */
      }
    }
  }
  return undefined
}

function readImageFileIcon(filePath: string): string | undefined {
  if (!['.ico', '.png', '.jpg', '.jpeg'].includes(extname(filePath).toLowerCase())) return undefined
  const image = nativeImage.createFromPath(filePath)
  if (image.isEmpty()) return undefined
  return image.toDataURL()
}

function iconFilePathCandidates(value?: IconCandidateInput): IconCandidate[] {
  const rawPath = typeof value === 'string' ? value : value?.path
  const expanded = expandWindowsEnv(rawPath)?.trim().replace(/^"(.+)"$/, '$1')
  if (!expanded) return []
  const withoutIconIndex = expanded.replace(/,\s*-?\d+$/, '').trim()
  return [...new Set([expanded, withoutIconIndex].filter(Boolean))].map((path) => ({
    path,
    index: typeof value === 'object' ? value.index : undefined,
  }))
}

function isShortcutLikePath(filePath?: string): boolean {
  if (!filePath) return false
  const extension = extname(filePath).toLowerCase()
  return extension === '.lnk' || extension === '.url'
}

function shortcutIconIndex(shortcut?: Electron.ShortcutDetails): number | undefined {
  return typeof shortcut?.iconIndex === 'number' ? shortcut.iconIndex : undefined
}

function iconCandidatesFor(
  extension: string,
  sourcePath: string,
  iconSourcePath?: string,
  targetPath?: string,
  iconIndex?: number
): IconCandidateInput[] {
  if (extension === '.lnk') {
    const preferredIcon = iconSourcePath && !isShortcutLikePath(iconSourcePath) ? iconSourcePath : undefined
    return [{ path: preferredIcon, index: iconIndex }, targetPath, { path: iconSourcePath, index: iconIndex }, sourcePath]
  }
  return [sourcePath, iconSourcePath, targetPath]
}

function getDisplayName(filePath: string): string {
  const parsed = parse(filePath)
  const ext = parsed.ext.toLowerCase()
  return ext === '.lnk' || ext === '.url' ? parsed.name : parsed.base
}

function readShortcut(filePath: string): Electron.ShortcutDetails | undefined {
  if (process.platform !== 'win32' || extname(filePath).toLowerCase() !== '.lnk') return undefined
  try {
    return shell.readShortcutLink(filePath)
  } catch {
    return undefined
  }
}

async function readInternetShortcutUrl(filePath: string): Promise<string | undefined> {
  if (extname(filePath).toLowerCase() !== '.url') return undefined
  try {
    const text = await fs.readFile(filePath, 'utf-8')
    const match = text.match(/^\s*URL\s*=\s*(.+?)\s*$/im)
    return match?.[1]?.trim()
  } catch {
    return undefined
  }
}

function splitShortcutArgs(args?: string): string[] {
  if (!args) return []
  const result: string[] = []
  const pattern = /"((?:\\"|[^"])*)"|'([^']*)'|(\S+)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(args))) {
    result.push((match[1] ?? match[2] ?? match[3] ?? '').replace(/\\"/g, '"'))
  }
  return result
}

function launchTarget(targetPath: string, args?: string, cwd?: string): boolean {
  try {
    const child = spawn(targetPath, splitShortcutArgs(args), {
      cwd: cwd || dirname(targetPath),
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    })
    child.unref()
    return true
  } catch {
    return false
  }
}

function launchWithShellStart(filePath: string): boolean {
  try {
    const escaped = filePath.replace(/"/g, '""')
    const child = spawn('cmd.exe', ['/d', '/s', '/c', `start "" "${escaped}"`], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.unref()
    return true
  } catch {
    return false
  }
}

async function launchExistingPath(filePath: string): Promise<boolean> {
  const error = await shell.openPath(filePath)
  if (!error) return true
  return launchWithShellStart(filePath)
}

async function importOneDesktopIcon(widgetId: string, sourcePath: string): Promise<DesktopIconItem> {
  if (!(await pathExists(sourcePath))) throw new Error('文件不存在')

  const id = randomUUID()
  const shortcut = readShortcut(sourcePath)
  const externalUrl = await readInternetShortcutUrl(sourcePath)
  const stat = await fs.stat(sourcePath)
  const extension = extname(sourcePath).toLowerCase()
  const targetPath = expandWindowsEnv(shortcut?.target)
  const iconSourcePath = expandWindowsEnv(shortcut?.icon) || targetPath
  const iconIndex = shortcutIconIndex(shortcut)
  const iconData = await readIconData(iconCandidatesFor(extension, sourcePath, iconSourcePath, targetPath, iconIndex))
  const removeOriginal = isFromDesktop(sourcePath)
  let managedPath = sourcePath

  if (removeOriginal) {
    const managedDir = getManagedDir(widgetId)
    await fs.mkdir(managedDir, { recursive: true })
    const originalName = parse(sourcePath).base
    const targetName = `${id}-${safeSegment(originalName) || `icon${extname(sourcePath)}`}`
    managedPath = await nextAvailablePath(managedDir, targetName)
    await movePath(sourcePath, managedPath)
  }

  return {
    id,
    name: getDisplayName(sourcePath),
    originalPath: sourcePath,
    managedPath,
    iconData,
    targetPath,
    targetArgs: shortcut?.args,
    workingDirectory: expandWindowsEnv(shortcut?.cwd),
    iconSourcePath,
    iconIndex,
    externalUrl,
    extension,
    isDirectory: stat.isDirectory(),
    removedFromDesktop: removeOriginal,
    addedAt: Date.now(),
  }
}

async function getBestExistingPath(item: DesktopIconItem): Promise<string | undefined> {
  for (const candidate of [item.managedPath, item.originalPath, item.targetPath]) {
    const filePath = expandWindowsEnv(candidate)
    if (filePath && (await pathExists(filePath))) return filePath
  }
  return undefined
}

async function hydrateDesktopIconItem(item: DesktopIconItem): Promise<DesktopIconItem> {
  const sourcePath = await getBestExistingPath(item)
  if (!sourcePath) return item

  const shortcut = readShortcut(sourcePath)
  const externalUrl = await readInternetShortcutUrl(sourcePath)
  const sourceExtension = extname(sourcePath).toLowerCase()
  const extension = item.extension || sourceExtension
  const targetPath = expandWindowsEnv(shortcut?.target) || item.targetPath
  const iconSourcePath = expandWindowsEnv(shortcut?.icon) || item.iconSourcePath || targetPath
  const iconIndex = shortcutIconIndex(shortcut) ?? item.iconIndex
  const iconData = await readIconData([
    ...iconCandidatesFor(extension, sourcePath, iconSourcePath, targetPath, iconIndex),
    item.originalPath,
  ])
  let isDirectory = item.isDirectory

  try {
    isDirectory = (await fs.stat(sourcePath)).isDirectory()
  } catch {
    /* keep old value */
  }

  return {
    ...item,
    targetPath,
    targetArgs: shortcut?.args ?? item.targetArgs,
    workingDirectory: expandWindowsEnv(shortcut?.cwd) ?? item.workingDirectory,
    iconSourcePath,
    iconIndex,
    externalUrl: externalUrl ?? item.externalUrl,
    extension,
    isDirectory,
    iconData: iconData ?? item.iconData,
  }
}

function appendItemsToWidget(widgetId: string, items: DesktopIconItem[]): boolean {
  const widgets = store.get('widgets')
  const target = widgets.find((widget) => widget.id === widgetId)
  if (!target || !isDesktopIconWidgetType(target.type)) return false

  const config = isRecord(target.config) ? target.config : {}
  const existing = Array.isArray(config.items) ? config.items.filter(isDesktopIconItem) : []
  const nextItems = [...existing, ...items].map((item, index) => ({ ...item, order: item.order ?? index }))
  const updated = widgets.map((widget) =>
    widget.id === widgetId ? { ...widget, config: { ...config, items: nextItems } } : widget
  )
  store.set('widgets', updated)
  syncToCanvas(updated)
  void saveWidgetsToWallpaper()
  return true
}

export async function restoreDesktopIconsForWidget(
  widgetOrId: WidgetInstance | string
): Promise<DesktopIconRestoreResult> {
  const widget =
    typeof widgetOrId === 'string'
      ? store.get('widgets').find((item) => item.id === widgetOrId)
      : widgetOrId
  if (!widget || !isDesktopIconWidgetType(widget.type)) return { ok: true, restored: [], skipped: [] }

  const restored: string[] = []
  const skipped: string[] = []
  const items = getDesktopIconItems(widget)

  for (const item of items) {
    if (!item.removedFromDesktop) continue
    try {
      if (!(await pathExists(item.managedPath))) {
        skipped.push(`${item.name}: 托管文件不存在`)
        continue
      }
      const targetFolder = dirname(item.originalPath || join(app.getPath('desktop'), item.name))
      await fs.mkdir(targetFolder, { recursive: true })
      const targetPath = await nextAvailablePath(targetFolder, parse(item.originalPath || item.name).base)
      await movePath(item.managedPath, targetPath)
      restored.push(targetPath)
    } catch (error) {
      skipped.push(`${item.name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  try {
    await fs.rm(getManagedDir(widget.id), { recursive: true, force: true })
  } catch {
    /* ignore */
  }

  return { ok: skipped.length === 0, restored, skipped }
}

export async function launchDesktopIcon(item: DesktopIconItem): Promise<DesktopIconLaunchResult> {
  const hydrated = await hydrateDesktopIconItem(item)

  if (hydrated.externalUrl) {
    try {
      await shell.openExternal(hydrated.externalUrl)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  let lastError = '文件不存在或无法启动'

  const shortcutCandidates = [hydrated.managedPath, hydrated.originalPath].filter(
    (filePath) => filePath && isShortcutLikePath(filePath)
  )

  for (const filePath of shortcutCandidates) {
    if (!(await pathExists(filePath))) continue
    if (await launchExistingPath(filePath)) return { ok: true }
  }

  const targetPath = expandWindowsEnv(hydrated.targetPath)
  if (targetPath && (await pathExists(targetPath))) {
    if (launchTarget(targetPath, hydrated.targetArgs, hydrated.workingDirectory)) return { ok: true }
    const error = await shell.openPath(targetPath)
    if (!error) return { ok: true }
    lastError = error
  }

  const candidates = [hydrated.managedPath, hydrated.originalPath].filter(Boolean)

  for (const filePath of candidates) {
    if (!(await pathExists(filePath))) continue
    if (await launchExistingPath(filePath)) return { ok: true }
    lastError = 'Shell 启动失败'
  }

  return { ok: false, error: lastError }
}

export function registerDesktopIconIpc(): void {
  ipcMain.handle(IPC.DESKTOP_ICON_IMPORT, async (_event, widgetId: string, filePaths: string[]) => {
    const result: DesktopIconImportResult = { ok: false, items: [], skipped: [] }
    if (!widgetId || !Array.isArray(filePaths) || filePaths.length === 0) {
      return { ...result, error: '没有可导入的图标' }
    }

    const uniquePaths = [...new Set(filePaths.filter((item) => typeof item === 'string' && item.trim()))]
    for (const filePath of uniquePaths) {
      try {
        result.items.push(await importOneDesktopIcon(widgetId, filePath))
      } catch (error) {
        result.skipped?.push(`${filePath}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    if (result.items.length > 0 && !appendItemsToWidget(widgetId, result.items)) {
      return { ok: false, items: [], skipped: result.skipped, error: '目标组件不存在' }
    }

    return { ...result, ok: result.items.length > 0 }
  })

  ipcMain.handle(IPC.DESKTOP_ICON_LAUNCH, (_event, item: DesktopIconItem) => launchDesktopIcon(item))

  ipcMain.handle(IPC.DESKTOP_ICON_REFRESH, async (_event, items: DesktopIconItem[]) => {
    if (!Array.isArray(items)) return []
    return Promise.all(items.filter(isDesktopIconItem).map((item) => hydrateDesktopIconItem(item)))
  })
}