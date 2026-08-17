import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, KeyRound, Loader2, PackageOpen, ShieldCheck, Trash2, X } from 'lucide-react'
import type {
  WallpaperItem,
  WallpaperOwnerStatus,
  WallpaperPublishProgress,
} from '@shared/types'

function defaultReleaseTag(): string {
  const now = new Date()
  return `wallpapers-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function suggestedId(item?: WallpaperItem): string {
  if (!item) return `wallpaper-${Date.now()}`
  const base = item.id
    .replace(/^(user|remote):/, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return base || `wallpaper-${Date.now()}`
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function WallpaperOwnerDialog(props: {
  open: boolean
  status: WallpaperOwnerStatus
  wallpapers: WallpaperItem[]
  onClose: () => void
  onStatusChange: (status: WallpaperOwnerStatus) => void
  onPublished: () => void
}) {
  const [showCredentials, setShowCredentials] = useState(!props.status.configured)
  const [token, setToken] = useState('')
  const [branch, setBranch] = useState(props.status.branch)
  const [manifestPath, setManifestPath] = useState(props.status.manifestPath)
  const [selectedId, setSelectedId] = useState(props.wallpapers[0]?.id || '')
  const selected = useMemo(
    () => props.wallpapers.find((item) => item.id === selectedId),
    [props.wallpapers, selectedId],
  )
  const [remoteId, setRemoteId] = useState(() => suggestedId(props.wallpapers[0]))
  const [version, setVersion] = useState('1.0.0')
  const [releaseTag, setReleaseTag] = useState(defaultReleaseTag)
  const [title, setTitle] = useState(props.wallpapers[0]?.name || '')
  const [description, setDescription] = useState('')
  const [author, setAuthor] = useState('')
  const [license, setLicense] = useState('')
  const [tags, setTags] = useState('')
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [progress, setProgress] = useState<WallpaperPublishProgress | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (!props.open) return
    setShowCredentials(!props.status.configured)
    setBranch(props.status.branch)
    setManifestPath(props.status.manifestPath)
    setError('')
    setSuccess('')
  }, [props.open, props.status])

  useEffect(() => window.lingyue.wallpaper.onPublishProgress(setProgress), [])

  const chooseWallpaper = (wallpaperId: string) => {
    setSelectedId(wallpaperId)
    const item = props.wallpapers.find((candidate) => candidate.id === wallpaperId)
    if (!item) return
    setRemoteId(suggestedId(item))
    setTitle(item.name)
    setDescription(String(item.meta?.Desc || ''))
    setAuthor(String(item.meta?.Author || ''))
    setTags(Array.isArray(item.meta?.Tags) ? (item.meta.Tags as string[]).join(', ') : '')
  }

  const saveCredentials = async () => {
    setSaving(true)
    setError('')
    try {
      const status = await window.lingyue.wallpaper.configureOwner({ token, branch, manifestPath })
      props.onStatusChange(status)
      setToken('')
      setShowCredentials(false)
    } catch (nextError) {
      setError(errorMessage(nextError))
    } finally {
      setSaving(false)
    }
  }

  const clearCredentials = async () => {
    if (!window.confirm('清除本机保存的 GitHub 发布凭据？')) return
    const status = await window.lingyue.wallpaper.clearOwnerCredentials()
    props.onStatusChange(status)
    setShowCredentials(true)
    setToken('')
  }

  const publish = async () => {
    if (!selected) return
    setPublishing(true)
    setError('')
    setSuccess('')
    setProgress({ phase: 'packing', percent: 1, message: '正在准备发布任务' })
    const result = await window.lingyue.wallpaper.publishResource({
      wallpaperId: selected.id,
      remoteId: remoteId.trim(),
      version: version.trim(),
      releaseTag: releaseTag.trim(),
      title: title.trim(),
      description: description.trim() || undefined,
      author: author.trim() || undefined,
      license: license.trim() || undefined,
      tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
    })
    setPublishing(false)
    if (!result.ok) {
      setError(result.error || '发布失败')
      return
    }
    setSuccess(`${result.entry?.title || title} ${result.entry?.version || version} 已发布到官方资源库。`)
    props.onPublished()
  }

  if (!props.open) return null

  return (
    <div className="dialog-overlay active owner-dialog-overlay">
      <div className="dialog owner-dialog">
        <div className="dialog__header">
          <div className="owner-dialog__title">
            <ShieldCheck size={19} />
            <div>
              <span>壁纸资源发布管理</span>
              <small>所有者模式 · {props.status.repository}</small>
            </div>
          </div>
          {!publishing && <button className="dialog__close" onClick={props.onClose}><X size={15} /></button>}
        </div>

        <div className="dialog__body owner-dialog__body">
          <div className="owner-security-note">
            <KeyRound size={16} />
            <span>发布入口只在所有者启动参数下显示；真正写入权限由 GitHub Token 和仓库权限双重校验。Token 使用 Windows DPAPI 加密后仅保存在本机。</span>
          </div>

          {showCredentials ? (
            <section className="owner-section">
              <div className="owner-section__heading">发布凭据</div>
              <label className="owner-field owner-field--wide">
                <span>GitHub Token</span>
                <input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="已有仓库需 Contents 写权限；首次创建还需仓库创建权限" autoComplete="off" />
              </label>
              <div className="owner-field-row">
                <label className="owner-field">
                  <span>目标分支</span>
                  <input value={branch} onChange={(event) => setBranch(event.target.value)} disabled />
                </label>
                <label className="owner-field">
                  <span>清单路径</span>
                  <input value={manifestPath} onChange={(event) => setManifestPath(event.target.value)} disabled />
                </label>
              </div>
              <div className="owner-inline-actions">
                <button className="btn btn--primary" disabled={saving || token.trim().length < 20} onClick={() => void saveCredentials()}>
                  {saving ? <Loader2 size={14} className="spin" /> : <KeyRound size={14} />}
                  <span>{saving ? '正在验证' : '验证并安全保存'}</span>
                </button>
                {props.status.configured && <button className="btn" onClick={() => setShowCredentials(false)}>返回发布</button>}
              </div>
            </section>
          ) : (
            <>
              <section className="owner-section owner-credential-summary">
                <div>
                  <span className="owner-section__heading">发布通道已就绪</span>
                  <small>{props.status.tokenHint} · {props.status.branch}/{props.status.manifestPath}</small>
                </div>
                <div className="owner-inline-actions">
                  <button className="btn" disabled={publishing} onClick={() => setShowCredentials(true)}>更换凭据</button>
                  <button className="btn owner-danger-btn" disabled={publishing} onClick={() => void clearCredentials()}><Trash2 size={13} /> 清除</button>
                </div>
              </section>

              <section className="owner-section">
                <div className="owner-section__heading">选择本地壁纸</div>
                <label className="owner-field owner-field--wide">
                  <span>发布来源</span>
                  <select value={selectedId} onChange={(event) => chooseWallpaper(event.target.value)} disabled={publishing}>
                    {props.wallpapers.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.id}</option>)}
                  </select>
                </label>
                <div className="owner-source-strip">
                  <PackageOpen size={18} />
                  <div><strong>{selected?.name || '没有可发布壁纸'}</strong><span>{selected?.type || '—'} · {selected?.id || '请先导入壁纸'}</span></div>
                </div>
              </section>

              <section className="owner-section">
                <div className="owner-section__heading">资源版本</div>
                <div className="owner-field-row owner-field-row--three">
                  <label className="owner-field"><span>资源 ID</span><input value={remoteId} onChange={(event) => setRemoteId(event.target.value.toLowerCase())} disabled={publishing} /></label>
                  <label className="owner-field"><span>版本</span><input value={version} onChange={(event) => setVersion(event.target.value)} disabled={publishing} /></label>
                  <label className="owner-field"><span>Release 标签</span><input value={releaseTag} onChange={(event) => setReleaseTag(event.target.value)} disabled={publishing} /></label>
                </div>
                <label className="owner-field owner-field--wide"><span>标题</span><input value={title} onChange={(event) => setTitle(event.target.value)} disabled={publishing} /></label>
                <label className="owner-field owner-field--wide"><span>描述</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} disabled={publishing} /></label>
                <div className="owner-field-row owner-field-row--three">
                  <label className="owner-field"><span>作者</span><input value={author} onChange={(event) => setAuthor(event.target.value)} disabled={publishing} /></label>
                  <label className="owner-field"><span>授权</span><input value={license} onChange={(event) => setLicense(event.target.value)} placeholder="例如 CC BY-NC 4.0" disabled={publishing} /></label>
                  <label className="owner-field"><span>标签（逗号分隔）</span><input value={tags} onChange={(event) => setTags(event.target.value)} disabled={publishing} /></label>
                </div>
              </section>
            </>
          )}

          {(error || success) && (
            <div className={`owner-result ${success ? 'owner-result--success' : 'owner-result--error'}`}>
              {success ? <CheckCircle2 size={16} /> : <X size={16} />}
              <span>{success || error}</span>
            </div>
          )}

          {publishing && progress && (
            <div className="owner-publish-progress">
              <div className="owner-publish-progress__track"><div style={{ width: `${progress.percent}%` }} /></div>
              <div><span>{progress.message}</span><strong>{Math.round(progress.percent)}%</strong></div>
            </div>
          )}
        </div>

        {!showCredentials && (
          <div className="dialog__footer">
            <button className="btn" disabled={publishing} onClick={props.onClose}>关闭</button>
            <button
              className="btn btn--primary"
              disabled={publishing || !selected || !remoteId.trim() || !version.trim() || !releaseTag.trim() || !title.trim()}
              onClick={() => void publish()}
            >
              {publishing ? <Loader2 size={14} className="spin" /> : <PackageOpen size={14} />}
              <span>{publishing ? '正在发布' : '打包并发布到 GitHub'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
