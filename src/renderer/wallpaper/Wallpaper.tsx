import { useCallback, useEffect, useRef, useState } from 'react'
import type { WallpaperItem } from '@shared/types'
import { toAssetUrl } from '@shared/asset-url'

/** 将 scaling 名称映射为 CSS object-fit */
function scalingToFit(s?: string): React.CSSProperties['objectFit'] {
  switch (s) {
    case '填充':
      return 'contain'
    case '居中':
      return 'none'
    case '拉伸':
      return 'fill'
    case '自由':
      return 'scale-down'
    default:
      return 'cover' // 覆盖
  }
}

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
  objectFit: React.CSSProperties['objectFit'],
  transform: string
): void {
  const sourceSize = getSourceSize(source)
  let drawWidth = width
  let drawHeight = height
  let drawX = 0
  let drawY = 0

  if (objectFit === 'cover' || objectFit === 'contain' || objectFit === 'scale-down') {
    const scale = objectFit === 'cover'
      ? Math.max(width / sourceSize.width, height / sourceSize.height)
      : Math.min(width / sourceSize.width, height / sourceSize.height)
    drawWidth = sourceSize.width * scale
    drawHeight = sourceSize.height * scale
    drawX = (width - drawWidth) / 2
    drawY = (height - drawHeight) / 2
  } else if (objectFit === 'none') {
    drawWidth = sourceSize.width
    drawHeight = sourceSize.height
    drawX = (width - drawWidth) / 2
    drawY = (height - drawHeight) / 2
  }

  ctx.clearRect(0, 0, width, height)
  ctx.save()
  if (transform === 'scaleX(-1)') {
    ctx.translate(width, 0)
    ctx.scale(-1, 1)
  } else if (transform === 'scaleY(-1)') {
    ctx.translate(0, height)
    ctx.scale(1, -1)
  }
  ctx.drawImage(source, drawX, drawY, drawWidth, drawHeight)
  ctx.restore()
}

/** 壁纸窗口：根据 type 渲染 video / image / web(iframe)。 */
export function Wallpaper() {
  const [item, setItem] = useState<WallpaperItem | null>(null)
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

  // 实时设置状态
  const [volume, setVolume] = useState(50)
  const [speed, setSpeed] = useState(1.0)
  const [scaling, setScaling] = useState('覆盖')
  const [flip, setFlip] = useState('无')
  const objectFit = scalingToFit(scaling)
  const transform = flipToTransform(flip)

  const clearPlayRetry = useCallback(() => {
    if (playRetryTimerRef.current !== null) {
      window.clearTimeout(playRetryTimerRef.current)
      playRetryTimerRef.current = null
    }
  }, [])

  const markMediaReady = useCallback(() => {
    if (!item) return
    setMediaReady(true)
  }, [item])

  const playVideo = useCallback(
    (attempt = 0, requestGeneration?: number) => {
      const generation = requestGeneration ?? ++playRequestGenerationRef.current
      if (pausedRef.current) {
        clearPlayRetry()
        return
      }
      const v = videoRef.current
      if (!v || item?.type !== 'video') return
      clearPlayRetry()
      v.volume = Math.max(0, Math.min(1, volume / 100))
      v.muted = volume === 0 || !videoStarted || attempt > 0
      v.playbackRate = speed
      v.play()
        .then(() => {
          if (pausedRef.current) {
            v.pause()
            return
          }
          if (generation !== playRequestGenerationRef.current) return
          setVideoStarted(true)
          if (volume > 0) v.muted = false
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
    [clearPlayRetry, item?.type, speed, videoStarted, volume]
  )

  // ---- 壁纸抽帧：给组件毛玻璃用 ----
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const captureTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const c = document.createElement('canvas')
    const aspect = Math.max(0.1, window.screen.height / Math.max(1, window.screen.width))
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
    setMediaReady(false)
    setVideoStarted(false)
    readyReportedRef.current = null
    captureErrorKeyRef.current = null
    playRequestGenerationRef.current += 1
    clearPlayRetry()
  }, [clearPlayRetry, item?.id, item?.source])

  useEffect(() => {
    if (!mediaReady || !item) return
    const readyKey = `${item.id}:${item.source}`
    if (readyReportedRef.current === readyKey) return

    // READY must be sent after React commits the visible media frame. Attaching the
    // hidden window before the initial opacity transition finishes can leave DWM
    // waiting for the first desktop input before it composites the wallpaper.
    let timer: number | null = null
    const frame = window.requestAnimationFrame(() => {
      timer = window.setTimeout(() => {
        readyReportedRef.current = readyKey
        window.wallpaperBridge?.notifyReady?.(item.id, item.source)
      }, 140)
    })
    return () => {
      window.cancelAnimationFrame(frame)
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [item, mediaReady])

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
      drawWallpaperFrame(ctx, source, c.width, c.height, objectFit, transform)
      const data = c.toDataURL('image/jpeg', 0.62)
      captureErrorKeyRef.current = null
      window.wallpaperBridge?.sendFrame?.(data)
    } catch (error) {
      const errorKey = `${item?.id ?? 'unknown'}:${error instanceof Error ? error.name : 'capture-error'}`
      if (captureErrorKeyRef.current !== errorKey) {
        captureErrorKeyRef.current = errorKey
        console.warn('[wallpaper] renderer frame capture failed; main fallback will take over:', error)
      }
    }
  }, [item?.id, objectFit, transform])

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
    if (item?.type !== 'video') return
    if (capturePaused) {
      clearPlayRetry()
      if (videoRef.current && !videoRef.current.paused) videoRef.current.pause()
      return
    }
    playVideo()
  }, [capturePaused, clearPlayRetry, item?.type, playVideo])

  // Frame capture has one idempotent owner, so repeated pause/resume cannot
  // leave duplicate intervals or revive a stopped timer.
  useEffect(() => {
    stopCapture()
    if (!item || capturePaused || !captureDemanded) return
    if (item.type === 'video') {
      startCapture()
      return () => stopCapture()
    }
    if (item.type === 'image') {
      captureFrame()
      const timer = window.setTimeout(captureFrame, 1500)
      return () => window.clearTimeout(timer)
    }
    return undefined
  }, [captureDemanded, captureFrame, capturePaused, item, startCapture, stopCapture])

  useEffect(() => {
    const off = window.wallpaperBridge?.onLoad((it) => {
      console.log('[wallpaper] onLoad', it)
      setErr(null)
      setMediaReady(false)
      setVideoStarted(false)
      setItem(it)
      // 加载壁纸自带的设置
      if (it.settings) {
        if (it.settings.volume !== undefined) setVolume(it.settings.volume)
        if (it.settings.speed !== undefined) setSpeed(it.settings.speed)
        if (it.settings.scaling !== undefined) setScaling(it.settings.scaling)
        if (it.settings.flip !== undefined) setFlip(it.settings.flip)
      }
    })
    // 主动拉取当前壁纸（防止启动时错过 LOAD 事件）
    window.wallpaperBridge?.getCurrent?.().then((state) => {
      if (state?.current) {
        console.log('[wallpaper] initial pull', state.current)
        setErr(null)
        setMediaReady(false)
        setVideoStarted(false)
        setItem(state.current)
        const s = state.current.settings
        if (s) {
          if (s.volume !== undefined) setVolume(s.volume)
          if (s.speed !== undefined) setSpeed(s.speed)
          if (s.scaling !== undefined) setScaling(s.scaling)
          if (s.flip !== undefined) setFlip(s.flip)
        }
      }
    })
    return off
  }, [])

  // 监听实时设置更新
  useEffect(() => {
    const off = window.wallpaperBridge?.onSettingUpdate?.((key: string, value: unknown) => {
      switch (key) {
        case 'volume':
          setVolume(value as number)
          break
        case 'speed':
          setSpeed(value as number)
          break
        case 'scaling':
          setScaling(value as string)
          break
        case 'flip':
          setFlip(value as string)
          break
      }
    })
    return off
  }, [])

  // 应用 volume 和 speed 到 video 元素
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = Math.max(0, Math.min(1, volume / 100))
      videoRef.current.muted = volume === 0 || !videoStarted
    }
  }, [volume, item, videoStarted])

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed
    }
  }, [speed, item])

  if (!item) {
    return <div style={{ width: '100%', height: '100%', background: 'transparent' }} />
  }

  const src = toAssetUrl(item.source) ?? ''

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

  if (item.type === 'video') {
    return (
      <>
        <video
          key={item.source}
          ref={videoRef}
          crossOrigin="anonymous"
          src={src}
          autoPlay
          muted={volume === 0 || !videoStarted}
          loop
          playsInline
          preload="auto"
          onLoadedData={() => {
            markMediaReady()
            captureFrame()
            playVideo()
          }}
          onCanPlay={() => {
            markMediaReady()
            playVideo()
          }}
          onPlaying={() => {
            markMediaReady()
            setVideoStarted(true)
          }}
          onError={() => {
            setErr(`video 加载失败 (${item.source})`)
            markMediaReady()
          }}
          style={mediaStyle}
        />
        {errorOverlay}
      </>
    )
  }

  if (item.type === 'image') {
    return (
      <>
        <img
          key={item.source}
          ref={imgRef}
          crossOrigin="anonymous"
          src={src}
          onLoad={() => {
            markMediaReady()
            captureFrame()
          }}
          onError={() => {
            setErr(`image 加载失败 (${item.source})`)
            markMediaReady()
          }}
          style={mediaStyle}
        />
        {errorOverlay}
      </>
    )
  }

  if (item.type === 'web') {
    return (
      <>
        <iframe
          key={item.source}
          src={src}
          onLoad={markMediaReady}
          onError={() => {
            setErr(`iframe 加载失败 (${item.source})`)
            markMediaReady()
          }}
          style={{ ...mediaStyle, border: 0 }}
        />
        {errorOverlay}
      </>
    )
  }

  return <div style={{ width: '100%', height: '100%', background: 'transparent' }} />
}
