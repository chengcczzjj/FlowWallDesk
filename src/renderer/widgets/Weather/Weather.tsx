import { Cloud, CloudLightning, CloudRain, CloudSnow, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'

const WeatherIcon = ({
  style,
  condition,
  size = 48,
  className = '',
}: {
  style: string
  condition: string
  size: number
  className?: string
}) => {
  const defs = (
    <defs>
      <linearGradient id="realismSun" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FDB813" />
        <stop offset="100%" stopColor="#F57F17" />
      </linearGradient>
      <linearGradient id="realismCloud" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="100%" stopColor="#E0E0E0" />
      </linearGradient>
      <filter id="neonGlow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
        <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
      <radialGradient id="claySun" cx="30%" cy="30%" r="70%">
        <stop offset="0%" stopColor="#FFD54F" />
        <stop offset="100%" stopColor="#FF6F00" />
      </radialGradient>
      <filter id="clayShadow" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="2" dy="4" stdDeviation="3" floodColor="rgba(0,0,0,0.2)" />
      </filter>
    </defs>
  )

  if (style === 'realism') {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
        {defs}
        {condition === 'Sunny' && (
          <g>
            <circle cx="32" cy="32" r="14" fill="url(#realismSun)" filter="drop-shadow(0 0 8px rgba(253, 184, 19, 0.6))" />
            {[0, 45, 90, 135, 180, 225, 270, 315].map((d) => (
              <line key={d} x1="32" y1="8" x2="32" y2="4" transform={`rotate(${d} 32 32)`} stroke="#FDB813" strokeWidth="3" strokeLinecap="round" />
            ))}
          </g>
        )}
        {(condition === 'Cloudy' || condition === 'Rainy' || condition === 'Snowy' || condition === 'Stormy') && (
          <g>
            {condition === 'Cloudy' && <circle cx="40" cy="24" r="10" fill="url(#realismSun)" opacity="0.8" />}
            <path d="M46 40C46 46.6 40.6 52 34 52H20C13.4 52 8 46.6 8 40C8 33.4 13.4 28 20 28C20.5 28 21 28.1 21.5 28.2C22.5 22 27 16 33 16C39 16 44 20 45.5 25.5C51.5 25.5 56 30 56 35.5C56 38 55 40 53.5 41.5" fill="url(#realismCloud)" filter="drop-shadow(0 4px 6px rgba(0,0,0,0.1))" />
            {condition === 'Rainy' && <g fill="#4FC3F7"><rect x="24" y="54" width="3" height="6" rx="1.5" /><rect x="34" y="54" width="3" height="6" rx="1.5" /><rect x="29" y="62" width="3" height="6" rx="1.5" /></g>}
            {condition === 'Snowy' && <g fill="#E0F7FA"><circle cx="24" cy="58" r="2.5" /><circle cx="34" cy="58" r="2.5" /><circle cx="29" cy="64" r="2.5" /></g>}
            {condition === 'Stormy' && <path d="M28 52L24 60H30L28 68" stroke="#FFD600" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
          </g>
        )}
      </svg>
    )
  }

  if (style === 'glass') {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
        {defs}
        <g filter="url(#clayShadow)">
          {condition === 'Sunny' && <circle cx="32" cy="32" r="18" fill="url(#claySun)" />}
          {(condition === 'Cloudy' || condition === 'Rainy' || condition === 'Snowy' || condition === 'Stormy') && (
            <g>
              <path d="M46 40C46 46.6 40.6 52 34 52H20C13.4 52 8 46.6 8 40C8 33.4 13.4 28 20 28C22.5 22 27 16 33 16C39 16 44 20 45.5 25.5C51.5 25.5 56 30 56 35.5C56 38 55 40 53.5 41.5" fill="#FFFFFF" />
              {condition === 'Rainy' && <g><path d="M24 56C24 56 22 62 22 62" stroke="#29B6F6" strokeWidth="4" strokeLinecap="round" /><path d="M34 56C34 56 32 62 32 62" stroke="#29B6F6" strokeWidth="4" strokeLinecap="round" /></g>}
              {condition === 'Snowy' && <g fill="#B3E5FC"><circle cx="24" cy="60" r="3" /><circle cx="34" cy="60" r="3" /></g>}
              {condition === 'Stormy' && <path d="M28 54L24 62H30L28 70" stroke="#FFAB00" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
            </g>
          )}
        </g>
      </svg>
    )
  }

  if (style === 'neon') {
    const neonColor = condition === 'Sunny' ? '#FFD700' : condition === 'Stormy' ? '#D500F9' : '#00E5FF'
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
        {defs}
        <g stroke={neonColor} strokeWidth="2" fill="none" filter="url(#neonGlow)">
          {condition === 'Sunny' && (
            <g>
              <circle cx="32" cy="32" r="12" />
              <path d="M32 6V10 M32 54V58 M6 32H10 M54 32H58 M14 14L17 17 M47 47L50 50 M14 50L17 47 M47 17L50 14" strokeLinecap="round" />
            </g>
          )}
          {(condition === 'Cloudy' || condition === 'Rainy' || condition === 'Snowy' || condition === 'Stormy') && (
            <path d="M46 40C46 46.6 40.6 52 34 52H20C13.4 52 8 46.6 8 40C8 33.4 13.4 28 20 28C22.5 22 27 16 33 16C39 16 44 20 45.5 25.5C51.5 25.5 56 30 56 35.5C56 38 55 40 53.5 41.5" />
          )}
          {condition === 'Rainy' && <path d="M24 56L22 62M34 56L32 62" strokeLinecap="round" />}
          {condition === 'Stormy' && <path d="M30 54L26 60H32L30 66" strokeLinecap="round" strokeLinejoin="round" />}
        </g>
      </svg>
    )
  }

  // minimal (default) — lucide icons
  if (condition === 'Sunny') return <Sun size={size} className={className} />
  if (condition === 'Rainy') return <CloudRain size={size} className={className} />
  if (condition === 'Snowy') return <CloudSnow size={size} className={className} />
  if (condition === 'Stormy') return <CloudLightning size={size} className={className} />
  return <Cloud size={size} className={className} />
}

interface WeatherWidgetProps {
  config?: Record<string, unknown>
}

export function WeatherWidget({ config }: WeatherWidgetProps) {
  const style = (config?.style as string) || 'minimal'
  const darkMode = (config?.darkMode as boolean) ?? false

  const [weatherData, setWeatherData] = useState({ temp: 22, condition: 'Sunny', city: 'Beijing' })
  const configuredCity = typeof config?.city === 'string' ? config.city.trim() : undefined

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const snapshot = await window.canvasBridge?.fetchWeather({ city: configuredCity, days: 1 })
        if (!snapshot?.ok || !snapshot.current) return
        const condition = snapshot.current.condition === 'sunny'
          ? 'Sunny'
          : snapshot.current.condition === 'rainy'
            ? 'Rainy'
            : snapshot.current.condition === 'snowy'
              ? 'Snowy'
              : snapshot.current.condition === 'stormy'
                ? 'Stormy'
                : 'Cloudy'
        setWeatherData({
          temp: Math.round(snapshot.current.temperature),
          condition,
          city: snapshot.city || snapshot.location,
        })
      } catch (error) {
        console.log('Weather API failed, using default', error)
      }
    }
    void fetchWeather()
  }, [configuredCity])

  const { temp, condition, city } = weatherData
  const textColor = darkMode ? 'text-slate-900' : 'text-white'

  const getStyle = (extra = {}) => ({ ...extra })

  if (style === 'glass') {
    return (
      <div className="flex items-center gap-2 select-none w-full h-full justify-center" style={getStyle()}>
        <WeatherIcon style={style} condition={condition} size={56} />
        <span className={`text-xl font-bold opacity-90 ${textColor} drop-shadow-md`}>{temp}°</span>
      </div>
    )
  }

  if (style === 'realism') {
    return (
      <div className="flex items-center gap-3 select-none w-full h-full justify-center" style={getStyle()}>
        <WeatherIcon style={style} condition={condition} size={64} />
        <div className="flex flex-col -space-y-0.5">
          <span className={`text-xl font-bold tracking-tight ${textColor} drop-shadow-lg`}>{temp}°</span>
          <span className={`text-[10px] font-medium opacity-80 ${textColor}`} style={{ whiteSpace: 'nowrap' }}>{city}</span>
        </div>
      </div>
    )
  }

  if (style === 'neon') {
    return (
      <div className="flex items-center gap-3 select-none w-full h-full justify-center" style={getStyle()}>
        <WeatherIcon style={style} condition={condition} size={48} />
        <span className={`text-xl font-bold ${textColor}`} style={{ textShadow: darkMode ? 'none' : '0 0 10px rgba(255,255,255,0.8)' }}>{temp}°</span>
      </div>
    )
  }

  // minimal (default)
  return (
    <div className="flex items-center gap-2 select-none w-full h-full justify-center" style={getStyle()}>
      <WeatherIcon style={style} condition={condition} size={48} className={darkMode ? 'text-slate-800' : 'text-white'} />
      <div className="flex flex-col -space-y-0.5">
        <span className={`text-lg font-medium ${textColor}`}>{temp}°</span>
        <span className={`text-[10px] uppercase tracking-widest opacity-60 ${textColor}`} style={{ whiteSpace: 'nowrap' }}>{city}</span>
      </div>
    </div>
  )
}
