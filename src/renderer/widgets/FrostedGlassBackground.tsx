import { useContext, useLayoutEffect, useRef } from 'react'
import { WidgetPosCtx } from '../canvas/contexts'
import {
  BASE_WALLPAPER_FRAME_BLUR_PX,
  getWallpaperFrame,
  subscribeWallpaperFrame,
} from '../canvas/wallpaperFrameStore'

/**
 * 毛玻璃背景层：采样壁纸抽帧，根据组件屏幕坐标偏移对齐，CSS 模糊。
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
  const frameImageRef = useRef<HTMLImageElement>(null)
  const appliedFrameRef = useRef<string | null>(null)
  const pos = useContext(WidgetPosCtx)
  const screenX = window.screenX || 0
  const screenY = window.screenY || 0
  const frameWidth = window.screen.width || window.innerWidth
  const frameHeight = window.screen.height || window.innerHeight
  const extraBlurPx = Math.sqrt(Math.max(0, blurPx ** 2 - BASE_WALLPAPER_FRAME_BLUR_PX ** 2))

  useLayoutEffect(() => {
    const applyLatestFrame = () => {
      const image = frameImageRef.current
      if (!image) return
      const frame = getWallpaperFrame()
      if (frame === appliedFrameRef.current) return
      appliedFrameRef.current = frame
      if (frame) image.src = frame
      else image.removeAttribute('src')
    }

    applyLatestFrame()
    return subscribeWallpaperFrame(applyLatestFrame)
  }, [])

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        overflow: 'hidden',
        borderRadius: 'inherit',
        pointerEvents: 'none',
      }}
    >
      <img
        ref={frameImageRef}
        style={{
          position: 'absolute',
          left: -(screenX + pos.x),
          top: -(screenY + pos.y),
          width: frameWidth,
          height: frameHeight,
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
