import { useCallback, useEffect, useRef, useState } from 'react'
import type { WallpaperItem } from '@shared/types'
import { toAssetUrl } from '@shared/asset-url'
import { FolderOpen, Upload, X, Loader2 } from 'lucide-react'

const VIDEO_EXT = new Set(['.mp4', '.webm', '.mkv', '.mov', '.avi'])
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'])
const WEB_EXT = new Set(['.html', '.htm'])
const ZIP_EXT = new Set(['.zip'])
const ALL_EXT = new Set([...VIDEO_EXT, ...IMAGE_EXT, ...WEB_EXT, ...ZIP_EXT])

function getExt(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

function getType(name: string): WallpaperItem['type'] {
  const ext = getExt(name)
  if (VIDEO_EXT.has(ext)) return 'video'
  if (WEB_EXT.has(ext) || ZIP_EXT.has(ext)) return 'web'
  return 'image'
}

function stripExt(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(0, i) : name
}

export interface InitialFile {
  path: string
  name: string
}

export function AddWallpaperDialog(props: {
  open: boolean
  onClose: () => void
  onImported: (item: WallpaperItem) => void
  initialFile?: InitialFile | null
}) {
  const { open, onClose, onImported, initialFile } = props

  // 文件状态
  const [filePath, setFilePath] = useState('')
  const [fileName, setFileName] = useState('')
  const [fileType, setFileType] = useState<WallpaperItem['type']>('image')
  const [previewUrl, setPreviewUrl] = useState<string | undefined>()

  // 元数据
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [author, setAuthor] = useState('')
  const [contact, setContact] = useState('')

  // 状态
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')

  const overlayRef = useRef<HTMLDivElement>(null)

  // 重置状态
  const reset = useCallback(() => {
    setFilePath('')
    setFileName('')
    setFileType('image')
    setPreviewUrl(undefined)
    setName('')
    setDesc('')
    setAuthor('')
    setContact('')
    setImporting(false)
    setProgress('')
    setError('')
    setDragOver(false)
  }, [])

  useEffect(() => {
    if (!open) reset()
  }, [open, reset])

  // 处理选中文件
  const handleFileSelected = useCallback(async (path: string, originalName: string) => {
    const ext = getExt(originalName)
    if (!ALL_EXT.has(ext)) {
      setError(`不支持的文件格式: ${ext}`)
      return
    }
    setError('')
    setFilePath(path)
    setFileName(originalName)
    const type = getType(originalName)
    setFileType(type)
    setName(stripExt(originalName))

    // 设置预览 URL（图片和视频都使用 lyasset:// 协议）
    if (type === 'image' || type === 'video') {
      const granted = await window.lingyue.wallpaper.grantPreview(path).catch(() => false)
      setPreviewUrl(granted ? (toAssetUrl(path) ?? undefined) : undefined)
    } else {
      setPreviewUrl(undefined)
    }
  }, [])

  // 打开弹窗时若有初始文件，直接选中
  useEffect(() => {
    if (open && initialFile) {
      void handleFileSelected(initialFile.path, initialFile.name)
    }
  }, [handleFileSelected, initialFile, open])

  // 浏览文件
  const handleBrowse = async () => {
    try {
      const item = await window.lingyue.wallpaper.pickFile()
      if (item) await handleFileSelected(item.source, item.name)
    } catch (error) {
      setError(error instanceof Error ? error.message : '文件选择失败，请重试。')
    }
  }

  // 拖放
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const files = e.dataTransfer.files
    if (files.length > 0) {
      const f = files[0]
      const path = window.lingyue.utils.getFilePath(f)
      if (path) {
        void handleFileSelected(path, f.name)
      } else {
        setError('无法读取拖入的文件路径，请使用浏览文件。')
      }
    }
  }

  // 确认导入
  const handleConfirm = async () => {
    if (!filePath || importing) return
    setImporting(true)
    setError('')

    if (fileType === 'video') {
      setProgress('正在复制文件并生成预览…')
    } else {
      setProgress('正在导入…')
    }

    try {
      const result = await window.lingyue.wallpaper.import(filePath, { name: name || stripExt(fileName), desc, author, contact })
      if (result.ok && result.item) {
        onImported(result.item)
        onClose()
      } else {
        setError(result.error ?? '导入失败')
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : '导入失败，请重试。')
    } finally {
      setImporting(false)
      setProgress('')
    }
  }

  // 点击遮罩关闭
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current && !importing) {
      onClose()
    }
  }

  if (!open) return null

  const hasFile = !!filePath

  return (
    <div
      ref={overlayRef}
      className="dialog-overlay active"
      onClick={handleOverlayClick}
    >
      <div className="dialog" style={{ minWidth: 480, maxWidth: 520 }}>
        <div className="dialog__header">
          <span>添加壁纸</span>
          {!importing && (
            <button className="dialog__close" onClick={onClose}>
              <X size={14} />
            </button>
          )}
        </div>

        <div className="dialog__body">
          {/* 拖放区 / 预览区 */}
          {!hasFile ? (
            <div
              className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <Upload size={32} style={{ color: 'var(--text-tertiary)' }} />
              <span className="drop-zone__text">拖放壁纸文件到此处</span>
              <span className="drop-zone__hint">
                支持 mp4, webm, jpg, png, gif, webp, html, zip。HTML 仅导入单文件；如需图片、脚本等相对资源，请将完整壁纸目录打包为 ZIP。
              </span>
            </div>
          ) : (
            <div className="preview-zone">
              {previewUrl && fileType === 'video' ? (
                <video
                  className="preview-zone__video"
                  src={previewUrl}
                  muted
                  autoPlay
                  loop
                  playsInline
                />
              ) : previewUrl && fileType === 'image' ? (
                <img className="preview-zone__image" src={previewUrl} alt={name} />
              ) : (
                <div className="preview-zone__placeholder">
                  {fileType === 'web' && <span>网页壁纸</span>}
                </div>
              )}
              <div className="preview-zone__name">{fileName}</div>
              {!importing && (
                <button
                  className="preview-zone__change"
                  onClick={() => {
                    setFilePath('')
                    setFileName('')
                    setPreviewUrl(undefined)
                    setProgress('')
                  }}
                >
                  更换文件
                </button>
              )}
            </div>
          )}

          {/* 浏览文件按钮 */}
          {!hasFile && (
            <div className="add-card clickable" onClick={handleBrowse}>
              <div className="add-card__icon">
                <FolderOpen size={18} />
              </div>
              <div className="add-card__body">
                <div className="add-card__title">浏览文件</div>
                <div className="add-card__desc">从磁盘选择壁纸文件</div>
              </div>
              <span style={{ color: 'var(--text-tertiary)', fontSize: 18 }}>›</span>
            </div>
          )}

          {/* 进度条 */}
          {importing && (
            <div className="import-progress">
              <div className="import-progress__bar">
                <div className="import-progress__fill" />
              </div>
              <span className="import-progress__text">{progress}</span>
            </div>
          )}

          {/* 错误提示 */}
          {error && <div className="import-error">{error}</div>}

          {/* 元数据表单 */}
          {hasFile && (
            <div className="meta-form">
              <div className="meta-form__field">
                <label>壁纸名称</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="输入壁纸名称…"
                  disabled={importing}
                />
              </div>
              <div className="meta-form__field">
                <label>描述</label>
                <input
                  type="text"
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder="壁纸描述（可选）"
                  disabled={importing}
                />
              </div>
              <div className="meta-form__row">
                <div className="meta-form__field">
                  <label>作者</label>
                  <input
                    type="text"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    placeholder="作者名（可选）"
                    disabled={importing}
                  />
                </div>
                <div className="meta-form__field">
                  <label>网址</label>
                  <input
                    type="text"
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    placeholder="来源网址（可选）"
                    disabled={importing}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="dialog__footer">
          <button className="btn" onClick={onClose} disabled={importing}>
            取消
          </button>
          <button
            className="btn btn--primary"
            onClick={handleConfirm}
            disabled={!hasFile || importing}
          >
            {importing ? (
              <>
                <Loader2 size={14} className="spin" />
                <span>导入中…</span>
              </>
            ) : (
              <span>确认添加</span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
