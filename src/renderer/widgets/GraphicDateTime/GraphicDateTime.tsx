import { type CSSProperties, useEffect, useState } from 'react'
import { COLOR_THEMES } from '../shared/constants'

interface GraphicDateTimeProps {
  config?: Record<string, unknown>
}

interface WeatherSummary {
  city: string
  condition: string
  temp: string
  humidity: string
  windSpeed: string
}

const DEFAULT_WEATHER: WeatherSummary = {
  city: 'your area',
  condition: '--',
  temp: '--',
  humidity: '--',
  windSpeed: '--',
}

const WEEKDAY_LETTERS: Record<number, string[]> = {
  0: ['S', 'U', 'N', 'D', 'A', 'Y'],
  1: ['M', 'O', 'N', 'D', 'A', 'Y'],
  2: ['T', 'U', 'E', 'S', 'D', 'A', 'Y'],
  3: ['W', 'E', 'D', 'N', 'E', 'S', 'D', 'A', 'Y'],
  4: ['T', 'H', 'U', 'R', 'S', 'D', 'A', 'Y'],
  5: ['F', 'R', 'I', 'D', 'A', 'Y'],
  6: ['S', 'A', 'T', 'U', 'R', 'D', 'A', 'Y'],
}

const DATE_NUMBER_FONT =
  "'Bahnschrift Condensed', 'Aptos Narrow', 'Arial Narrow', 'Roboto Condensed', 'HelveticaNeue-CondensedBold', sans-serif"

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '')
  if (normalized.length !== 3 && normalized.length !== 6) return `rgba(226, 169, 54, ${alpha})`
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => char + char)
          .join('')
      : normalized
  const value = parseInt(full, 16)
  const red = (value >> 16) & 255
  const green = (value >> 8) & 255
  const blue = value & 255
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

export function GraphicDateTime({ config }: GraphicDateTimeProps) {
  const themeId = (config?.themeId as string) || 'yellow'
  const darkMode = (config?.darkMode as boolean) ?? true
  const theme =
    COLOR_THEMES.find((t) => t.id === themeId) || COLOR_THEMES.find((t) => t.id === 'yellow') || COLOR_THEMES[0]
  const [now, setNow] = useState(new Date())
  const [weatherSummary, setWeatherSummary] = useState<WeatherSummary>(DEFAULT_WEATHER)
  const configuredCity = typeof config?.city === 'string' ? config.city.trim() : undefined

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false

    const fetchWeather = async () => {
      try {
        const snapshot = await window.canvasBridge?.fetchWeather({ city: configuredCity, days: 1 })
        const current = snapshot?.current
        if (!snapshot?.ok || !current) throw new Error(snapshot?.error || 'weather fetch failed')

        if (!cancelled) {
          setWeatherSummary({
            city: snapshot.city || snapshot.location || DEFAULT_WEATHER.city,
            condition: current.condition === 'sunny' ? 'clear' : current.condition,
            temp: Number.isFinite(current.temperature)
              ? String(Math.round(current.temperature))
              : '--',
            humidity: Number.isFinite(current.humidity)
              ? String(Math.round(current.humidity))
              : '--',
            windSpeed: Number.isFinite(current.windSpeed)
              ? String(Math.round(current.windSpeed))
              : '--',
          })
        }
      } catch {
        if (!cancelled) setWeatherSummary(DEFAULT_WEATHER)
      }
    }

    void fetchWeather()
    return () => {
      cancelled = true
    }
  }, [configuredCity])

  const day = now.toLocaleDateString('en-US', { day: '2-digit' })
  const month = now.toLocaleDateString('en-US', { month: 'long' }).toUpperCase()
  const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(' ', ' ')
  const weekdayLetters = WEEKDAY_LETTERS[now.getDay()]
  const monthFontSize = month.length >= 9 ? 44 : month.length >= 8 ? 50 : 58
  const weekdayFontSize = weekdayLetters.length > 7 ? 13 : 18
  const weekdayGap = weekdayLetters.length > 7 ? 7 : 11
  const weekdayTop = weekdayLetters.length > 7 ? 205 : 230
  const textColor = darkMode ? '#29272f' : '#f8f7f2'
  const lineColor = darkMode ? 'rgba(41, 39, 47, 0.62)' : 'rgba(248, 247, 242, 0.78)'
  const textShadow = darkMode ? 'none' : '0 2px 14px rgba(0, 0, 0, 0.35)'
  const dateGradient = `linear-gradient(180deg, ${hexToRgba(theme.base, 0.98)} 0%, ${hexToRgba(theme.base, 0.82)} 52%, ${hexToRgba(theme.base, 0.38)} 100%)`

  const foregroundText: CSSProperties = {
    color: textColor,
    textShadow,
  }

  return (
    <div
      className="select-none"
      style={{
        position: 'relative',
        width: 420,
        height: 420,
        fontFamily: "'Arial', 'Helvetica Neue', 'Segoe UI', sans-serif",
        overflow: 'visible',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: '6px 14px 12px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0,
          pointerEvents: 'none',
        }}
      >
        {day.split('').map((digit, index) => (
          <span
            key={`${digit}-${index}`}
            style={{
              display: 'block',
              width: 160,
              fontFamily: DATE_NUMBER_FONT,
              fontSize: 356,
              lineHeight: 0.95,
              fontWeight: 800,
              letterSpacing: 0,
              textAlign: 'center',
              overflow: 'visible',
              backgroundImage: dateGradient,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              filter: `drop-shadow(0 18px 22px ${hexToRgba(theme.base, 0.18)})`,
            }}
          >
            {digit}
          </span>
        ))}
      </div>

      <div
        style={{
          position: 'absolute',
          left: 98,
          top: weekdayTop,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: weekdayGap,
          ...foregroundText,
        }}
      >
        {weekdayLetters.map((letter, index) => (
          <span
            key={`${letter}-${index}`}
            style={{
              fontSize: weekdayFontSize,
              lineHeight: 1,
              fontWeight: 900,
              letterSpacing: 0,
            }}
          >
            {letter}
          </span>
        ))}
      </div>

      <div
        style={{
          position: 'absolute',
          left: 140,
          top: 165,
          width: 238,
          ...foregroundText,
        }}
      >
        <div
          style={{
            fontSize: monthFontSize,
            lineHeight: 0.92,
            fontWeight: 950,
            letterSpacing: 0,
            whiteSpace: 'nowrap',
          }}
        >
          {month}
        </div>
        <div
          style={{
            marginTop: 17,
            fontSize: 20,
            lineHeight: 1,
            fontWeight: 850,
            letterSpacing: 0,
            whiteSpace: 'nowrap',
          }}
        >
          {time}
        </div>
        <div
          style={{
            width: 112,
            height: 2,
            marginTop: 19,
            background: lineColor,
          }}
        />
        <div
          style={{
            width: 280,
            marginTop: 42,
            fontSize: 17,
            lineHeight: 1.32,
            fontWeight: 700,
            color: textColor,
            textShadow,
            overflowWrap: 'break-word',
          }}
        >
          Weather in {weatherSummary.city}
          <br />
          {weatherSummary.condition}, {weatherSummary.temp}° · Humidity {weatherSummary.humidity}%
          <br />
          Wind {weatherSummary.windSpeed} km/h
        </div>
      </div>
    </div>
  )
}
