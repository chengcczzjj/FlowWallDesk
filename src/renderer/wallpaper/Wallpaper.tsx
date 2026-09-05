import { getSynchronizedVideoTime, needsVideoTimeCorrection } from '@shared/wallpaper-playback'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { WallpaperItem, WallpaperDisplayLayout } from '@shared/types'
import { toAssetUrl } from '@shared/asset-url'
import { resolveWallpaperObjectFit } from '@shared/wallpaper-display-layout'

/** 将 flip 名称映射为 CSS transform */
function flipToTransform(f?: string): string {
  switch (f) {
    case '水平':
      return 'scaleX(-1)'
    case '垂直':
      return 'scaleY(-1)'
    default:
      return 'none'
  }
}

function getSourceSize(source: CanvasImageSource): { width: number; height: number } {
  if (source instanceof HTMLVideoElement) {
    return { width: source.videoWidth || source.clientWidth || 1, height: source.videoHeight || source.clientHeight || 1 }
  }
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth || source.clientWidth || 1, height: source.naturalHeight || source.clientHeight || 1 }
  }
  return { width: 1, height: 1 }
}

function drawWallpaperFrame(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
  surfaceBounds: { x: number; y: number; width: number; height: number },
  objectFit: React.CSSProperties['objectFit'],
  transform: string
): void {
  const sourceSize = getSourceSize(source)
  const outputScaleX = width / Math.max(1, viewportWidth)
  const outputScaleY = height / Math.max(1, viewportHeight)
  const surfaceX = surfaceBounds.x * outputScaleX
  const surfaceY = surfaceBounds.y * outputScaleY
  const surfaceWidth = surfaceBounds.width * outputScaleX
  const surfaceHeight = surfaceBounds.height * outputScaleY
  let drawWidth = surfaceWidth
  let drawHeight = surfaceHeight
  let drawX = 0
  let drawY = 0

  if (objectFit === 'cover' || objectFit === 'contain' || objectFit === 'scale-down') {
    const scale = objectFit === 'cover'
      ? Math.max(surfaceWidth / sourceSize.width, surfaceHeight / sourceSize.height)
      : Math.min(surfaceWidth / sourceSize.width, surfaceHeight / sourceSize.height)
    drawWidth = sourceSize.width * scale
    drawHeight = sourceSize.height * scale
    drawX = (surfaceWidth - drawWidth) / 2
    drawY = (surfaceHeight - drawHeight) / 2
  } else if (objectFit === 'none') {
    drawWidth = sourceSize.width * outputScaleX
    drawHeight = sourceSize.height * outputScaleY
    drawX = (surfaceWidth - drawWidth) / 2
    drawY = (surfaceHeight - drawHeight) / 2
  }

  ctx.clearRect(0, 0, width, height)
  ctx.save()
  ctx.translate(surfaceX, surfaceY)
  ctx.beginPath()
  ctx.rect(0, 0, surfaceWidth, surfaceHeight)
  ctx.clip()
  if (transform === 'scaleX(-1)') {
    ctx.translate(surfaceWidth, 0)
    ctx.scale(-1, 1)
  } else if (transform === 'scaleY(-1)') {
    ctx.translate(0, surfaceHeight)
    ctx.scale(1, -1)
  }
  ctx.drawImage(source, drawX, drawY, drawWidth, drawHeight)
  ctx.restore()
}

/** 壁纸窗口：根据 type 渲染 video / image / web(iframe)。 */
export function Wallpaper() {
  const [item, setItem] = useState<WallpaperItem | null>(null)
  const [layout, setLayout] = useState<WallpaperDisplayLayout | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [mediaReady, setMediaReady] = useState(false)
  const [videoStarted, setVideoStarted] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const playRetryTimerRef = useRef<number | null>(null)
  const playRequestGenerationRef = useRef(0)
  const readyReportedRef = useRef<string | null>(null)
  const captureErrorKeyRef = useRef<string | null>(null)
  const captureDemandRef = useRef(false)
  const pausedRef = useRef(false)
  const [captureDemanded, setCaptureDemanded] = useState(false)
  const [capturePaused, setCapturePaused] = useState(false)
  const activeItem = layout?.displays[0]?.item ?? item

  // Settings belong to this surface, never the primary window's legacy snapshot.
  const audioEnabled = layout?.playback?.audioEnabled !== false
  const volume = activeItem?.settings?.volume ?? 50
  const speed = activeItem?.settings?.speed ?? 1
  const scaling = activeItem?.settings?.scaling ?? '覆盖'
  const flip = activeItem?.settings?.flip ?? '无'
  const objectFit = resolveWallpaperObjectFit(layout?.mode, scaling)
  const transform = flipToTransform(flip)

  const clearPlayRetry = useCallback(() => {
    if (playRetryTimerRef.current !== null) {
      window.clearTimeout(playRetryTimerRef.current)
      playRetryTimerRef.current = null
    }
  }, [])

  const markMediaReady = useCallback(() => {
    if (!activeItem) return
    setMediaReady(true)
  }, [activeItem])

  const playVideo = useCallback(
    (attempt = 0, requestGeneration?: number) => {
      const generation = requestGeneration ?? ++playRequestGenerationRef.current
      if (pausedRef.current) {
        clearPlayRetry()
        return
      }
      const v = videoRef.current
      if (!v || activeItem?.type !== 'video') return
      clearPlayRetry()
      v.volume = Math.max(0, Math.min(1, volume / 100))
      v.muted = !audioEnabled || volume === 0 || !videoStarted || attempt > 0
      v.playbackRate = speed
      v.play()
        .then(() => {
          if (pausedRef.current) {
            v.pause()
            return
          }
          if (generation !== playRequestGenerationRef.current) return
          setVideoStarted(true)
          if (audioEnabled && volume > 0) v.muted = false
        })
        .catch((e: DOMException) => {
          if (generation !== playRequestGenerationRef.current || pausedRef.current) return
          console.warn('[wallpaper] video.play 被拒:', e.name, e.message)
          if (attempt >= 3 || videoRef.current !== v) return
          v.muted = true
          playRetryTimerRef.current = window.setTimeout(
            () => playVideo(attempt + 1, generation),
            attempt === 0 ? 250 : 1000
          )
        })
    },
    [activeItem?.type, audioEnabled, clearPlayRetry, speed, videoStarted, volume]
  )

  // ---- 壁纸抽帧：给组件毛玻璃用 ----
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const captureTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const c = document.createElement('canvas')
    const aspect = Math.max(0.1, window.innerHeight / Math.max(1, window.innerWidth))
    c.width = 768
    c.height = Math.max(1, Math.round(c.width * aspect))
    captureCanvasRef.current = c
    return () => {
      playRequestGenerationRef.current += 1
      if (captureTimerRef.current) clearInterval(captureTimerRef.current)
      clearPlayRetry()
    }
  }, [clearPlayRetry])

  useEffect(() => {
    setErr(null)
    setMediaReady(false)
    setVideoStarted(false)
    readyReportedRef.current = null
    captureErrorKeyRef.current = null
    playRequestGenerationRef.current += 1
    clearPlayRetry()
  }, [activeItem?.id, activeItem?.source, clearPlayRetry])

  useEffect(() => {
    if (!mediaReady || !activeItem) return
    const readyKey = `${activeItem.id}:${activeItem.source}`
    if (readyReportedRef.current === readyKey) return

    // READY must be sent after React commits the visible media frame. Attaching the
    // hidden window before the initial opacity transition finishes can leave DWM
    // waiting for the first desktop input before it composites the wallpaper.
    let timer: number | null = null
    const frame = window.requestAnimationFrame(() => {
      timer = window.setTimeout(() => {
        readyReportedRef.current = readyKey
        window.wallpaperBridge?.notifyReady?.(activeItem.id, activeItem.source)
      }, 140)
    })
    return () => {
      window.cancelAnimationFrame(frame)
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [activeItem, mediaReady])

  const captureFrame = useCallback(() => {
    if (!captureDemandRef.current || pausedRef.current) return
    const c = captureCanvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    let source: CanvasImageSource | null = null
    if (videoRef.current && videoRef.current.readyState >= 2) {
      source = videoRef.current
    } else if (imgRef.current && imgRef.current.complete && imgRef.current.naturalWidth > 0) {
      source = imgRef.current
    }
    if (!source) return
    try {
      const viewportWidth = Math.max(1, window.innerWidth)
      const viewportHeight = Math.max(1, window.innerHeight)
      const expectedHeight = Math.max(1, Math.round(c.width * viewportHeight / viewportWidth))
      if (c.height !== expectedHeight) c.height = expectedHeight
      const surfaceBounds = layout?.displays[0]?.localBounds ?? {
        x: 0,
        y: 0,
        width: viewportWidth,
        height: viewportHeight,
      }
      drawWallpaperFrame(
        ctx,
        source,
        c.width,
        c.height,
        viewportWidth,
        viewportHeight,
        surfaceBounds,
        objectFit,
        transform,
      )
      const data = c.toDataURL('image/jpeg', 0.62)
      captureErrorKeyRef.current = null
      window.wallpaperBridge?.sendFrame?.(data)
    } catch (error) {
      const errorKey = `${activeItem?.id ?? 'unknown'}:${error instanceof Error ? error.name : 'capture-error'}`
      if (captureErrorKeyRef.current !== errorKey) {
        captureErrorKeyRef.current = errorKey
        console.warn('[wallpaper] renderer frame capture failed; main fallback will take over:', error)
      }
    }
  }, [activeItem?.id, layout, objectFit, transform])

  // 根据壁纸类型启动/停止抽帧
  const startCapture = useCallback(() => {
    if (captureTimerRef.current) return
    if (pausedRef.current || !captureDemandRef.current) return
    captureFrame()
    captureTimerRef.current = setInterval(captureFrame, 250) // 4fps is sufficient for blurred backgrounds
  }, [captureFrame])

  const stopCapture = useCallback(() => {
    if (captureTimerRef.current) {
      clearInterval(captureTimerRef.current)
      captureTimerRef.current = null
    }
  }, [])

  // Keep edge-triggered IPC listeners stable; changing media callbacks must not
  // create a gap where a pause/resume event can be lost.
  useEffect(() => {
    const offPause = window.wallpaperBridge?.onPauseCapture?.((paused) => {
      pausedRef.current = paused
      if (paused) {
        playRequestGenerationRef.current += 1
        if (playRetryTimerRef.current !== null) {
          window.clearTimeout(playRetryTimerRef.current)
          playRetryTimerRef.current = null
        }
      }
      setCapturePaused(paused)
    })
    const offDemand = window.wallpaperBridge?.onCaptureDemand?.((enabled) => {
      captureDemandRef.current = enabled
      setCaptureDemanded(enabled)
    })
    return () => {
      offPause?.()
      offDemand?.()
    }
  }, [])

  // Full-screen occlusion owns video playback independently from frame demand.
  useEffect(() => {
    if (activeItem?.type !== 'video') return
    if (capturePaused) {
      clearPlayRetry()
      if (videoRef.current && !videoRef.current.paused) videoRef.current.pause()
      return
    }
    playVideo()
  }, [activeItem?.type, capturePaused, clearPlayRetry, playVideo])

  // Frame capture has one idempotent owner, so repeated pause/resume cannot
  // leave duplicate intervals or revive a stopped timer.
  useEffect(() => {
    stopCapture()
    if (!activeItem || capturePaused || !captureDemanded) return
    if (activeItem.type === 'video') {
      startCapture()
      return () => stopCapture()
    }
    if (activeItem.type === 'image') {
      captureFrame()
      const timer = window.setTimeout(captureFrame, 1500)
      return () => window.clearTimeout(timer)
    }
    return undefined
  }, [activeItem, captureDemanded, captureFrame, capturePaused, startCapture, stopCapture])

  useEffect(() => {
    let alive = true
    let itemRevision = 0
    const off = window.wallpaperBridge?.onLoad((it) => {
      console.log('[wallpaper] onLoad', it)
      itemRevision += 1
      setItem(it)
    })
    let layoutRevision = 0
    const pullLayout = (): void => {
      const revision = ++layoutRevision
      void window.wallpaperBridge?.getDisplayLayout?.().then((next) => {
        if (alive && revision === layoutRevision) setLayout(next)
      }).catch((error) => { if (alive) console.warn('[wallpaper] layout request failed:', error) })
    }
    const offLayout = window.wallpaperBridge?.onDisplayLayout?.((next) => {
      layoutRevision += 1
      setLayout(next)
    })
    const offLayoutChanged = window.wallpaperBridge?.onDisplayLayoutChanged?.(pullLayout)
    // A delayed initial pull must not overwrite a newer pushed layout.
    pullLayout()
    const currentRevision = itemRevision
    window.wallpaperBridge?.getCurrent?.().then((state) => {
      if (alive && currentRevision === itemRevision && state?.current) {
        // Readiness resets only when the effective surface changes, not when a
        // legacy primary snapshot arrives after an image or iframe has loaded.
        setItem(state.current)
      }
    }).catch((error) => { if (alive) console.warn('[wallpaper] current request failed:', error) })
    return () => {
      alive = false
      off?.()
      offLayout?.()
      offLayoutChanged?.()
    }
  }, [])

  // 应用 volume 和 speed 到 video 元素
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = Math.max(0, Math.min(1, volume / 100))
      videoRef.current.muted = !audioEnabled || volume === 0 || !videoStarted
    }
  }, [activeItem, audioEnabled, videoStarted, volume])

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed
    }
  }, [activeItem, speed])

  useEffect(() => {
    const epoch = layout?.playback?.epochMs
    if (epoch === undefined || activeItem?.type !== 'video' || capturePaused || (layout?.mode !== 'duplicate' && layout?.mode !== 'span')) return
    const video = videoRef.current
    if (!video) return
    const synchronize = (): void => {
      const expected = getSynchronizedVideoTime(epoch, Date.now(), video.duration, speed)
      if (expected !== undefined && video.readyState >= 1 && needsVideoTimeCorrection(video.currentTime, expected, video.duration)) video.currentTime = expected
    }
    synchronize()
    video.addEventListener('loadedmetadata', synchronize)
    video.addEventListener('playing', synchronize)
    const timer = setInterval(synchronize, 1000)
    return () => { clearInterval(timer); video.removeEventListener('loadedmetadata', synchronize); video.removeEventListener('playing', synchronize) }
  }, [activeItem?.source, activeItem?.type, capturePaused, layout?.mode, layout?.playback?.epochMs, speed])

  if (!activeItem) {
    return <div style={{ width: '100%', height: '100%', background: 'transparent' }} />
  }

  const errorOverlay = err ? (
    <div
      style={{
        position: 'fixed',
        bottom: 12,
        left: 12,
        padding: '6px 10px',
        background: 'rgba(200,0,0,0.85)',
        color: '#fff',
        fontSize: 12,
        borderRadius: 4,
        maxWidth: '50vw',
        zIndex: 99,
      }}
    >
      壁纸加载失败：{err}
    </div>
  ) : null

  const mediaStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit,
    transform,
    background: 'transparent',
    opacity: mediaReady ? 1 : 0,
    transition: 'opacity 120ms ease-out',
  }

  const surfaces = layout?.displays?.length
    ? layout.displays
    : [{ displayId: -1, displayKey: 'fallback', bounds: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }, localBounds: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }, item: activeItem }]

  const renderSurface = (surface: (typeof surfaces)[number], index: number) => {
    const surfaceItem = surface.item ?? activeItem
    const surfaceSrc = toAssetUrl(surfaceItem.source) ?? ''
    const surfaceMediaStyle = { ...mediaStyle, display: 'block' as const }
    if (surfaceItem.type === 'video') {
      return <video key={`${surface.displayKey}:${surfaceItem.source}`} ref={index === 0 ? videoRef : undefined} crossOrigin="anonymous" src={surfaceSrc} autoPlay muted={!audioEnabled || volume === 0 || !videoStarted || index > 0} loop playsInline preload="auto" onLoadedMetadata={(event) => { event.currentTarget.playbackRate = speed; event.currentTarget.volume = Math.max(0, Math.min(1, volume / 100)) }} onLoadedData={() => { if (index === 0) { markMediaReady(); captureFrame(); playVideo() } }} onCanPlay={() => { if (index === 0) { markMediaReady(); playVideo() } }} onPlaying={() => { if (index === 0) { markMediaReady(); setVideoStarted(true) } }} onError={() => { if (index === 0) { setErr(`video 加载失败 (${surfaceItem.source})`); markMediaReady() } }} style={{ ...surfaceMediaStyle, width: '100%', height: '100%' }} />
    }
    if (surfaceItem.type === 'image') {
      return <img key={`${surface.displayKey}:${surfaceItem.source}`} ref={index === 0 ? imgRef : undefined} crossOrigin="anonymous" src={surfaceSrc} onLoad={() => { if (index === 0) { markMediaReady(); captureFrame() } }} onError={() => { if (index === 0) { setErr(`image 加载失败 (${surfaceItem.source})`); markMediaReady() } }} style={{ ...surfaceMediaStyle, width: '100%', height: '100%' }} alt="" />
    }
    if (surfaceItem.type === 'web') {
      return <iframe key={`${surface.displayKey}:${surfaceItem.source}`} sandbox="allow-scripts allow-same-origin" src={surfaceItem.webUrl} onLoad={index === 0 ? markMediaReady : undefined} onError={() => { if (index === 0) { setErr(`iframe 加载失败 (${surfaceItem.source})`); markMediaReady() } }} style={{ ...surfaceMediaStyle, width: '100%', height: '100%', border: 0 }} title="壁纸" />
    }
    return null
  }

  return <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: 'transparent' }}>
    {surfaces.map((surface, index) => <div key={`${surface.displayKey}:${surface.localBounds.x}:${surface.localBounds.y}`} style={{ position: 'absolute', left: surface.localBounds.x, top: surface.localBounds.y, width: surface.localBounds.width, height: surface.localBounds.height, overflow: 'hidden' }}>{renderSurface(surface, index)}</div>)}
    {errorOverlay}
  </div>
}
