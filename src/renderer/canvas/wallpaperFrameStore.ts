let currentFrame: string | null = null
const listeners = new Set<() => void>()

export function setWallpaperFrame(frame: string): void {
  if (frame === currentFrame) return
  currentFrame = frame
  for (const listener of listeners) listener()
}

export function getWallpaperFrame(): string | null {
  return currentFrame
}

export function subscribeWallpaperFrame(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
