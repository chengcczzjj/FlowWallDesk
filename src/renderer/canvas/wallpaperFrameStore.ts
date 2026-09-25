import type { WallpaperFramePayload } from '@shared/types'

interface ProcessedWallpaperFrame extends WallpaperFramePayload {
  sourceData: string
}

const currentFrames = new Map<string, ProcessedWallpaperFrame>()
const listeners = new Set<() => void>()
const pendingFrames = new Map<string, WallpaperFramePayload>()
const lastProcessedSourceFrames = new Map<string, string>()
let processingFrame = false
let activeDisplayKey: string | null = null
let activeSourceFrame: string | null = null
let blurCanvas: HTMLCanvasElement | null = null
let blurContext: CanvasRenderingContext2D | null = null

/** Minimum pixel blur baked into every frame before transparent-window composition. */
export const BASE_WALLPAPER_FRAME_BLUR_PX = 12

function hasSameBounds(left: WallpaperFramePayload, right: WallpaperFramePayload): boolean {
  return left.bounds.x === right.bounds.x &&
    left.bounds.y === right.bounds.y &&
    left.bounds.width === right.bounds.width &&
    left.bounds.height === right.bounds.height
}

function publishFrame(payload: WallpaperFramePayload, data: string): void {
  const current = currentFrames.get(payload.displayKey)
  if (
    current?.data === data &&
    current.bounds.x === payload.bounds.x &&
    current.bounds.y === payload.bounds.y &&
    current.bounds.width === payload.bounds.width &&
    current.bounds.height === payload.bounds.height
  ) return

  currentFrames.set(payload.displayKey, { ...payload, data, sourceData: payload.data })
  for (const listener of listeners) listener()
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
      const next = pendingFrames.entries().next().value as [string, WallpaperFramePayload] | undefined
      if (!next) break
      const [displayKey, payload] = next
      pendingFrames.delete(displayKey)
      const sourceFrame = payload.data
      activeDisplayKey = displayKey
      activeSourceFrame = sourceFrame
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
          publishFrame(payload, sourceFrame)
          processedSuccessfully = true
          continue
        }

        const screenWidth = Math.max(1, payload.bounds.width)
        const sourceBlurPx = Math.max(1.5, BASE_WALLPAPER_FRAME_BLUR_PX * bitmap.width / screenWidth)
        const bleed = Math.ceil(sourceBlurPx * 3)
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.filter = `blur(${sourceBlurPx}px) saturate(1.12)`
        ctx.drawImage(bitmap, -bleed, -bleed, canvas.width + bleed * 2, canvas.height + bleed * 2)
        ctx.filter = 'none'
        publishFrame(payload, canvas.toDataURL('image/jpeg', 0.68))
        processedSuccessfully = true
      } catch (error) {
        console.warn('[canvas] wallpaper frame pre-blur failed; using CSS fallback:', error)
        publishFrame(payload, sourceFrame)
      } finally {
        if (processedSuccessfully) lastProcessedSourceFrames.set(displayKey, sourceFrame)
        activeDisplayKey = null
        activeSourceFrame = null
        bitmap?.close()
      }
    }
  } finally {
    processingFrame = false
    if (pendingFrames.size > 0) void processPendingFrames()
  }
}

export function setWallpaperFrame(payload: WallpaperFramePayload): void {
  if (!payload?.displayKey || !payload.data || payload.bounds.width <= 0 || payload.bounds.height <= 0) return
  const frame = payload.data
  const current = currentFrames.get(payload.displayKey)
  if (current?.sourceData === frame) {
    if (!hasSameBounds(current, payload)) publishFrame(payload, current.data)
    return
  }
  const pending = pendingFrames.get(payload.displayKey)
  const lastProcessedSourceFrame = lastProcessedSourceFrames.get(payload.displayKey)
  if (
    (frame === pending?.data && hasSameBounds(pending, payload)) ||
    (payload.displayKey === activeDisplayKey && frame === activeSourceFrame) ||
    (!processingFrame && frame === lastProcessedSourceFrame)
  ) return
  pendingFrames.set(payload.displayKey, payload)
  void processPendingFrames()
}

/** Return the monitor-local frame containing the absolute desktop point. */
export function getWallpaperFrameAt(x: number, y: number): ProcessedWallpaperFrame | null {
  const frames = [...currentFrames.values()]
  const containing = frames.find((frame) => (
    x >= frame.bounds.x &&
    y >= frame.bounds.y &&
    x < frame.bounds.x + frame.bounds.width &&
    y < frame.bounds.y + frame.bounds.height
  ))
  if (containing) return containing
  return frames.sort((left, right) => {
    const leftX = left.bounds.x + left.bounds.width / 2 - x
    const leftY = left.bounds.y + left.bounds.height / 2 - y
    const rightX = right.bounds.x + right.bounds.width / 2 - x
    const rightY = right.bounds.y + right.bounds.height / 2 - y
    return leftX * leftX + leftY * leftY - (rightX * rightX + rightY * rightY)
  })[0] ?? null
}

/** Compatibility accessor for callers that do not need monitor selection. */
export function getWallpaperFrame(): string | null {
  return currentFrames.values().next().value?.data ?? null
}

export function subscribeWallpaperFrame(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
