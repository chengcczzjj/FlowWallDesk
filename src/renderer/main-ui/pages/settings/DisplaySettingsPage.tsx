import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Check, Monitor, RefreshCw, Tv2 } from 'lucide-react'
import type { WallpaperDisplayMode, WallpaperDisplaySettings, WallpaperItem } from '@shared/types'
import { DISPLAY_MODE_OPTIONS, formatDisplayResolution, layoutDisplayTopology } from '@shared/display-topology'
import './settings.css'

type StatusTone = 'info' | 'success' | 'error'

function readErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : ''
  return message.replace(/^Error invoking remote method '[^']+':\s*(?:\w*Error:\s*)?/, '').trim() || fallback
}

export function DisplaySettingsPage() {
  const [settings, setSettings] = useState<WallpaperDisplaySettings | null>(null)
  const [wallpapers, setWallpapers] = useState<WallpaperItem[]>([])
  const [status, setStatus] = useState<{ tone: StatusTone; text: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [selectedDisplayId, setSelectedDisplayId] = useState<number>()
  const topologyRef = useRef<HTMLDivElement>(null)
  const [topologySize, setTopologySize] = useState({ width: 0, height: 0 })

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const [nextSettings, list] = await Promise.all([
        window.lingyue.wallpaper.getDisplaySettings(),
        window.lingyue.wallpaper.list(),
      ])
      setSettings(nextSettings)
      setWallpapers(list)
      setSelectedDisplayId((current) => (
        nextSettings.displays.some((display) => display.id === current)
          ? current
          : nextSettings.displays.find((display) => display.primary)?.id ?? nextSettings.displays[0]?.id
      ))
    } catch (error) {
      setStatus({ tone: 'error', text: readErrorMessage(error, '显示器设置读取失败') })
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    return window.lingyue.wallpaper.onDisplaySettingsChanged(() => void load(false))
  }, [load])

  // Success notes fade out; errors stay until the next action.
  useEffect(() => {
    if (status?.tone !== 'success') return undefined
    const timer = window.setTimeout(() => setStatus(null), 3200)
    return () => window.clearTimeout(timer)
  }, [status])

  useLayoutEffect(() => {
    const element = topologyRef.current
    if (!element) return undefined
    const measure = () => {
      const width = Math.round(element.clientWidth)
      const height = Math.round(element.clientHeight)
      setTopologySize((current) => (current.width === width && current.height === height ? current : { width, height }))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const displays = useMemo(() => settings?.displays ?? [], [settings])
  const displayCount = displays.length
  const primary = displays.find((display) => display.primary)
  const topology = useMemo(
    () => layoutDisplayTopology(displays.map((display, index) => ({ ...display, number: index + 1 })), topologySize, 18),
    [displays, topologySize],
  )

  const runAction = async (pending: string, action: () => Promise<WallpaperDisplaySettings>, success: string, failure: string) => {
    if (busy) return
    setBusy(true)
    setStatus({ tone: 'info', text: pending })
    try {
      setSettings(await action())
      setStatus({ tone: 'success', text: success })
    } catch (error) {
      setStatus({ tone: 'error', text: readErrorMessage(error, failure) })
    } finally {
      setBusy(false)
    }
  }

  const updateMode = (mode: WallpaperDisplayMode) => {
    if (settings?.mode === mode) return
    void runAction(
      '正在应用显示器布局…',
      () => window.lingyue.wallpaper.setDisplayMode(mode),
      mode === 'primary' ? '已切换为仅主显示器' : '显示器布局已应用',
      '布局应用失败',
    )
  }

  const updateAssignment = (displayId: number, wallpaperId: string) => {
    void runAction(
      '正在保存壁纸分配…',
      () => window.lingyue.wallpaper.setDisplayAssignment(displayId, wallpaperId || null),
      '壁纸分配已保存',
      '壁纸分配失败',
    )
  }

  const summary = loading && !settings
    ? { title: '正在检测显示器…', detail: '正在向 Windows 读取显示器排列。', state: '检测中', ready: false }
    : displayCount > 1
      ? { title: '已识别多台显示器', detail: '可以选择布局，或在“每台显示器单独设置”下为每个屏幕指定壁纸。', state: '多屏就绪', ready: true }
      : { title: 'Windows 当前只报告一台显示器', detail: '如已连接副屏，请在 Windows 显示设置中选择“扩展这些显示器”，然后重新检测。', state: '单屏', ready: false }

  return (
    <div className="settings-scroll">
      <div className="settings-hero">
        <div className="settings-hero__icon"><Tv2 size={20} /></div>
        <div className="settings-hero__copy">
          <h1>显示器与壁纸</h1>
          <p>跟随 Windows 显示器排列，自动处理副屏位置、任务栏区域和热插拔。</p>
        </div>
        <button className="settings-btn settings-btn--sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'settings-spin' : ''} /> 重新检测
        </button>
      </div>

      <div className="settings-display-summary">
        <div className="settings-display-summary__count"><strong>{loading && !settings ? '–' : displayCount}</strong><span>台显示器</span></div>
        <div className="settings-display-summary__copy">
          <strong>{summary.title}</strong>
          <small>{summary.detail}</small>
        </div>
        <span className={`settings-display-summary__state${summary.ready ? ' ready' : ''}`}>{summary.state}</span>
      </div>

      <div className="settings-group">
        <div className="settings-group__header">屏幕排列</div>
        <div className="settings-topology" ref={topologyRef} role="group" aria-label="Windows 显示器排列">
          {topology.map((display) => {
            const compact = display.rect.width < 120 || display.rect.height < 64
            const description = `${display.label}${display.primary ? '（主显示器）' : ''} · ${formatDisplayResolution(display)}${display.name ? ` · ${display.name}` : ''}`
            return (
              <button
                key={display.id}
                type="button"
                className={`settings-topology__monitor${selectedDisplayId === display.id ? ' selected' : ''}${display.primary ? ' primary' : ''}${compact ? ' compact' : ''}`}
                style={display.rect}
                onClick={() => setSelectedDisplayId(display.id)}
                title={description}
                aria-label={description}
                aria-pressed={selectedDisplayId === display.id}
              >
                <strong>{display.number}</strong>
                {!compact && (
                  <span className="settings-topology__meta">
                    <span>{display.label}{display.primary ? ' · 主显示器' : ''}</span>
                    <small>{formatDisplayResolution(display)}</small>
                  </span>
                )}
              </button>
            )
          })}
          {!loading && topology.length === 0 && displayCount === 0 && (
            <div className="settings-topology__empty">暂时没有从 Windows 读取到显示器，请重新检测。</div>
          )}
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group__header">显示器布局</div>
        <div className="settings-mode-grid" aria-busy={busy}>
          {DISPLAY_MODE_OPTIONS.map((mode) => {
            const selected = settings?.mode === mode.value
            return (
              <button
                key={mode.value}
                type="button"
                className={`settings-mode-card${selected ? ' selected' : ''}`}
                onClick={() => updateMode(mode.value)}
                disabled={busy || !settings}
                aria-pressed={selected}
              >
                <span className="settings-mode-card__icon">{selected ? <Check size={16} /> : <Monitor size={16} />}</span>
                <span className="settings-mode-card__copy"><strong>{mode.label}</strong><small>{mode.description}</small></span>
              </button>
            )
          })}
        </div>
        <div className="settings-display-note">
          {primary ? `当前主显示器：${primary.label} · ${formatDisplayResolution(primary)}` : loading ? '正在读取显示器…' : ''}
        </div>
        {status && (
          <div className={`settings-display-status settings-display-status--${status.tone}`} role={status.tone === 'error' ? 'alert' : 'status'}>
            {status.text}
          </div>
        )}
      </div>

      <div className="settings-group">
        <div className="settings-group__header">已连接显示器</div>
        {settings && settings.mode !== 'per-display' && displayCount > 1 && (
          <div className="settings-display-note settings-display-note--above">切换到“每台显示器单独设置”后可以为每个屏幕指定壁纸。</div>
        )}
        <div className="settings-display-list">
          {displays.map((display) => {
            const assignment = settings?.assignments[String(display.id)] ?? ''
            const selected = selectedDisplayId === display.id
            return (
              <div className={`settings-display-card${selected ? ' selected' : ''}`} key={display.id}>
                <button
                  type="button"
                  className="settings-display-card__select"
                  onClick={() => setSelectedDisplayId(display.id)}
                  aria-pressed={selected}
                >
                  <span className="settings-display-card__icon"><Monitor size={18} /></span>
                  <span className="settings-display-card__body">
                    <span className="settings-card__title">{display.label}{display.primary ? ' · 主显示器' : ''}</span>
                    <span className="settings-card__desc">
                      {display.name ? `${display.name} · ` : ''}{formatDisplayResolution(display)} · 缩放 {Math.round(display.scaleFactor * 100)}%
                    </span>
                  </span>
                </button>
                <div className="settings-display-card__action">
                  <select
                    className="settings-select"
                    value={assignment}
                    onChange={(event) => updateAssignment(display.id, event.target.value)}
                    disabled={busy || settings?.mode !== 'per-display'}
                    aria-label={`${display.label}壁纸`}
                  >
                    <option value="">跟随当前壁纸</option>
                    {wallpapers.map((wallpaper) => <option key={wallpaper.id} value={wallpaper.id}>{wallpaper.name}</option>)}
                  </select>
                </div>
              </div>
            )
          })}
          {!loading && displayCount === 0 && <div className="settings-empty">没有检测到显示器。请先在 Windows 显示设置中启用副屏。</div>}
        </div>
      </div>

      <div className="settings-card settings-display-tip">
        <div className="settings-card__icon"><Tv2 size={18} /></div>
        <div className="settings-card__body">
          <div className="settings-card__title">工作方式</div>
          <div className="settings-card__desc">复制和单独设置模式会为每台显示器创建独立的桌面壁纸窗口，避免不同缩放比例导致跨屏拉伸；只有“跨屏延展”使用覆盖整个虚拟桌面的单一窗口。显示器拔插、分辨率和缩放变化会自动重建布局，离开可见区域的组件会移回最近的显示器。</div>
        </div>
      </div>
    </div>
  )
}
