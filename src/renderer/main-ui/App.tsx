import {
  Image as ImageIcon,
  LayoutGrid,
  Cat,
  MessageCircle,
  Settings,
  MoreHorizontal,
  Plus,
  Monitor,
  Search,
  Minus,
  Square,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { LibraryPage } from './pages/LibraryPage'
import { EmptyPage } from './pages/EmptyPage'
import { WidgetsPage } from './pages/WidgetsPage'
import { ChatPage } from './pages/chat/ChatPage'
import { SettingsGeneralPage } from './pages/settings/SettingsGeneralPage'
import { AddWallpaperDialog } from './components/AddWallpaperDialog'
import './styles.css'

type ActivityKey = 'memory' | 'library' | 'widgets' | 'pet' | 'settings'

const NAV_TABS: Record<ActivityKey, { label: string; pages?: { id: string; label: string }[] }> = {
  memory: { label: 'AI 对话' },
  library: {
    label: '壁纸资源',
    pages: [
      { id: 'library', label: '本地壁纸' },
      { id: 'store', label: '壁纸库' },
      { id: 'maker', label: '壁纸制作' },
    ],
  },
  widgets: {
    label: '小组件',
    pages: [
      { id: 'widgets-floating', label: '悬浮挂件' },
      { id: 'widgets-card', label: '卡片组件' },
    ],
  },
  pet: { label: '桌宠' },
  settings: {
    label: '设置',
    pages: [
      { id: 'settings-general', label: '通用' },
      { id: 'settings-performance', label: '性能' },
      { id: 'settings-wallpaper', label: '壁纸' },
      { id: 'settings-screensaver', label: '屏保' },
      { id: 'settings-system', label: '系统' },
    ],
  },
}

/** 判断 URL 是否携带 restore 参数（窗口重建时恢复上次页面） */
const shouldRestore = new URLSearchParams(window.location.search).has('restore')

function loadSavedNav(): { activity: ActivityKey; subPage: string } {
  if (shouldRestore) {
    try {
      const saved = localStorage.getItem('lingyue-nav')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.activity && NAV_TABS[parsed.activity as ActivityKey]) {
          return { activity: parsed.activity, subPage: parsed.subPage || NAV_TABS[parsed.activity as ActivityKey].pages?.[0]?.id || '' }
        }
      }
    } catch { /* ignore */ }
  }
  return { activity: 'memory', subPage: '' }
}

export function App() {
  const saved = loadSavedNav()
  const [activity, setActivity] = useState<ActivityKey>(saved.activity)
  const [subPage, setSubPage] = useState<string>(saved.subPage)
  const [search, setSearch] = useState('')
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const openAddDialog = useCallback(() => {
    setShowAddDialog(true)
  }, [])

  // 持久化当前导航状态到 localStorage（窗口重建时可恢复）
  useEffect(() => {
    localStorage.setItem('lingyue-nav', JSON.stringify({ activity, subPage }))
  }, [activity, subPage])

  const tabs = NAV_TABS[activity].pages

  const switchActivity = (key: ActivityKey) => {
    setActivity(key)
    const first = NAV_TABS[key].pages?.[0]?.id
    if (first) setSubPage(first)
  }

  return (
    <div className="app-shell">
      <header className="title-bar">
        <span className="title-bar__text">灵月 · LingyueDesk</span>
        <div className="title-bar__spacer" />
        {activity === 'library' && (
          <div style={{ position: 'relative', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                top: '50%',
                left: 10,
                transform: 'translateY(-50%)',
                color: 'var(--text-tertiary)',
                pointerEvents: 'none',
              }}
            />
            <input
              className="title-bar__search"
              type="text"
              placeholder="搜索壁纸…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 28 }}
            />
          </div>
        )}
        <div className="title-bar__spacer" />
        <WindowControls />
      </header>

      <div className="app-body">
        <nav className="activity-bar">
          <ActivityItem
            icon={<MessageCircle size={20} />}
            active={activity === 'memory'}
            onClick={() => switchActivity('memory')}
            title="AI 对话"
          />
          <ActivityItem
            icon={<ImageIcon size={20} />}
            active={activity === 'library'}
            onClick={() => switchActivity('library')}
            title="壁纸资源"
          />
          <ActivityItem
            icon={<LayoutGrid size={20} />}
            active={activity === 'widgets'}
            onClick={() => switchActivity('widgets')}
            title="小组件"
          />
          <ActivityItem
            icon={<Cat size={20} />}
            active={activity === 'pet'}
            onClick={() => switchActivity('pet')}
            title="桌宠"
          />
          <div className="activity-bar__spacer" />
          <ActivityItem
            icon={<Settings size={20} />}
            active={activity === 'settings'}
            onClick={() => switchActivity('settings')}
            title="设置"
          />
          <ActivityItem icon={<MoreHorizontal size={20} />} onClick={() => undefined} title="更多" />
        </nav>

        <div className="app-content">
          {activity === 'memory' ? (
            <ChatPage />
          ) : (
          <>
          <nav className="top-nav">
            <div className="top-nav__items">
              {tabs?.map((t) => (
                <button
                  key={t.id}
                  className={`nav-item ${subPage === t.id ? 'active' : ''}`}
                  onClick={() => setSubPage(t.id)}
                >
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
            {activity === 'library' && (
              <div className="nav-footer">
                <button className="nav-btn" title="添加壁纸" onClick={() => openAddDialog()}>
                  <Plus size={16} />
                </button>
                <button className="nav-btn" title="控制面板">
                  <Monitor size={16} />
                </button>
              </div>
            )}
          </nav>

          <div className="page-content">
            {activity === 'library' && subPage === 'library' && (
              <LibraryPage search={search} refreshKey={refreshKey} />
            )}
            {activity === 'library' && subPage === 'store' && (
              <EmptyPage icon={<ImageIcon size={48} />} title="壁纸库" subtitle="敬请期待…" />
            )}
            {activity === 'library' && subPage === 'maker' && (
              <EmptyPage icon={<ImageIcon size={48} />} title="壁纸制作" subtitle="敬请期待…" />
            )}
            {activity === 'widgets' && (
              <WidgetsPage subPage={subPage} />
            )}
            {activity === 'pet' && <EmptyPage icon={<Cat size={48} />} title="桌宠" subtitle="规划中…" />}
            {activity === 'settings' && subPage === 'settings-general' && (
              <SettingsGeneralPage />
            )}
            {activity === 'settings' && subPage !== 'settings-general' && (
              <EmptyPage icon={<Settings size={48} />} title="设置" subtitle="即将到来…" />
            )}
          </div>
          </>
          )}
        </div>
      </div>

      <AddWallpaperDialog
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onImported={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  )
}

function ActivityItem(props: {
  icon: React.ReactNode
  active?: boolean
  onClick: () => void
  title: string
}) {
  return (
    <button
      className={`activity-bar__item ${props.active ? 'active' : ''}`}
      onClick={props.onClick}
      title={props.title}
    >
      {props.icon}
    </button>
  )
}

function WindowControls() {
  return (
    <div className="window-controls">
      <button
        className="window-controls__btn"
        title="最小化"
        onClick={() => window.lingyue.window.minimize()}
      >
        <Minus size={14} />
      </button>
      <button
        className="window-controls__btn"
        title="最大化"
        onClick={() => window.lingyue.window.maximizeToggle()}
      >
        <Square size={12} />
      </button>
      <button
        className="window-controls__btn window-controls__btn--close"
        title="关闭"
        onClick={() => window.lingyue.window.close()}
      >
        <X size={14} />
      </button>
    </div>
  )
}
