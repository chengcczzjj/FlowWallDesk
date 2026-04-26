import { type CSSProperties, useEffect, useState } from 'react'
import { COLOR_THEMES } from '../shared/constants'

interface PixelClockProps {
  config?: Record<string, unknown>
}

const PIXEL_FONT = "'Press Start 2P', 'Courier New', monospace"

/** 桌面像素时钟组件 — 两种样式 */
export function PixelClock({ config }: PixelClockProps) {
  const style = (config?.style as string) || 'minimal'
  const themeId = (config?.themeId as string) || 'white'
  const opacity = (config?.opacity as number) ?? 0.8
  const customStyle = {} as CSSProperties

  const theme = COLOR_THEMES.find((t) => t.id === themeId) || COLOR_THEMES[0]
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const time = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })
  const date = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()
  const day = now.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase()

  const containerStyle = { opacity }
  const getStyle = (defaults = {}) => ({ ...containerStyle, ...defaults, ...customStyle })

  const hexToRgba = (hex: string, alpha: number) => {
    let r = 0, g = 0, b = 0
    if (hex.length === 4) { r = parseInt(hex[1] + hex[1], 16); g = parseInt(hex[2] + hex[2], 16); b = parseInt(hex[3] + hex[3], 16) }
    else if (hex.length === 7) { r = parseInt(hex.slice(1, 3), 16); g = parseInt(hex.slice(3, 5), 16); b = parseInt(hex.slice(5, 7), 16) }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }

  const gradientText = {
    backgroundImage: `linear-gradient(to bottom, ${theme.base}, ${hexToRgba(theme.base, 0.2)})`,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: customStyle.color ? 'currentcolor' : 'transparent',
    textShadow: `0 0 20px ${theme.glow}`,
    fontFamily: PIXEL_FONT,
  }

  switch (style) {
    case 'weekday':
      return (
        <div className="flex flex-col items-center drop-shadow-lg select-none" style={{ ...getStyle(), gap: 6, padding: '8px 12px' }}>
          <span className="font-black leading-none text-center uppercase" style={{ ...gradientText, fontSize: '3rem', letterSpacing: '0.3em', whiteSpace: 'nowrap' }}>{day}</span>
          <div className="flex items-center gap-4">
            <div className="h-px w-10 opacity-60" style={{ backgroundColor: theme.borderColor }}></div>
            <span className="font-bold tracking-widest" style={{ ...gradientText, fontSize: '1rem', whiteSpace: 'nowrap' }}>{time}</span>
            <div className="h-px w-10 opacity-60" style={{ backgroundColor: theme.borderColor }}></div>
          </div>
          <span className="font-bold uppercase tracking-[0.3em] opacity-70" style={{ color: theme.accent, fontFamily: PIXEL_FONT, whiteSpace: 'nowrap', fontSize: '0.5rem' }}>{date}</span>
        </div>
      )
    case 'minimal':
    default:
      return (
        <div className="flex flex-col items-center drop-shadow-2xl select-none" style={{ ...getStyle(), padding: '8px 12px' }}>
          <span className="font-bold tracking-tight leading-none" style={{ ...gradientText, fontSize: '4.5rem' }}>{time}</span>
          <span className="text-sm font-light tracking-[0.3em] opacity-80 uppercase pl-[0.3em]" style={{ color: theme.accent, fontFamily: PIXEL_FONT, whiteSpace: 'nowrap', fontSize: '0.6rem', marginTop: 8 }}>{day} · {date}</span>
        </div>
      )
  }
}
