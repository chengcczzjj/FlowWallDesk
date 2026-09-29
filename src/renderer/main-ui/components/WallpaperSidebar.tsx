import { useCallback, useEffect, useState } from 'react'
import type { WallpaperItem, WallpaperSettings } from '@shared/types'
import { toAssetUrl } from '@shared/asset-url'
import { Check, Monitor, RotateCcw, Trash2, X } from 'lucide-react'
import { SelectMenu, type SelectOption } from './ui/SelectMenu'
import { SegmentedControl, type SegmentOption } from './ui/SegmentedControl'

const TYPE_LABEL: Record<WallpaperItem['type'], string> = {
  video: '视频',
  image: '图片',
  web: '网页',
}

const SCALING_OPTIONS: SelectOption<string>[] = [
  { value: '覆盖', label: '覆盖', description: '铺满屏幕，超出部分裁切' },
  { value: '填充', label: '填充', description: '完整显示，留出边距' },
  { value: '居中', label: '居中', description: '保持原始尺寸居中' },
  { value: '拉伸', label: '拉伸', description: '拉伸到屏幕尺寸' },
  { value: '自由', label: '自由', description: '保持原比例自由摆放' },
]

const FLIP_OPTIONS: SegmentOption<string>[] = [
  { value: '无', label: '无' },
  { value: '水平', label: '水平' },
  { value: '垂直', label: '垂直' },
]

const DEFAULT_SETTINGS: Required<WallpaperSettings> = {
  volume: 50,
  speed: 1.0,
  scaling: '覆盖',
  flip: '无',
}

interface SidebarProps {
  item: WallpaperItem
  isApplied: boolean
  onApply: () => void
  onClose: () => void
  onDelete?: () => void
}

/**
 * Detail panel: slides in once when a wallpaper is selected and out when the
 * selection clears; switching wallpapers only crossfades the body.
 */
export function WallpaperSidebar(props: SidebarProps & { open: boolean }) {
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <aside className={`wallpaper-sidebar ${entered && props.open ? 'open' : ''}`} aria-label="壁纸详情" aria-hidden={!props.open}>
      <button type="button" className="ly-icon-btn ly-icon-btn--glass wallpaper-sidebar__close" title="关闭" aria-label="关闭详情" onClick={props.onClose}>
        <X size={15} />
      </button>
      <SidebarBody key={props.item.id} {...props} />
    </aside>
  )
}

function SidebarBody(props: SidebarProps) {
  const { item, isApplied } = props
  const cover =
    toAssetUrl(item.preview) ?? (item.type === 'image' ? toAssetUrl(item.source) : undefined)

  // 从壁纸配置文件加载设置
  const [volume, setVolume] = useState(item.settings?.volume ?? DEFAULT_SETTINGS.volume)
  const [speed, setSpeed] = useState(item.settings?.speed ?? DEFAULT_SETTINGS.speed)
  const [scaling, setScaling] = useState(item.settings?.scaling ?? DEFAULT_SETTINGS.scaling)
  const [flip, setFlip] = useState(item.settings?.flip ?? DEFAULT_SETTINGS.flip)

  const [saveError, setSaveError] = useState('')
  const saveSettings = useCallback((settings: WallpaperSettings) => {
    setSaveError('')
    void window.lingyue.wallpaper.saveSettings(item.id, settings).catch((error) => {
      setSaveError(error instanceof Error ? error.message : '设置保存失败，请重试。')
    })
  }, [item.id])

  const handleVolume = (v: number) => {
    setVolume(v)
    saveSettings({ volume: v })
  }
  const handleSpeed = (v: number) => {
    setSpeed(v)
    saveSettings({ speed: v })
  }
  const handleScaling = (v: string) => {
    setScaling(v)
    saveSettings({ scaling: v })
  }
  const handleFlip = (v: string) => {
    setFlip(v)
    saveSettings({ flip: v })
  }
  const handleReset = () => {
    setVolume(DEFAULT_SETTINGS.volume)
    setSpeed(DEFAULT_SETTINGS.speed)
    setScaling(DEFAULT_SETTINGS.scaling)
    setFlip(DEFAULT_SETTINGS.flip)
    const s = { ...DEFAULT_SETTINGS }
    saveSettings(s)
  }

  const showVolume = item.type === 'video' || item.type === 'web'
  const showSpeed = item.type === 'video'

  const fromFlowWall = item.meta?.Source === 'flowwall'
  const downloadedAt = typeof item.meta?.DownloadedAt === 'string'
    ? new Date(item.meta.DownloadedAt).toLocaleDateString()
    : undefined
  const author = typeof item.meta?.Author === 'string' && item.meta.Author ? item.meta.Author : undefined
  const subtitle = fromFlowWall ? `FlowWall${downloadedAt ? ` · ${downloadedAt} 下载` : ''}` : author

  return (
    <>
      <div className="sidebar__scroll">
        <div className="sidebar__header">
          <div className="sidebar__cover-frame">
            {cover ? (
              <img className="sidebar__cover" src={cover} alt="" draggable={false} />
            ) : (
              <div className="sidebar__cover-placeholder">{TYPE_LABEL[item.type]}</div>
            )}
            {isApplied && <span className="ly-chip ly-chip--accent sidebar__applied"><Check size={11} strokeWidth={3} />当前壁纸</span>}
          </div>
          <div className="sidebar__title-row">
            <h2 className="sidebar__title" title={item.name}>{item.name}</h2>
            <span className="ly-chip ly-chip--soft">{TYPE_LABEL[item.type]}</span>
          </div>
          {subtitle && <div className="sidebar__subtitle">{subtitle}</div>}
        </div>

        {saveError && <div className="ly-inline-alert ly-inline-alert--danger" role="alert">{saveError}</div>}

        <section className="sidebar-section">
          <div className="sidebar-section__title">播放与显示</div>
          <div className="sidebar-card">
            <Property label="显示策略">
              <SelectMenu
                value={scaling}
                options={SCALING_OPTIONS}
                onChange={handleScaling}
                ariaLabel="显示策略"
                align="end"
                menuWidth={200}
                className="ly-select--field"
              />
            </Property>
            <Property label="镜像翻转">
              <SegmentedControl value={flip} options={FLIP_OPTIONS} onChange={handleFlip} ariaLabel="镜像翻转" size="sm" />
            </Property>
            {showSpeed && (
              <Property label="播放速度" value={`${speed.toFixed(1)}x`} stacked>
                <RangeSlider min={0.1} max={2} step={0.1} value={speed} onChange={handleSpeed} ariaLabel="播放速度" />
              </Property>
            )}
            {showVolume && (
              <Property label="音量" value={`${volume}%`} stacked>
                <RangeSlider min={0} max={100} step={1} value={volume} onChange={handleVolume} ariaLabel="音量" />
              </Property>
            )}
          </div>
        </section>

        {item.meta && (
          <section className="sidebar-section">
            <div className="sidebar-section__title">资源信息</div>
            <dl className="sidebar-card sidebar-info">
              {author && <InfoLine label="作者" value={author} />}
              {typeof item.meta.Desc === 'string' && item.meta.Desc && <InfoLine label="描述" value={item.meta.Desc} />}
              {Array.isArray(item.meta.Tags) && (
                <InfoLine label="标签" value={(item.meta.Tags as string[]).join(' / ')} />
              )}
              {fromFlowWall && <InfoLine label="来源" value={`FlowWall 在线壁纸${downloadedAt ? ` · ${downloadedAt} 下载` : ''}`} />}
              <InfoLine label="ID" value={item.id} mono />
            </dl>
          </section>
        )}
      </div>

      <div className="sidebar__footer">
        <button
          type="button"
          className={`ly-btn ly-btn--lg sidebar__apply ${isApplied ? 'ly-btn--done' : 'ly-btn--primary'}`}
          onClick={props.onApply}
          title="应用并保存到当前显示器"
        >
          {isApplied ? <Check size={15} /> : <Monitor size={15} />}
          <span>{isApplied ? '已应用并保存' : '应用并保存'}</span>
        </button>
        <button type="button" className="ly-icon-btn ly-icon-btn--outline ly-icon-btn--lg" onClick={handleReset} title="恢复默认参数" aria-label="恢复默认参数">
          <RotateCcw size={15} />
        </button>
        {props.onDelete && (
          <button type="button" className="ly-icon-btn ly-icon-btn--outline ly-icon-btn--lg ly-icon-btn--danger" onClick={props.onDelete} title="删除本地壁纸" aria-label="删除本地壁纸">
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </>
  )
}

function Property(props: { label: string; value?: string; stacked?: boolean; children: React.ReactNode }) {
  return (
    <div className={`sidebar-row${props.stacked ? ' sidebar-row--stacked' : ''}`}>
      <div className="sidebar-row__label">
        <span>{props.label}</span>
        {props.value && <span className="sidebar-row__value">{props.value}</span>}
      </div>
      <div className="sidebar-row__control">{props.children}</div>
    </div>
  )
}

function RangeSlider(props: { min: number; max: number; step: number; value: number; ariaLabel: string; onChange: (value: number) => void }) {
  const fill = ((props.value - props.min) / (props.max - props.min)) * 100
  return (
    <input
      type="range"
      className="ly-range"
      min={props.min}
      max={props.max}
      step={props.step}
      value={props.value}
      aria-label={props.ariaLabel}
      style={{ '--fill': `${fill}%` } as React.CSSProperties}
      onChange={(event) => props.onChange(Number(event.target.value))}
    />
  )
}

function InfoLine(props: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="sidebar-info__row">
      <dt>{props.label}</dt>
      <dd className={props.mono ? 'is-mono' : undefined} title={props.value}>{props.value}</dd>
    </div>
  )
}
