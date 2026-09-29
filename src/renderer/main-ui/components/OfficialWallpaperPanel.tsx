import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowUpCircle,
  Check,
  CloudOff,
  Download,
  Loader2,
  Monitor,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react'
import type {
  WallpaperDisplaySettings,
  WallpaperApplyTarget,
  WallpaperItem,
  WallpaperOwnerStatus,
  WallpaperResourceCatalog,
  WallpaperResourceCatalogItem,
  WallpaperResourceProgress,
} from '@shared/types'
import { toAssetUrl } from '@shared/asset-url'
import { getDisplayAssignment } from '@shared/wallpaper-display-layout'
import { WallpaperOwnerDialog } from './WallpaperOwnerDialog'

const ONLINE_TYPE_LABEL: Record<string, string> = {
  video: '视频',
  image: '图片',
  web: '网页',
}

const EMPTY_CATALOG: WallpaperResourceCatalog = {
  source: 'empty',
  fetchedAt: 0,
  items: [],
}

const SOURCE_LABEL: Record<WallpaperResourceCatalog['source'], string> = {
  network: '在线清单已连接',
  cache: '正在使用离线缓存',
  empty: '在线清单不可用',
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes < 1) return '未知大小'
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  return `${(bytes / 1024 ** 2).toFixed(bytes >= 100 * 1024 ** 2 ? 0 : 1)} MB`
}

function stateLabel(item: WallpaperResourceCatalogItem): string {
  if (item.installState === 'installed') return `已下载 ${item.installedVersion}`
  if (item.installState === 'update-available') return `${item.installedVersion} → ${item.version}`
  if (item.installState === 'downloading') return '下载中'
  if (item.installState === 'installing') return '安装中'
  if (item.installState === 'error') return '安装失败'
  return `版本 ${item.version}`
}

/**
 * 灵月官方在线壁纸（GitHub Release 托管的清单）。在「壁纸库」发现页的侧栏里，
 * 与 FlowWall 下载记录并列，下载/更新/应用都作用于工具栏选中的显示目标。
 */
export function OfficialWallpaperPanel({
  wallpaperTarget = 'current',
  displaySettings,
}: {
  wallpaperTarget?: WallpaperApplyTarget
  displaySettings?: WallpaperDisplaySettings | null
}) {
  const [catalog, setCatalog] = useState<WallpaperResourceCatalog>(EMPTY_CATALOG)
  const [localItems, setLocalItems] = useState<WallpaperItem[]>([])
  const [currentId, setCurrentId] = useState<string>()
  const [ownerStatus, setOwnerStatus] = useState<WallpaperOwnerStatus | null>(null)
  const [showOwnerDialog, setShowOwnerDialog] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [actionId, setActionId] = useState<string>()
  const [progress, setProgress] = useState<Record<string, WallpaperResourceProgress>>({})
  const [actionError, setActionError] = useState('')

  const load = useCallback(async (force = false) => {
    if (force) setRefreshing(true)
    try {
      const [nextCatalog, nextLocal, current, owner, displaySettings] = await Promise.all([
        force
          ? window.lingyue.wallpaper.refreshResourceCatalog()
          : window.lingyue.wallpaper.getResourceCatalog(),
        window.lingyue.wallpaper.list(),
        window.lingyue.wallpaper.getCurrent(),
        window.lingyue.wallpaper.getOwnerStatus(),
        window.lingyue.wallpaper.getDisplaySettings(),
      ])
      setCatalog(nextCatalog)
      setLocalItems(nextLocal)
      const targetDisplay = typeof wallpaperTarget === 'number'
        ? displaySettings.displays.find((display) => display.id === wallpaperTarget)
        : undefined
      setCurrentId(targetDisplay
        ? getDisplayAssignment(displaySettings.assignments, targetDisplay) ?? current?.current?.id
        : current?.current?.id)
      setOwnerStatus(owner)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '在线壁纸库读取失败')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [wallpaperTarget])

  useEffect(() => {
    void load(false)
  }, [load])

  useEffect(() => window.lingyue.wallpaper.onResourceProgress((next) => {
    setProgress((current) => ({ ...current, [next.wallpaperId]: next }))
    if (next.phase === 'complete') void load(false)
  }), [load])

  useEffect(() => window.lingyue.wallpaper.onResourceCatalogChanged(() => {
    void load(false)
  }), [load])

  const localById = new Map(localItems.map((item) => [item.id, item]))

  const install = async (item: WallpaperResourceCatalogItem) => {
    setActionId(item.id)
    setActionError('')
    try {
      const result = await window.lingyue.wallpaper.installResource(item.id)
      if (!result.ok) setActionError(result.error || '安装失败')
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '安装失败')
    } finally {
      setActionId(undefined)
    }
    await load(false)
  }

  const apply = async (item: WallpaperResourceCatalogItem) => {
    const local = item.localWallpaperId ? localById.get(item.localWallpaperId) : undefined
    if (!local) return
    try {
      await window.lingyue.wallpaper.apply(local, wallpaperTarget)
      setCurrentId(local.id)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '应用壁纸失败')
    }
  }

  const remove = async (item: WallpaperResourceCatalogItem) => {
    if (!window.confirm(`删除已下载的“${item.title}”？在线资源仍可重新下载。`)) return
    setActionId(item.id)
    setActionError('')
    try {
      const result = await window.lingyue.wallpaper.removeResource(item.id)
      if (!result.ok) setActionError(result.error || '删除失败')
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '删除失败')
    } finally {
      setActionId(undefined)
    }
    await load(false)
  }

  // In per-display mode "应用" targets the monitor chosen in the toolbar; say which.
  const targetIndex = displaySettings?.mode === 'per-display' && typeof wallpaperTarget === 'number'
    ? displaySettings.displays.findIndex((candidate) => candidate.id === wallpaperTarget)
    : -1

  return (
    <div className="official-panel">
      <div className="official-panel__status">
        <span className={`status-dot status-dot--${catalog.source}`} aria-hidden="true" />
        <span className="official-panel__status-text">
          {SOURCE_LABEL[catalog.source]}
          {catalog.items.length > 0 && ` · ${catalog.items.length} 项`}
        </span>
        {ownerStatus?.enabled && (
          <button type="button" className="ly-icon-btn ly-icon-btn--sm" onClick={() => setShowOwnerDialog(true)} title="资源发布管理" aria-label="资源发布管理">
            <ShieldCheck size={15} />
          </button>
        )}
        <button
          type="button"
          className="ly-icon-btn ly-icon-btn--sm"
          disabled={refreshing}
          onClick={() => void load(true)}
          title={refreshing ? '刷新中' : '刷新资源'}
          aria-label="刷新资源"
        >
          <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
        </button>
      </div>
      {targetIndex >= 0 && (
        <div className="official-panel__target">
          <Monitor size={13} aria-hidden="true" />
          <span>应用到 {targetIndex + 1} 号屏（在工具栏切换）</span>
        </div>
      )}

      {(catalog.warning || actionError) && (
        <div className="ly-inline-alert" role="status">
          <CloudOff size={14} aria-hidden="true" />
          <span>{actionError || catalog.warning}</span>
        </div>
      )}

      {loading ? (
        <div className="official-list" aria-busy="true">
          {[0, 1].map((key) => <div key={key} className="official-card official-card--skeleton"><div className="ly-skeleton official-card__media" /><div className="official-card__body"><div className="ly-skeleton ly-skeleton--line" /><div className="ly-skeleton ly-skeleton--line ly-skeleton--short" /></div></div>)}
        </div>
      ) : catalog.items.length === 0 ? (
        <div className="drawer-empty">
          <span className="drawer-empty__icon"><Sparkles size={20} /></span>
          <div className="drawer-empty__title">暂无灵月精选</div>
          <p>{catalog.source === 'empty' ? '官方发布第一张壁纸后会出现在这里。' : '清单里暂时没有资源。'}</p>
        </div>
      ) : (
        <div className="official-list">
          {catalog.items.map((item, index) => {
            const itemProgress = progress[item.id]
            const busy = actionId === item.id || itemProgress?.phase === 'downloading' || itemProgress?.phase === 'installing'
            const installed = item.installState === 'installed'
            const updateAvailable = item.installState === 'update-available'
            const local = item.localWallpaperId ? localById.get(item.localWallpaperId) : undefined
            const applied = Boolean(local && currentId === local.id)
            const preview = item.cachedPreview || item.previewUrl
            return (
              <article
                className={`official-card${applied ? ' is-applied' : ''}`}
                key={item.id}
                style={{ animationDelay: `${Math.min(index * 40, 240)}ms` }}
                onDoubleClick={() => installed && void apply(item)}
              >
                <div className="official-card__media">
                  {preview ? (
                    <img src={toAssetUrl(preview)} alt="" loading="lazy" />
                  ) : (
                    <div className="official-card__placeholder">{ONLINE_TYPE_LABEL[item.type] ?? item.type}</div>
                  )}
                  <div className="ly-chip-row ly-chip-row--start">
                    {applied && <span className="ly-chip ly-chip--accent"><Check size={11} strokeWidth={3} />已应用</span>}
                  </div>
                  <span className="ly-chip ly-chip--glass official-card__type">{ONLINE_TYPE_LABEL[item.type] ?? item.type}</span>
                  {busy && itemProgress && (
                    <div className="ly-progress ly-progress--overlay" role="progressbar" aria-valuenow={Math.round(itemProgress.percent)} aria-valuemin={0} aria-valuemax={100}>
                      <div style={{ width: `${Math.max(3, itemProgress.percent)}%` }} />
                    </div>
                  )}
                </div>
                <div className="official-card__body">
                  <div className="official-card__title-row">
                    <h3 title={item.title}>{item.title}</h3>
                    <span>{formatBytes(item.size)}</span>
                  </div>
                  <p title={item.description}>{busy && itemProgress ? itemProgress.message : item.description || item.tags?.join(' · ') || '灵月在线壁纸资源'}</p>
                  <div className="official-card__footer">
                    <span className={`resource-state resource-state--${item.installState}`}>{stateLabel(item)}</span>
                    <div className="official-card__actions">
                      {(installed || updateAvailable) && (
                        <button type="button" className="ly-icon-btn ly-icon-btn--sm ly-icon-btn--danger" disabled={busy || applied} onClick={() => void remove(item)} title={applied ? '请先切换壁纸' : '删除本地资源'} aria-label="删除本地资源">
                          <Trash2 size={14} />
                        </button>
                      )}
                      {!installed && !updateAvailable && (
                        <button type="button" className="ly-btn ly-btn--primary ly-btn--sm" disabled={busy} onClick={() => void install(item)}>
                          {busy ? <Loader2 size={13} className="spin" /> : <Download size={13} />}
                          <span>下载</span>
                        </button>
                      )}
                      {updateAvailable && (
                        <button type="button" className="ly-btn ly-btn--primary ly-btn--sm" disabled={busy || applied} onClick={() => void install(item)} title={applied ? '请先切换壁纸再更新' : '更新壁纸资源'}>
                          {busy ? <Loader2 size={13} className="spin" /> : <ArrowUpCircle size={13} />}
                          <span>更新</span>
                        </button>
                      )}
                      {installed && (
                        <button type="button" className={`ly-btn ly-btn--sm ${applied ? 'ly-btn--done' : 'ly-btn--primary'}`} disabled={!local || applied} onClick={() => void apply(item)}>
                          {applied ? <Check size={13} /> : <Monitor size={13} />}
                          <span>{applied ? '已应用' : '应用'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {/* The drawer is transformed while it animates; keep the modal on the shell. */}
      {ownerStatus?.enabled && createPortal(
        <WallpaperOwnerDialog
          open={showOwnerDialog}
          status={ownerStatus}
          wallpapers={localItems}
          onClose={() => setShowOwnerDialog(false)}
          onStatusChange={setOwnerStatus}
          onPublished={() => void load(false)}
        />,
        document.querySelector('.app-shell') ?? document.body,
      )}
    </div>
  )
}
