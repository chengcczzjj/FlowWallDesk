import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CloudOff,
  Download,
  ExternalLink,
  Film,
  Home,
  Image as ImageIcon,
  Loader2,
  Lock,
  Monitor,
  Package,
  RotateCw,
  Sparkles,
  X,
} from 'lucide-react'
import type { WallpaperApplyTarget, WallpaperDisplaySettings } from '@shared/types'
import { FLOWWALL_HOME_URL, type FlowWallDownload, type FlowWallViewState } from '@shared/flowwall'
import { OfficialWallpaperPanel } from '../components/OfficialWallpaperPanel'

type DrawerSection = 'downloads' | 'official'
type Freeze = 'live' | 'freezing' | 'frozen'

const INITIAL_VIEW: FlowWallViewState = { url: FLOWWALL_HOME_URL, title: 'FlowWall 发现', loading: true, canGoBack: false, canGoForward: false }
const DRAWER_EXIT_MS = 200

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 1) return ''
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(bytes >= 100 * 1024 ** 2 ? 0 : 1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function describeUrl(value: string): { host: string; path: string } {
  try {
    const url = new URL(value)
    return { host: url.hostname.replace(/^www\./, ''), path: decodeURIComponent(url.pathname).replace(/\/$/, '') }
  } catch {
    return { host: 'flowwall.ai', path: '' }
  }
}

function downloadStatus(download: FlowWallDownload): string {
  switch (download.state) {
    case 'downloading': {
      const percent = download.totalBytes > 0 ? Math.round((download.receivedBytes / download.totalBytes) * 100) : null
      const size = download.totalBytes > 0 ? `${formatBytes(download.receivedBytes)} / ${formatBytes(download.totalBytes)}` : formatBytes(download.receivedBytes)
      return percent === null ? `下载中 ${size}` : `${percent}% · ${size}`
    }
    case 'importing': return '正在检查并加入我的壁纸…'
    case 'completed': return '已加入我的壁纸'
    case 'duplicate': return '之前已下载过，已在我的壁纸里'
    case 'cancelled': return '已取消'
    default: return download.error || '下载失败'
  }
}

const KIND_ICON = {
  video: <Film size={16} />,
  image: <ImageIcon size={16} />,
  package: <Package size={16} />,
}

/**
 * App menus, popovers and dialogs that must appear above the page. The
 * embedded site is a native layer over the renderer, so while one is open the
 * page shows a still image and the live view steps aside.
 */
const APP_OVERLAY_SELECTOR = '.dialog-overlay.active, [aria-modal="true"], [data-ly-overlay]'

function isAppOverlayOpen(): boolean {
  return Boolean(document.querySelector(APP_OVERLAY_SELECTOR))
}

const nextFrame = () => new Promise<void>((done) => requestAnimationFrame(() => done()))

/**
 * 壁纸库：FlowWall 发现页就是在线壁纸库。站点的下载自动检查并加入「我的壁纸」，
 * 侧栏同时收纳下载记录与灵月官方精选，二者都应用到工具栏选中的显示目标。
 */
export function WallpaperStorePage({
  wallpaperTarget = 'current',
  displaySettings,
  onShowLibrary,
}: {
  wallpaperTarget?: WallpaperApplyTarget
  displaySettings?: WallpaperDisplaySettings | null
  onShowLibrary: () => void
}) {
  const [view, setView] = useState<FlowWallViewState>(INITIAL_VIEW)
  const [downloads, setDownloads] = useState<FlowWallDownload[]>([])
  const [section, setSection] = useState<DrawerSection | null>(null)
  const [drawerClosing, setDrawerClosing] = useState(false)
  const [overlayOpen, setOverlayOpen] = useState(isAppOverlayOpen)
  const [freeze, setFreeze] = useState<Freeze>('live')
  const [snapshot, setSnapshot] = useState<string | null>(null)
  const [attached, setAttached] = useState(false)
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [appliedWallpaperId, setAppliedWallpaperId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const viewportRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef(0)

  const openSection = useCallback((next: DrawerSection) => {
    window.clearTimeout(closeTimer.current)
    setDrawerClosing(false)
    setSection(next)
  }, [])

  const closeDrawer = useCallback(() => {
    setDrawerClosing(true)
    window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => {
      setSection(null)
      setDrawerClosing(false)
    }, DRAWER_EXIT_MS)
  }, [])

  const toggleSection = (next: DrawerSection) => {
    if (section === next && !drawerClosing) closeDrawer()
    else openSection(next)
  }

  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  useEffect(() => {
    let alive = true
    void window.lingyue.flowwall.getState().then((state) => {
      if (!alive) return
      setView(state.view)
      setDownloads(state.downloads)
      if (state.downloads.some((item) => item.state === 'downloading' || item.state === 'importing')) openSection('downloads')
    })
    void window.lingyue.wallpaper.getCurrent().then((state) => {
      if (alive && state.current?.meta?.Source === 'flowwall') setAppliedWallpaperId(state.current.id)
    }).catch(() => undefined)
    const offView = window.lingyue.flowwall.onViewState(setView)
    const offDownload = window.lingyue.flowwall.onDownloadChanged((download) => {
      // A new download opens the drawer so its progress is visible right away.
      if (download.state === 'downloading' && download.receivedBytes === 0) openSection('downloads')
      setDownloads((prev) => (
        prev.some((item) => item.id === download.id)
          ? prev.map((item) => (item.id === download.id ? download : item))
          : [download, ...prev]
      ))
    })
    return () => {
      alive = false
      offView()
      offDownload()
    }
  }, [openSection])

  // Track app overlays; the snapshot swap below keeps the page visible beneath them.
  useEffect(() => {
    let frame = 0
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setOverlayOpen(isAppOverlayOpen()))
    })
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'aria-modal', 'data-ly-overlay'],
    })
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    if (!overlayOpen) {
      setFreeze('live')
      return
    }
    if (freeze !== 'live') return
    let cancelled = false
    setFreeze('freezing')
    void (async () => {
      const still = attached ? await window.lingyue.flowwall.snapshot().catch(() => null) : null
      if (cancelled) return
      setSnapshot(still)
      if (still) {
        const image = new Image()
        image.src = still
        await image.decode().catch(() => undefined)
        await nextFrame()
      }
      // Closed again before the swap finished: the live view never left.
      if (cancelled) setSnapshot(null)
      else setFreeze('frozen')
    })()
    return () => {
      cancelled = true
    }
    // `freeze` and `attached` are read at the moment an overlay opens only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayOpen])

  // Keep the native view glued to the placeholder; step aside under overlays and error states.
  const hidden = freeze === 'frozen' || Boolean(view.error)
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    let frame = 0
    let alive = true
    const sync = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const rect = viewport.getBoundingClientRect()
        if (hidden || rect.width < 2 || rect.height < 2) {
          window.lingyue.flowwall.detach()
          setAttached(false)
          return
        }
        void window.lingyue.flowwall.attach({ x: rect.left, y: rect.top, width: rect.width, height: rect.height })
          .then(async (state) => {
            if (!alive) return
            setView(state)
            setAttached(true)
            // Let the live view paint over the still before dropping it.
            await nextFrame()
            await nextFrame()
            if (alive) setSnapshot(null)
          })
          .catch((error) => setNotice(error instanceof Error ? error.message : 'FlowWall 页面打开失败'))
      })
    }
    sync()
    const resize = new ResizeObserver(sync)
    resize.observe(viewport)
    window.addEventListener('resize', sync)
    return () => {
      alive = false
      cancelAnimationFrame(frame)
      resize.disconnect()
      window.removeEventListener('resize', sync)
      window.lingyue.flowwall.detach()
    }
  }, [hidden])

  const navigate = useCallback((action: Parameters<typeof window.lingyue.flowwall.navigate>[0]) => {
    void window.lingyue.flowwall.navigate(action).then(setView)
  }, [])

  const applyDownload = useCallback(async (download: FlowWallDownload) => {
    if (!download.wallpaperId) return
    setApplyingId(download.id)
    setNotice('')
    try {
      const item = (await window.lingyue.wallpaper.list()).find((candidate) => candidate.id === download.wallpaperId)
      if (!item) throw new Error('这张壁纸已经从我的壁纸里删除了，可以在 FlowWall 页面重新下载。')
      await window.lingyue.wallpaper.apply(item, wallpaperTarget)
      setAppliedWallpaperId(item.id)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '应用壁纸失败')
    } finally {
      setApplyingId(null)
    }
  }, [wallpaperTarget])

  const activeCount = downloads.filter((item) => item.state === 'downloading' || item.state === 'importing').length
  const address = useMemo(() => describeUrl(view.url), [view.url])
  const finished = downloads.some((item) => item.state !== 'downloading' && item.state !== 'importing')

  return (
    <div className="store-page">
      <div className="store-toolbar" role="toolbar" aria-label="壁纸库页面导航">
        <div className="store-toolbar__cluster">
          <button type="button" className="ly-icon-btn" title="后退（Alt+←）" aria-label="后退" disabled={!view.canGoBack} onClick={() => navigate('back')}><ArrowLeft size={16} /></button>
          <button type="button" className="ly-icon-btn" title="前进（Alt+→）" aria-label="前进" disabled={!view.canGoForward} onClick={() => navigate('forward')}><ArrowRight size={16} /></button>
          <button type="button" className="ly-icon-btn" title={view.loading ? '停止（Esc）' : '刷新（F5）'} aria-label={view.loading ? '停止加载' : '刷新'} onClick={() => navigate(view.loading ? 'stop' : 'reload')}>
            {view.loading ? <X size={16} /> : <RotateCw size={15} />}
          </button>
          <button type="button" className="ly-icon-btn" title="回到发现页" aria-label="回到发现页" onClick={() => navigate('home')}><Home size={15} /></button>
        </div>
        <div className="store-address" title={view.url} data-loading={view.loading || undefined}>
          <span className="store-address__icon">{view.loading ? <Loader2 size={13} className="spin" /> : <Lock size={12} />}</span>
          <span className="store-address__host">{address.host}</span>
          <span className="store-address__path">{address.path}</span>
          {view.loading && <span className="store-address__progress" aria-hidden="true" />}
        </div>
        <div className="store-toolbar__actions">
          <button type="button" className="ly-icon-btn" onClick={() => void window.lingyue.flowwall.openExternal()} title="在系统浏览器中打开当前页面" aria-label="在浏览器打开">
            <ExternalLink size={15} />
          </button>
          <span className="store-toolbar__divider" aria-hidden="true" />
          <button
            type="button"
            className="ly-toggle"
            data-state={section === 'downloads' && !drawerClosing ? 'on' : 'off'}
            aria-pressed={section === 'downloads' && !drawerClosing}
            onClick={() => toggleSection('downloads')}
            title="下载与导入记录"
          >
            <Download size={15} />
            <span>下载</span>
            {activeCount > 0 && <span className="ly-count">{activeCount}</span>}
          </button>
          <button
            type="button"
            className="ly-toggle"
            data-state={section === 'official' && !drawerClosing ? 'on' : 'off'}
            aria-pressed={section === 'official' && !drawerClosing}
            onClick={() => toggleSection('official')}
            title="灵月官方精选壁纸"
          >
            <Sparkles size={15} />
            <span>灵月精选</span>
          </button>
        </div>
      </div>

      <div className="store-body">
        <div className="store-viewport" ref={viewportRef} data-frozen={snapshot ? 'true' : undefined}>
          {view.error ? (
            <div className="store-state">
              <span className="store-state__icon"><CloudOff size={26} /></span>
              <div className="store-state__title">FlowWall 暂时打不开</div>
              <div className="store-state__text">{view.error}</div>
              <div className="store-state__actions">
                <button type="button" className="ly-btn ly-btn--primary" onClick={() => navigate('reload')}><RotateCw size={14} /><span>重试</span></button>
                <button type="button" className="ly-btn" onClick={() => void window.lingyue.flowwall.openExternal()}><ExternalLink size={14} /><span>在浏览器打开</span></button>
                <button type="button" className="ly-btn" onClick={() => openSection('official')}><Sparkles size={14} /><span>看看灵月精选</span></button>
              </div>
            </div>
          ) : (
            <div className="store-skeleton" role="status" aria-label={overlayOpen ? '对话框关闭后继续浏览' : '正在打开 FlowWall…'}>
              <div className="store-skeleton__bar" />
              <div className="store-skeleton__grid">
                {Array.from({ length: 12 }, (_, index) => <div key={index} className="ly-skeleton" style={{ animationDelay: `${index * 60}ms` }} />)}
              </div>
            </div>
          )}
          {snapshot && <img className="store-viewport__still" src={snapshot} alt="" aria-hidden="true" />}
        </div>

        {section && (
          <aside className="store-drawer" data-state={drawerClosing ? 'closing' : 'open'} aria-label={section === 'downloads' ? '下载与导入' : '灵月精选'}>
            <div className="store-drawer__panel">
              <header className="store-drawer__header">
                <div className="store-drawer__title">
                  {section === 'downloads' ? '下载与导入' : '灵月精选'}
                  {section === 'downloads' && activeCount > 0 && <span className="ly-count ly-count--soft">{activeCount} 进行中</span>}
                </div>
                {section === 'downloads' && finished && (
                  <button type="button" className="ly-link-btn" onClick={() => void window.lingyue.flowwall.clearDownloads().then(setDownloads)}>清空记录</button>
                )}
                <button type="button" className="ly-icon-btn ly-icon-btn--sm" title="收起" aria-label="收起侧栏" onClick={closeDrawer}><X size={15} /></button>
              </header>
              <div className="store-drawer__content" key={section}>
                {section === 'official' ? (
                  <OfficialWallpaperPanel wallpaperTarget={wallpaperTarget} displaySettings={displaySettings} />
                ) : (
                  <>
                    {notice && <div className="ly-inline-alert ly-inline-alert--danger" role="alert"><AlertCircle size={14} /><span>{notice}</span></div>}
                    {downloads.length === 0 ? (
                      <div className="drawer-empty">
                        <span className="drawer-empty__icon"><Download size={20} /></span>
                        <div className="drawer-empty__title">还没有下载</div>
                        <p>在左侧页面点下载，动态或 4K 壁纸会自动检查并加入「我的壁纸」，然后可以直接设为壁纸。</p>
                        <p className="drawer-empty__hint">登录状态只保存在灵月里，不影响系统浏览器。</p>
                      </div>
                    ) : (
                      <ul className="download-list">
                        {downloads.map((download, index) => {
                          const running = download.state === 'downloading' || download.state === 'importing'
                          const ready = (download.state === 'completed' || download.state === 'duplicate') && download.wallpaperId
                          const percent = download.totalBytes > 0 ? Math.min(100, (download.receivedBytes / download.totalBytes) * 100) : 0
                          const applied = ready && appliedWallpaperId === download.wallpaperId
                          const failed = download.state === 'failed' || download.state === 'cancelled'
                          return (
                            <li key={download.id} className={`download-item download-item--${download.state}`} style={{ animationDelay: `${Math.min(index * 40, 240)}ms` }}>
                              <div className="download-item__icon">{KIND_ICON[download.kind]}</div>
                              <div className="download-item__body">
                                <div className="download-item__title" title={download.title}>{download.title}</div>
                                <div className="download-item__status">
                                  {ready && <CheckCircle2 size={12} aria-hidden="true" />}
                                  {download.state === 'failed' && <AlertCircle size={12} aria-hidden="true" />}
                                  <span>{downloadStatus(download)}</span>
                                </div>
                                {running && (
                                  <div className="ly-progress" role="progressbar" aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100} data-indeterminate={download.state === 'importing' || undefined}>
                                    <div style={{ width: download.state === 'importing' ? '100%' : `${Math.max(3, percent)}%` }} />
                                  </div>
                                )}
                                {(download.state === 'downloading' || ready || (failed && download.pageUrl)) && (
                                  <div className="download-item__actions">
                                    {download.state === 'downloading' && (
                                      <button type="button" className="ly-link-btn" onClick={() => void window.lingyue.flowwall.cancelDownload(download.id)}>取消</button>
                                    )}
                                    {ready && (
                                      <button type="button" className={`ly-btn ly-btn--sm ${applied ? 'ly-btn--done' : 'ly-btn--primary'}`} disabled={applyingId === download.id || Boolean(applied)} onClick={() => void applyDownload(download)}>
                                        {applyingId === download.id ? <Loader2 size={13} className="spin" /> : applied ? <Check size={13} /> : <Monitor size={13} />}
                                        <span>{applied ? '已设为壁纸' : '设为壁纸'}</span>
                                      </button>
                                    )}
                                    {ready && <button type="button" className="ly-link-btn" onClick={onShowLibrary}>在我的壁纸中查看</button>}
                                    {failed && download.pageUrl && (
                                      <button type="button" className="ly-link-btn" onClick={() => navigate({ url: download.pageUrl! })}>回到下载页</button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </>
                )}
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
