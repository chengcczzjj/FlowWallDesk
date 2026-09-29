import { useEffect, useRef, useState } from 'react'
import { AlertCircle, LoaderCircle, Monitor, X } from 'lucide-react'
import type { WallpaperApplyTarget, WallpaperDisplayMode, WallpaperDisplaySettings } from '@shared/types'
import { SelectMenu, type SelectOption } from './ui/SelectMenu'
import { DisplayModeGlyph } from './ui/DisplayModeGlyph'

const MODES: { value: WallpaperDisplayMode; label: string; description: string }[] = [
  { value: 'primary', label: '仅主显示器', description: '壁纸只显示在 Windows 主屏' },
  { value: 'duplicate', label: '复制到各屏', description: '每块屏幕铺满同一张壁纸' },
  { value: 'per-display', label: '每屏独立', description: '为每台显示器单独选择壁纸' },
  { value: 'span', label: '跨屏延展', description: '一张构图横跨整个桌面' },
]

const MODE_OPTIONS: SelectOption<WallpaperDisplayMode>[] = MODES.map((mode) => ({
  ...mode,
  icon: <span className="display-mode-tile"><DisplayModeGlyph mode={mode.value} size={26} /></span>,
}))

const ERROR_DISMISS_MS = 8000

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
  const displays = settings?.displays ?? []
  const display = displays.find((item) => item.id === target)
    ?? displays.find((item) => item.primary)
    ?? displays[0]
  const perDisplay = mode === 'per-display'

  useEffect(() => {
    if (!error) return
    const timer = window.setTimeout(() => setError(''), ERROR_DISMISS_MS)
    return () => window.clearTimeout(timer)
  }, [error])

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

  const targetOptions: SelectOption<number>[] = displays.map((item, index) => ({
    value: item.id,
    label: `${index + 1} 号屏${item.primary ? ' · 主屏' : ''}`,
    description: `${item.bounds.width} × ${item.bounds.height}${item.scaleFactor && item.scaleFactor !== 1 ? ` · ${Math.round(item.scaleFactor * 100)}%` : ''}`,
    icon: <span className="display-index-tile">{index + 1}</span>,
  }))
  const displayIndex = display ? displays.indexOf(display) : -1

  return (
    <div className="display-switch" role="group" aria-label="壁纸显示设置" aria-busy={busy} data-per-display={perDisplay || undefined}>
      <SelectMenu
        value={mode}
        options={MODE_OPTIONS}
        onChange={(next) => void updateMode(next)}
        ariaLabel="选择显示器布局"
        disabled={busy || !settings}
        align="end"
        menuWidth={288}
        title={MODES.find((item) => item.value === mode)?.description}
        className="display-switch__trigger"
        menuClassName="display-switch__menu"
        leading={busy
          ? <LoaderCircle size={15} className="spin" />
          : <DisplayModeGlyph mode={mode} size={22} />}
      />
      {perDisplay && (
        <>
          <span className="display-switch__divider" aria-hidden="true" />
          <SelectMenu
            value={display?.id}
            options={targetOptions}
            onChange={(id) => onTargetChange(id)}
            ariaLabel="选择壁纸显示器"
            disabled={busy || displays.length === 0}
            align="end"
            menuWidth={248}
            placeholder="读取中…"
            title={display ? `${display.label} · ${display.bounds.width} × ${display.bounds.height}` : '正在读取显示器'}
            className="display-switch__trigger display-switch__trigger--target"
            leading={<Monitor size={15} />}
            renderValue={(option) => option && display ? (
              <>
                {displayIndex + 1} 号屏
                {display.primary && <span className="display-switch__tag">主屏</span>}
              </>
            ) : '读取中…'}
          />
        </>
      )}
      {error && (
        <div className="display-switch__error" role="alert" data-ly-overlay="">
          <AlertCircle size={15} aria-hidden="true" />
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="关闭显示设置错误" title="关闭">
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  )
}
