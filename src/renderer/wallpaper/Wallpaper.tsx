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
  const videoRef = useRef<HTMLVideoElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  // 实时设置状态
  const [volume, setVolume] = useState(50)
  const [speed, setSpeed] = useState(1.0)
  const [scaling, setScaling] = useState('覆盖')
  const [flip, setFlip] = useState('无')
  const objectFit = scalingToFit(scaling)
  const transform = flipToTransform(flip)

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
      if (captureTimerRef.current) clearInterval(captureTimerRef.current)
    }
  }, [])

  const captureFrame = useCallback(() => {
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
    drawWallpaperFrame(ctx, source, c.width, c.height, objectFit, transform)
    const data = c.toDataURL('image/jpeg', 0.62)
    window.wallpaperBridge?.sendFrame?.(data)
  }, [objectFit, transform])

  // 根据壁纸类型启动/停止抽帧
  const pausedRef = useRef(false)

  const startCapture = useCallback(() => {
    if (captureTimerRef.current) return
    if (pausedRef.current) return // 全屏遮挡时不启动
    captureTimerRef.current = setInterval(captureFrame, 83) // ~12fps
  }, [captureFrame])

  const stopCapture = useCallback(() => {
    if (captureTimerRef.current) {
      clearInterval(captureTimerRef.current)
      captureTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    stopCapture()
    if (!item) return
    if (item.type === 'video') {
      startCapture()
    } else if (item.type === 'image') {
      // 静态图片：onLoad 会触发一次 captureFrame
      // 额外延迟再发一次，确保 canvas 窗口已就绪
      const t = setTimeout(captureFrame, 1500)
      return () => clearTimeout(t)
    }
    // web 类型由主进程 capturePage 抽帧，渲染端不处理
    return () => stopCapture()
  }, [item, startCapture, stopCapture, captureFrame])

  // 全屏遮挡时暂停帧捕获和视频播放，节省 CPU 和 IPC 开销
  useEffect(() => {
    const off = window.wallpaperBridge?.onPauseCapture?.((paused) => {
      pausedRef.current = paused
      if (paused) {
        stopCapture()
        // 暂停视频播放以节省解码开销
        if (videoRef.current && !videoRef.current.paused) {
          videoRef.current.pause()
        }
      } else {
        // 恢复视频播放和帧捕获
        if (item?.type === 'video') {
          videoRef.current?.play().catch(() => {})
          startCapture()
        }
      }
    })
    return () => off?.()
  }, [item, startCapture, stopCapture])

  useEffect(() => {
    const off = window.wallpaperBridge?.onLoad((it) => {
      console.log('[wallpaper] onLoad', it)
      setErr(null)
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
      videoRef.current.muted = volume === 0
    }
  }, [volume, item])

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed
    }
  }, [speed, item])

  useEffect(() => {
    if (item?.type === 'video' && videoRef.current) {
      const v = videoRef.current
      v.muted = volume === 0
      v.volume = Math.max(0, Math.min(1, volume / 100))
      v.playbackRate = speed
      v.play().catch((e: DOMException) => {
        console.warn('[wallpaper] video.play 被拒:', e.name, e.message)
      })
    }
  }, [item])

  if (!item) {
    // 调试色块：如果你能在桌面上看到一个全屏红色 + "壁纸窗口已贴桌面"字样，
    // 说明窗口已经成功贴到 Wallpaper 层。然后在主 UI 里点应用即可看到真壁纸。
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#c0392b',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 28,
          fontFamily: 'Segoe UI, sans-serif',
        }}
      >
        壁纸窗口已贴桌面（请在主界面选择并应用一个壁纸）
      </div>
    )
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
    background: '#000',
  }

  if (item.type === 'video') {
    return (
      <>
        <video
          ref={videoRef}
          src={src}
          autoPlay
          muted={volume === 0}
          loop
          playsInline
          onError={() => setErr(`video 加载失败 (${item.source})`)}
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
          ref={imgRef}
          src={src}
          onLoad={captureFrame}
          onError={() => setErr(`image 加载失败 (${item.source})`)}
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
          src={src}
          onError={() => setErr(`iframe 加载失败 (${item.source})`)}
          style={{ width: '100%', height: '100%', border: 0, background: '#000', transform }}
        />
        {errorOverlay}
      </>
    )
  }

  return <div style={{ width: '100%', height: '100%', background: '#000' }} />
}
