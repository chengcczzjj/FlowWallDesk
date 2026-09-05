import { useEffect, useState } from 'react'
import { startWeatherPolling, type WeatherPollingState } from '@shared/weather-polling'

export function useWeather(city?: string): WeatherPollingState & { label: string } {
  const [state, setState] = useState<WeatherPollingState>({ status: 'loading' })
  useEffect(() => {
    const polling = startWeatherPolling(() => window.canvasBridge?.fetchWeather({ city, days: 1 }) ?? Promise.resolve(undefined), setState)
    const refresh = (): void => { if (!document.hidden) void polling.refresh() }
    window.addEventListener('online', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      polling.stop()
      window.removeEventListener('online', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [city])
  const time = state.updatedAt ? new Date(state.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
  const label = state.status === 'loading' ? '天气加载中'
    : state.status === 'error' ? '天气暂不可用，稍后自动重试'
      : state.status === 'stale' ? '天气更新失败，上次更新 ' + time : '天气更新于 ' + time
  return { ...state, label }
}
