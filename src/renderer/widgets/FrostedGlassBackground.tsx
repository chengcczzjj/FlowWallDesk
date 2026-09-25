import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { WidgetPosCtx } from '../canvas/contexts'
import {
  BASE_WALLPAPER_FRAME_BLUR_PX,
  getWallpaperFrame,
  getWallpaperFrameSources,
  subscribeWallpaperFrame,
  subscribeWallpaperFrameSources,
} from '../canvas/wallpaperFrameStore'

/**
 * 毛玻璃背景层：采样壁纸抽帧，根据组件在画布中的坐标偏移对齐，CSS 模糊。
 *
 * 多显示器下每个壁纸窗口独立抽帧，这里按壁纸窗口在画布坐标中的区域逐层放置，
 * 组件跨屏时两块帧各自对齐到对应显示器。
 *
 * 用法：在组件根 div（position:relative, overflow:hidden）内作为第一个子元素。
 * 上层内容需要 position:relative + zIndex:1 才能显示在毛玻璃之上。
 *
 * 如果没有壁纸帧数据，回退为纯色 overlayColor 背景（与原有效果一致）。
 */
export function FrostedGlassBackground({
  overlayColor = 'rgba(255,255,255,0.85)',
  blurPx = 24,
}: {
  overlayColor?: string
  blurPx?: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const pos = useContext(WidgetPosCtx)
  const [sources, setSources] = useState(getWallpaperFrameSources)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const extraBlurPx = Math.sqrt(Math.max(0, blurPx ** 2 - BASE_WALLPAPER_FRAME_BLUR_PX ** 2))

  useEffect(() => subscribeWallpaperFrameSources(() => setSources(getWallpaperFrameSources())), [])

  useLayoutEffect(() => {
    const element = containerRef.current
    if (!element) return undefined
    const measure = () => {
      const width = Math.round(element.offsetWidth)
      const height = Math.round(element.offsetHeight)
      setSize((current) => (current.width === width && current.height === height ? current : { width, height }))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // Only paint the wallpaper windows this widget overlaps (usually one); the
  // blur margin keeps a neighbouring display's colours at a shared edge.
  const margin = Math.ceil(extraBlurPx * 2)
  const visibleSources = size.width > 0 && size.height > 0
    ? sources.filter((source) => (
        source.bounds.x < pos.x + size.width + margin &&
        source.bounds.x + source.bounds.width > pos.x - margin &&
        source.bounds.y < pos.y + size.height + margin &&
        source.bounds.y + source.bounds.height > pos.y - margin
      ))
    : sources

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        overflow: 'hidden',
        borderRadius: 'inherit',
        pointerEvents: 'none',
      }}
    >
      {visibleSources.map((source) => (
        <WallpaperFrameLayer
          key={source.key}
          frameKey={source.key}
          left={source.bounds.x - pos.x}
          top={source.bounds.y - pos.y}
          width={source.bounds.width}
          height={source.bounds.height}
          extraBlurPx={extraBlurPx}
        />
      ))}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: overlayColor,
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}

/** One wallpaper window's frame. The image source is swapped imperatively so 4fps frames never re-render React. */
function WallpaperFrameLayer({
  frameKey,
  left,
  top,
  width,
  height,
  extraBlurPx,
}: {
  frameKey: string
  left: number
  top: number
  width: number
  height: number
  extraBlurPx: number
}) {
  const frameImageRef = useRef<HTMLImageElement>(null)
  const appliedFrameRef = useRef<string | null>(null)

  useLayoutEffect(() => {
    const applyLatestFrame = () => {
      const image = frameImageRef.current
      if (!image) return
      const frame = getWallpaperFrame(frameKey)
      if (frame === appliedFrameRef.current) return
      appliedFrameRef.current = frame
      if (frame) image.src = frame
      else image.removeAttribute('src')
    }

    appliedFrameRef.current = null
    applyLatestFrame()
    return subscribeWallpaperFrame(frameKey, applyLatestFrame)
  }, [frameKey])

  return (
    <img
      ref={frameImageRef}
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height,
        maxWidth: 'none',
        maxHeight: 'none',
        filter: `blur(${extraBlurPx}px) saturate(1.08)`,
        willChange: 'filter',
        pointerEvents: 'none',
        objectFit: 'fill',
      }}
      alt=""
      aria-hidden
    />
  )
}
