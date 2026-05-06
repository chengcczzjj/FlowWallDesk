import { useEffect, useRef, useState } from 'react'
import { CopyCheck, EyeOff, LayoutTemplate, Moon, Palette, SlidersHorizontal, Sparkles, Sun, Trash2, Volume, Volume1, Volume2, VolumeX, ZoomIn } from 'lucide-react'
import { COLOR_THEMES, getStylesForType } from './shared/constants'

type PopoverName = 'style' | 'theme' | 'storage' | 'storageStyle' | 'dockStyle' | 'dockColor' | 'dockGlass' | 'dockScale'

const ICON_STORAGE_TYPES = ['desktop-icons-box', 'desktop-icons-horizontal', 'desktop-icons-adaptive']

interface FloatingToolbarProps {
  widgetType: string
  config: Record<string, unknown>
  updateConfig: (config: Record<string, unknown>, options?: { applyToAllIconStorage?: boolean }) => void
  onDelete: () => void
}

export function FloatingToolbar({
  widgetType,
  config,
  updateConfig,
  onDelete,
}: FloatingToolbarProps) {
  const [activePopover, setActivePopover] = useState<PopoverName | null>(null)
  const [applyToAllStorage, setApplyToAllStorage] = useState(true)
  const toolbarRef = useRef<HTMLDivElement>(null)
  /** 打开颜色面板前的原始 themeId，用于离开时恢复 */
  const originalThemeRef = useRef<string | null>(null)

  const styles = getStylesForType(widgetType)
  const currentStyle = styles.find((s) => s.id === config.style) || styles[0]
  const defaultThemeId = widgetType === 'graphicdatetime' ? 'yellow' : COLOR_THEMES[0].id
  const currentTheme =
    COLOR_THEMES.find((t) => t.id === ((config.themeId as string | undefined) || defaultThemeId)) || COLOR_THEMES[0]
  const darkModeOn = (config.darkMode as boolean | undefined) ?? widgetType === 'graphicdatetime'
  const hasStorageOptions = ICON_STORAGE_TYPES.includes(widgetType)
  const hasDockOptions = widgetType === 'desktop-icons-dock'
  const storageTint = readHexColor(config.storageTint, '#ffffff')
  const storageTintStrength = readNumber(config.storageTintStrength, 0.04, 0, 0.2)
  const storageOpacity = readNumber(config.storageOpacity, 0.08, 0.02, 0.22)
  const storageBlur = readNumber(config.storageBlur, 15, 6, 32)
  const storageStyle = config.storageStyle === 'titled' ? 'titled' : 'plain'
  const storageTitle = typeof config.storageTitle === 'string' ? config.storageTitle : '图标收纳'
  const storageHideLabels = config.storageHideLabels === true
  const dockTint = readHexColor(config.dockTint, '#ffffff')
  const dockTintStrength = readNumber(config.dockTintStrength, 0.1, 0, 0.24)
  const dockOpacity = readNumber(config.dockOpacity, 0.18, 0, 0.24)
  const dockBlur = readNumber(config.dockBlur, 16, 6, 32)
  const dockStyle = config.dockStyle === 'trapezoid' ? 'trapezoid' : 'glass'
  const dockReflection = config.dockReflection === true
  const dockHoverScale = readNumber(config.dockHoverScale, 1.58, 1.1, 2.1)
  const updateStorageConfig = (changes: Record<string, unknown>) => {
    updateConfig(changes, { applyToAllIconStorage: applyToAllStorage })
  }

  const togglePopover = (name: PopoverName) => {
    setActivePopover((prev) => {
      if (name === 'theme') {
        if (prev === 'theme') {
          // 关闭颜色面板 — 保持当前悬浮选中的颜色
          originalThemeRef.current = null
          return null
        } else {
          // 打开颜色面板 — 记录原始值
          originalThemeRef.current = (config.themeId as string) || defaultThemeId
          return 'theme'
        }
      }
      return prev === name ? null : name
    })
  }

  /** 点击选定（样式） */
  const handleSelect = (changes: Record<string, unknown>) => {
    updateConfig({ ...config, ...changes })
    setActivePopover(null)
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(event.target as Node)) {
        if (activePopover === 'theme') {
          // 点击外部关闭颜色面板 — 保持当前悬浮选择的颜色
          originalThemeRef.current = null
        }
        if (activePopover) setActivePopover(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [activePopover])

  // 是否支持样式选择
  const hasStyles = styles.length > 0
  // 是否支持颜色主题
  const hasTheme = ['clock', 'audio', 'whitenoise', 'graphicdatetime'].includes(widgetType)
  // 是否支持暗色模式
  const hasDarkMode = ['weather', 'whitenoise', 'graphicdatetime'].includes(widgetType)
  // 是否支持音量
  const hasVolume = widgetType === 'whitenoise'
  // 是否支持透明度
  const hasOpacity = ['clock', 'audio', 'whitenoise'].includes(widgetType)

  return (
    <div
      ref={toolbarRef}
      className="flex items-center bg-white rounded-full shadow-xl border border-slate-200 p-1.5 gap-2 select-none"
      style={{ whiteSpace: 'nowrap' }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Style Dropdown */}
      {hasStyles && (
        <>
          <div className="relative">
            <button
              onClick={() => togglePopover('style')}
              className={`p-1.5 rounded-full transition-colors ${activePopover === 'style' ? 'bg-orange-50 text-orange-600' : 'text-slate-700 hover:bg-slate-50'}`}
              title="样式"
            >
              <div className="relative">
                <LayoutTemplate size={16} />
                <span className="absolute -bottom-1.5 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-slate-200 text-[9px] font-bold text-slate-700 ring-1 ring-white">
                  {styles.indexOf(currentStyle) + 1}
                </span>
              </div>
            </button>
            {activePopover === 'style' && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 bg-white rounded-xl shadow-xl border border-slate-100 p-1.5 flex gap-1.5 min-w-max">
                {styles.map((s, index) => {
                  const isActive = config.style === s.id
                  return (
                    <button
                      key={s.id}
                      onClick={() => handleSelect({ style: s.id })}
                      className={`p-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap relative ${isActive ? 'bg-orange-50 text-orange-600' : 'text-slate-600 hover:bg-slate-50'}`}
                      title={s.name}
                    >
                      <div className="relative">
                        <LayoutTemplate size={20} className={isActive ? 'text-orange-600' : 'text-slate-500'} />
                        <span className="absolute -bottom-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-slate-200 text-[8px] font-bold text-slate-700 ring-1 ring-white">
                          {index + 1}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          <div className="h-4 w-px bg-slate-200 mx-1"></div>
        </>
      )}

      {/* Dark Mode Toggle */}
      {hasDarkMode && (
        <button
          onClick={() => updateConfig({ ...config, darkMode: !darkModeOn })}
          className={`p-1.5 rounded-full transition-colors ${darkModeOn ? 'bg-slate-800 text-yellow-400' : 'hover:bg-slate-50 text-slate-400 hover:text-orange-500'}`}
          title="明暗切换"
        >
          {darkModeOn ? <Moon size={16} /> : <Sun size={16} />}
        </button>
      )}

      {/* Volume Control (WhiteNoise) */}
      {hasVolume && (
        <>
          <div className="h-4 w-px bg-slate-200 mx-1"></div>
          <button
            onClick={() => updateConfig({ ...config, volume: (((config.volume as number) ?? 2) + 1) % 4 })}
            className="p-1.5 rounded-full transition-colors hover:bg-slate-50 text-slate-400 hover:text-slate-700"
            title={`音量: ${Math.round([0, 0.3, 0.6, 1][(config.volume as number) ?? 2] * 100)}%`}
          >
            {
              [
                <VolumeX key="0" size={16} />,
                <Volume key="1" size={16} />,
                <Volume1 key="2" size={16} />,
                <Volume2 key="3" size={16} />,
              ][(config.volume as number) ?? 2]
            }
          </button>
        </>
      )}

      {/* Icon Storage Settings */}
      {hasStorageOptions && (
        <>
          <button
            onClick={() => setApplyToAllStorage((checked) => !checked)}
            className={`p-1.5 rounded-full transition-colors ${applyToAllStorage ? 'bg-sky-50 text-sky-600' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
            title={applyToAllStorage ? '应用到全部收纳' : '仅应用当前收纳'}
            aria-pressed={applyToAllStorage}
          >
            <CopyCheck size={16} />
          </button>
          <div className="relative">
            <button
              onClick={() => togglePopover('storage')}
              className={`p-1.5 rounded-full transition-colors ${activePopover === 'storage' ? 'bg-sky-50 text-sky-600' : 'text-slate-700 hover:bg-slate-50'}`}
              title="收纳设置"
            >
              <div className="relative">
                <SlidersHorizontal size={16} />
                <span
                  className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 rounded-full ring-1 ring-white border border-slate-200"
                  style={{ background: storageTint }}
                />
              </div>
            </button>
            {activePopover === 'storage' && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-72 bg-white rounded-2xl shadow-xl border border-slate-100 p-3 text-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">颜色</span>
                  <Palette size={14} className="text-slate-300" />
                </div>
                <div className="grid grid-cols-7 gap-2 mb-3">
                  {COLOR_THEMES.map((theme) => {
                    const isActive = storageTint.toLowerCase() === theme.base.toLowerCase()
                    return (
                      <button
                        key={theme.id}
                        onClick={() => updateStorageConfig({ storageTint: theme.base })}
                        className={`w-6 h-6 rounded-full border border-slate-200 transition-transform hover:scale-110 ${isActive ? 'ring-2 ring-sky-500 ring-offset-1 scale-105 border-transparent' : ''}`}
                        style={{ background: theme.base }}
                        title={theme.label}
                      />
                    )
                  })}
                </div>
                <StorageSlider
                  label="颜色强度"
                  value={storageTintStrength}
                  min={0}
                  max={0.2}
                  step={0.01}
                  display={`${Math.round(storageTintStrength * 100)}%`}
                  onChange={(value) => updateStorageConfig({ storageTintStrength: value })}
                />
                <StorageSlider
                  label="透明度"
                  value={storageOpacity}
                  min={0.02}
                  max={0.22}
                  step={0.01}
                  display={`${Math.round(storageOpacity * 100)}%`}
                  onChange={(value) => updateStorageConfig({ storageOpacity: value })}
                />
                <StorageSlider
                  label="模糊"
                  value={storageBlur}
                  min={6}
                  max={32}
                  step={1}
                  display={`${Math.round(storageBlur)}px`}
                  onChange={(value) => updateStorageConfig({ storageBlur: value })}
                />
              </div>
            )}
          </div>
          <div className="relative">
            <button
              onClick={() => togglePopover('storageStyle')}
              className={`p-1.5 rounded-full transition-colors ${activePopover === 'storageStyle' ? 'bg-sky-50 text-sky-600' : 'text-slate-700 hover:bg-slate-50'}`}
              title="收纳样式"
            >
              <LayoutTemplate size={16} />
            </button>
            {activePopover === 'storageStyle' && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-64 bg-white rounded-2xl shadow-xl border border-slate-100 p-3 text-slate-700">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'plain', label: '普通' },
                    { id: 'titled', label: '标题' },
                  ].map((option) => {
                    const isActive = storageStyle === option.id
                    return (
                      <button
                        key={option.id}
                        onClick={() => updateStorageConfig({ storageStyle: option.id })}
                        className={`flex h-16 items-center justify-center rounded-xl border transition-colors ${isActive ? 'border-sky-300 bg-sky-50 text-sky-600' : 'border-slate-100 bg-slate-50 text-slate-500 hover:bg-white hover:border-slate-200'}`}
                        title={option.label}
                      >
                        <StorageStylePreview titled={option.id === 'titled'} active={isActive} />
                      </button>
                    )
                  })}
                </div>
                {storageStyle === 'titled' && (
                  <input
                    type="text"
                    maxLength={32}
                    value={storageTitle}
                    onChange={(event) => updateStorageConfig({ storageTitle: event.target.value })}
                    className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 outline-none transition-colors focus:border-sky-300 focus:bg-white"
                    placeholder="图标收纳"
                  />
                )}
                <button
                  type="button"
                  onClick={() => updateStorageConfig({ storageHideLabels: !storageHideLabels })}
                  className={`mt-3 flex w-full items-center justify-between rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${storageHideLabels ? 'border-sky-200 bg-sky-50 text-sky-600' : 'border-slate-100 bg-slate-50 text-slate-500 hover:bg-white hover:border-slate-200'}`}
                  title="隐藏图标名字"
                >
                  <span>隐藏图标名字</span>
                  <EyeOff size={14} />
                </button>
              </div>
            )}
          </div>
          <div className="h-4 w-px bg-slate-200 mx-1"></div>
        </>
      )}

      {/* Dock Settings */}
      {hasDockOptions && (
        <>
          <div className="relative">
            <button
              onClick={() => togglePopover('dockStyle')}
              className={`p-1.5 rounded-full transition-colors ${activePopover === 'dockStyle' ? 'bg-sky-50 text-sky-600' : 'text-slate-700 hover:bg-slate-50'}`}
              title="Dock 样式"
            >
              <LayoutTemplate size={16} />
            </button>
            {activePopover === 'dockStyle' && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-64 bg-white rounded-2xl shadow-xl border border-slate-100 p-3 text-slate-700">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'glass', label: '经典' },
                    { id: 'trapezoid', label: '梯形' },
                  ].map((option) => {
                    const isActive = dockStyle === option.id
                    return (
                      <button
                        key={option.id}
                        onClick={() => updateConfig({ dockStyle: option.id })}
                        className={`flex h-16 flex-col items-center justify-center gap-2 rounded-xl border text-xs font-semibold transition-colors ${isActive ? 'border-sky-300 bg-sky-50 text-sky-600' : 'border-slate-100 bg-slate-50 text-slate-500 hover:bg-white hover:border-slate-200'}`}
                        title={option.label}
                      >
                        <DockStylePreview trapezoid={option.id === 'trapezoid'} active={isActive} />
                        <span>{option.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
          <div className="relative">
            <button
              onClick={() => togglePopover('dockColor')}
              className={`p-1.5 rounded-full transition-colors ${activePopover === 'dockColor' ? 'bg-sky-50 text-sky-600' : 'text-slate-700 hover:bg-slate-50'}`}
              title="Dock 颜色"
            >
              <div className="relative">
                <Palette size={16} />
                <span
                  className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 rounded-full ring-1 ring-white border border-slate-200"
                  style={{ background: dockTint }}
                />
              </div>
            </button>
            {activePopover === 'dockColor' && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-72 bg-white rounded-2xl shadow-xl border border-slate-100 p-3 text-slate-700">
                <div className="grid grid-cols-7 gap-2 mb-3">
                  {COLOR_THEMES.map((theme) => {
                    const isActive = dockTint.toLowerCase() === theme.base.toLowerCase()
                    return (
                      <button
                        key={theme.id}
                        onClick={() => updateConfig({ dockTint: theme.base })}
                        className={`w-6 h-6 rounded-full border border-slate-200 transition-transform hover:scale-110 ${isActive ? 'ring-2 ring-sky-500 ring-offset-1 scale-105 border-transparent' : ''}`}
                        style={{ background: theme.base }}
                        title={theme.label}
                      />
                    )
                  })}
                </div>
                <StorageSlider
                  label="颜色强度"
                  value={dockTintStrength}
                  min={0}
                  max={0.24}
                  step={0.01}
                  display={`${Math.round(dockTintStrength * 100)}%`}
                  onChange={(value) => updateConfig({ dockTintStrength: value })}
                />
              </div>
            )}
          </div>
          <div className="relative">
            <button
              onClick={() => togglePopover('dockGlass')}
              className={`p-1.5 rounded-full transition-colors ${activePopover === 'dockGlass' ? 'bg-sky-50 text-sky-600' : 'text-slate-700 hover:bg-slate-50'}`}
              title="Dock 透明与模糊"
            >
              <SlidersHorizontal size={16} />
            </button>
            {activePopover === 'dockGlass' && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-64 bg-white rounded-2xl shadow-xl border border-slate-100 p-3 text-slate-700">
                <StorageSlider
                  label="透明度"
                  value={dockOpacity}
                  min={0}
                  max={0.24}
                  step={0.01}
                  display={`${Math.round(dockOpacity * 100)}%`}
                  onChange={(value) => updateConfig({ dockOpacity: value })}
                />
                <StorageSlider
                  label="模糊"
                  value={dockBlur}
                  min={6}
                  max={32}
                  step={1}
                  display={`${Math.round(dockBlur)}px`}
                  onChange={(value) => updateConfig({ dockBlur: value })}
                />
              </div>
            )}
          </div>
          <button
            onClick={() => updateConfig({ dockReflection: !dockReflection })}
            className={`p-1.5 rounded-full transition-colors ${dockReflection ? 'bg-sky-50 text-sky-600' : 'text-slate-700 hover:bg-slate-50'}`}
            title="Dock 倒影"
          >
            <Sparkles size={16} />
          </button>
          <div className="relative">
            <button
              onClick={() => togglePopover('dockScale')}
              className={`p-1.5 rounded-full transition-colors ${activePopover === 'dockScale' ? 'bg-sky-50 text-sky-600' : 'text-slate-700 hover:bg-slate-50'}`}
              title="Dock 悬浮放大"
            >
              <ZoomIn size={16} />
            </button>
            {activePopover === 'dockScale' && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-64 bg-white rounded-2xl shadow-xl border border-slate-100 p-3 text-slate-700">
                <StorageSlider
                  label="放大倍数"
                  value={dockHoverScale}
                  min={1.1}
                  max={2.1}
                  step={0.01}
                  display={`${dockHoverScale.toFixed(2)}x`}
                  onChange={(value) => updateConfig({ dockHoverScale: value })}
                />
              </div>
            )}
          </div>
          <div className="h-4 w-px bg-slate-200 mx-1"></div>
        </>
      )}

      {/* Color Theme Picker */}
      {hasTheme && (
        <>
          {(hasVolume || hasDarkMode) && <div className="h-4 w-px bg-slate-200 mx-1"></div>}
          <div className="relative">
            <button
              onClick={() => togglePopover('theme')}
              className={`p-1.5 rounded-full transition-colors ${activePopover === 'theme' ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
              title="颜色主题"
            >
              <div className="w-4 h-4 rounded-full" style={{ background: currentTheme.base }}></div>
            </button>
            {activePopover === 'theme' && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 bg-white rounded-xl shadow-xl border border-slate-100 p-3 min-w-max">
                <div className="grid grid-cols-7 gap-2 mb-2">
                  {COLOR_THEMES.map((theme) => (
                    <button
                      key={theme.id}
                      onMouseEnter={() => updateConfig({ ...config, themeId: theme.id })}
                      className={`w-6 h-6 rounded-full border border-slate-200 transition-transform hover:scale-110 ${config.themeId === theme.id ? 'ring-2 ring-orange-500 ring-offset-1 scale-105 border-transparent' : ''}`}
                      style={{ background: theme.base }}
                      title={theme.label}
                    />
                  ))}
                </div>
                {hasOpacity && (
                  <div className="border-t border-slate-100 pt-2 px-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">透明度</span>
                      <span className="text-[10px] text-slate-500">
                        {Math.round(((config.opacity as number) ?? 1) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="1.0"
                      step="0.01"
                      value={(config.opacity as number) ?? 1}
                      onChange={(e) => updateConfig({ ...config, opacity: parseFloat(e.target.value) })}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-orange-500 block"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      <div className="h-4 w-px bg-slate-200 mx-1"></div>

      {/* Delete Button */}
      <button
        onClick={onDelete}
        className="p-1.5 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
        title="删除组件"
      >
        <Trash2 size={16} />
      </button>
    </div>
  )
}

function StorageStylePreview({ titled, active }: { titled: boolean; active: boolean }) {
  return (
    <span
      style={{
        width: 48,
        height: 34,
        borderRadius: titled ? 7 : 10,
        border: active ? '1.5px solid rgba(2,132,199,0.7)' : '1px solid rgba(100,116,139,0.28)',
        background: 'linear-gradient(145deg, rgba(255,255,255,0.9), rgba(226,232,240,0.82))',
        boxShadow: active ? '0 8px 18px rgba(14,165,233,0.18)' : 'inset 0 1px 0 rgba(255,255,255,0.86)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {titled && <span style={{ height: 9, background: 'rgba(148,163,184,0.32)', borderBottom: '1px solid rgba(148,163,184,0.24)' }} />}
      <span
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 4,
          padding: titled ? '5px 7px' : '7px',
        }}
      >
        {[0, 1, 2, 3, 4, 5].map((dot) => (
          <span key={dot} style={{ width: 5, height: 5, borderRadius: 3, background: active ? '#0ea5e9' : '#94a3b8' }} />
        ))}
      </span>
    </span>
  )
}

function DockStylePreview({ trapezoid, active }: { trapezoid: boolean; active: boolean }) {
  return (
    <span
      style={{
        width: 54,
        height: 22,
        borderRadius: trapezoid ? 4 : 11,
        clipPath: trapezoid ? 'polygon(8% 0, 92% 0, 100% 100%, 0 100%)' : undefined,
        border: active ? '1.5px solid rgba(2,132,199,0.72)' : '1px solid rgba(100,116,139,0.26)',
        background: trapezoid
          ? 'linear-gradient(to top, rgba(125,211,252,0.42), rgba(226,232,240,0.2))'
          : 'linear-gradient(145deg, rgba(255,255,255,0.86), rgba(226,232,240,0.56))',
        boxShadow: active ? '0 8px 18px rgba(14,165,233,0.18)' : 'inset 0 1px 0 rgba(255,255,255,0.72)',
      }}
    />
  )
}

function StorageSlider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  display: string
  onChange: (value: number) => void
}) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
        <span className="text-[10px] text-slate-500">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(parseFloat(event.target.value))}
        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-sky-500 block"
      />
    </div>
  )
}

function readNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, value))
}

function readHexColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim()
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized : fallback
}
