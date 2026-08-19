import { useEffect, useMemo, useState } from 'react'
import { Check, Monitor, RefreshCw, Tv2 } from 'lucide-react'
import type { WallpaperDisplayMode, WallpaperDisplaySettings, WallpaperItem } from '@shared/types'
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

  const load = async () => {
    setLoading(true)
    try {
      const [nextSettings, list] = await Promise.all([
        window.lingyue.wallpaper.getDisplaySettings(),
        window.lingyue.wallpaper.list(),
      ])
      setSettings(nextSettings)
      setWallpapers(list)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '显示器设置读取失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const primary = useMemo(() => settings?.displays.find((display) => display.primary), [settings])

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
        <button className="settings-btn settings-btn--sm" onClick={() => void load()} disabled={loading}><RefreshCw size={13} /> 刷新</button>
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
          {message || (primary ? `当前主显示器：${primary.bounds.width} × ${primary.bounds.height}` : '正在读取显示器…')}
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group__header">已连接显示器</div>
        <div className="settings-display-list">
          {(settings?.displays ?? []).map((display) => {
            const assignment = settings?.assignments[String(display.id)] ?? ''
            return <div className="settings-display-card" key={display.id}>
              <div className="settings-display-card__icon"><Monitor size={18} /></div>
              <div className="settings-display-card__body">
                <div className="settings-card__title">{display.label}{display.primary ? ' · 主屏' : ''}</div>
                <div className="settings-card__desc">{display.bounds.width} × {display.bounds.height} · 缩放 {Math.round(display.scaleFactor * 100)}% · 坐标 ({display.bounds.x}, {display.bounds.y})</div>
              </div>
              <div className="settings-display-card__action">
                <select className="settings-select" value={assignment} onChange={(event) => void updateAssignment(display.id, event.target.value)} disabled={settings?.mode !== 'per-display'}>
                  <option value="">跟随当前壁纸</option>
                  {wallpapers.map((wallpaper) => <option key={wallpaper.id} value={wallpaper.id}>{wallpaper.name}</option>)}
                </select>
              </div>
            </div>
          })}
          {!loading && (settings?.displays.length ?? 0) === 0 && <div className="settings-empty">没有检测到显示器</div>}
        </div>
      </div>

      <div className="settings-card settings-display-tip">
        <div className="settings-card__icon"><Tv2 size={17} /></div>
        <div className="settings-card__body">
          <div className="settings-card__title">实现方式</div>
          <div className="settings-card__desc">壁纸和组件使用一个覆盖虚拟桌面的透明窗口，按显示器边界分区渲染；显示器拔插、分辨率和缩放变化会自动重新布局，不会把副屏全屏应用误判成整桌面遮挡。</div>
        </div>
      </div>
    </div>
  )
}
