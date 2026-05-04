/**
 * 获取当前时间工具
 * 提供精确的日期、时间、星期、时区信息
 */
import { tool } from 'ai'
import { z } from 'zod'

export const currentTimeTool = tool({
  description:
    '获取当前的日期和时间信息，包含年月日、星期、时分秒、时区。当用户询问现在几点、今天星期几、什么日期时使用。',
  inputSchema: z.object({
    timezone: z
      .string()
      .optional()
      .describe('IANA 时区名称，如 Asia/Shanghai。默认使用系统时区。'),
  }),
  execute: async ({ timezone }) => {
    const now = new Date()
    const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
    const formatted = now.toLocaleString('zh-CN', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    return {
      formatted,
      iso: now.toISOString(),
      timezone: tz,
      timestamp: now.getTime(),
    }
  },
})
