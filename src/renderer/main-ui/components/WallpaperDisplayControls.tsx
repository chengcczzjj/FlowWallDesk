import { useRef, useState } from 'react'
import { LoaderCircle, Monitor } from 'lucide-react'
import type { WallpaperApplyTarget, WallpaperDisplayMode, WallpaperDisplaySettings } from '@shared/types'

const MODES: { value: WallpaperDisplayMode; label: string; description: string }[] = [
  { value: 'primary', label: '仅主显示器', description: '壁纸仅显示在 Windows 主屏。' },
  { value: 'duplicate', label: '复制到各屏', description: '同一张壁纸在各显示器上分别铺满。' },
  { value: 'per-display', label: '每屏独立', description: '为每台显示器单独选择壁纸。' },
  { value: 'span', label: '跨屏延展', description: '同一构图延展到整个桌面。' },
]

export function WallpaperDisplayControls({ settings, target, onTargetChange, onSettingsChange }: {
  settings: WallpaperDisplaySettings | null
  target: WallpaperApplyTarget
  onTargetChange: (target: WallpaperApplyTarget) => void
  onSettingsChange: (settings: WallpaperDisplaySettings) => void
}) {
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const [error, setError] = useState('')
  const mode = settings?.mode ?? 'primary'
  const display = settings?.displays.find((item) => item.id === target)
    ?? settings?.displays.find((item) => item.primary)
    ?? settings?.displays[0]

  const updateMode = async (nextMode: WallpaperDisplayMode) => {
    if (pending.current || !settings || nextMode === mode) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      const next = await window.lingyue.wallpaper.setDisplayMode(nextMode)
      onSettingsChange(next)
      if (!next.displays.some((item) => item.id === target)) {
        onTargetChange(next.displays.find((item) => item.primary)?.id ?? next.displays[0]?.id ?? 'current')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '显示模式切换失败，请重试。')
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return (
    <div className="wallpaper-display-controls" role="group" aria-label="壁纸显示设置" aria-busy={busy}>
      <label className="wallpaper-display-control" title={MODES.find((item) => item.value === mode)?.description}>
        {busy ? <LoaderCircle size={14} className="spin" aria-hidden="true" /> : <Monitor size={14} aria-hidden="true" />}
        <select
          className="wallpaper-display-picker"
          value={mode}
          disabled={busy || !settings}
          onChange={(event) => void updateMode(event.target.value as WallpaperDisplayMode)}
          aria-label="选择显示器布局"
        >
          {MODES.map((item) => <option key={item.value} value={item.value} title={item.description}>{item.label}</option>)}
        </select>
      </label>
      {mode === 'per-display' && (
        <label className="wallpaper-display-control" title={display ? `${display.label} · ${display.bounds.width} × ${display.bounds.height}` : '正在读取显示器'}>
          <select
            className="wallpaper-display-picker wallpaper-display-picker--target"
            value={display?.id ?? ''}
            disabled={busy || !settings?.displays.length}
            onChange={(event) => onTargetChange(Number(event.target.value))}
            aria-label="选择壁纸显示器"
          >
            {!settings?.displays.length && <option value="">读取中…</option>}
            {(settings?.displays ?? []).map((item, index) => (
              <option key={item.id} value={item.id}>{index + 1} 号屏{item.primary ? ' · 主屏' : ''}</option>
            ))}
          </select>
        </label>
      )}
      {error && <div className="wallpaper-display-error" role="alert">
        <span>{error}</span>
        <button type="button" onClick={() => setError('')} aria-label="关闭显示设置错误">关闭</button>
      </div>}
    </div>
  )
}
