import { type CSSProperties, useEffect, useState } from 'react'
import { COLOR_THEMES } from '../shared/constants'

interface ElegantClockProps {
  config?: Record<string, unknown>
}

/** 桌面 Elegant 时钟组件 — 星期居上、横线装饰 */
export function ElegantClock({ config }: ElegantClockProps) {
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
  }

  return (
    <div className="flex flex-col items-center drop-shadow-lg select-none" style={{ ...getStyle(), gap: 2 }}>
      <span className="font-black tracking-[0.15em] leading-none text-center uppercase pl-[0.15em]" style={{ ...gradientText, fontSize: '3rem', whiteSpace: 'nowrap' }}>{day}</span>
      <div className="flex items-center gap-4">
        <div className="h-px w-12 opacity-60" style={{ backgroundColor: theme.borderColor }}></div>
        <span className="font-bold tracking-widest" style={{ ...gradientText, fontSize: '1.5rem', whiteSpace: 'nowrap' }}>{time}</span>
        <div className="h-px w-12 opacity-60" style={{ backgroundColor: theme.borderColor }}></div>
      </div>
      <span className="text-xs font-bold uppercase tracking-[0.3em] opacity-70" style={{ color: theme.accent, whiteSpace: 'nowrap' }}>{date}</span>
    </div>
  )
}
