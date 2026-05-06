import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import {
  PIXEL_PET_HEIGHT,
  PIXEL_PET_WIDTH,
  drawPixelPet,
  type PixelPet,
  type PixelPetSettings,
  type PixelPetStateKey,
  type PixelPetThemeKey,
} from './pixel-pet'

interface PixelPetCanvasProps {
  pet: PixelPet
  settings: PixelPetSettings
  stateKey?: PixelPetStateKey
  themeKey?: PixelPetThemeKey
  animate?: boolean
  width?: number | string
  height?: number | string
  className?: string
  style?: CSSProperties
  title?: string
}

export function PixelPetCanvas({
  pet,
  settings,
  stateKey,
  themeKey,
  animate = true,
  width = 160,
  height = 128,
  className,
  style,
  title,
}: PixelPetCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return

    let frame = 0
    const start = performance.now()
    const render = (now: number) => {
      drawPixelPet(context, {
        pet,
        stateKey: stateKey ?? settings.state,
        themeKey: themeKey ?? settings.theme,
        time: (now - start) / 1000,
        speed: settings.speed,
        intensity: settings.intensity,
        motion: settings.motion,
        effects: settings.effects,
      })
      if (animate) frame = requestAnimationFrame(render)
    }

    render(performance.now())
    return () => {
      if (frame) cancelAnimationFrame(frame)
    }
  }, [animate, pet, settings.effects, settings.intensity, settings.motion, settings.speed, settings.state, settings.theme, stateKey, themeKey])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      width={PIXEL_PET_WIDTH}
      height={PIXEL_PET_HEIGHT}
      title={title}
      style={{
        display: 'block',
        width,
        height,
        imageRendering: 'pixelated',
        ...style,
      }}
    />
  )
}