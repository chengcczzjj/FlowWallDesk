import type { WeatherSnapshot } from './types'

export interface WeatherPollingState {
  status: 'loading' | 'ready' | 'stale' | 'error'
  snapshot?: WeatherSnapshot
  updatedAt?: number
}

export const WEATHER_REFRESH_MS = 10 * 60 * 1000
export const WEATHER_RETRY_MS = 60 * 1000

/** One in-flight request; disposal prevents late replies from an old city updating the UI. */
export function startWeatherPolling(fetchWeather: () => Promise<WeatherSnapshot | undefined>, emit: (state: WeatherPollingState) => void) {
  let disposed = false
  let running = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let state: WeatherPollingState = { status: 'loading' }
  emit(state)

  async function refresh(): Promise<void> {
    if (disposed || running) return
    running = true
    clearTimeout(timer)
    try {
      const snapshot = await fetchWeather()
      if (!snapshot?.ok || !snapshot.current || !Number.isFinite(snapshot.current.temperature)) throw new Error('Weather unavailable')
      if (!disposed) state = { status: 'ready', snapshot, updatedAt: Date.now() }
    } catch {
      if (!disposed) state = { ...state, status: state.snapshot ? 'stale' : 'error' }
    } finally {
      running = false
      if (!disposed) {
        emit(state)
        timer = setTimeout(() => { void refresh() }, state.status === 'ready' ? WEATHER_REFRESH_MS : WEATHER_RETRY_MS)
      }
    }
  }

  void refresh()
  return {
    refresh,
    stop(): void { disposed = true; clearTimeout(timer) },
  }
}
