import { dirname, normalize } from 'path'

export interface AppWindowCandidate {
  hwnd: number
  processId: number
  processPath: string
  title: string
  visible: boolean
  enabled: boolean
  minimized: boolean
  owned: boolean
  toolWindow: boolean
  zOrder: number
  className?: string
  rect?: { left: number; top: number; right: number; bottom: number }
}

function pathKey(value: string): string {
  return normalize(value).toLowerCase()
}

const UTILITY_WINDOW_CLASSES = new Set([
  'base_powermessagewindow',
  'chrome_statustraywindow',
  'crashpad_sessionendwatcher',
  'gdi+ hook window class',
  'ifly_notify_window',
  'ime',
  'lark_statustraywindow',
  'msctfime ui',
])

function isUsableAppWindow(candidate: AppWindowCandidate): boolean {
  const className = candidate.className?.trim().toLowerCase() ?? ''
  if (UTILITY_WINDOW_CLASSES.has(className)) return false
  if (/^(default ime|gdi\+ window|msctfime ui)$/i.test(candidate.title.trim())) return false
  if (!candidate.rect) return true
  return candidate.rect.right - candidate.rect.left >= 120 && candidate.rect.bottom - candidate.rect.top >= 80
}

export function selectAppWindowCandidate(
  targetPath: string,
  candidates: readonly AppWindowCandidate[],
): AppWindowCandidate | undefined {
  const targetKey = pathKey(targetPath)
  const targetDir = `${pathKey(dirname(targetPath)).replace(/[\\/]+$/, '')}\\`

  return candidates
    .map((candidate) => {
      const candidateKey = pathKey(candidate.processPath)
      const exact = candidateKey === targetKey
      const sameInstallTree = candidateKey.startsWith(targetDir)
      if (!candidate.enabled || (!exact && !sameInstallTree)) return null
      if (!candidate.title.trim() || candidate.toolWindow || !isUsableAppWindow(candidate)) return null
      if (!candidate.visible && candidate.owned) return null

      const score =
        (exact ? 220 : 180) +
        (candidate.visible ? 500 : -80) +
        (candidate.minimized ? 450 : 0) +
        (candidate.owned ? -80 : 80) -
        candidate.zOrder
      return { candidate, score }
    })
    .filter((entry): entry is { candidate: AppWindowCandidate; score: number } => Boolean(entry))
    .sort((left, right) => right.score - left.score)[0]?.candidate
}
