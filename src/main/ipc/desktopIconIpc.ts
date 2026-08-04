import { app, ipcMain, Menu, nativeImage, shell } from 'electron'
import { promises as fs } from 'fs'
import { basename, dirname, extname, join, normalize, parse } from 'path'
import { randomUUID } from 'crypto'
import { spawn } from 'child_process'
import { IPC } from '@shared/ipc-channels'
import { assertTrustedIpcSender } from './ipcSecurity'
import type {
  DesktopIconImportResult,
  DesktopIconContextMenuResult,
  DesktopIconItem,
  DesktopIconLaunchResult,
  DesktopIconRestoreResult,
  WidgetInstance,
} from '@shared/types'
import { store } from '../store'
import { getCanvasWindow } from '../windows/canvasWindow'
import { activateExistingAppWindow } from '../windows/foregroundAppWindow'
import { logDockDiagnostic } from '../runtime/diagnosticLog'

const ICON_WIDGET_TYPES = new Set([
  'desktop-icons-box',
  'desktop-icons-horizontal',
  'desktop-icons-adaptive',
  'desktop-icons-dock',
])
const IMPORT_CONCURRENCY = 4
const postLaunchActivationGeneration = new Map<string, number>()

export function isDesktopIconWidgetType(type: string): boolean {
  return ICON_WIDGET_TYPES.has(type)
}

function syncToCanvas(list: WidgetInstance[]): void {
  const win = getCanvasWindow()
  if (win && !win.isDestroyed()) win.webContents.send(IPC.WIDGET_SYNC, list)
}

function persistWidgets(list: WidgetInstance[]): void {
  store.set('widgets', list)
  store.set('globalIconWidgets', list.filter((widget) => isDesktopIconWidgetType(widget.type)))
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

export function getDesktopIconItems(widget: WidgetInstance): DesktopIconItem[] {
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

function pathKey(filePath?: string): string | undefined {
  const expanded = expandWindowsEnv(filePath)
  return expanded ? normalize(expanded).toLowerCase() : undefined
}

function isFromDesktop(filePath: string): boolean {
  const normalized = normalize(filePath).toLowerCase()
  return getDesktopRoots().some((root) => {
    const prefix = root.endsWith('\\') ? root : `${root}\\`
    return normalized === root || normalized.startsWith(prefix)
  })
}

async function movePath(sourcePath: string, targetPath: string): Promise<void> {
  await fs.rename(sourcePath, targetPath)
}

async function restoreManagedPath(sourcePath: string, targetPath: string): Promise<void> {
  try {
    await fs.rename(sourcePath, targetPath)
    return
  } catch {
    const stat = await fs.stat(sourcePath)
    if (stat.isDirectory()) {
      await fs.cp(sourcePath, targetPath, { recursive: true })
      try {
        await fs.rm(sourcePath, { recursive: true, force: true })
      } catch {
        /* restored copy is already available; keep the managed duplicate */
      }
    } else {
      await fs.copyFile(sourcePath, targetPath)
      try {
        await fs.unlink(sourcePath)
      } catch {
        /* restored copy is already available; keep the managed duplicate */
      }
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
        const dataUrl = imageToDataUrl(image)
        if (dataUrl) return dataUrl
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
  return imageToDataUrl(image)
}

function imageToDataUrl(image: Electron.NativeImage): string | undefined {
  if (image.isEmpty()) return undefined
  try {
    const dataUrl = image.toDataURL({ scaleFactor: 2 })
    if (dataUrl) return dataUrl
  } catch {
    /* fall back to the default representation */
  }
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
  if (extension === '.url') return [{ path: iconSourcePath, index: iconIndex }, sourcePath]
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

interface InternetShortcutDetails {
  url?: string
  iconFile?: string
  iconIndex?: number
}

async function readInternetShortcut(filePath: string): Promise<InternetShortcutDetails> {
  if (extname(filePath).toLowerCase() !== '.url') return {}
  try {
    const text = await fs.readFile(filePath, 'utf-8')
    const url = text.match(/^\s*URL\s*=\s*(.+?)\s*$/im)?.[1]?.trim()
    const iconFile = text.match(/^\s*IconFile\s*=\s*(.+?)\s*$/im)?.[1]?.trim()
    const iconIndexText = text.match(/^\s*IconIndex\s*=\s*(-?\d+)\s*$/im)?.[1]
    const iconIndex = iconIndexText === undefined ? undefined : Number.parseInt(iconIndexText, 10)
    return { url, iconFile, iconIndex: Number.isFinite(iconIndex) ? iconIndex : undefined }
  } catch {
    return {}
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

function launchTarget(targetPath: string, args?: string, cwd?: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (ok: boolean): void => {
      if (settled) return
      settled = true
      resolve(ok)
    }
    try {
      const child = spawn(targetPath, splitShortcutArgs(args), {
        cwd: cwd || dirname(targetPath),
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      })
      child.once('spawn', () => finish(true))
      child.once('error', () => finish(false))
      child.unref()
    } catch {
      finish(false)
    }
  })
}

function launchWithShellStart(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (ok: boolean): void => {
      if (settled) return
      settled = true
      resolve(ok)
    }
    try {
      const escaped = filePath.replace(/"/g, '""')
      const child = spawn('cmd.exe', ['/d', '/s', '/c', `start "" "${escaped}"`], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      })
      child.once('spawn', () => finish(true))
      child.once('error', () => finish(false))
      child.unref()
    } catch {
      finish(false)
    }
  })
}

async function launchExistingPath(filePath: string, requestId: string): Promise<'shortcut' | 'fallback-shell' | null> {
  const error = await shell.openPath(filePath)
  logDockDiagnostic('launch.shell-open-path-result', {
    requestId,
    fileName: basename(filePath),
    ok: !error,
    error: error || null,
  })
  if (!error) return 'shortcut'
  return await launchWithShellStart(filePath) ? 'fallback-shell' : null
}

function schedulePostLaunchActivation(targetPath: string, requestId: string): void {
  const key = normalize(targetPath).toLowerCase()
  const generation = (postLaunchActivationGeneration.get(key) ?? 0) + 1
  postLaunchActivationGeneration.set(key, generation)

  for (const delayMs of [800, 3_000, 7_000]) {
    const timer = setTimeout(() => {
      if (postLaunchActivationGeneration.get(key) !== generation) return
      const result = activateExistingAppWindow(targetPath)
      logDockDiagnostic('launch.post-activation-result', {
        requestId,
        targetFile: basename(targetPath),
        delayMs,
        found: result.found,
        activated: result.activated,
        processId: result.processId ?? null,
        windowTitle: result.title ?? null,
        windowClass: result.className ?? null,
        windowRect: result.rect ?? null,
        error: result.error ?? null,
      })
      if (result.activated || delayMs === 7_000) postLaunchActivationGeneration.delete(key)
    }, delayMs)
    timer.unref()
  }
}

async function importOneDesktopIcon(widgetId: string, sourcePath: string): Promise<DesktopIconItem> {
  if (!(await pathExists(sourcePath))) throw new Error('文件不存在')

  const id = randomUUID()
  const shortcut = readShortcut(sourcePath)
  const internetShortcut = await readInternetShortcut(sourcePath)
  const externalUrl = internetShortcut.url
  const stat = await fs.stat(sourcePath)
  const extension = extname(sourcePath).toLowerCase()
  const targetPath = expandWindowsEnv(shortcut?.target)
  const iconSourcePath = expandWindowsEnv(shortcut?.icon) || expandWindowsEnv(internetShortcut.iconFile) || targetPath
  const iconIndex = shortcutIconIndex(shortcut) ?? internetShortcut.iconIndex
  const iconData = await readIconData(iconCandidatesFor(extension, sourcePath, iconSourcePath, targetPath, iconIndex))
  const removeOriginal = isFromDesktop(sourcePath)
  let managedPath = sourcePath

  if (removeOriginal) {
    const managedDir = getManagedDir(widgetId)
    await fs.mkdir(managedDir, { recursive: true })
    const originalName = parse(sourcePath).base
    const targetName = `${id}-${safeSegment(originalName) || `icon${extname(sourcePath)}`}`
    managedPath = await nextAvailablePath(managedDir, targetName)
    try {
      await movePath(sourcePath, managedPath)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`移动到托管目录失败，原文件已保留：${message}`)
    }
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

function findReusableDesktopIconItem(widgetId: string, sourcePath: string): DesktopIconItem | undefined {
  const sourceKey = pathKey(sourcePath)
  if (!sourceKey) return undefined

  for (const widget of store.get('widgets')) {
    if (widget.id === widgetId || !isDesktopIconWidgetType(widget.type)) continue
    for (const item of getDesktopIconItems(widget)) {
      if (pathKey(item.originalPath) === sourceKey || pathKey(item.managedPath) === sourceKey) return item
    }
  }
  return undefined
}

async function importDesktopIconForWidget(widgetId: string, sourcePath: string): Promise<DesktopIconItem> {
  try {
    return await importOneDesktopIcon(widgetId, sourcePath)
  } catch (error) {
    const reusable = findReusableDesktopIconItem(widgetId, sourcePath)
    if (!reusable) throw error

    const existingPath = await getBestExistingPath(reusable)
    if (!existingPath) throw error

    return {
      ...reusable,
      id: randomUUID(),
      order: undefined,
      removedFromDesktop: false,
      addedAt: Date.now(),
    }
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
  const internetShortcut = await readInternetShortcut(sourcePath)
  const externalUrl = internetShortcut.url
  const sourceExtension = extname(sourcePath).toLowerCase()
  const extension = item.extension || sourceExtension
  const targetPath = expandWindowsEnv(shortcut?.target) || item.targetPath
  const iconSourcePath = expandWindowsEnv(shortcut?.icon) || expandWindowsEnv(internetShortcut.iconFile) || item.iconSourcePath || targetPath
  const iconIndex = shortcutIconIndex(shortcut) ?? internetShortcut.iconIndex ?? item.iconIndex
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

function persistHydratedDesktopIconItems(hydratedItems: DesktopIconItem[]): void {
  const hydratedById = new Map(hydratedItems.map((item) => [item.id, item]))
  if (hydratedById.size === 0) return

  let changed = false
  const updated = store.get('widgets').map((widget) => {
    if (!isDesktopIconWidgetType(widget.type)) return widget
    let widgetChanged = false
    const nextItems = getDesktopIconItems(widget).map((item) => {
      const hydrated = hydratedById.get(item.id)
      if (!hydrated) return item
      widgetChanged = true
      return { ...hydrated, order: item.order }
    })
    if (!widgetChanged) return widget
    changed = true
    const config = isRecord(widget.config) ? widget.config : {}
    return { ...widget, config: { ...config, items: nextItems } }
  })

  if (!changed) return
  persistWidgets(updated)
  syncToCanvas(updated)
}

function appendItemsToWidget(widgetId: string, items: DesktopIconItem[]): boolean {
  const widgets = store.get('widgets')
  const target = widgets.find((widget) => widget.id === widgetId)
  if (!target || !isDesktopIconWidgetType(target.type)) return false

  const config = isRecord(target.config) ? target.config : {}
  const existing = Array.isArray(config.items) ? config.items.filter(isDesktopIconItem) : []
  const nextItems = [...existing, ...items].map((item, index) => ({ ...item, order: index }))
  const updated = widgets.map((widget) =>
    widget.id === widgetId ? { ...widget, config: { ...config, items: nextItems } } : widget
  )
  persistWidgets(updated)
  syncToCanvas(updated)
  return true
}

async function rollbackImportedDesktopIcon(item: DesktopIconItem): Promise<void> {
  if (!item.removedFromDesktop) return
  const result = await restoreOneDesktopIcon(item)
  if (!result.ok) {
    console.warn('[desktop-icons] rollback failed:', item.name, result.error)
  }
}

async function appendImportedItemToWidget(widgetId: string, item: DesktopIconItem): Promise<void> {
  try {
    if (!appendItemsToWidget(widgetId, [item])) throw new Error('目标组件不存在')
  } catch (error) {
    await rollbackImportedDesktopIcon(item)
    throw error
  }
}

function updateDesktopIconItems(
  widgetId: string,
  updater: (items: DesktopIconItem[], widget: WidgetInstance) => DesktopIconItem[]
): boolean {
  const widgets = store.get('widgets')
  const target = widgets.find((widget) => widget.id === widgetId)
  if (!target || !isDesktopIconWidgetType(target.type)) return false
  const nextItems = updater(getDesktopIconItems(target), target).map((item, index) => ({ ...item, order: index }))
  const nextConfig = { ...(target.config ?? {}), items: nextItems }
  const updated = widgets.map((widget) => (widget.id === widgetId ? { ...widget, config: nextConfig } : widget))
  persistWidgets(updated)
  syncToCanvas(updated)
  return true
}

function findStoredDesktopIcon(itemId: string, widgetId?: string): DesktopIconItem | undefined {
  const globalWidgets = store.get('globalIconWidgets')
  const widgets = [
    ...store.get('widgets'),
    ...(Array.isArray(globalWidgets) ? globalWidgets : []),
  ]
  const candidates = widgetId ? widgets.filter((widget) => widget.id === widgetId) : widgets
  for (const widget of candidates) {
    const item = getDesktopIconItems(widget).find((candidate) => candidate.id === itemId)
    if (item) return item
  }
  return undefined
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await mapper(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

async function restoreOneDesktopIcon(item: DesktopIconItem): Promise<{ ok: boolean; itemId: string; restoredPath?: string; error?: string }> {
  if (!item.removedFromDesktop) return { ok: true, itemId: item.id }

  const managedPath = expandWindowsEnv(item.managedPath)
  const originalPath = expandWindowsEnv(item.originalPath) || join(app.getPath('desktop'), item.name)
  if (!managedPath || !(await pathExists(managedPath))) {
    if (originalPath && (await pathExists(originalPath))) return { ok: true, itemId: item.id, restoredPath: originalPath }
    return { ok: false, itemId: item.id, error: '托管文件不存在' }
  }

  let lastError = '恢复失败'
  const fallbackDesktopPath = join(app.getPath('desktop'), parse(originalPath).base || item.name)
  const restoreTargets = [...new Set([originalPath, fallbackDesktopPath].filter(Boolean))]
  for (const desiredPath of restoreTargets) {
    try {
      const targetFolder = dirname(desiredPath)
      await fs.mkdir(targetFolder, { recursive: true })
      const targetPath = await nextAvailablePath(targetFolder, parse(desiredPath).base)
      await restoreManagedPath(managedPath, targetPath)
      return { ok: true, itemId: item.id, restoredPath: targetPath }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
  }
  return { ok: false, itemId: item.id, error: lastError }
}

async function removeEmptyManagedDir(widgetId: string): Promise<void> {
  try {
    await fs.rmdir(getManagedDir(widgetId))
  } catch {
    /* keep non-empty managed dirs so failed restore files are not lost */
  }
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
  const restoredItemIds: string[] = []
  const skipped: string[] = []
  const items = getDesktopIconItems(widget)

  for (const item of items) {
    if (!item.removedFromDesktop) continue
    const result = await restoreOneDesktopIcon(item)
    if (result.ok) {
      restoredItemIds.push(item.id)
      if (result.restoredPath) restored.push(result.restoredPath)
    } else {
      skipped.push(`${item.name}: ${result.error ?? '恢复失败'}`)
    }
  }

  await removeEmptyManagedDir(widget.id)

  return { ok: skipped.length === 0, restored, skipped, restoredItemIds }
}

async function revealDesktopIcon(item: DesktopIconItem): Promise<DesktopIconContextMenuResult> {
  const hydrated = await hydrateDesktopIconItem(item)
  for (const candidate of [hydrated.targetPath, hydrated.managedPath, hydrated.originalPath]) {
    const filePath = expandWindowsEnv(candidate)
    if (filePath && (await pathExists(filePath))) {
      shell.showItemInFolder(filePath)
      return { ok: true, action: 'show-in-folder' }
    }
  }
  return { ok: false, action: 'show-in-folder', error: '文件不存在，无法定位' }
}

async function restoreDesktopIconFromWidget(widgetId: string, item: DesktopIconItem): Promise<DesktopIconContextMenuResult> {
  const result = await restoreOneDesktopIcon(item)
  if (!result.ok) return { ok: false, action: 'restore', error: result.error ?? '恢复失败' }
  if (!updateDesktopIconItems(widgetId, (items) => items.filter((candidate) => candidate.id !== item.id))) {
    return { ok: false, action: 'restore', error: '目标组件不存在' }
  }
  await removeEmptyManagedDir(widgetId)
  return { ok: true, action: 'restore' }
}

function removeDesktopIconReference(widgetId: string, item: DesktopIconItem): DesktopIconContextMenuResult {
  if (!updateDesktopIconItems(widgetId, (items) => items.filter((candidate) => candidate.id !== item.id))) {
    return { ok: false, action: 'remove', error: '目标组件不存在' }
  }
  return { ok: true, action: 'remove' }
}

export async function launchDesktopIcon(
  item: DesktopIconItem,
  context: { requestId?: string; widgetId?: string } = {},
): Promise<DesktopIconLaunchResult> {
  const requestId = context.requestId ?? randomUUID()
  const startedAt = Date.now()
  const hydrated = await hydrateDesktopIconItem(item)
  const targetPath = expandWindowsEnv(hydrated.targetPath)
  logDockDiagnostic('launch.hydrated', {
    requestId,
    widgetId: context.widgetId ?? null,
    itemId: hydrated.id,
    itemName: hydrated.name,
    managedFile: basename(hydrated.managedPath),
    targetFile: targetPath ? basename(targetPath) : null,
    hasExternalUrl: Boolean(hydrated.externalUrl),
  })

  if (hydrated.externalUrl) {
    try {
      await shell.openExternal(hydrated.externalUrl)
      return { ok: true, requestId, method: 'external-url' }
    } catch (error) {
      return { ok: false, requestId, error: error instanceof Error ? error.message : String(error) }
    }
  }

  let lastError = '文件不存在或无法启动'

  if (
    targetPath &&
    !hydrated.targetArgs?.trim() &&
    extname(targetPath).toLowerCase() === '.exe' &&
    (await pathExists(targetPath))
  ) {
    const activation = activateExistingAppWindow(targetPath)
    logDockDiagnostic('launch.activate-existing-result', {
      requestId,
      targetFile: basename(targetPath),
      found: activation.found,
      activated: activation.activated,
      processId: activation.processId ?? null,
      windowTitle: activation.title ?? null,
      windowClass: activation.className ?? null,
      windowRect: activation.rect ?? null,
      error: activation.error ?? null,
    })
    if (activation.activated) {
      return {
        ok: true,
        requestId,
        method: 'activate-existing',
        activatedExisting: true,
      }
    }
  }

  const shortcutCandidates = [hydrated.managedPath, hydrated.originalPath].filter(
    (filePath) => filePath && isShortcutLikePath(filePath)
  )

  for (const filePath of shortcutCandidates) {
    if (!(await pathExists(filePath))) continue
    const method = await launchExistingPath(filePath, requestId)
    if (method) {
      if (targetPath && !hydrated.targetArgs?.trim() && extname(targetPath).toLowerCase() === '.exe') {
        schedulePostLaunchActivation(targetPath, requestId)
      }
      return { ok: true, requestId, method }
    }
  }

  if (targetPath && (await pathExists(targetPath))) {
    if (await launchTarget(targetPath, hydrated.targetArgs, hydrated.workingDirectory)) {
      logDockDiagnostic('launch.target-spawned', {
        requestId,
        targetFile: basename(targetPath),
        elapsedMs: Date.now() - startedAt,
      })
      if (!hydrated.targetArgs?.trim() && extname(targetPath).toLowerCase() === '.exe') {
        schedulePostLaunchActivation(targetPath, requestId)
      }
      return { ok: true, requestId, method: 'target-spawn' }
    }
    const error = await shell.openPath(targetPath)
    if (!error) {
      if (!hydrated.targetArgs?.trim() && extname(targetPath).toLowerCase() === '.exe') {
        schedulePostLaunchActivation(targetPath, requestId)
      }
      return { ok: true, requestId, method: 'target-shell' }
    }
    lastError = error
  }

  const candidates = [hydrated.managedPath, hydrated.originalPath].filter(Boolean)

  for (const filePath of candidates) {
    if (!(await pathExists(filePath))) continue
    const method = await launchExistingPath(filePath, requestId)
    if (method) return { ok: true, requestId, method }
    lastError = 'Shell 启动失败'
  }

  return { ok: false, requestId, error: lastError }
}

export function registerDesktopIconIpc(): void {
  ipcMain.handle(IPC.DESKTOP_ICON_IMPORT, async (_event, widgetId: string, filePaths: string[]) => {
    assertTrustedIpcSender(_event, ['canvas'])
    const result: DesktopIconImportResult = { ok: false, items: [], skipped: [] }
    if (!widgetId || !Array.isArray(filePaths) || filePaths.length === 0) {
      return { ...result, error: '没有可导入的图标' }
    }

    const widgets = store.get('widgets')
    const target = widgets.find((widget) => widget.id === widgetId)
    if (!target || !isDesktopIconWidgetType(target.type)) {
      return { ...result, error: '目标组件不存在' }
    }

    const uniquePaths = [...new Set(filePaths.filter((item) => typeof item === 'string' && item.trim()))]
    await mapWithConcurrency(uniquePaths, IMPORT_CONCURRENCY, async (filePath) => {
      try {
        const item = await importDesktopIconForWidget(widgetId, filePath)
        await appendImportedItemToWidget(widgetId, item)
        result.items.push(item)
      } catch (error) {
        result.skipped?.push(`${filePath}: ${error instanceof Error ? error.message : String(error)}`)
      }
    })

    return { ...result, ok: result.items.length > 0 }
  })

  ipcMain.handle(IPC.DESKTOP_ICON_LAUNCH, async (_event, widgetId: string, item: DesktopIconItem, suppliedRequestId?: string) => {
    assertTrustedIpcSender(_event, ['canvas'])
    const requestId = typeof suppliedRequestId === 'string' && /^[a-zA-Z0-9-]{8,80}$/.test(suppliedRequestId)
      ? suppliedRequestId
      : randomUUID()
    logDockDiagnostic('launch.ipc-received', {
      requestId,
      widgetId: typeof widgetId === 'string' ? widgetId : null,
      itemId: isDesktopIconItem(item) ? item.id : null,
    })
    const stored = typeof widgetId === 'string' && isDesktopIconItem(item)
      ? findStoredDesktopIcon(item.id, widgetId)
      : undefined
    if (!stored) {
      logDockDiagnostic('launch.stored-item-missing', { requestId, widgetId })
      return { ok: false, requestId, error: '桌面图标记录不存在。' }
    }
    const result = await launchDesktopIcon(stored, { requestId, widgetId })
    logDockDiagnostic('launch.completed', {
      requestId,
      widgetId,
      itemId: stored.id,
      ok: result.ok,
      method: result.method ?? null,
      activatedExisting: result.activatedExisting ?? false,
      error: result.error ?? null,
    })
    return result
  })

  ipcMain.handle(IPC.DESKTOP_ICON_REFRESH, async (_event, items: DesktopIconItem[]) => {
    assertTrustedIpcSender(_event, ['canvas'])
    if (!Array.isArray(items)) return []
    const storedItems = items
      .filter(isDesktopIconItem)
      .map((item) => findStoredDesktopIcon(item.id))
      .filter((item): item is DesktopIconItem => Boolean(item))
    const hydratedItems = await Promise.all(storedItems.map((item) => hydrateDesktopIconItem(item)))
    persistHydratedDesktopIconItems(hydratedItems)
    return hydratedItems
  })

  ipcMain.handle(IPC.DESKTOP_ICON_CONTEXT_MENU, async (_event, widgetId: string, item: DesktopIconItem) => {
    assertTrustedIpcSender(_event, ['canvas'])
    const win = getCanvasWindow()
    const storedItem = isDesktopIconItem(item) ? findStoredDesktopIcon(item.id, widgetId) : undefined
    if (!win || !storedItem) return null

    return new Promise<DesktopIconContextMenuResult | null>((resolve) => {
      let resolved = false
      const settleCancel = () => {
        if (resolved) return
        resolved = true
        resolve(null)
      }
      const runAction = async (action: () => Promise<DesktopIconContextMenuResult> | DesktopIconContextMenuResult) => {
        if (resolved) return
        resolved = true
        try {
          resolve(await action())
        } catch (error) {
          resolve({ ok: false, error: error instanceof Error ? error.message : String(error) })
        }
      }
      const menu = Menu.buildFromTemplate([
        {
          label: '打开',
          click: () => void runAction(async () => ({ ...(await launchDesktopIcon(storedItem)), action: 'open' })),
        },
        {
          label: '打开文件所在位置',
          click: () => void runAction(() => revealDesktopIcon(storedItem)),
        },
        { type: 'separator' },
        storedItem.removedFromDesktop
          ? {
              label: '移回桌面',
              click: () => void runAction(() => restoreDesktopIconFromWidget(widgetId, storedItem)),
            }
          : {
              label: '从收纳中移除',
              click: () => void runAction(() => removeDesktopIconReference(widgetId, storedItem)),
            },
      ])
      menu.popup({
        window: win,
        callback: settleCancel,
      })
    })
  })
}
