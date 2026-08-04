import { IPC } from '@shared/ipc-channels'
import { getCanvasWindow } from '../windows/canvasWindow'
import { logDockDiagnostic } from './diagnosticLog'

interface DockSelfTestTarget {
  label: string
  widgetId: string
  clientX: number
  clientY: number
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs))
}

async function findDockTarget(label: string): Promise<DockSelfTestTarget | null> {
  const win = getCanvasWindow()
  if (!win || win.webContents.isDestroyed()) return null
  return win.webContents.executeJavaScript(`(() => {
    const expected = ${JSON.stringify(label)}.toLocaleLowerCase()
    const button = Array.from(document.querySelectorAll('button[data-desktop-icon-action]'))
      .find((candidate) => (candidate.getAttribute('aria-label') || '').toLocaleLowerCase() === expected)
    if (!(button instanceof HTMLButtonElement)) return null
    const widget = button.closest('[data-widget]')
    const rect = button.getBoundingClientRect()
    return {
      label: button.getAttribute('aria-label') || '',
      widgetId: widget?.getAttribute('data-widget') || '',
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    }
  })()`, true)
}

export async function runDockLaunchSelfTest(spec: string, rounds = 3, initialDelayMs = 2_500): Promise<void> {
  const labels = spec.split(',').map((value) => value.trim()).filter(Boolean)
  if (labels.length === 0) return
  await wait(initialDelayMs)
  logDockDiagnostic('self-test.started', { labels, rounds })

  for (let round = 1; round <= rounds; round += 1) {
    for (const label of labels) {
      const win = getCanvasWindow()
      const target = await findDockTarget(label)
      if (!win || !target?.widgetId || win.webContents.isDestroyed()) {
        logDockDiagnostic('self-test.target-missing', { label, round })
        continue
      }

      const method = round % 2 === 1 ? 'renderer-click' : 'native-fallback'
      logDockDiagnostic('self-test.action', { label: target.label, round, method })
      if (method === 'renderer-click') {
        await win.webContents.executeJavaScript(`(() => {
          const expected = ${JSON.stringify(label)}.toLocaleLowerCase()
          const button = Array.from(document.querySelectorAll('button[data-desktop-icon-action]'))
            .find((candidate) => (candidate.getAttribute('aria-label') || '').toLocaleLowerCase() === expected)
          if (!(button instanceof HTMLButtonElement)) return false
          button.click()
          return true
        })()`, true)
      } else {
        const bounds = win.getBounds()
        win.webContents.send(IPC.CANVAS_NATIVE_DOCK_CLICK, {
          widgetId: target.widgetId,
          screenX: bounds.x + target.clientX,
          screenY: bounds.y + target.clientY,
          detectedAt: Date.now(),
        })
      }
      await wait(1_200)
    }
  }

  logDockDiagnostic('self-test.completed', { labels, rounds })
}
