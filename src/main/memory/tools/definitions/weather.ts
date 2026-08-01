/** Weather tool backed by the same cached main-process service used by desktop widgets. */
import { tool } from 'ai'
import { z } from 'zod'
import { fetchWeatherSnapshot } from '../../../services/weather-service'

export const weatherTool = tool({
  description:
    '?????????????????????????????????????????? ok=false??????????????????',
  inputSchema: z.object({
    city: z.string().trim().max(120).optional().describe('?????????????????????????'),
    days: z.number().int().min(1).max(7).default(3).describe('?????1-7 ???? 3 ??'),
  }),
  execute: async ({ city, days }) => {
    const snapshot = await fetchWeatherSnapshot({ city, days })
    if (!snapshot.ok || !snapshot.current) {
      return {
        ok: false,
        message: snapshot.error || '????????????????????',
        userMessage: snapshot.error || '????????????????????',
        location: snapshot.location,
      }
    }
    return {
      ok: true,
      location: snapshot.location,
      usedUserLocation: snapshot.usedUserLocation,
      current: {
        temperature: `${snapshot.current.temperature}?C`,
        feelsLike: `${snapshot.current.apparentTemperature}?C`,
        humidity: `${snapshot.current.humidity}%`,
        weather: snapshot.current.weather,
        wind: `${snapshot.current.windSpeed}km/h`,
      },
      forecast: snapshot.forecast.map((item) => ({
        date: item.date,
        weather: item.weather,
        tempMax: `${item.tempMax}?C`,
        tempMin: `${item.tempMin}?C`,
        precipitation: `${item.precipitation}mm`,
        windMax: `${item.windMax}km/h`,
      })),
    }
  },
})
