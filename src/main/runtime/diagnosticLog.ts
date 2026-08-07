import { app } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'

const MAX_LOG_BYTES = 2 * 1024 * 1024
const writeQueues = new Map<string, Promise<void>>()

export function getDockDiagnosticLogPath(): string {
  return join(app.getPath('userData'), 'logs', 'dock-diagnostics.jsonl')
}

export function getUpdateDiagnosticLogPath(): string {
  return join(app.getPath('userData'), 'logs', 'update-diagnostics.jsonl')
}

function logDiagnostic(logPath: string, consoleScope: string, event: string, details: Record<string, unknown>): void {
  const entry = {
    at: new Date().toISOString(),
    pid: process.pid,
    event,
    ...details,
  }
  const line = `${JSON.stringify(entry)}\n`
  console.log(`[${consoleScope}-diagnostic] ${event}`, details)

  const writeQueue = writeQueues.get(logPath) ?? Promise.resolve()
  writeQueues.set(logPath, writeQueue
    .then(async () => {
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
      console.warn(`[${consoleScope}-diagnostic] failed to persist log:`, error)
    }))
}

export function logDockDiagnostic(event: string, details: Record<string, unknown> = {}): void {
  logDiagnostic(getDockDiagnosticLogPath(), 'dock', event, details)
}

export function logUpdateDiagnostic(event: string, details: Record<string, unknown> = {}): void {
  logDiagnostic(getUpdateDiagnosticLogPath(), 'update', event, details)
}
