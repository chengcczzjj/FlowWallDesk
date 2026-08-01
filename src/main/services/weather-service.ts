import type { WeatherConditionKind, WeatherSnapshot } from '@shared/types'
import { getApproximateUserLocation } from '../memory/tools/definitions/user-location'

const WEATHER_TIMEOUT_MS = 12_000
const WEATHER_CACHE_TTL_MS = 10 * 60_000
const cache = new Map<string, { value: WeatherSnapshot; expiresAt: number }>()
const inFlight = new Map<string, Promise<WeatherSnapshot>>()

const WMO_CODES: Record<number, string> = {
  0: '晴', 1: '大部晴朗', 2: '多云', 3: '阴天', 45: '雾', 48: '霜雾',
  51: '小毛毛雨', 53: '中毛毛雨', 55: '大毛毛雨', 61: '小雨', 63: '中雨', 65: '大雨',
  71: '小雪', 73: '中雪', 75: '大雪', 77: '雪粒', 80: '小阵雨', 81: '中阵雨', 82: '大阵雨',
  85: '小阵雪', 86: '大阵雪', 95: '雷暴', 96: '雷暴伴小冰雹', 99: '雷暴伴大冰雹',
}

interface GeoResult {
  name: string
  latitude: number
  longitude: number
  country: string
  admin1?: string
}

function describeWeatherCode(code: number): string {
  return WMO_CODES[code] ?? `未知(${code})`
}

function conditionFromCode(code: number): WeatherConditionKind {
  if (code <= 1) return 'sunny'
  if (code <= 3) return 'cloudy'
  if (code === 45 || code === 48) return 'foggy'
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rainy'
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return 'snowy'
  if (code >= 95) return 'stormy'
  return 'cloudy'
}

async function geocode(city: string): Promise<GeoResult | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh`
  const response = await fetch(url, { signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS) })
  if (!response.ok) return null
  const data = await response.json() as { results?: GeoResult[] }
  return data.results?.[0] ?? null
}

async function fetchWeatherUncached(city: string | undefined, days: number): Promise<WeatherSnapshot> {
  const explicitCity = city?.trim()
  let latitude: number | undefined
  let longitude: number | undefined
  let locationName = explicitCity || '当前位置'
  let cityName = explicitCity

  if (explicitCity) {
    const geo = await geocode(explicitCity)
    if (!geo) return { ok: false, location: explicitCity, city: explicitCity, usedUserLocation: false, forecast: [], error: `没有找到“${explicitCity}”的天气位置。` }
    latitude = geo.latitude
    longitude = geo.longitude
    cityName = geo.name
    locationName = `${geo.name}${geo.admin1 ? `, ${geo.admin1}` : ''}, ${geo.country}`
  } else {
    const location = await getApproximateUserLocation()
    latitude = location.latitude
    longitude = location.longitude
    cityName = location.city
    locationName = location.displayName
    if (latitude == null || longitude == null) {
      if (!location.city) return { ok: false, location: location.displayName, usedUserLocation: true, forecast: [], error: location.error || '没有自动确认到所在城市。' }
      const geo = await geocode(location.city)
      if (!geo) return { ok: false, location: location.displayName, city: location.city, usedUserLocation: true, forecast: [], error: '无法解析当前位置。' }
      latitude = geo.latitude
      longitude = geo.longitude
    }
  }

  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max',
    timezone: 'auto',
    forecast_days: String(days),
  })
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
    signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`weather HTTP ${response.status}`)
  const data = await response.json() as {
    current?: Record<string, number>
    daily?: Record<string, Array<number | string>>
  }
  const current = data.current
  const daily = data.daily
  if (!current || !daily || !Array.isArray(daily.time)) throw new Error('天气响应格式不完整。')

  const weatherCode = Number(current.weather_code)
  const forecast = daily.time.slice(0, days).map((date, index) => {
    const code = Number(daily.weather_code?.[index])
    return {
      date: String(date),
      weatherCode: code,
      weather: describeWeatherCode(code),
      condition: conditionFromCode(code),
      tempMax: Number(daily.temperature_2m_max?.[index]),
      tempMin: Number(daily.temperature_2m_min?.[index]),
      precipitation: Number(daily.precipitation_sum?.[index]),
      windMax: Number(daily.wind_speed_10m_max?.[index]),
    }
  })

  return {
    ok: true,
    location: locationName,
    city: cityName,
    usedUserLocation: !explicitCity,
    current: {
      temperature: Number(current.temperature_2m),
      apparentTemperature: Number(current.apparent_temperature),
      humidity: Number(current.relative_humidity_2m),
      weatherCode,
      weather: describeWeatherCode(weatherCode),
      condition: conditionFromCode(weatherCode),
      windSpeed: Number(current.wind_speed_10m),
      windDirection: Number(current.wind_direction_10m),
    },
    forecast,
  }
}

export async function fetchWeatherSnapshot(options: { city?: string; days?: number } = {}): Promise<WeatherSnapshot> {
  const city = options.city?.trim()
  const days = Math.max(1, Math.min(7, Math.round(options.days ?? 3)))
  const key = `${city?.toLocaleLowerCase() || '@user'}:${days}`
  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.value
  const pending = inFlight.get(key)
  if (pending) return pending

  const request = fetchWeatherUncached(city, days)
    .then((value) => {
      if (value.ok) cache.set(key, { value, expiresAt: Date.now() + WEATHER_CACHE_TTL_MS })
      return value
    })
    .catch((error: unknown) => cached?.value ?? ({
      ok: false,
      location: city || '当前位置',
      city,
      usedUserLocation: !city,
      forecast: [],
      error: (error as Error).message,
    } satisfies WeatherSnapshot))
    .finally(() => inFlight.delete(key))
  inFlight.set(key, request)
  return request
}

