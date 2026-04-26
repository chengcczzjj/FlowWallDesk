import { useEffect, useRef, useState } from 'react'
import { LayoutTemplate, Moon, Save, Sun, Trash2, Volume, Volume1, Volume2, VolumeX } from 'lucide-react'
import { COLOR_THEMES, getStylesForType } from './shared/constants'

interface FloatingToolbarProps {
  widgetType: string
  config: Record<string, unknown>
  updateConfig: (config: Record<string, unknown>) => void
  onDelete: () => void
  onSaveToWallpaper: () => void
}

export function FloatingToolbar({
  widgetType,
  config,
  updateConfig,
  onDelete,
  onSaveToWallpaper,
}: FloatingToolbarProps) {
  const [activePopover, setActivePopover] = useState<'style' | 'theme' | null>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  /** 打开颜色面板前的原始 themeId，用于离开时恢复 */
  const originalThemeRef = useRef<string | null>(null)

  const styles = getStylesForType(widgetType)
  const currentStyle = styles.find((s) => s.id === config.style) || styles[0]
  const defaultThemeId = widgetType === 'graphicdatetime' ? 'yellow' : COLOR_THEMES[0].id
  const currentTheme =
    COLOR_THEMES.find((t) => t.id === ((config.themeId as string | undefined) || defaultThemeId)) || COLOR_THEMES[0]
  const darkModeOn = (config.darkMode as boolean | undefined) ?? widgetType === 'graphicdatetime'

  const togglePopover = (name: 'style' | 'theme') => {
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

      {/* Save to Wallpaper */}
      <button
        onClick={onSaveToWallpaper}
        className="p-1.5 rounded-full text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
        title="保存到当前壁纸"
      >
        <Save size={16} />
      </button>

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
