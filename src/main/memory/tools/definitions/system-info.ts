/**
 * 系统信息工具 — 获取操作系统和硬件信息
 */
import { tool } from 'ai'
import { z } from 'zod'
import * as os from 'os'

export const systemInfoTool = tool({
  description:
    '获取用户电脑的系统信息，包括操作系统、CPU、内存等。当用户问"我的电脑配置"、"系统信息"时使用。',
  inputSchema: z.object({
    detail: z
      .enum(['basic', 'full'])
      .optional()
      .describe('信息详细程度。basic=基本信息，full=包含所有细节'),
  }),
  execute: async ({ detail = 'basic' }) => {
    const totalMem = os.totalmem()
    const freeMem = os.freemem()
    const cpus = os.cpus()

    const basic = {
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      hostname: os.hostname(),
      cpu: cpus[0]?.model || 'unknown',
      cpuCores: cpus.length,
      totalMemory: `${(totalMem / 1024 / 1024 / 1024).toFixed(1)} GB`,
      freeMemory: `${(freeMem / 1024 / 1024 / 1024).toFixed(1)} GB`,
      memoryUsage: `${((1 - freeMem / totalMem) * 100).toFixed(1)}%`,
      uptime: `${(os.uptime() / 3600).toFixed(1)} 小时`,
    }

    if (detail === 'full') {
      return {
        ...basic,
        homeDir: os.homedir(),
        tempDir: os.tmpdir(),
        networkInterfaces: Object.keys(os.networkInterfaces()),
        loadAvg: os.loadavg(),
      }
    }

    return basic
  },
})
