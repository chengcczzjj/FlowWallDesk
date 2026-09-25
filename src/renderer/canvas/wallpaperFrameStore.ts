import type { WallpaperFramePayload, WallpaperFrameSource } from '@shared/types'

/**
 * Pre-blurred wallpaper frames for frosted-glass widgets, one stream per
 * native wallpaper window. Non-span multi-monitor modes run one wallpaper
 * window per display, so a single frame stretched across the whole canvas
 * showed the primary wallpaper (misaligned) behind widgets on every screen.
 */
const currentFrames = new Map<string, string>()
const frameListeners = new Map<string, Set<() => void>>()
const pendingFrames = new Map<string, string>()
const activeSourceFrames = new Map<string, string>()
const lastProcessedSourceFrames = new Map<string, string>()
let processingFrame = false
let blurCanvas: HTMLCanvasElement | null = null
let blurContext: CanvasRenderingContext2D | null = null

let frameSources: WallpaperFrameSource[] = []
const sourceListeners = new Set<() => void>()

/** Minimum pixel blur baked into every frame before transparent-window composition. */
export const BASE_WALLPAPER_FRAME_BLUR_PX = 12

function notifyFrame(key: string): void {
  const listeners = frameListeners.get(key)
  if (!listeners) return
  for (const listener of listeners) listener()
}

function publishFrame(key: string, frame: string): void {
  // A frame can finish pre-blurring after its wallpaper window was removed.
  if (frameSources.length > 0 && !frameSources.some((source) => source.key === key)) return
  if (frame === currentFrames.get(key)) return
  currentFrames.set(key, frame)
  notifyFrame(key)
}

function getSourceWidth(key: string): number {
  const source = frameSources.find((candidate) => candidate.key === key)
  return Math.max(1, source?.bounds.width ?? (window.innerWidth || window.screen.width))
}

async function loadFrameBitmap(frame: string): Promise<ImageBitmap> {
  const response = await fetch(frame)
  const blob = await response.blob()
  return createImageBitmap(blob)
}

async function processPendingFrames(): Promise<void> {
  if (processingFrame) return
  processingFrame = true
  try {
    while (pendingFrames.size > 0) {
      const [key, sourceFrame] = pendingFrames.entries().next().value as [string, string]
      pendingFrames.delete(key)
      activeSourceFrames.set(key, sourceFrame)
      let bitmap: ImageBitmap | null = null
      let processedSuccessfully = false
      try {
        bitmap = await loadFrameBitmap(sourceFrame)
        const canvas = blurCanvas ?? document.createElement('canvas')
        blurCanvas = canvas
        if (canvas.width !== bitmap.width) canvas.width = bitmap.width
        if (canvas.height !== bitmap.height) canvas.height = bitmap.height
        const ctx = blurContext ?? canvas.getContext('2d')
        blurContext = ctx
        if (!ctx) {
          publishFrame(key, sourceFrame)
          processedSuccessfully = true
          continue
        }

        // The frame covers one wallpaper window, so scale the blur against
        // that window's width rather than the whole multi-monitor canvas.
        const sourceBlurPx = Math.max(1.5, BASE_WALLPAPER_FRAME_BLUR_PX * bitmap.width / getSourceWidth(key))
        const bleed = Math.ceil(sourceBlurPx * 3)
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.filter = `blur(${sourceBlurPx}px) saturate(1.12)`
        ctx.drawImage(bitmap, -bleed, -bleed, canvas.width + bleed * 2, canvas.height + bleed * 2)
        ctx.filter = 'none'
        publishFrame(key, canvas.toDataURL('image/jpeg', 0.68))
        processedSuccessfully = true
      } catch (error) {
        console.warn('[canvas] wallpaper frame pre-blur failed; using CSS fallback:', error)
        publishFrame(key, sourceFrame)
      } finally {
        if (processedSuccessfully) lastProcessedSourceFrames.set(key, sourceFrame)
        activeSourceFrames.delete(key)
        bitmap?.close()
      }
    }
  } finally {
    processingFrame = false
    if (pendingFrames.size > 0) void processPendingFrames()
  }
}

export function setWallpaperFrame(payload: WallpaperFramePayload): void {
  const key = payload?.key
  const frame = payload?.data
  if (typeof key !== 'string' || !key || typeof frame !== 'string' || !frame) return
  const activeSourceFrame = activeSourceFrames.get(key)
  const lastProcessedSourceFrame = lastProcessedSourceFrames.get(key)
  if (
    frame === pendingFrames.get(key) ||
    frame === activeSourceFrame ||
    (!activeSourceFrame && frame === lastProcessedSourceFrame)
  ) return
  pendingFrames.set(key, frame)
  void processPendingFrames()
}

export function getWallpaperFrame(key: string): string | null {
  return currentFrames.get(key) ?? null
}

export function subscribeWallpaperFrame(key: string, listener: () => void): () => void {
  let listeners = frameListeners.get(key)
  if (!listeners) {
    listeners = new Set()
    frameListeners.set(key, listeners)
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && frameListeners.get(key) === listeners) frameListeners.delete(key)
  }
}

function isValidSource(source: unknown): source is WallpaperFrameSource {
  if (!source || typeof source !== 'object') return false
  const { key, bounds } = source as Partial<WallpaperFrameSource>
  if (typeof key !== 'string' || !key || !bounds || typeof bounds !== 'object') return false
  return [bounds.x, bounds.y, bounds.width, bounds.height].every((value) => typeof value === 'number' && Number.isFinite(value)) &&
    bounds.width > 0 && bounds.height > 0
}

/** Replace the known wallpaper windows; frames of windows that no longer exist are dropped. */
export function setWallpaperFrameSources(next: readonly WallpaperFrameSource[] | null | undefined): void {
  const sources = Array.isArray(next) ? next.filter(isValidSource) : []
  const keys = new Set(sources.map((source) => source.key))
  const unchanged = sources.length === frameSources.length && sources.every((source, index) => {
    const previous = frameSources[index]
    return previous?.key === source.key &&
      previous.bounds.x === source.bounds.x && previous.bounds.y === source.bounds.y &&
      previous.bounds.width === source.bounds.width && previous.bounds.height === source.bounds.height
  })
  if (unchanged) return
  frameSources = sources.map((source) => ({ key: source.key, bounds: { ...source.bounds } }))
  const evicted = [...currentFrames.keys()].filter((key) => !keys.has(key))
  for (const key of evicted) {
    currentFrames.delete(key)
    notifyFrame(key)
  }
  for (const key of [...pendingFrames.keys()]) if (!keys.has(key)) pendingFrames.delete(key)
  for (const key of [...lastProcessedSourceFrames.keys()]) if (!keys.has(key)) lastProcessedSourceFrames.delete(key)
  for (const listener of sourceListeners) listener()
}

export function getWallpaperFrameSources(): readonly WallpaperFrameSource[] {
  return frameSources
}

export function subscribeWallpaperFrameSources(listener: () => void): () => void {
  sourceListeners.add(listener)
  return () => sourceListeners.delete(listener)
}
