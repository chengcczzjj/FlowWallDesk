import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  WallpaperApplyTarget,
  WallpaperDisplayMode,
  WallpaperDisplaySettings,
  WallpaperItem,
} from '@shared/types'
import { toAssetUrl } from '@shared/asset-url'
import { WallpaperSidebar } from '../components/WallpaperSidebar'
import { ImageOff, Monitor, Plus } from 'lucide-react'
import type { InitialFile } from '../components/AddWallpaperDialog'

const TYPE_LABEL: Record<WallpaperItem['type'], string> = {
  video: '视频',
  image: '图片',
  web: '网页',
}

const DISPLAY_MODE_COPY: Record<WallpaperDisplayMode, { label: string; description: string }> = {
  primary: { label: '仅主显示器', description: '壁纸只铺满 Windows 主显示器。' },
  duplicate: { label: '复制到每台显示器', description: '同一张壁纸会在每台显示器上独立铺满。' },
  'per-display': { label: '每台显示器单独设置', description: '当前选择只会替换指定显示器的壁纸。' },
  span: { label: '跨屏延展', description: '一张壁纸会铺满整个 Windows 虚拟桌面。' },
}

export function LibraryPage({
  search,
  refreshKey,
  wallpaperTarget = 'current',
  displaySettings,
  onDisplaySelect,
  onDisplaySettingsChange,
  onDropFile,
}: {
  search: string
  refreshKey?: number
  wallpaperTarget?: WallpaperApplyTarget
  displaySettings?: WallpaperDisplaySettings | null
  onDisplaySelect?: (target: WallpaperApplyTarget) => void
  onDisplaySettingsChange?: (settings: WallpaperDisplaySettings) => void
  onDropFile?: (file: InitialFile) => void
}) {
  const [list, setList] = useState<WallpaperItem[]>([])
  const [loadedDisplaySettings, setLoadedDisplaySettings] = useState<WallpaperDisplaySettings | null>(displaySettings ?? null)
  const [selectedId, setSelectedId] = useState<string | undefined>()
  const [appliedId, setAppliedId] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([
      window.lingyue.wallpaper.list(),
      window.lingyue.wallpaper.getCurrent(),
      window.lingyue.wallpaper.getDisplaySettings(),
    ]).then(
      ([items, current, nextDisplaySettings]) => {
        if (!alive) return
        setList(items)
        setLoadedDisplaySettings(nextDisplaySettings)
        setLoading(false)
        const displayId = typeof wallpaperTarget === 'number' && nextDisplaySettings.displays.some((display) => display.id === wallpaperTarget)
          ? wallpaperTarget
          : nextDisplaySettings.displays.find((display) => display.primary)?.id ?? nextDisplaySettings.displays[0]?.id
        if (nextDisplaySettings.mode === 'per-display' && displayId !== undefined && displayId !== wallpaperTarget) {
          onDisplaySelect?.(displayId)
        }
        const effectiveId = nextDisplaySettings.mode === 'per-display' && displayId !== undefined
          ? nextDisplaySettings.assignments[String(displayId)] ?? current?.current?.id
          : current?.current?.id
        if (effectiveId) {
          setAppliedId(effectiveId)
          setSelectedId(effectiveId)
        } else if (items[0]) {
          setSelectedId(items[0].id)
        }
      }
    )
    return () => {
      alive = false
    }
  }, [refreshKey, wallpaperTarget, displaySettings, onDisplaySelect])

  const activeSettings = displaySettings ?? loadedDisplaySettings
  const activeDisplayId = typeof wallpaperTarget === 'number' && activeSettings?.displays.some((display) => display.id === wallpaperTarget)
    ? wallpaperTarget
    : activeSettings?.displays.find((display) => display.primary)?.id ?? activeSettings?.displays[0]?.id
  const activeDisplay = activeSettings?.displays.find((display) => display.id === activeDisplayId)
  const activeMode = activeSettings?.mode ?? 'primary'
  const activeModeCopy = DISPLAY_MODE_COPY[activeMode]

  const filtered = useMemo(() => {
    if (!search.trim()) return list
    const q = search.trim().toLowerCase()
    return list.filter((w) => w.name.toLowerCase().includes(q) || w.id.toLowerCase().includes(q))
  }, [list, search])

  const selected = useMemo(
    () => filtered.find((w) => w.id === selectedId) ?? list.find((w) => w.id === selectedId),
    [filtered, list, selectedId]
  )

  const apply = async (item: WallpaperItem) => {
    try {
      const target = activeMode === 'per-display' && activeDisplayId !== undefined
        ? activeDisplayId
        : 'current'
      await window.lingyue.wallpaper.apply(item, target)
      const nextSettings = await window.lingyue.wallpaper.getDisplaySettings()
      setAppliedId(item.id)
      setLoadedDisplaySettings(nextSettings)
      onDisplaySettingsChange?.(nextSettings)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '应用壁纸失败')
    }
  }

  const updateDisplayMode = async (mode: WallpaperDisplayMode) => {
    try {
      const nextSettings = await window.lingyue.wallpaper.setDisplayMode(mode)
      setLoadedDisplaySettings(nextSettings)
      onDisplaySettingsChange?.(nextSettings)
      const current = await window.lingyue.wallpaper.getCurrent()
      const effectiveId = mode === 'per-display' && activeDisplayId !== undefined
        ? nextSettings.assignments[String(activeDisplayId)] ?? current?.current?.id
        : current?.current?.id
      setAppliedId(effectiveId)
      if (effectiveId) setSelectedId(effectiveId)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '显示器布局应用失败')
    }
  }

  const remove = async (item: WallpaperItem) => {
    if (item.id === appliedId) {
      window.alert('当前正在使用这张壁纸，请先切换到其他壁纸。')
      return
    }
    if (!window.confirm(`删除本地壁纸“${item.name}”？此操作会移除本机副本。`)) return
    const result = await window.lingyue.wallpaper.remove(item.id)
    if (!result.ok) {
      window.alert(result.error || '删除失败')
      return
    }
    setList((current) => current.filter((candidate) => candidate.id !== item.id))
    setSelectedId(undefined)
  }

  // 页面级拖放
  const handlePageDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])
  const handlePageDragLeave = useCallback((e: React.DragEvent) => {
    // 只在离开 library-page 时关闭
    const rel = e.relatedTarget as HTMLElement | null
    const page = e.currentTarget as HTMLElement
    if (!rel || !page.contains(rel)) {
      setDragOver(false)
    }
  }, [])
  const handlePageDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const files = e.dataTransfer.files
      if (files.length > 0 && onDropFile) {
        const f = files[0]
        const path = (f as File & { path?: string }).path
        if (path) {
          onDropFile({ path, name: f.name })
        }
      }
    },
    [onDropFile]
  )

  return (
    <div
      className="library-page"
      onDragOver={handlePageDragOver}
      onDragLeave={handlePageDragLeave}
      onDrop={handlePageDrop}
    >
      {/* 拖放覆盖层 */}
      {dragOver && (
        <div className="library-dropzone active">
          <div className="library-dropzone__border">
            <Plus size={48} style={{ color: 'var(--text-tertiary)' }} />
            <span className="library-dropzone__text">拖放壁纸文件到此处</span>
          </div>
        </div>
      )}
      {/* 模糊背景 */}
      <div className={`library-bg ${selected?.preview ? 'show' : ''}`}>
        {selected?.preview && <img src={toAssetUrl(selected.preview)} alt="" />}
      </div>

      <div className="library-content" style={{ marginRight: selected ? 320 : 0 }}>
        <div className="library-toolbar">
          <div className="library-toolbar__copy">
            <span className="library-toolbar__eyebrow">WALLPAPER DISPLAY</span>
            <strong>{activeMode === 'per-display' && activeDisplay
              ? `${activeModeCopy.label} · ${activeDisplay.label}${activeDisplay.primary ? ' · 主屏' : ''}`
              : activeModeCopy.label}</strong>
            <small>{activeMode === 'per-display' && !activeDisplay ? '正在读取 Windows 显示器…' : activeModeCopy.description}</small>
          </div>
          <div className="library-display-controls">
            <label className="library-display-select">
              <Monitor size={15} />
              <span className="sr-only">选择显示器布局</span>
              <select
                value={activeMode}
                onChange={(event) => void updateDisplayMode(event.target.value as WallpaperDisplayMode)}
                aria-label="选择显示器布局"
              >
                {Object.entries(DISPLAY_MODE_COPY).map(([mode, copy]) => (
                  <option key={mode} value={mode}>{copy.label}</option>
                ))}
              </select>
            </label>
            {activeMode === 'per-display' && (
              <label className="library-display-select">
                <Monitor size={15} />
                <span className="sr-only">选择壁纸显示器</span>
                <select
                  value={activeDisplayId ?? ''}
                  onChange={(event) => onDisplaySelect?.(Number(event.target.value))}
                  disabled={!activeSettings?.displays.length}
                  aria-label="选择壁纸显示器"
                >
                  {!activeSettings?.displays.length && <option value="">读取中…</option>}
                  {(activeSettings?.displays ?? []).map((display) => (
                    <option key={display.id} value={display.id}>
                      {display.label}{display.primary ? ' · 主屏' : ''} · {display.bounds.width} × {display.bounds.height}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>
        {loading ? (
          <div className="empty-page">加载中…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-page">
            <ImageOff size={48} />
            <div className="empty-page__title">未找到壁纸</div>
          </div>
        ) : (
          <div className="library-grid">
            {filtered.map((w, i) => (
              <WallpaperCard
                key={w.id}
                item={w}
                index={i}
                selected={w.id === selectedId}
                applied={w.id === appliedId}
                onClick={() => setSelectedId(w.id)}
                onDoubleClick={() => apply(w)}
              />
            ))}
          </div>
        )}
      </div>

      {selected && (
        <WallpaperSidebar
          key={selected.id}
          item={selected}
          isApplied={selected.id === appliedId}
          onApply={() => apply(selected)}
          onClose={() => setSelectedId(undefined)}
          onDelete={selected.id.startsWith('user:') ? () => void remove(selected) : undefined}
        />
      )}
    </div>
  )
}

function WallpaperCard(props: {
  item: WallpaperItem
  index: number
  selected: boolean
  applied: boolean
  onClick: () => void
  onDoubleClick: () => void
}) {
  const { item, index, selected, applied } = props
  const previewUrl = toAssetUrl(item.preview)
  const fallbackUrl = item.type === 'image' ? toAssetUrl(item.source) : undefined
  const src = previewUrl ?? fallbackUrl

  return (
    <div
      className={`wallpaper-card ${selected ? 'selected' : ''} ${applied ? 'applied' : ''}`}
      style={{ animationDelay: `${Math.min(index * 0.04, 0.4)}s` }}
      onClick={props.onClick}
      onDoubleClick={props.onDoubleClick}
      title={item.name}
    >
      {src ? (
        <img className="wallpaper-card__image" src={src} alt={item.name} loading="lazy" />
      ) : (
        <div className="wallpaper-card__placeholder">{TYPE_LABEL[item.type]}</div>
      )}
      <div className="wallpaper-card__type">{TYPE_LABEL[item.type]}</div>
      <div className="wallpaper-card__gradient" />
      <div className="wallpaper-card__title">{item.name}</div>
    </div>
  )
}
