import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { WidgetInstance } from '@shared/types'
import { PixelPetCanvas } from '@renderer/shared/PixelPetCanvas'
import {
  PIXEL_PET_GENERATOR_ENDPOINT,
  PIXEL_PET_CHANGE_EVENT,
  PIXEL_PET_HEIGHT,
  PIXEL_PET_SETTINGS_KEY,
  PIXEL_PET_STATE_GROUPS,
  PIXEL_PET_STATE_ORDER,
  PIXEL_PET_STATES,
  PIXEL_PET_STORAGE_KEY,
  PIXEL_PET_THEME_EVENT,
  PIXEL_PET_THEME_KEYS,
  PIXEL_PET_THEMES,
  PIXEL_PET_WIDTH,
  buildPixelPetThemeVars,
  createDefaultPixelPets,
  drawPixelPet,
  findPixelPetGroupIndex,
  getActivePixelPet,
  normalizePixelPet,
  normalizePixelPetSettings,
  resolvePixelPetPalette,
  type PixelPet,
  type PixelPetSettings,
  type PixelPetStateKey,
} from '@renderer/shared/pixel-pet'

const PET_WIDGET_SIZE = 160

export function PixelPetPage() {
  const [pets, setPets] = useState<PixelPet[]>(loadPixelPetsFromStorage)
  const [settings, setSettings] = useState<PixelPetSettings>(() => loadPixelPetSettingsFromStorage(loadPixelPetsFromStorage()))
  const [instances, setInstances] = useState<WidgetInstance[]>([])
  const [pendingImage, setPendingImage] = useState<string | null>(null)
  const [pendingFileName, setPendingFileName] = useState('')
  const [generatorStatus, setGeneratorStatus] = useState('')
  const [generatorError, setGeneratorError] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [notice, setNotice] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const activePet = useMemo(() => getActivePixelPet(pets, settings), [pets, settings])
  const activeState = PIXEL_PET_STATES[settings.state]
  const activeGroupIndex = findPixelPetGroupIndex(settings.state)
  const activeGroup = PIXEL_PET_STATE_GROUPS[activeGroupIndex]
  const visibleGroup = PIXEL_PET_STATE_GROUPS[settings.viewGroupIndex] ?? activeGroup
  const palette = useMemo(() => resolvePixelPetPalette(activePet, settings.theme), [activePet, settings.theme])
  const petWidget = instances.find((item) => item.type === 'pet')

  const pageStyle = useMemo(
    () => buildPixelPetThemeVars(palette) as CSSProperties,
    [palette]
  )

  const refreshWidgets = useCallback(async () => {
    const list = await window.lingyue.widget.list()
    setInstances(list)
  }, [])

  useEffect(() => {
    refreshWidgets()
  }, [refreshWidgets])

  useEffect(() => {
    localStorage.setItem(PIXEL_PET_STORAGE_KEY, JSON.stringify(pets.filter((pet) => !pet.locked)))
    window.dispatchEvent(new CustomEvent(PIXEL_PET_CHANGE_EVENT))
  }, [pets])

  useEffect(() => {
    localStorage.setItem(PIXEL_PET_SETTINGS_KEY, JSON.stringify(settings))
    window.dispatchEvent(new CustomEvent(PIXEL_PET_CHANGE_EVENT))
  }, [settings])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent(PIXEL_PET_THEME_EVENT, { detail: pageStyle }))
  }, [pageStyle])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 1800)
    return () => window.clearTimeout(timer)
  }, [notice])

  const selectPet = (petId: string) => {
    const pet = pets.find((item) => item.id === petId) ?? pets[0]
    if (!pet) return
    setSettings((current) => normalizePixelPetSettings({ ...current, petId: pet.id, petName: pet.name }, pets))
  }

  const deletePet = (petId: string) => {
    const target = pets.find((item) => item.id === petId)
    if (!target || target.locked) return
    const nextPets = pets.filter((item) => item.id !== petId)
    setPets(nextPets)
    if (settings.petId === petId) {
      const fallback = nextPets[0] ?? createDefaultPixelPets()[0]
      setSettings((current) => normalizePixelPetSettings({ ...current, petId: fallback.id, petName: fallback.name }, nextPets))
    }
  }

  const updateName = (value: string) => {
    const cleanName = (value || '桌宠').slice(0, 12)
    setSettings((current) => ({ ...current, petName: cleanName }))
    if (!activePet.locked) {
      setPets((current) => current.map((pet) => (pet.id === activePet.id ? { ...pet, name: cleanName } : pet)))
    }
  }

  const selectState = (state: PixelPetStateKey) => {
    setSettings((current) => ({ ...current, state, viewGroupIndex: findPixelPetGroupIndex(state) }))
  }

  const randomize = () => {
    const state = PIXEL_PET_STATE_ORDER[Math.floor(Math.random() * PIXEL_PET_STATE_ORDER.length)]
    const theme = PIXEL_PET_THEME_KEYS[Math.floor(Math.random() * PIXEL_PET_THEME_KEYS.length)]
    setSettings((current) => ({
      ...current,
      state,
      theme,
      viewGroupIndex: findPixelPetGroupIndex(state),
      speed: Number((0.65 + Math.random() * 0.95).toFixed(2)),
      intensity: Number((0.55 + Math.random() * 0.95).toFixed(2)),
    }))
    setNotice('已生成一组新组合')
  }

  const exportPng = () => {
    const output = document.createElement('canvas')
    const scale = 8
    output.width = PIXEL_PET_WIDTH * scale
    output.height = PIXEL_PET_HEIGHT * scale
    const outputContext = output.getContext('2d')
    if (!outputContext) return
    outputContext.imageSmoothingEnabled = false

    const temp = document.createElement('canvas')
    temp.width = PIXEL_PET_WIDTH
    temp.height = PIXEL_PET_HEIGHT
    const tempContext = temp.getContext('2d')
    if (!tempContext) return
    tempContext.imageSmoothingEnabled = false
    drawPixelPet(tempContext, {
      pet: activePet,
      stateKey: settings.state,
      themeKey: settings.theme,
      time: performance.now() / 1000,
      speed: settings.speed,
      intensity: settings.intensity,
      motion: settings.motion,
      effects: settings.effects,
    })
    outputContext.drawImage(temp, 0, 0, output.width, output.height)

    const link = document.createElement('a')
    link.download = `pixel-character-${settings.state}-${settings.theme}.png`
    link.href = output.toDataURL('image/png')
    link.click()
    setNotice(`PNG 已导出为 ${output.width}×${output.height}`)
  }

  const syncToDesktop = async () => {
    const config = buildPixelPetWidgetConfig(activePet, settings)
    if (petWidget) {
      await window.lingyue.widget.updateConfig(petWidget.id, config)
      setNotice('已更新桌面宠物')
    } else {
      const id = `pet-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const inst: WidgetInstance = {
        id,
        type: 'pet',
        x: Math.round(window.screen.width / 2 - PET_WIDGET_SIZE / 2),
        y: Math.round(window.screen.height / 3 - PET_WIDGET_SIZE / 2),
        width: PET_WIDGET_SIZE,
        height: PET_WIDGET_SIZE,
        enabled: true,
        config,
      }
      await window.lingyue.widget.add(inst)
      setNotice('已添加到桌面')
    }
    refreshWidgets()
  }

  const handleImageInput = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setPendingFileName(file.name)
    setGeneratorError(false)
    setGeneratorStatus('正在压缩参考图，避免大图请求失败...')
    setPendingImage(null)
    try {
      const dataUrl = await readImageAsModelDataUrl(file)
      setPendingImage(dataUrl)
      setGeneratorStatus('参考图已载入并压缩，准备调用模型服务。')
    } catch (error) {
      setGeneratorError(true)
      setGeneratorStatus(`图片载入失败：${error instanceof Error ? error.message : '无法读取图片'}`)
    }
  }

  const generatePetFromImage = async () => {
    if (!pendingImage || generating) return
    setGenerating(true)
    setGeneratorError(false)
    setGeneratorStatus('正在调用视觉模型生成桌宠配置...')
    try {
      const response = await fetch(PIXEL_PET_GENERATOR_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageDataUrl: pendingImage,
          desiredName: settings.petName,
          sourceName: pendingFileName,
        }),
      })
      const payload = (await response.json().catch(() => ({}))) as { pet?: unknown; error?: string }
      if (!response.ok) throw new Error(payload.error || `模型服务返回 ${response.status}`)
      const pet = normalizePixelPet({
        ...(isRecord(payload.pet) ? payload.pet : {}),
        id: `pet-${Date.now()}`,
        createdAt: new Date().toISOString(),
        sourceName: pendingFileName,
        locked: false,
      })
      const nextPets = [...pets, pet]
      setPets(nextPets)
      setSettings((current) => normalizePixelPetSettings({ ...current, petId: pet.id, petName: pet.name }, nextPets))
      setGeneratorStatus(`已生成并保存为${pet.profile.features.avatarType === 'human' ? '人形' : '兽类'}桌宠。`)
      setNotice('已保存新桌宠')
    } catch (error) {
      setGeneratorError(true)
      setGeneratorStatus(`生成失败：${error instanceof Error ? error.message : '需要启动本地模型服务并配置 OPENAI_API_KEY'}`)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="pixel-pet-page" style={pageStyle}>
      <section className="pixel-pet-preview-panel" aria-label="像素小人预览">
        <div className="pixel-pet-stage-shell">
          <div className={`pixel-pet-stage ${settings.grid ? '' : 'no-grid'}`}>
            <PixelPetCanvas pet={activePet} settings={settings} className="pixel-pet-character-canvas" width="min(36vw, 400px)" height="auto" />
            <div className="pixel-pet-caption">
              <span className="pixel-pet-icon" aria-hidden="true">♡</span>
              <strong>{settings.petName || activePet.name}</strong>
              <span>{activeState.line}</span>
            </div>
          </div>
        </div>

        <section className="pixel-pet-state-dock" aria-label="动作库">
          <div className="pixel-pet-action-summary">
            <span className="pixel-pet-action-kicker">{activeGroup.title}</span>
            <strong className="pixel-pet-action-title">{activeState.label}</strong>
            <span className="pixel-pet-action-desc">{activeState.line}</span>
          </div>
          <div className="pixel-pet-action-picker">
            <div className="pixel-pet-state-tabs" role="tablist" aria-label="动作分类">
              {PIXEL_PET_STATE_GROUPS.map((group, index) => (
                <button
                  key={group.title}
                  type="button"
                  className="pixel-pet-state-tab"
                  aria-pressed={settings.viewGroupIndex === index}
                  onClick={() => setSettings((current) => ({ ...current, viewGroupIndex: index }))}
                >
                  {group.title}
                </button>
              ))}
            </div>
            <div className="pixel-pet-state-list">
              <section className="pixel-pet-state-group active">
                <div className="pixel-pet-state-grid">
                  {visibleGroup.items.map((key) => {
                    const state = PIXEL_PET_STATES[key]
                    return (
                      <button key={key} type="button" className="pixel-pet-state-button" aria-pressed={settings.state === key} onClick={() => selectState(key)}>
                        <span>
                          <span className="pixel-pet-button-main">{state.label}</span>
                          <span className="pixel-pet-button-sub">{state.short}</span>
                        </span>
                        <span className="pixel-pet-button-mark" aria-hidden="true" />
                      </button>
                    )
                  })}
                </div>
              </section>
            </div>
          </div>
        </section>
      </section>

      <aside className="pixel-pet-control-panel">
        <section className="pixel-pet-tool-section">
          <h2>宠物</h2>
          <label className="pixel-pet-field pixel-pet-field--select">
            <span>选择宠物</span>
            <div className="pixel-pet-select-row">
              <select className="pixel-pet-select" value={activePet.id} onChange={(event) => selectPet(event.target.value)}>
                {pets.map((pet) => (
                  <option key={pet.id} value={pet.id}>
                    {pet.name}
                  </option>
                ))}
              </select>
              {!activePet.locked && (
                <button type="button" className="pixel-pet-delete-current" onClick={() => deletePet(activePet.id)}>
                  删除
                </button>
              )}
            </div>
            <small className="pixel-pet-field-hint">{activePet.locked ? '内置参考角色' : activePet.sourceName || '由参考图生成'}</small>
          </label>
          <label className="pixel-pet-field">
            <span>名字</span>
            <input value={settings.petName} maxLength={12} onChange={(event) => updateName(event.target.value)} />
          </label>
        </section>

        <section className="pixel-pet-tool-section">
          <h2>模型生成</h2>
          <div className="pixel-pet-generator-box">
            <button type="button" className="pixel-pet-upload-card" onClick={() => fileInputRef.current?.click()}>
              {pendingImage ? <img src={pendingImage} alt="参考图预览" /> : <span>上传参考图<br />由视觉模型提取角色特征</span>}
            </button>
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={handleImageInput} />
            <button type="button" className="pixel-pet-action-button" disabled={!pendingImage || generating} onClick={generatePetFromImage}>
              {generating ? '生成中' : '生成并保存桌宠'}
            </button>
            <div className="pixel-pet-generator-note">需要本地模型服务：pet-generator-server.mjs；视觉模型提取外观配置，动作由内置骨架自动套用。</div>
            <div className={`pixel-pet-generator-status ${generatorError ? 'is-error' : ''}`}>{generatorStatus}</div>
          </div>
        </section>

        <section className="pixel-pet-tool-section">
          <h2>配色</h2>
          <div className="pixel-pet-palette-grid">
            {PIXEL_PET_THEME_KEYS.map((key) => {
              const theme = PIXEL_PET_THEMES[key]
              return (
                <button key={key} type="button" className="pixel-pet-palette-button" aria-pressed={settings.theme === key} onClick={() => setSettings((current) => ({ ...current, theme: key }))}>
                  <span className="pixel-pet-swatches" aria-hidden="true">
                    <i style={{ background: theme.fur }} />
                    <i style={{ background: theme.mane }} />
                    <i style={{ background: theme.spot }} />
                  </span>
                  <span className="pixel-pet-palette-name">{theme.label}</span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="pixel-pet-tool-section">
          <h2>动作参数</h2>
          <SliderRow label="速度" value={settings.speed} min={0.4} max={1.8} step={0.05} onChange={(value) => setSettings((current) => ({ ...current, speed: value }))} />
          <SliderRow label="幅度" value={settings.intensity} min={0} max={1.8} step={0.05} onChange={(value) => setSettings((current) => ({ ...current, intensity: value }))} />
        </section>

        <section className="pixel-pet-tool-section">
          <h2>显示</h2>
          <div className="pixel-pet-toggle-grid">
            <label className="pixel-pet-toggle">
              <input type="checkbox" checked={settings.motion} onChange={(event) => setSettings((current) => ({ ...current, motion: event.target.checked }))} />
              <span>动画</span>
            </label>
            <label className="pixel-pet-toggle">
              <input type="checkbox" checked={settings.effects} onChange={(event) => setSettings((current) => ({ ...current, effects: event.target.checked }))} />
              <span>特效</span>
            </label>
            <label className="pixel-pet-toggle">
              <input type="checkbox" checked={settings.grid} onChange={(event) => setSettings((current) => ({ ...current, grid: event.target.checked }))} />
              <span>网格</span>
            </label>
          </div>
        </section>

        <section className="pixel-pet-tool-section">
          <h2>输出</h2>
          <div className="pixel-pet-output-grid">
            <button type="button" onClick={randomize}>
              随机组合
            </button>
            <button type="button" onClick={exportPng}>
              导出 PNG
            </button>
            <button type="button" className="wide" onClick={syncToDesktop}>
              {petWidget ? '同步桌面宠物' : '添加到桌面'}
            </button>
          </div>
          <div className="pixel-pet-copy-note">{notice}</div>
        </section>
      </aside>
    </div>
  )
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}) {
  return (
    <label className="pixel-pet-control-row">
      <span className="pixel-pet-control-head">
        <span>{label}</span>
        <span>{value.toFixed(2)}×</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  )
}

function buildPixelPetWidgetConfig(pet: PixelPet, settings: PixelPetSettings): Record<string, unknown> {
  return {
    mode: 'pixel',
    pixelPet: {
      pet,
      settings,
    },
  }
}

function loadPixelPetsFromStorage(): PixelPet[] {
  const defaults = createDefaultPixelPets()
  try {
    const saved = JSON.parse(localStorage.getItem(PIXEL_PET_STORAGE_KEY) || '[]')
    const defaultIds = new Set(defaults.map((pet) => pet.id))
    const generated = Array.isArray(saved) ? saved.filter((pet) => !defaultIds.has(isRecord(pet) ? String(pet.id || '') : '')).map(normalizePixelPet) : []
    return [...defaults, ...generated]
  } catch {
    return defaults
  }
}

function loadPixelPetSettingsFromStorage(pets: PixelPet[]): PixelPetSettings {
  try {
    return normalizePixelPetSettings(JSON.parse(localStorage.getItem(PIXEL_PET_SETTINGS_KEY) || '{}'), pets)
  } catch {
    return normalizePixelPetSettings({}, pets)
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('无法读取图片'))
    reader.readAsDataURL(file)
  })
}

async function readImageAsModelDataUrl(file: File): Promise<string> {
  const original = await readFileAsDataUrl(file)
  if (file.size < 5 * 1024 * 1024) return original
  return compressImageDataUrl(original, 1280, 0.86)
}

function compressImageDataUrl(dataUrl: string, maxSide: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const ratio = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight))
      const width = Math.max(1, Math.round(image.naturalWidth * ratio))
      const height = Math.max(1, Math.round(image.naturalHeight * ratio))
      const temp = document.createElement('canvas')
      temp.width = width
      temp.height = height
      const context = temp.getContext('2d')
      if (!context) {
        reject(new Error('无法创建图片画布'))
        return
      }
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.drawImage(image, 0, 0, width, height)
      resolve(temp.toDataURL('image/jpeg', quality))
    }
    image.onerror = () => reject(new Error('图片无法解码'))
    image.src = dataUrl
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}