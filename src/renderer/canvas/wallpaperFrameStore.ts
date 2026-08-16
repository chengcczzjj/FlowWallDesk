let currentFrame: string | null = null
const listeners = new Set<() => void>()
let pendingFrame: string | null = null
let processingFrame = false
let activeSourceFrame: string | null = null
let lastProcessedSourceFrame: string | null = null
let blurCanvas: HTMLCanvasElement | null = null
let blurContext: CanvasRenderingContext2D | null = null

/** Minimum pixel blur baked into every frame before transparent-window composition. */
export const BASE_WALLPAPER_FRAME_BLUR_PX = 12

function publishFrame(frame: string): void {
  if (frame === currentFrame) return
  currentFrame = frame
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
    while (pendingFrame) {
      const sourceFrame = pendingFrame
      pendingFrame = null
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
          publishFrame(sourceFrame)
          processedSuccessfully = true
          continue
        }

        const screenWidth = Math.max(1, window.screen.width || window.innerWidth)
        const sourceBlurPx = Math.max(1.5, BASE_WALLPAPER_FRAME_BLUR_PX * bitmap.width / screenWidth)
        const bleed = Math.ceil(sourceBlurPx * 3)
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.filter = `blur(${sourceBlurPx}px) saturate(1.12)`
        ctx.drawImage(bitmap, -bleed, -bleed, canvas.width + bleed * 2, canvas.height + bleed * 2)
        ctx.filter = 'none'
        publishFrame(canvas.toDataURL('image/jpeg', 0.68))
        processedSuccessfully = true
      } catch (error) {
        console.warn('[canvas] wallpaper frame pre-blur failed; using CSS fallback:', error)
        publishFrame(sourceFrame)
      } finally {
        if (processedSuccessfully) lastProcessedSourceFrame = sourceFrame
        activeSourceFrame = null
        bitmap?.close()
      }
    }
  } finally {
    processingFrame = false
    if (pendingFrame) void processPendingFrames()
  }
}

export function setWallpaperFrame(frame: string): void {
  if (
    !frame ||
    frame === pendingFrame ||
    frame === activeSourceFrame ||
    (!processingFrame && frame === lastProcessedSourceFrame)
  ) return
  pendingFrame = frame
  void processPendingFrames()
}

export function getWallpaperFrame(): string | null {
  return currentFrame
}

export function subscribeWallpaperFrame(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
