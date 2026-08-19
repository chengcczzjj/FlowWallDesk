import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowUpCircle,
  Check,
  CloudOff,
  Download,
  Loader2,
  Monitor,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import type {
  WallpaperItem,
  WallpaperOwnerStatus,
  WallpaperResourceCatalog,
  WallpaperResourceCatalogItem,
  WallpaperResourceProgress,
} from '@shared/types'
import { toAssetUrl } from '@shared/asset-url'
import { WallpaperOwnerDialog } from '../components/WallpaperOwnerDialog'

const EMPTY_CATALOG: WallpaperResourceCatalog = {
  source: 'empty',
  fetchedAt: 0,
  items: [],
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes < 1) return '未知大小'
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GiB`
  return `${(bytes / 1024 ** 2).toFixed(bytes >= 100 * 1024 ** 2 ? 0 : 1)} MiB`
}

function stateLabel(item: WallpaperResourceCatalogItem): string {
  if (item.installState === 'installed') return `已安装 ${item.installedVersion}`
  if (item.installState === 'update-available') return `${item.installedVersion} → ${item.version}`
  if (item.installState === 'downloading') return '下载中'
  if (item.installState === 'installing') return '安装中'
  if (item.installState === 'error') return '安装失败'
  return `版本 ${item.version}`
}

export function OnlineWallpaperPage({ search, refreshKey, targetDisplayId = null }: { search: string; refreshKey?: number; targetDisplayId?: number | null }) {
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
      const [nextCatalog, nextLocal, current, owner] = await Promise.all([
        force
          ? window.lingyue.wallpaper.refreshResourceCatalog()
          : window.lingyue.wallpaper.getResourceCatalog(),
        window.lingyue.wallpaper.list(),
        window.lingyue.wallpaper.getCurrent(),
        window.lingyue.wallpaper.getOwnerStatus(),
      ])
      setCatalog(nextCatalog)
      setLocalItems(nextLocal)
      setCurrentId(current?.current?.id)
      setOwnerStatus(owner)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load(false)
  }, [load, refreshKey])

  useEffect(() => window.lingyue.wallpaper.onResourceProgress((next) => {
    setProgress((current) => ({ ...current, [next.wallpaperId]: next }))
    if (next.phase === 'complete') void load(false)
  }), [load])

  useEffect(() => window.lingyue.wallpaper.onResourceCatalogChanged(() => {
    void load(false)
  }), [load])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return catalog.items
    return catalog.items.filter((item) => (
      item.title.toLowerCase().includes(query) ||
      item.id.toLowerCase().includes(query) ||
      item.tags?.some((tag) => tag.toLowerCase().includes(query))
    ))
  }, [catalog.items, search])

  const localById = useMemo(
    () => new Map(localItems.map((item) => [item.id, item])),
    [localItems],
  )

  const install = async (item: WallpaperResourceCatalogItem) => {
    setActionId(item.id)
    setActionError('')
    const result = await window.lingyue.wallpaper.installResource(item.id)
    setActionId(undefined)
    if (!result.ok) setActionError(result.error || '安装失败')
    await load(false)
  }

  const apply = async (item: WallpaperResourceCatalogItem) => {
    const local = item.localWallpaperId ? localById.get(item.localWallpaperId) : undefined
    if (!local) return
    try {
      if (targetDisplayId !== null) {
        await window.lingyue.wallpaper.setDisplayMode('per-display')
        await window.lingyue.wallpaper.setDisplayAssignment(targetDisplayId, local.id)
      } else {
        await window.lingyue.wallpaper.apply(local)
      }
      setCurrentId(local.id)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '应用壁纸失败')
    }
  }

  const remove = async (item: WallpaperResourceCatalogItem) => {
    if (!window.confirm(`删除已下载的“${item.title}”？在线资源仍可重新下载。`)) return
    setActionId(item.id)
    setActionError('')
    const result = await window.lingyue.wallpaper.removeResource(item.id)
    setActionId(undefined)
    if (!result.ok) setActionError(result.error || '删除失败')
    await load(false)
  }

  return (
    <div className="online-wallpaper-page">
      <header className="online-library-hero">
        <div>
          <div className="online-library-hero__eyebrow">LINGYUE CLOUD LIBRARY</div>
          <h1>在线壁纸库</h1>
          <p>壁纸资源独立下载和更新，不再跟随整个应用安装包。</p>
        </div>
        <div className="online-library-hero__actions">
          {ownerStatus?.enabled && (
            <button className="btn owner-entry-btn" onClick={() => setShowOwnerDialog(true)}>
              <ShieldCheck size={15} />
              <span>资源发布管理</span>
            </button>
          )}
          <button className="btn" disabled={refreshing} onClick={() => void load(true)}>
            <RefreshCw size={15} className={refreshing ? 'spin' : ''} />
            <span>{refreshing ? '刷新中' : '刷新资源'}</span>
          </button>
        </div>
      </header>

      <div className="online-library-status">
        <span className={`online-library-status__dot online-library-status__dot--${catalog.source}`} />
        <span>
          {catalog.source === 'network' ? '在线清单已连接' : catalog.source === 'cache' ? '正在使用离线缓存' : '在线清单不可用'}
        </span>
        {catalog.updatedAt && <span>更新于 {new Date(catalog.updatedAt).toLocaleString()}</span>}
        <span>{catalog.items.length} 项资源</span>
      </div>

      {(catalog.warning || actionError) && (
        <div className="online-library-warning">
          <CloudOff size={16} />
          <span>{actionError || catalog.warning}</span>
        </div>
      )}

      {loading ? (
        <div className="empty-page"><Loader2 size={34} className="spin" /><span>正在读取资源清单…</span></div>
      ) : filtered.length === 0 ? (
        <div className="empty-page">
          <CloudOff size={44} />
          <div className="empty-page__title">暂无在线壁纸</div>
          <div>{catalog.source === 'empty' ? '发布第一张壁纸后会显示在这里。' : '没有符合搜索条件的资源。'}</div>
        </div>
      ) : (
        <div className="online-library-grid">
          {filtered.map((item, index) => {
            const itemProgress = progress[item.id]
            const busy = actionId === item.id || itemProgress?.phase === 'downloading' || itemProgress?.phase === 'installing'
            const installed = item.installState === 'installed'
            const updateAvailable = item.installState === 'update-available'
            const local = item.localWallpaperId ? localById.get(item.localWallpaperId) : undefined
            const applied = Boolean(local && currentId === local.id)
            return (
              <article
                className={`online-wallpaper-card ${applied ? 'applied' : ''}`}
                key={item.id}
                style={{ animationDelay: `${Math.min(index * 0.035, 0.35)}s` }}
                onDoubleClick={() => installed && void apply(item)}
              >
                <div className="online-wallpaper-card__media">
                  {item.previewUrl || item.cachedPreview ? (
                    <img src={toAssetUrl(item.cachedPreview || item.previewUrl)} alt={item.title} loading="lazy" />
                  ) : (
                    <div className="wallpaper-card__placeholder">{item.type.toUpperCase()}</div>
                  )}
                  <span className="online-wallpaper-card__type">{item.type}</span>
                  {applied && <span className="online-wallpaper-card__applied"><Check size={12} /> 已应用</span>}
                  {busy && itemProgress && (
                    <div className="online-wallpaper-card__progress">
                      <div style={{ width: `${Math.max(3, itemProgress.percent)}%` }} />
                    </div>
                  )}
                </div>
                <div className="online-wallpaper-card__body">
                  <div className="online-wallpaper-card__title-row">
                    <h2 title={item.title}>{item.title}</h2>
                    <span>{formatBytes(item.size)}</span>
                  </div>
                  <p>{item.description || item.tags?.join(' · ') || '灵月在线壁纸资源'}</p>
                  <div className="online-wallpaper-card__meta">
                    <span className={`resource-state resource-state--${item.installState}`}>{stateLabel(item)}</span>
                    {item.author && <span title={item.author}>{item.author}</span>}
                  </div>
                  {itemProgress && busy && <div className="resource-progress-text">{itemProgress.message}</div>}
                  <div className="online-wallpaper-card__actions">
                    {!installed && !updateAvailable && (
                      <button className="btn btn--primary" disabled={busy} onClick={() => void install(item)}>
                        {busy ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
                        <span>下载</span>
                      </button>
                    )}
                    {updateAvailable && (
                      <button className="btn btn--primary" disabled={busy || applied} onClick={() => void install(item)} title={applied ? '请先切换壁纸再更新' : '更新壁纸资源'}>
                        {busy ? <Loader2 size={14} className="spin" /> : <ArrowUpCircle size={14} />}
                        <span>更新</span>
                      </button>
                    )}
                    {installed && (
                      <button className="btn btn--primary" disabled={!local || applied} onClick={() => void apply(item)}>
                        {applied ? <Check size={14} /> : <Monitor size={14} />}
                        <span>{applied ? '已应用' : '应用'}</span>
                      </button>
                    )}
                    {(installed || updateAvailable) && (
                      <button className="btn resource-remove-btn" disabled={busy || applied} onClick={() => void remove(item)} title={applied ? '请先切换壁纸' : '删除本地资源'}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {ownerStatus?.enabled && (
        <WallpaperOwnerDialog
          open={showOwnerDialog}
          status={ownerStatus}
          wallpapers={localItems}
          onClose={() => setShowOwnerDialog(false)}
          onStatusChange={setOwnerStatus}
          onPublished={() => void load(false)}
        />
      )}
    </div>
  )
}
