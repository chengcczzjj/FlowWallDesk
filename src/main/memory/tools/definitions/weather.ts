/**
 * 天气查询工具
 * 使用 Open-Meteo API（免费、无需 API Key、全球覆盖）
 * 支持当前天气和未来 7 天预报
 *
 * 参考: https://open-meteo.com/en/docs
 */
import { tool } from 'ai'
import { z } from 'zod'

/** WMO Weather Interpretation Code 转中文描述 */
const WMO_CODES: Record<number, string> = {
  0: '晴',
  1: '大部晴朗',
  2: '多云',
  3: '阴天',
  45: '雾',
  48: '霜雾',
  51: '小毛毛雨',
  53: '中毛毛雨',
  55: '大毛毛雨',
  61: '小雨',
  63: '中雨',
  65: '大雨',
  71: '小雪',
  73: '中雪',
  75: '大雪',
  77: '雪粒',
  80: '小阵雨',
  81: '中阵雨',
  82: '大阵雨',
  85: '小阵雪',
  86: '大阵雪',
  95: '雷暴',
  96: '雷暴伴小冰雹',
  99: '雷暴伴大冰雹',
}

function describeWeatherCode(code: number): string {
  return WMO_CODES[code] ?? `未知(${code})`
}

interface GeoResult {
  name: string
  latitude: number
  longitude: number
  country: string
  admin1?: string
}

/** 使用 Open-Meteo Geocoding API 解析城市坐标 */
async function geocode(city: string): Promise<GeoResult | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh`
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) return null
  const data = await res.json()
  if (!data.results?.length) return null
  const r = data.results[0]
  return { name: r.name, latitude: r.latitude, longitude: r.longitude, country: r.country, admin1: r.admin1 }
}

export const weatherTool = tool({
  description: '查询指定城市的当前天气和未来几天预报。返回温度、体感温度、湿度、风速、天气描述等信息。',
  inputSchema: z.object({
    city: z.string().describe('城市名称（支持中英文，如"北京"、"Tokyo"、"New York"）'),
    days: z.number().min(1).max(7).default(3).describe('预报天数，1-7天，默认3天'),
  }),
  execute: async ({ city, days }) => {
    // 1. 地理编码
    const geo = await geocode(city)
    if (!geo) {
      return { error: `无法找到城市"${city}"，请检查城市名称` }
    }

    // 2. 查询天气
    const params = new URLSearchParams({
      latitude: String(geo.latitude),
      longitude: String(geo.longitude),
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max',
      timezone: 'auto',
      forecast_days: String(days),
    })

    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      return { error: `天气API请求失败: ${res.status}` }
    }

    const data = await res.json()

    // 3. 格式化结果
    const current = data.current
    const daily = data.daily

    const forecast: { date: string; weather: string; tempMax: string; tempMin: string; precipitation: string; windMax: string }[] = []
    for (let i = 0; i < days && i < daily.time.length; i++) {
      forecast.push({
        date: daily.time[i],
        weather: describeWeatherCode(daily.weather_code[i]),
        tempMax: `${daily.temperature_2m_max[i]}°C`,
        tempMin: `${daily.temperature_2m_min[i]}°C`,
        precipitation: `${daily.precipitation_sum[i]}mm`,
        windMax: `${daily.wind_speed_10m_max[i]}km/h`,
      })
    }

    return {
      location: `${geo.name}${geo.admin1 ? `, ${geo.admin1}` : ''}, ${geo.country}`,
      current: {
        temperature: `${current.temperature_2m}°C`,
        feelsLike: `${current.apparent_temperature}°C`,
        humidity: `${current.relative_humidity_2m}%`,
        weather: describeWeatherCode(current.weather_code),
        wind: `${current.wind_speed_10m}km/h`,
      },
      forecast,
    }
  },
})
