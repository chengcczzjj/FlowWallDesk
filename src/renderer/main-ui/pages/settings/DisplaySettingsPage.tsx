import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Monitor, RefreshCw, Tv2 } from 'lucide-react'
import type { WallpaperDisplayMode, WallpaperDisplaySettings, WallpaperItem } from '@shared/types'
import { getDisplayAssignment } from '@shared/wallpaper-display-layout'
import './settings.css'

const MODES: Array<{ value: WallpaperDisplayMode; title: string; description: string }> = [
  { value: 'primary', title: '仅主显示器', description: '保持兼容的单屏模式，壁纸与组件只显示在主屏。' },
  { value: 'duplicate', title: '复制到每台显示器', description: '每台显示器独立铺满同一张壁纸，适合视频与动效。' },
  { value: 'per-display', title: '每台显示器单独设置', description: '为不同显示器选择不同壁纸，缺省时回退到当前壁纸。' },
  { value: 'span', title: '跨屏延展', description: '把一张壁纸按虚拟桌面尺寸延展到所有显示器。' },
]

export function DisplaySettingsPage() {
  const [settings, setSettings] = useState<WallpaperDisplaySettings | null>(null)
  const [wallpapers, setWallpapers] = useState<WallpaperItem[]>([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedDisplayId, setSelectedDisplayId] = useState<number>()

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
      setMessage(error instanceof Error ? error.message : '显示器设置读取失败')
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    return window.lingyue.wallpaper.onDisplaySettingsChanged(() => void load(false))
  }, [load])

  const primary = useMemo(() => settings?.displays.find((display) => display.primary), [settings])
  const topology = useMemo(() => {
    const displays = settings?.displays ?? []
    if (displays.length === 0) return []
    const left = Math.min(...displays.map((display) => display.bounds.x))
    const top = Math.min(...displays.map((display) => display.bounds.y))
    const right = Math.max(...displays.map((display) => display.bounds.x + display.bounds.width))
    const bottom = Math.max(...displays.map((display) => display.bounds.y + display.bounds.height))
    const width = Math.max(1, right - left)
    const height = Math.max(1, bottom - top)
    return displays.map((display, index) => ({
      ...display,
      number: index + 1,
      style: {
        left: `${4 + ((display.bounds.x - left) / width) * 92}%`,
        top: `${8 + ((display.bounds.y - top) / height) * 84}%`,
        width: `${Math.max(13, (display.bounds.width / width) * 92)}%`,
        height: `${Math.max(30, (display.bounds.height / height) * 84)}%`,
      },
    }))
  }, [settings])

  const updateMode = async (mode: WallpaperDisplayMode) => {
    try {
      setMessage('正在应用显示器布局…')
      const next = await window.lingyue.wallpaper.setDisplayMode(mode)
      setSettings(next)
      setMessage(mode === 'primary' ? '已恢复单显示器模式' : '显示器布局已应用')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '布局应用失败')
    }
  }

  const updateAssignment = async (displayId: number, wallpaperId: string) => {
    try {
      const next = await window.lingyue.wallpaper.setDisplayAssignment(displayId, wallpaperId || null)
      setSettings(next)
      setMessage('壁纸分配已保存')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '壁纸分配失败')
    }
  }

  return (
    <div className="settings-scroll">
      <div className="settings-hero">
        <div className="settings-hero__icon"><Tv2 size={22} /></div>
        <div>
          <div className="settings-hero__eyebrow">DISPLAY TOPOLOGY</div>
          <h1>显示器与壁纸</h1>
          <p>灵月会跟随 Windows 显示器排列，自动处理负坐标、任务栏工作区和热插拔。</p>
        </div>
        <button className="settings-btn settings-btn--sm" onClick={() => void load()} disabled={loading}><RefreshCw size={13} className={loading ? 'settings-spin' : ''} /> 重新检测</button>
      </div>

      <div className="settings-display-summary">
        <div className="settings-display-summary__count"><strong>{settings?.displays.length ?? 0}</strong><span>台显示器</span></div>
        <div className="settings-display-summary__copy">
          <strong>{(settings?.displays.length ?? 0) > 1 ? 'Windows 多显示器已识别' : 'Windows 当前只报告一台显示器'}</strong>
          <small>{(settings?.displays.length ?? 0) > 1 ? '下方每个屏幕都可以单独分配壁纸。' : '请确认副屏已在 Windows 设置中选择“扩展这些显示器”，然后重新检测。'}</small>
        </div>
        <span className={`settings-display-summary__state${(settings?.displays.length ?? 0) > 1 ? ' ready' : ''}`}>{(settings?.displays.length ?? 0) > 1 ? '多屏就绪' : '单屏模式'}</span>
      </div>

      <div className="settings-group">
        <div className="settings-group__header">Windows 屏幕排列</div>
        <div className="settings-topology" aria-label="Windows 显示器排列">
          {topology.map((display) => <button
            key={display.id}
            className={`settings-topology__monitor${selectedDisplayId === display.id ? ' selected' : ''}${display.primary ? ' primary' : ''}`}
            style={display.style}
            onClick={() => setSelectedDisplayId(display.id)}
          >
            <strong>{display.number}</strong>
            <span>{display.label}{display.primary ? ' · 主屏' : ''}</span>
            <small>{display.bounds.width} × {display.bounds.height}{display.name ? ` · ${display.name}` : ''}</small>
          </button>)}
          {!loading && topology.length === 0 && <div className="settings-topology__empty">暂时没有从 Windows 读取到显示器，请重新检测。</div>}
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group__header">显示器布局</div>
        <div className="settings-mode-grid">
          {MODES.map((mode) => {
            const selected = settings?.mode === mode.value
            return <button key={mode.value} className={`settings-mode-card${selected ? ' selected' : ''}`} onClick={() => void updateMode(mode.value)} aria-pressed={selected}>
              <span className="settings-mode-card__icon">{selected ? <Check size={16} /> : <Monitor size={16} />}</span>
              <span className="settings-mode-card__copy"><strong>{mode.title}</strong><small>{mode.description}</small></span>
            </button>
          })}
        </div>
        <div className="settings-card__desc" style={{ marginTop: 10 }}>
          {message || (primary ? `当前主显示器：${primary.label} · ${primary.bounds.width} × ${primary.bounds.height}` : '正在读取显示器…')}
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group__header">已连接显示器</div>
        <div className="settings-display-list">
          {(settings?.displays ?? []).map((display) => {
            const assignment = settings ? getDisplayAssignment(settings.assignments, display) ?? '' : ''
            return <div className={`settings-display-card${selectedDisplayId === display.id ? ' selected' : ''}`} key={display.id} onClick={() => setSelectedDisplayId(display.id)}>
              <div className="settings-display-card__icon"><Monitor size={18} /></div>
              <div className="settings-display-card__body">
                <div className="settings-card__title">{display.label}{display.primary ? ' · 主屏' : ''}</div>
                <div className="settings-card__desc">{display.name ? `${display.name} · ` : ''}{display.bounds.width} × {display.bounds.height} · 缩放 {Math.round(display.scaleFactor * 100)}% · 坐标 ({display.bounds.x}, {display.bounds.y})</div>
              </div>
              <div className="settings-display-card__action">
                <select className="settings-select" value={assignment} onClick={(event) => event.stopPropagation()} onChange={(event) => void updateAssignment(display.id, event.target.value)} disabled={settings?.mode !== 'per-display'} aria-label={`${display.label}壁纸`}>
                  <option value="">跟随当前壁纸</option>
                  {wallpapers.map((wallpaper) => <option key={wallpaper.id} value={wallpaper.id}>{wallpaper.name}</option>)}
                </select>
              </div>
            </div>
          })}
          {!loading && (settings?.displays.length ?? 0) === 0 && <div className="settings-empty">没有检测到显示器。请先在 Windows 显示设置中启用副屏。</div>}
        </div>
      </div>

      <div className="settings-card settings-display-tip">
        <div className="settings-card__icon"><Tv2 size={17} /></div>
        <div className="settings-card__body">
          <div className="settings-card__title">实现方式</div>
          <div className="settings-card__desc">复制和单独设置模式会为每台显示器创建独立的桌面壁纸窗口，避免不同缩放比例导致跨屏拉伸；只有“跨屏延展”会使用覆盖整个虚拟桌面的单一窗口。显示器拔插、分辨率和缩放变化会自动重建布局。</div>
        </div>
      </div>
    </div>
  )
}
