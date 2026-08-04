import { app } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'

const MAX_LOG_BYTES = 2 * 1024 * 1024
let writeQueue: Promise<void> = Promise.resolve()

export function getDockDiagnosticLogPath(): string {
  return join(app.getPath('userData'), 'logs', 'dock-diagnostics.jsonl')
}

export function logDockDiagnostic(event: string, details: Record<string, unknown> = {}): void {
  const entry = {
    at: new Date().toISOString(),
    pid: process.pid,
    event,
    ...details,
  }
  const line = `${JSON.stringify(entry)}\n`
  console.log(`[dock-diagnostic] ${event}`, details)

  writeQueue = writeQueue
    .then(async () => {
      const logPath = getDockDiagnosticLogPath()
      await fs.mkdir(join(app.getPath('userData'), 'logs'), { recursive: true })
      try {
        const stat = await fs.stat(logPath)
        if (stat.size >= MAX_LOG_BYTES) {
          const previousPath = `${logPath}.1`
          await fs.rm(previousPath, { force: true })
          await fs.rename(logPath, previousPath)
        }
      } catch {
        // The log is created by appendFile on first use.
      }
      await fs.appendFile(logPath, line, 'utf8')
    })
    .catch((error) => {
      console.warn('[dock-diagnostic] failed to persist log:', error)
    })
}
