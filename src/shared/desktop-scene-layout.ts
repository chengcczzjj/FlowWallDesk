import type { WidgetInstance } from './types'
import {
  DEFAULT_WIDGET_SIZE_BY_TYPE,
  getDesktopSceneTemplate,
  getWidgetCapability,
  type DesktopAnchor,
  type DesktopSceneTemplate,
  type DesktopSize,
  type WidgetLayer,
  type WidgetPatch,
  type WidgetTypeId,
  type WallpaperLayoutMetadata,
} from './desktop-scene'

export interface DesktopRect {
  x: number
  y: number
  width: number
  height: number
}

export interface PlannedSceneWidget {
  id: string
  type: WidgetTypeId
  source: 'existing' | 'new' | 'persistent'
  preset?: string
  anchor: DesktopAnchor
  rect: DesktopRect
  config: Record<string, unknown>
  layer: WidgetLayer
  material: string
  visualWeight: string
  canBeHero: boolean
  persistent: boolean
}

export interface DesktopAestheticIssue {
  id: string
  severity: 'error' | 'warning'
  label: string
  message: string
}

export interface DesktopAestheticCheckResult {
  ok: boolean
  score: number
  issues: DesktopAestheticIssue[]
  summary: string
}

export interface DesktopSceneLayoutPlan {
  sceneId: string
  sceneName: string
  screen: DesktopSize
  widgets: PlannedSceneWidget[]
  hiddenWidgetIds: string[]
  widgetPatches: WidgetPatch[]
  preservedEmptyAreas: string[]
  aestheticCheck: DesktopAestheticCheckResult
}

const EDGE_PADDING = 24
const GAP = 16
const CENTER_AVOID_RECT = { x: 0.28, y: 0.18, width: 0.44, height: 0.58 }

const FIT_CONTENT_ESTIMATES: Partial<Record<WidgetTypeId, DesktopSize>> = {
  clock: { width: 336, height: 155 },
  elegantclock: { width: 320, height: 150 },
  pixelclock: { width: 288, height: 96 },
  graphicdatetime: { width: 464, height: 464 },
  weather: { width: 160, height: 72 },
  whitenoise: { width: 208, height: 120 },
  text: { width: 320, height: 96 },
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function rectsOverlap(a: DesktopRect, b: DesktopRect, gap = 0): boolean {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  )
}

function expandRect(rect: DesktopRect, amount: number): DesktopRect {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2,
  }
}

function scaleArea(rect: [number, number, number, number], screen: DesktopSize): DesktopRect {
  return {
    x: Math.round(rect[0] * screen.width),
    y: Math.round(rect[1] * screen.height),
    width: Math.round(rect[2] * screen.width),
    height: Math.round(rect[3] * screen.height),
  }
}

function getWidgetSize(type: WidgetTypeId): DesktopSize {
  const base = DEFAULT_WIDGET_SIZE_BY_TYPE[type]
  if (base.width > 0 && base.height > 0) return base
  return FIT_CONTENT_ESTIMATES[type] ?? { width: 240, height: 120 }
}

function anchorRect(anchor: DesktopAnchor, size: DesktopSize, screen: DesktopSize): DesktopRect {
  const maxX = screen.width - EDGE_PADDING - size.width
  const maxY = screen.height - EDGE_PADDING - size.height
  const centerX = Math.round((screen.width - size.width) / 2)
  const centerY = Math.round((screen.height - size.height) / 2)

  const xByAnchor: Record<DesktopAnchor, number> = {
    'top-left': EDGE_PADDING,
    'top-center': centerX,
    'top-right': maxX,
    'center-left': EDGE_PADDING,
    'center-right': maxX,
    'bottom-left': EDGE_PADDING,
    'bottom-center': centerX,
    'bottom-right': maxX,
  }
  const yByAnchor: Record<DesktopAnchor, number> = {
    'top-left': EDGE_PADDING,
    'top-center': EDGE_PADDING,
    'top-right': EDGE_PADDING,
    'center-left': centerY,
    'center-right': centerY,
    'bottom-left': maxY,
    'bottom-center': maxY,
    'bottom-right': maxY,
  }

  return {
    x: clamp(xByAnchor[anchor], EDGE_PADDING, maxX),
    y: clamp(yByAnchor[anchor], EDGE_PADDING, maxY),
    width: size.width,
    height: size.height,
  }
}

function snapRect(rect: DesktopRect, screen: DesktopSize): DesktopRect {
  const maxX = screen.width - EDGE_PADDING - rect.width
  const maxY = screen.height - EDGE_PADDING - rect.height
  return {
    ...rect,
    x: clamp(Math.round(rect.x / GAP) * GAP, EDGE_PADDING, Math.max(EDGE_PADDING, maxX)),
    y: clamp(Math.round(rect.y / GAP) * GAP, EDGE_PADDING, Math.max(EDGE_PADDING, maxY)),
  }
}

function candidateRects(anchor: DesktopAnchor, size: DesktopSize, screen: DesktopSize): DesktopRect[] {
  const base = anchorRect(anchor, size, screen)
  const offsets = [0, GAP, GAP * 2, GAP * 4, GAP * 6, GAP * 8, GAP * 12]
  const xDirection = anchor.endsWith('right') ? -1 : anchor.endsWith('left') ? 1 : 0
  const yDirection = anchor.startsWith('bottom') ? -1 : anchor.startsWith('top') ? 1 : 0
  const alternatives: DesktopRect[] = [base]

  for (const primary of offsets) {
    for (const secondary of offsets) {
      if (primary === 0 && secondary === 0) continue
      const x = base.x + (xDirection === 0 ? secondary - GAP * 4 : primary * xDirection)
      const y = base.y + (yDirection === 0 ? secondary - GAP * 4 : primary * yDirection)
      alternatives.push({ ...base, x, y })
    }
  }

  return alternatives.map((rect) => snapRect(rect, screen))
}

function createAvoidRects(screen: DesktopSize, wallpaperLayout?: WallpaperLayoutMetadata): DesktopRect[] {
  const wallpaperAvoid = wallpaperLayout?.avoidAreas.map((area) => scaleArea(area.rect, screen)) ?? []
  return [
    scaleArea([CENTER_AVOID_RECT.x, CENTER_AVOID_RECT.y, CENTER_AVOID_RECT.width, CENTER_AVOID_RECT.height], screen),
    ...wallpaperAvoid,
  ]
}

function createSafeAreaNames(wallpaperLayout?: WallpaperLayoutMetadata): string[] {
  if (!wallpaperLayout || wallpaperLayout.safeAreas.length === 0) {
    return ['四角和边缘留白', '屏幕中心主体区']
  }
  return wallpaperLayout.safeAreas.map((area) => area.id)
}

function findPlacement(params: {
  anchor: DesktopAnchor
  size: DesktopSize
  screen: DesktopSize
  occupied: DesktopRect[]
  protectedRects: DesktopRect[]
  avoidRects: DesktopRect[]
  avoidCenter: boolean
}): DesktopRect {
  const blocking = [...params.occupied, ...params.protectedRects]
  if (params.avoidCenter) blocking.push(...params.avoidRects)

  for (const candidate of candidateRects(params.anchor, params.size, params.screen)) {
    if (!blocking.some((rect) => rectsOverlap(candidate, rect, GAP))) return candidate
  }

  return candidateRects(params.anchor, params.size, params.screen)[0]
}

function getPresetConfig(type: WidgetTypeId, presetId?: string): Record<string, unknown> {
  const capability = getWidgetCapability(type)
  const preset = capability?.presets.find((item) => item.id === presetId)
  return preset?.config ?? {}
}

function isWidgetTypeId(type: string): type is WidgetTypeId {
  return Boolean(getWidgetCapability(type))
}

export function buildDesktopSceneLayoutPlan(params: {
  sceneId: string
  currentWidgets: WidgetInstance[]
  screen: DesktopSize
  wallpaperLayout?: WallpaperLayoutMetadata
}): DesktopSceneLayoutPlan {
  const template = getDesktopSceneTemplate(params.sceneId) ?? getDesktopSceneTemplate('minimal')
  if (!template) throw new Error('desktop scene templates are not registered')

  return buildTemplateLayoutPlan({
    template,
    currentWidgets: params.currentWidgets,
    screen: params.screen,
    wallpaperLayout: params.wallpaperLayout,
  })
}

export function buildTemplateLayoutPlan(params: {
  template: DesktopSceneTemplate
  currentWidgets: WidgetInstance[]
  screen: DesktopSize
  wallpaperLayout?: WallpaperLayoutMetadata
}): DesktopSceneLayoutPlan {
  const { template, currentWidgets, screen, wallpaperLayout } = params
  const avoidRects = createAvoidRects(screen, wallpaperLayout)
  const hiddenLayers = new Set(template.hiddenWidgetLayers ?? [])
  const desiredTypes = new Set(template.widgets.map((rule) => rule.type))
  const hiddenWidgetIds = currentWidgets
    .filter((widget) => {
      const capability = getWidgetCapability(widget.type)
      return Boolean(widget.enabled && capability && hiddenLayers.has(capability.layer) && capability.canAutoHide && !desiredTypes.has(capability.type))
    })
    .map((widget) => widget.id)

  const protectedWidgets = currentWidgets.filter((widget) => {
    const capability = getWidgetCapability(widget.type)
    return Boolean(widget.enabled && capability?.persistent)
  })
  const protectedRects = protectedWidgets.map((widget) => expandRect({
    x: widget.x,
    y: widget.y,
    width: widget.width || getWidgetSize(widget.type as WidgetTypeId).width,
    height: widget.height || getWidgetSize(widget.type as WidgetTypeId).height,
  }, GAP))

  const widgets: PlannedSceneWidget[] = []
  const occupied: DesktopRect[] = []
  const widgetPatches: WidgetPatch[] = []

  for (const widget of protectedWidgets) {
    if (!isWidgetTypeId(widget.type)) continue
    const capability = getWidgetCapability(widget.type)
    if (!capability) continue
    const size = getWidgetSize(widget.type)
    widgets.push({
      id: widget.id,
      type: widget.type,
      source: 'persistent',
      anchor: capability.layoutHints.preferredAnchors[0] ?? 'bottom-center',
      rect: {
        x: widget.x,
        y: widget.y,
        width: widget.width || size.width,
        height: widget.height || size.height,
      },
      config: widget.config ?? {},
      layer: capability.layer,
      material: capability.aesthetics.material,
      visualWeight: capability.aesthetics.visualWeight,
      canBeHero: capability.aesthetics.canBeHero,
      persistent: true,
    })
  }

  for (const rule of template.widgets) {
    const capability = getWidgetCapability(rule.type)
    if (!capability) continue
    const existing = currentWidgets.find((widget) => widget.type === rule.type && !hiddenWidgetIds.includes(widget.id))
    const size = getWidgetSize(rule.type)
    const rect = findPlacement({
      anchor: rule.anchor,
      size,
      screen,
      occupied,
      protectedRects,
      avoidRects,
      avoidCenter: capability.layoutHints.avoidCenter,
    })
    occupied.push(rect)

    const presetConfig = getPresetConfig(rule.type, rule.preset)
    widgets.push({
      id: existing?.id ?? `${rule.type}-preview`,
      type: rule.type,
      source: existing ? 'existing' : 'new',
      preset: rule.preset,
      anchor: rule.anchor,
      rect,
      config: { ...(existing?.config ?? {}), ...presetConfig },
      layer: capability.layer,
      material: capability.aesthetics.material,
      visualWeight: capability.aesthetics.visualWeight,
      canBeHero: capability.aesthetics.canBeHero,
      persistent: capability.persistent,
    })

    if (existing) {
      widgetPatches.push({
        op: 'update-layout',
        id: existing.id,
        layout: { anchor: rule.anchor, x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      })
      if (Object.keys(presetConfig).length > 0) {
        widgetPatches.push({ op: 'update-config', id: existing.id, config: presetConfig })
      }
    } else {
      widgetPatches.push({
        op: 'create',
        type: rule.type,
        preset: rule.preset,
        layout: { anchor: rule.anchor, x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        config: presetConfig,
      })
    }
  }

  for (const id of hiddenWidgetIds) {
    widgetPatches.push({ op: 'hide', id, reason: `${template.displayName} 默认弱化信息密度` })
  }

  const aestheticCheck = checkDesktopAesthetics({
    template,
    widgets,
    screen,
    avoidRects,
  })

  return {
    sceneId: template.id,
    sceneName: template.displayName,
    screen,
    widgets,
    hiddenWidgetIds,
    widgetPatches,
    preservedEmptyAreas: createSafeAreaNames(wallpaperLayout),
    aestheticCheck,
  }
}

export function checkDesktopAesthetics(params: {
  template: DesktopSceneTemplate
  widgets: PlannedSceneWidget[]
  screen: DesktopSize
  avoidRects?: DesktopRect[]
}): DesktopAestheticCheckResult {
  const { template, widgets, screen } = params
  const avoidRects = params.avoidRects ?? createAvoidRects(screen)
  const issues: DesktopAestheticIssue[] = []
  const visible = widgets
  const nonPersistent = visible.filter((widget) => !widget.persistent)
  const heroWidgets = nonPersistent.filter((widget) => widget.canBeHero)
  const informationWidgets = nonPersistent.filter((widget) => widget.layer === 'information')
  const materials = new Set(nonPersistent.map((widget) => widget.material))

  if (nonPersistent.length > template.maxVisibleWidgets) {
    issues.push({
      id: 'density-too-high',
      severity: 'warning',
      label: '组件密度偏高',
      message: `${template.displayName} 建议最多 ${template.maxVisibleWidgets} 个轻组件，当前计划 ${nonPersistent.length} 个。`,
    })
  }

  if (heroWidgets.length > 1) {
    issues.push({
      id: 'too-many-heroes',
      severity: 'warning',
      label: '主视觉过多',
      message: '一张桌面默认只保留一个主视觉组件，避免时间和音频可视化同时抢画面。',
    })
  }

  if ((template.hiddenWidgetLayers ?? []).includes('information') && informationWidgets.length > 0) {
    issues.push({
      id: 'information-in-minimal-scene',
      severity: 'warning',
      label: '信息卡片不适合当前场景',
      message: `${template.displayName} 默认应隐藏新闻、股票、系统监控等高密度信息卡片。`,
    })
  }

  if (materials.size > 2) {
    issues.push({
      id: 'material-mixed',
      severity: 'warning',
      label: '材质语言偏杂',
      message: '同一桌面场景建议使用不超过两种主要材质，避免像多个应用窗口拼在一起。',
    })
  }

  for (const widget of nonPersistent) {
    const touchesEdge = (
      widget.rect.x < EDGE_PADDING ||
      widget.rect.y < EDGE_PADDING ||
      widget.rect.x + widget.rect.width > screen.width - EDGE_PADDING ||
      widget.rect.y + widget.rect.height > screen.height - EDGE_PADDING
    )
    if (touchesEdge) {
      issues.push({
        id: `edge-breathing-${widget.id}`,
        severity: 'warning',
        label: '边缘呼吸感不足',
        message: `${widget.type} 贴边过近，桌面会显得拥挤。`,
      })
    }

    const overlapsAvoid = avoidRects.some((rect) => rectsOverlap(widget.rect, rect, 0))
    if (overlapsAvoid) {
      issues.push({
        id: `avoid-overlap-${widget.id}`,
        severity: 'error',
        label: '可能遮挡壁纸主体',
        message: `${widget.type} 落在保守避让区内，应移到角落或边缘留白。`,
      })
    }
  }

  const hardErrors = issues.filter((issue) => issue.severity === 'error').length
  const warnings = issues.filter((issue) => issue.severity === 'warning').length
  const score = clamp(100 - hardErrors * 35 - warnings * 10, 0, 100)
  return {
    ok: hardErrors === 0,
    score,
    issues,
    summary: issues.length === 0
      ? '布局克制，主视觉明确，未发现明显遮挡或过密问题。'
      : `发现 ${hardErrors} 个阻断问题和 ${warnings} 个可优化项。`,
  }
}
