import { Download, LoaderCircle, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { AppUpdateStatus } from '@shared/types'

export function SidebarUpdateButton() {
  const [status, setStatus] = useState<AppUpdateStatus | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let canceled = false
    window.lingyue.app.getUpdateStatus()
      .then((nextStatus) => {
        if (!canceled) setStatus(nextStatus)
      })
      .catch(() => undefined)

    const unsubscribe = window.lingyue.app.onUpdateStateChanged((nextStatus) => {
      if (!canceled) setStatus(nextStatus)
    })
    return () => {
      canceled = true
      unsubscribe()
    }
  }, [])

  const presentation = useMemo(() => getUpdatePresentation(status), [status])
  if (!status || !presentation) return null

  const handleClick = async () => {
    if (busy || status.phase === 'downloading' || status.phase === 'installing') return
    setBusy(true)
    try {
      if (status.phase === 'downloaded') {
        await window.lingyue.app.installUpdate()
        return
      }
      setStatus(await window.lingyue.app.downloadUpdate())
    } finally {
      setBusy(false)
    }
  }

  const progress = Math.max(0, Math.min(100, status.progressPercent || 0))
  const isWorking = busy || status.phase === 'downloading' || status.phase === 'installing'
  return (
    <button
      type="button"
      className={`activity-bar__item sidebar-update sidebar-update--${presentation.kind}`}
      title={presentation.title}
      aria-label={presentation.title}
      disabled={isWorking}
      onClick={handleClick}
    >
      {isWorking ? (
        <LoaderCircle size={17} className="spin" />
      ) : status.phase === 'downloaded' ? (
        <RotateCcw size={17} />
      ) : (
        <Download size={17} />
      )}
      {status.phase === 'downloading' ? (
        <span className="sidebar-update__progress">{Math.round(progress)}</span>
      ) : status.phase !== 'installing' ? (
        <span className="sidebar-update__dot" aria-hidden="true" />
      ) : null}
    </button>
  )
}

function getUpdatePresentation(status: AppUpdateStatus | null): { kind: 'ready' | 'downloading' | 'restart' | 'error'; title: string } | null {
  if (!status) return null
  const version = status.availableVersion ? ` v${status.availableVersion}` : ''
  if (status.phase === 'available') return { kind: 'ready', title: `下载并更新到${version}` }
  if (status.phase === 'downloading') return { kind: 'downloading', title: `正在下载${version}：${Math.round(status.progressPercent || 0)}%` }
  if (status.phase === 'installing') return { kind: 'downloading', title: `正在重启并安装${version}` }
  if (status.phase === 'downloaded') return { kind: 'restart', title: `重启并更新到${version}` }
  if (status.phase === 'error' && status.availableVersion) return { kind: 'error', title: `更新下载失败，点击重试${version}` }
  return null
}
