export const PIXEL_PET_STORAGE_KEY = 'lingyueDesk.pixelPets.v1'
export const PIXEL_PET_SETTINGS_KEY = 'lingyueDesk.pixelPetSettings.v1'
export const PIXEL_PET_GENERATOR_ENDPOINT = 'http://127.0.0.1:43177/api/pets/generate'

export const PIXEL_PET_WIDTH = 80
export const PIXEL_PET_HEIGHT = 64
export const PIXEL_PET_SPRITE_X = 16
export const PIXEL_PET_SPRITE_Y = 8

export const DEFAULT_PIXEL_PET_ID = 'default-hyena'
export const BLUE_COMPANION_PIXEL_PET_ID = 'default-blue-companion'

export interface PixelPetPalette {
  label?: string
  accent: string
  accent2: string
  danger: string
  stage: string
  ink: string
  inkSoft: string
  fur: string
  furDark: string
  belly: string
  muzzle: string
  mane: string
  maneLight: string
  earInner: string
  spot: string
  lens: string
  lensLight: string
  blush: string
  fang: string
  shirt: string
  pants: string
  shoe: string
  skin?: string
  skinDark?: string
  hair?: string
  hairLight?: string
  shirtDark?: string
  skirt?: string
}

export interface PixelPetFeatures {
  avatarType: 'mascot' | 'human'
  characterStyle?: 'blueCompanion' | 'generic'
  earShape: 'round' | 'pointy' | 'long' | 'none'
  maneStyle: 'mohawk' | 'fluffy' | 'bangs' | 'long' | 'none'
  tailStyle: 'tuft' | 'curled' | 'long' | 'none'
  spotStyle: 'hyena' | 'dots' | 'stripes' | 'heart' | 'none'
  accessory: 'sunglasses' | 'bow' | 'scarf' | 'collar' | 'flower' | 'none'
  vibe: 'confident' | 'cute' | 'cool' | 'gentle' | 'mysterious'
}

export interface PixelPetProfile {
  description: string
  palette: Partial<PixelPetPalette>
  features: PixelPetFeatures
}

export interface PixelPet {
  id: string
  name: string
  locked: boolean
  createdAt?: string
  sourceName?: string
  profile: PixelPetProfile
}

export interface PixelPetState {
  label: string
  short: string
  line: string
  eyes: 'normal' | 'happy' | 'angry' | 'cry' | 'shock' | 'focused' | 'confused' | 'sleepy'
  mouth: 'smile' | 'bigSmile' | 'snarl' | 'crying' | 'smallOpen' | 'talk' | 'flat' | 'wave' | 'tiny' | 'sleep'
  arms: 'idle' | 'wave' | 'panic' | 'sleep' | 'think' | 'shrug' | 'book' | 'swipe' | 'type'
  fx: 'none' | 'sparkle' | 'rage' | 'tears' | 'music' | 'exclaim' | 'dots' | 'idea' | 'question' | 'zzz' | 'flow' | 'book' | 'web' | 'code'
  pose: 'idle' | 'sway' | 'stomp' | 'slump' | 'alert' | 'talk' | 'think' | 'tilt' | 'error' | 'sit' | 'sleep' | 'walk' | 'jump' | 'work' | 'browse'
  prop?: 'bubble' | 'book' | 'headphones' | 'browser' | 'codeRig' | 'magnifier' | 'cards' | 'battery'
  tempo: number
}

export const PIXEL_PET_STATE_GROUPS = [
  { title: '情绪', items: ['joy', 'anger', 'sorrow', 'delight', 'surprise'] },
  { title: '交互状态', items: ['speaking', 'thinking', 'inspiration', 'confused', 'error'] },
  { title: '基础行为', items: ['idle', 'sit', 'sleepy', 'walk', 'jump'] },
  { title: '工作状态', items: ['reading', 'music', 'surfing', 'coding', 'searching', 'organizing', 'charging'] },
] as const

export const PIXEL_PET_STATES = {
  joy: { label: '喜', short: '开心', line: '喜 · 原地挥手摇尾', eyes: 'happy', mouth: 'bigSmile', arms: 'wave', fx: 'sparkle', pose: 'sway', tempo: 1.2 },
  anger: { label: '怒', short: '生气', line: '怒 · 压眉龇牙跺脚', eyes: 'angry', mouth: 'snarl', arms: 'panic', fx: 'rage', pose: 'stomp', tempo: 1.45 },
  sorrow: { label: '哀', short: '哭泣', line: '哀 · 掉眼泪低头', eyes: 'cry', mouth: 'crying', arms: 'sleep', fx: 'tears', pose: 'slump', tempo: 0.62 },
  delight: { label: '乐', short: '愉快', line: '乐 · 左右轻摆', eyes: 'happy', mouth: 'smile', arms: 'wave', fx: 'music', pose: 'sway', tempo: 1.05 },
  surprise: { label: '惊讶', short: '震惊', line: '惊讶 · 定点抬手', eyes: 'shock', mouth: 'smallOpen', arms: 'panic', fx: 'exclaim', pose: 'alert', tempo: 1.45 },
  speaking: { label: '说话', short: '回应中', line: '说话 · 嘴型开合', eyes: 'normal', mouth: 'talk', arms: 'wave', fx: 'dots', pose: 'talk', prop: 'bubble', tempo: 1.1 },
  thinking: { label: '思考', short: '推理', line: '思考 · 托腮推理', eyes: 'focused', mouth: 'flat', arms: 'think', fx: 'dots', pose: 'think', tempo: 0.85 },
  inspiration: { label: '灵感', short: '点亮', line: '灵感 · 灯泡亮起', eyes: 'happy', mouth: 'bigSmile', arms: 'wave', fx: 'idea', pose: 'sway', tempo: 1.25 },
  confused: { label: '困惑', short: '疑问', line: '困惑 · 歪头确认', eyes: 'confused', mouth: 'smallOpen', arms: 'shrug', fx: 'question', pose: 'tilt', tempo: 0.75 },
  error: { label: '错误', short: '警告', line: '错误 · 原地抖动', eyes: 'shock', mouth: 'wave', arms: 'panic', fx: 'exclaim', pose: 'error', tempo: 1.65 },
  idle: { label: '站立空闲', short: '待命', line: '站立空闲 · 稳定站立', eyes: 'normal', mouth: 'smile', arms: 'idle', fx: 'none', pose: 'idle', tempo: 0.7 },
  sit: { label: '坐下', short: '放松', line: '坐下 · 贴地放松', eyes: 'normal', mouth: 'tiny', arms: 'sleep', fx: 'none', pose: 'sit', tempo: 0.45 },
  sleepy: { label: '睡觉', short: '休眠', line: '睡觉 · 趴在地面', eyes: 'sleepy', mouth: 'sleep', arms: 'sleep', fx: 'zzz', pose: 'sleep', tempo: 0.45 },
  walk: { label: '走路', short: '巡游', line: '走路 · 平地小步', eyes: 'normal', mouth: 'tiny', arms: 'idle', fx: 'flow', pose: 'walk', tempo: 1.45 },
  jump: { label: '跳跃', short: '弹起', line: '跳跃 · 离地弹起', eyes: 'happy', mouth: 'bigSmile', arms: 'wave', fx: 'sparkle', pose: 'jump', tempo: 1.35 },
  reading: { label: '读书', short: '阅读', line: '读书 · 捧书阅读', eyes: 'focused', mouth: 'flat', arms: 'book', fx: 'book', pose: 'work', prop: 'book', tempo: 0.7 },
  music: { label: '听音乐', short: '律动', line: '听音乐 · 耳机节拍', eyes: 'happy', mouth: 'smile', arms: 'wave', fx: 'music', pose: 'sway', prop: 'headphones', tempo: 1.1 },
  surfing: { label: '上网冲浪', short: '浏览', line: '上网冲浪 · 浮窗刷屏', eyes: 'focused', mouth: 'tiny', arms: 'swipe', fx: 'web', pose: 'browse', prop: 'browser', tempo: 1.05 },
  coding: { label: '写代码', short: '构建', line: '写代码 · 二进制数据流', eyes: 'focused', mouth: 'tiny', arms: 'type', fx: 'code', pose: 'work', prop: 'codeRig', tempo: 1.45 },
  searching: { label: '搜索资料', short: '检索', line: '搜索资料 · 放大线索', eyes: 'confused', mouth: 'flat', arms: 'think', fx: 'question', pose: 'tilt', prop: 'magnifier', tempo: 0.9 },
  organizing: { label: '整理记忆', short: '归档', line: '整理记忆 · 卡片归档', eyes: 'focused', mouth: 'flat', arms: 'type', fx: 'dots', pose: 'work', prop: 'cards', tempo: 1.0 },
  charging: { label: '充电', short: '恢复', line: '充电 · 电量恢复', eyes: 'sleepy', mouth: 'sleep', arms: 'sleep', fx: 'sparkle', pose: 'sit', prop: 'battery', tempo: 0.55 },
} as const satisfies Record<string, PixelPetState>

export const PIXEL_PET_THEMES = {
  moon: {
    label: '赤鬃',
    accent: '#c87935',
    accent2: '#e64832',
    danger: '#e3483d',
    stage: '#fff7e8',
    ink: '#4a211f',
    inkSoft: '#74403a',
    fur: '#d69a55',
    furDark: '#9f6237',
    belly: '#ffe4a5',
    muzzle: '#6b3f35',
    mane: '#d74431',
    maneLight: '#f36d45',
    earInner: '#ed876e',
    spot: '#6a3a35',
    lens: '#2e313d',
    lensLight: '#d8d1c6',
    blush: '#f47c68',
    fang: '#fff3d8',
    shirt: '#d69a55',
    pants: '#6a3a35',
    shoe: '#5a332e',
  },
  berry: {
    label: '莓粉',
    accent: '#ff7aa8',
    accent2: '#9a4fb8',
    danger: '#e54b66',
    stage: '#fff3f7',
    ink: '#3f2433',
    inkSoft: '#7a4a64',
    fur: '#f1b58e',
    furDark: '#be735e',
    belly: '#ffe4cf',
    muzzle: '#84505a',
    mane: '#d93076',
    maneLight: '#ff78a2',
    earInner: '#f39a98',
    spot: '#7b3d61',
    lens: '#312f47',
    lensLight: '#f2d8e4',
    blush: '#ff86a0',
    fang: '#fff4e3',
    shirt: '#f1b58e',
    pants: '#7b3d61',
    shoe: '#553049',
  },
  amber: {
    label: '青霜',
    accent: '#3aa6a3',
    accent2: '#5f8ee6',
    danger: '#e05d6d',
    stage: '#eef9fb',
    ink: '#243447',
    inkSoft: '#4f6478',
    fur: '#99c5c0',
    furDark: '#5f8d8b',
    belly: '#e5f5dc',
    muzzle: '#4f6b70',
    mane: '#3d8f9b',
    maneLight: '#70d3cf',
    earInner: '#8ecaca',
    spot: '#335d6a',
    lens: '#243044',
    lensLight: '#cdeff2',
    blush: '#f08a90',
    fang: '#f8ffe8',
    shirt: '#99c5c0',
    pants: '#335d6a',
    shoe: '#2f4854',
  },
  violet: {
    label: '夜紫',
    accent: '#8268d8',
    accent2: '#f0b45a',
    danger: '#ff667e',
    stage: '#f4f1ff',
    ink: '#2c253d',
    inkSoft: '#5f5576',
    fur: '#b9a3d9',
    furDark: '#7a65a3',
    belly: '#eadfff',
    muzzle: '#615170',
    mane: '#6f4fb1',
    maneLight: '#b08cff',
    earInner: '#c88fc1',
    spot: '#4d3a6f',
    lens: '#25283b',
    lensLight: '#ded8ff',
    blush: '#e486a6',
    fang: '#fff8e8',
    shirt: '#b9a3d9',
    pants: '#4d3a6f',
    shoe: '#392f55',
  },
} as const satisfies Record<string, PixelPetPalette>

export type PixelPetStateKey = keyof typeof PIXEL_PET_STATES
export type PixelPetThemeKey = keyof typeof PIXEL_PET_THEMES

export interface PixelPetSettings {
  petId: string
  petName: string
  state: PixelPetStateKey
  viewGroupIndex: number
  theme: PixelPetThemeKey
  speed: number
  intensity: number
  motion: boolean
  effects: boolean
  grid: boolean
}

export interface DrawPixelPetOptions {
  pet: PixelPet
  stateKey: PixelPetStateKey
  themeKey: PixelPetThemeKey
  time: number
  speed?: number
  intensity?: number
  motion?: boolean
  effects?: boolean
}

export const PIXEL_PET_STATE_ORDER = PIXEL_PET_STATE_GROUPS.flatMap((group) => group.items) as PixelPetStateKey[]
export const PIXEL_PET_THEME_KEYS = Object.keys(PIXEL_PET_THEMES) as PixelPetThemeKey[]

export function createDefaultPixelPet(): PixelPet {
  return {
    id: DEFAULT_PIXEL_PET_ID,
    name: '默认鬣狗',
    locked: true,
    profile: {
      description: '默认保留的鬣狗桌宠',
      palette: {},
      features: {
        avatarType: 'mascot',
        earShape: 'round',
        maneStyle: 'mohawk',
        tailStyle: 'tuft',
        spotStyle: 'hyena',
        accessory: 'sunglasses',
        vibe: 'confident',
      },
    },
  }
}

export function createBlueCompanionPixelPet(): PixelPet {
  return {
    id: BLUE_COMPANION_PIXEL_PET_ID,
    name: '晴蓝',
    locked: true,
    sourceName: 'ElevenLabs_image_nano-banana-2_修复胸口阴影_2026-05-01T15_29_15.png',
    profile: {
      description: '浅蓝长发、白色花饰和清冷温柔气质的桌宠',
      palette: {
        accent: '#78CBE8',
        accent2: '#F0C56A',
        danger: '#E96B7A',
        stage: '#F0F9FC',
        ink: '#2A3B49',
        inkSoft: '#5E7C8E',
        fur: '#B7D8E8',
        furDark: '#6F94A7',
        belly: '#FFF1E7',
        muzzle: '#EFCFC3',
        mane: '#9ECBDD',
        maneLight: '#D7F2FB',
        earInner: '#F0A88F',
        spot: '#DCEEF5',
        lens: '#476679',
        lensLight: '#D8F6FF',
        blush: '#EE9AA7',
        fang: '#FFFDF2',
        shirt: '#F5EFE7',
        pants: '#8AAEC0',
        shoe: '#6A8798',
      },
      features: {
        avatarType: 'human',
        characterStyle: 'blueCompanion',
        earShape: 'none',
        maneStyle: 'long',
        tailStyle: 'none',
        spotStyle: 'none',
        accessory: 'flower',
        vibe: 'gentle',
      },
    },
  }
}

export function createDefaultPixelPets(): PixelPet[] {
  return [createDefaultPixelPet(), createBlueCompanionPixelPet()]
}

export function createDefaultPixelPetSettings(pets = createDefaultPixelPets()): PixelPetSettings {
  const firstPet = pets[0] ?? createDefaultPixelPet()
  return {
    petId: firstPet.id,
    petName: firstPet.name,
    state: 'idle',
    viewGroupIndex: findPixelPetGroupIndex('idle'),
    theme: 'moon',
    speed: 1,
    intensity: 1,
    motion: true,
    effects: true,
    grid: true,
  }
}

export function normalizePixelPet(value: unknown): PixelPet {
  const base = createDefaultPixelPet()
  const safe = isRecord(value) ? value : {}
  const rawProfile = isRecord(safe.profile) ? safe.profile : {}
  const rawFeatures = isRecord(rawProfile.features) ? rawProfile.features : isRecord(safe.features) ? safe.features : {}
  return {
    id: typeof safe.id === 'string' && safe.id ? safe.id : `pet-${Date.now()}`,
    name: normalizeName(safe.name, '新桌宠'),
    locked: Boolean(safe.locked),
    createdAt: typeof safe.createdAt === 'string' ? safe.createdAt : new Date().toISOString(),
    sourceName: typeof safe.sourceName === 'string' ? safe.sourceName : '',
    profile: {
      description:
        typeof rawProfile.description === 'string'
          ? rawProfile.description
          : typeof safe.description === 'string'
            ? safe.description
            : '由参考图生成的桌宠',
      palette: normalizePixelPetPalette(isRecord(rawProfile.palette) ? rawProfile.palette : isRecord(safe.palette) ? safe.palette : {}),
      features: normalizePixelPetFeatures(rawFeatures, base.profile.features),
    },
  }
}

export function normalizePixelPetSettings(value: unknown, pets = createDefaultPixelPets()): PixelPetSettings {
  const fallback = createDefaultPixelPetSettings(pets)
  if (!isRecord(value)) return fallback
  const petId = typeof value.petId === 'string' && pets.some((pet) => pet.id === value.petId) ? value.petId : fallback.petId
  const activePet = pets.find((pet) => pet.id === petId) ?? pets[0] ?? createDefaultPixelPet()
  const state = isPixelPetStateKey(value.state) ? value.state : fallback.state
  const theme = isPixelPetThemeKey(value.theme) ? value.theme : fallback.theme
  return {
    petId,
    petName: normalizeName(value.petName, activePet.name),
    state,
    viewGroupIndex: findPixelPetGroupIndex(state),
    theme,
    speed: clampNumber(value.speed, 0.4, 1.8, fallback.speed),
    intensity: clampNumber(value.intensity, 0, 1.8, fallback.intensity),
    motion: typeof value.motion === 'boolean' ? value.motion : fallback.motion,
    effects: typeof value.effects === 'boolean' ? value.effects : fallback.effects,
    grid: typeof value.grid === 'boolean' ? value.grid : fallback.grid,
  }
}

export function getActivePixelPet(pets: PixelPet[], settings: PixelPetSettings): PixelPet {
  return pets.find((pet) => pet.id === settings.petId) ?? pets[0] ?? createDefaultPixelPet()
}

export function resolvePixelPetPalette(pet: PixelPet, themeKey: PixelPetThemeKey): PixelPetPalette {
  const base = pet.locked ? PIXEL_PET_THEMES[themeKey] : PIXEL_PET_THEMES.moon
  return {
    ...base,
    ...pet.profile.palette,
  }
}

export function findPixelPetGroupIndex(key: PixelPetStateKey): number {
  return Math.max(0, PIXEL_PET_STATE_GROUPS.findIndex((group) => (group.items as readonly string[]).includes(key)))
}

export function isPixelPetStateKey(value: unknown): value is PixelPetStateKey {
  return typeof value === 'string' && value in PIXEL_PET_STATES
}

export function isPixelPetThemeKey(value: unknown): value is PixelPetThemeKey {
  return typeof value === 'string' && value in PIXEL_PET_THEMES
}

export function drawPixelPet(target: CanvasRenderingContext2D, options: DrawPixelPetOptions): void {
  const state = PIXEL_PET_STATES[options.stateKey]
  const palette = resolvePixelPetPalette(options.pet, options.themeKey)
  const features = options.pet.profile.features
  const motion = options.motion ?? true
  const effects = options.effects ?? true
  const speed = options.speed ?? 1
  const intensity = options.intensity ?? 1
  const referencePhase = options.time * state.tempo * speed
  if (features.avatarType === 'mascot') {
    drawReferenceMascotPixelPet(target, state, palette, features, referencePhase, { motion, effects, intensity })
    return
  }
  drawReferenceHumanPixelPet(target, state, palette, features, referencePhase, { motion, effects, intensity })
}

export function colorMix(colorA: string, colorB: string, amount: number): string {
  const a = hexToRgb(colorA)
  const b = hexToRgb(colorB)
  const mix = {
    r: Math.round(a.r + (b.r - a.r) * amount),
    g: Math.round(a.g + (b.g - a.g) * amount),
    b: Math.round(a.b + (b.b - a.b) * amount),
  }
  return `rgb(${mix.r}, ${mix.g}, ${mix.b})`
}

export function hexToRgba(hex: string, alpha: number): string {
  const color = hexToRgb(hex)
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`
}

function normalizePixelPetPalette(palette: Record<string, unknown>): Partial<PixelPetPalette> {
  const fallback = PIXEL_PET_THEMES.moon
  const keys: (keyof PixelPetPalette)[] = [
    'accent',
    'accent2',
    'danger',
    'stage',
    'ink',
    'inkSoft',
    'fur',
    'furDark',
    'belly',
    'muzzle',
    'mane',
    'maneLight',
    'earInner',
    'spot',
    'lens',
    'lensLight',
    'blush',
    'fang',
    'shirt',
    'pants',
    'shoe',
  ]
  return keys.reduce<Partial<PixelPetPalette>>((result, key) => {
    const value = palette[key]
    result[key] = isHexColor(value) ? value : fallback[key]
    return result
  }, {})
}

function normalizePixelPetFeatures(value: Record<string, unknown>, fallback: PixelPetFeatures): PixelPetFeatures {
  const avatarType = pickFeature(value.avatarType, ['human', 'mascot'], fallback.avatarType)
  const normalized: PixelPetFeatures = {
    avatarType,
    characterStyle: pickFeature(
      value.characterStyle,
      ['blueCompanion', 'generic'] as const,
      (fallback.characterStyle ?? 'generic') as NonNullable<PixelPetFeatures['characterStyle']>
    ),
    earShape: pickFeature(value.earShape, ['round', 'pointy', 'long', 'none'], fallback.earShape),
    maneStyle: pickFeature(value.maneStyle, ['mohawk', 'fluffy', 'bangs', 'long', 'none'], fallback.maneStyle),
    tailStyle: pickFeature(value.tailStyle, ['tuft', 'curled', 'long', 'none'], fallback.tailStyle),
    spotStyle: pickFeature(value.spotStyle, ['hyena', 'dots', 'stripes', 'heart', 'none'], fallback.spotStyle),
    accessory: pickFeature(value.accessory, ['sunglasses', 'bow', 'scarf', 'collar', 'flower', 'none'], fallback.accessory),
    vibe: pickFeature(value.vibe, ['confident', 'cute', 'cool', 'gentle', 'mysterious'], fallback.vibe),
  }
  if (normalized.avatarType === 'human') {
    normalized.earShape = 'none'
    normalized.tailStyle = 'none'
    normalized.spotStyle = 'none'
    if (normalized.maneStyle === 'mohawk') normalized.maneStyle = 'long'
    if (normalized.accessory === 'sunglasses') normalized.accessory = 'none'
  }
  return normalized
}

function getHumanPalette(palette: PixelPetPalette): PixelPetPalette {
  const skin = palette.skin || palette.muzzle || '#efcfc3'
  const hair = palette.hair || palette.mane || palette.fur
  const hairLight = palette.hairLight || palette.maneLight || colorMix(hair, '#ffffff', 0.28)
  return {
    ...palette,
    skin,
    skinDark: palette.skinDark || colorMix(skin, '#b98579', 0.34),
    hair,
    hairLight,
    shirtDark: palette.shirtDark || colorMix(palette.shirt || '#f5efe7', '#9aaeba', 0.2),
    skirt: palette.skirt || colorMix(palette.shirt || '#f5efe7', palette.accent || '#78cbe8', 0.08),
  }
}

interface ReferenceDrawSettings {
  motion: boolean
  effects: boolean
  intensity: number
}

function drawReferenceMascotPixelPet(
  target: CanvasRenderingContext2D,
  state: PixelPetState,
  palette: PixelPetPalette,
  features: PixelPetFeatures,
  phase: number,
  settings: ReferenceDrawSettings
): void {
  const tick = Math.floor(phase * 6)
  const jumpLift = state.pose === 'jump' && settings.motion ? -Math.max(0, Math.round(Math.max(0, Math.sin(phase * Math.PI * 2)) * 6 * settings.intensity)) : 0
  const shake = (state.pose === 'error' || state.pose === 'stomp') && settings.motion ? (Math.floor(phase * 12) % 2 === 0 ? -1 : 1) * Math.max(1, Math.round(settings.intensity)) : 0
  const sway = (state.pose === 'sway' || state.pose === 'talk') && settings.motion ? Math.round(Math.sin(phase * 2) * settings.intensity) : 0
  const headTilt = (state.pose === 'tilt' || state.pose === 'think') && settings.motion ? Math.round(Math.sin(phase * Math.PI) * settings.intensity) : 0
  const headDrop = state.pose === 'slump' ? 3 : 0
  const legTick = state.pose === 'walk' || state.arms === 'type' ? tick : 0

  target.setTransform(1, 0, 0, 1, 0, 0)
  target.clearRect(0, 0, PIXEL_PET_WIDTH, PIXEL_PET_HEIGHT)
  target.imageSmoothingEnabled = false

  target.save()
  drawReferenceActionBackdrop(target, palette, state, phase, settings)
  target.save()
  target.translate(PIXEL_PET_SPRITE_X, PIXEL_PET_SPRITE_Y)
  drawReferenceShadow(target, phase, settings, jumpLift)
  target.restore()

  target.save()
  target.translate(PIXEL_PET_SPRITE_X + shake + sway, PIXEL_PET_SPRITE_Y + jumpLift)
  if (state.pose === 'sleep') {
    drawReferenceMascotSleeping(target, palette, phase, settings, features)
    drawReferenceMascotDetails(target, palette, state, phase, settings, features)
    drawReferenceActionCues(target, palette, state, phase, settings, features)
    target.restore()
    drawReferenceSpriteEffects(target, palette, state.fx, phase, settings)
    target.restore()
    return
  }

  if (state.pose === 'sit') {
    drawReferenceMascotSitting(target, palette, phase, settings, headTilt, state, features)
    drawReferenceMascotProp(target, palette, state.prop, phase, settings)
    drawReferenceMascotDetails(target, palette, state, phase, settings, features)
    drawReferenceActionCues(target, palette, state, phase, settings, features)
    target.restore()
    drawReferenceSpriteEffects(target, palette, state.fx, phase, settings)
    target.restore()
    return
  }

  drawReferenceMascotTail(target, palette, phase, settings, features)
  drawReferenceMascotLegs(target, palette, legTick, state.pose)
  drawReferenceMascotBody(target, palette, features)
  drawReferenceMascotArms(target, palette, state.arms, phase)
  target.save()
  target.translate(0, headDrop)
  drawReferenceMascotEarsAndMane(target, palette, headTilt, phase, settings, features)
  drawReferenceMascotHead(target, palette, headTilt)
  drawReferenceMascotAccessory(target, palette, headTilt, features)
  drawReferenceMascotFace(target, palette, state.eyes, state.mouth, false, headTilt, phase, settings)
  target.restore()
  drawReferenceMascotDetails(target, palette, state, phase, settings, features)
  drawReferenceMascotProp(target, palette, state.prop, phase, settings)
  drawReferenceActionCues(target, palette, state, phase, settings, features)
  target.restore()
  drawReferenceSpriteEffects(target, palette, state.fx, phase, settings)
  target.restore()
}

interface ReferenceTransform {
  shake: number
  sway: number
  jumpLift: number
  headTilt: number
  headDrop: number
  shouldBlink: boolean
}

function drawReferenceHumanPixelPet(
  target: CanvasRenderingContext2D,
  state: PixelPetState,
  palette: PixelPetPalette,
  features: PixelPetFeatures,
  phase: number,
  settings: ReferenceDrawSettings
): void {
  const humanPalette = getHumanPalette(palette)
  if (features.characterStyle === 'blueCompanion') {
    drawReferenceBlueCompanionPixelPet(target, state, humanPalette, phase, settings)
    return
  }

  const tick = Math.floor(phase * 6)
  const jumpLift = state.pose === 'jump' && settings.motion ? -Math.max(0, Math.round(Math.max(0, Math.sin(phase * Math.PI * 2)) * 6 * settings.intensity)) : 0
  const shake = (state.pose === 'error' || state.pose === 'stomp') && settings.motion ? (Math.floor(phase * 12) % 2 === 0 ? -1 : 1) * Math.max(1, Math.round(settings.intensity)) : 0
  const sway = (state.pose === 'sway' || state.pose === 'talk') && settings.motion ? Math.round(Math.sin(phase * 2) * settings.intensity) : 0
  const headTilt = (state.pose === 'tilt' || state.pose === 'think') && settings.motion ? Math.round(Math.sin(phase * Math.PI) * settings.intensity) : 0
  const headDrop = state.pose === 'slump' ? 3 : 0

  target.setTransform(1, 0, 0, 1, 0, 0)
  target.clearRect(0, 0, PIXEL_PET_WIDTH, PIXEL_PET_HEIGHT)
  target.imageSmoothingEnabled = false
  target.save()
  drawReferenceActionBackdrop(target, humanPalette, state, phase, settings)
  target.save()
  target.translate(PIXEL_PET_SPRITE_X, PIXEL_PET_SPRITE_Y)
  drawReferenceShadow(target, phase, settings, jumpLift)
  target.restore()
  drawReferenceHumanCharacter(target, state, humanPalette, features, phase, tick, settings, { shake, sway, jumpLift, headTilt, headDrop, shouldBlink: false })
  target.restore()
}

function drawReferenceHumanCharacter(
  target: CanvasRenderingContext2D,
  state: PixelPetState,
  palette: PixelPetPalette,
  features: PixelPetFeatures,
  phase: number,
  tick: number,
  settings: ReferenceDrawSettings,
  transform: ReferenceTransform
): void {
  const legTick = state.pose === 'walk' || state.arms === 'type' ? tick : 0
  target.save()
  target.translate(PIXEL_PET_SPRITE_X + transform.shake + transform.sway, PIXEL_PET_SPRITE_Y + transform.jumpLift)
  if (features.characterStyle === 'blueCompanion' && state.pose === 'idle') {
    drawReferenceBlueCompanionStanding(target, palette)
    target.restore()
    drawReferenceSpriteEffects(target, palette, state.fx, phase, settings)
    return
  }
  if (state.pose === 'sleep') {
    drawReferenceHumanSleeping(target, palette, phase, settings, features)
    drawReferenceActionCues(target, palette, state, phase, settings, features)
    target.restore()
    drawReferenceSpriteEffects(target, palette, state.fx, phase, settings)
    return
  }
  if (state.pose === 'sit') {
    drawReferenceHumanSitting(target, palette, phase, settings, transform.headTilt, state, features)
    drawReferenceMascotProp(target, palette, state.prop, phase, settings)
    drawReferenceActionCues(target, palette, state, phase, settings, features)
    target.restore()
    drawReferenceSpriteEffects(target, palette, state.fx, phase, settings)
    return
  }
  drawReferenceHumanBackHair(target, palette, transform.headTilt, phase, settings, features)
  drawReferenceHumanLegs(target, palette, legTick)
  drawReferenceHumanBody(target, palette)
  drawReferenceHumanArms(target, palette, state.arms, phase, settings)
  target.save()
  target.translate(0, transform.headDrop)
  drawReferenceHumanHead(target, palette, transform.headTilt, features)
  drawReferenceHumanFace(target, palette, state.eyes, state.mouth, phase, transform.shouldBlink, transform.headTilt)
  drawReferenceHumanAccessory(target, palette, features, transform.headTilt)
  target.restore()
  drawReferenceHumanDetails(target, palette, state, phase, settings, features)
  drawReferenceMascotProp(target, palette, state.prop, phase, settings)
  drawReferenceActionCues(target, palette, state, phase, settings, features)
  target.restore()
  drawReferenceSpriteEffects(target, palette, state.fx, phase, settings)
}

function drawReferenceBlueCompanionPixelPet(
  target: CanvasRenderingContext2D,
  state: PixelPetState,
  palette: PixelPetPalette,
  phase: number,
  settings: ReferenceDrawSettings
): void {
  const tick = Math.floor(phase * 6)
  const jumpLift = state.pose === 'jump' && settings.motion ? -Math.max(0, Math.round(Math.max(0, Math.sin(phase * Math.PI * 2)) * 6 * settings.intensity)) : 0
  const shake = (state.pose === 'error' || state.pose === 'stomp') && settings.motion ? (Math.floor(phase * 12) % 2 === 0 ? -1 : 1) * Math.max(1, Math.round(settings.intensity)) : 0
  const sway = (state.pose === 'sway' || state.pose === 'talk') && settings.motion ? Math.round(Math.sin(phase * 2) * settings.intensity) : 0

  target.setTransform(1, 0, 0, 1, 0, 0)
  target.clearRect(0, 0, PIXEL_PET_WIDTH, PIXEL_PET_HEIGHT)
  target.imageSmoothingEnabled = false

  drawReferenceBlueCompanionActionBackdrop(target, palette, state, phase, settings)
  target.save()
  target.translate(PIXEL_PET_SPRITE_X, PIXEL_PET_SPRITE_Y)
  drawReferenceShadow(target, phase, settings, jumpLift)
  target.restore()

  target.save()
  target.translate(PIXEL_PET_SPRITE_X + shake + sway, PIXEL_PET_SPRITE_Y + jumpLift)
  drawReferenceBlueCompanionCharacter(target, palette, phase, settings, state, tick)
  drawReferenceBlueCompanionProp(target, palette, state.prop, phase, settings)
  drawReferenceBlueCompanionActionCues(target, palette, state, phase, settings)
  target.restore()

  target.save()
  target.translate(PIXEL_PET_SPRITE_X, PIXEL_PET_SPRITE_Y)
  drawReferenceBlueCompanionEffects(target, palette, state.fx, phase, settings)
  target.restore()
}

function drawReferenceBlueCompanionCharacter(
  target: CanvasRenderingContext2D,
  palette: PixelPetPalette,
  phase: number,
  settings: ReferenceDrawSettings,
  state: PixelPetState,
  tick: number
): void {
  const ink = palette.ink || '#17171b'
  const hair = palette.mane
  const hairDark = colorMix(hair, '#223949', 0.24)
  const hairMid = colorMix(hair, palette.maneLight, 0.24)
  const hairLight = palette.maneLight
  const skin = palette.muzzle
  const skinDark = colorMix(skin, '#b98579', 0.34)
  const shirt = palette.shirt
  const shirtShade = colorMix(shirt, palette.accent, 0.1)
  const eye = palette.accent
  const shoe = palette.shoe
  const flower = palette.fang || '#fff8ef'
  const flowerCore = palette.accent2 || '#f0ae54'
  const centerWidth = 48
  const alt = settings.motion ? tick % 2 : 0
  const pulse = settings.motion ? Math.floor(phase * 6) % 2 : 0

  const dot = (x: number, y: number, color: string): void => px(target, x, y, 1, 1, color)
  const block = (x: number, y: number, width: number, height: number, color: string): void => {
    for (let row = 0; row < height; row += 1) for (let column = 0; column < width; column += 1) dot(x + column, y + row, color)
  }
  const mirrorBlock = (x: number, y: number, width: number, height: number, color: string): void => {
    block(x, y, width, height, color)
    block(centerWidth - x - width, y, width, height, color)
  }
  const mirrorDot = (x: number, y: number, color: string): void => {
    dot(x, y, color)
    dot(centerWidth - x - 1, y, color)
  }

  const drawTwinTails = (y = 0, tucked = false): void => {
    if (tucked) {
      mirrorBlock(8, 19 + y, 7, 4, ink)
      mirrorBlock(6, 23 + y, 9, 11, ink)
      mirrorBlock(8, 20 + y, 5, 3, hairLight)
      mirrorBlock(7, 24 + y, 7, 9, hair)
      mirrorBlock(9, 32 + y, 4, 3, hairDark)
      return
    }
    mirrorBlock(7, 13 + y, 7, 4, ink)
    mirrorBlock(5, 17 + y, 10, 16, ink)
    mirrorBlock(7, 33 + y, 7, 5, ink)
    mirrorBlock(8, 14 + y, 5, 3, hairLight)
    mirrorBlock(6, 18 + y, 8, 14, hair)
    mirrorBlock(8, 32 + y, 5, 5, hairDark)
    mirrorBlock(8, 20 + y, 2, 11, hairMid)
    mirrorBlock(12, 19 + y, 2, 13, colorMix(hairDark, '#000000', 0.05))
  }

  const drawHead = (y = 0, eyes: PixelPetState['eyes'] = state.eyes, mouth: PixelPetState['mouth'] = state.mouth): void => {
    block(18, 6 + y, 12, 1, ink)
    block(15, 7 + y, 18, 1, ink)
    block(13, 8 + y, 22, 2, ink)
    block(12, 10 + y, 24, 5, ink)
    block(13, 15 + y, 22, 3, ink)
    block(18, 7 + y, 12, 1, hairLight)
    block(15, 8 + y, 18, 2, hairLight)
    block(14, 10 + y, 20, 3, hair)
    block(13, 13 + y, 22, 4, hair)
    block(16, 15 + y, 16, 2, hairLight)
    mirrorBlock(12, 18 + y, 3, 7, ink)
    mirrorBlock(13, 18 + y, 2, 6, hairDark)

    block(14, 17 + y, 20, 12, ink)
    block(15, 18 + y, 18, 10, skin)
    mirrorBlock(11, 20 + y, 3, 5, ink)
    mirrorBlock(12, 21 + y, 2, 3, skinDark)
    block(16, 27 + y, 16, 2, colorMix(skin, skinDark, 0.18))

    if (eyes === 'happy') {
      mirrorBlock(17, 21 + y, 5, 1, ink)
      mirrorDot(18, 20 + y, ink)
      mirrorDot(20, 20 + y, ink)
    } else if (eyes === 'sleepy') {
      mirrorBlock(17, 21 + y, 5, 1, ink)
    } else if (eyes === 'angry') {
      mirrorBlock(17, 18 + y, 5, 1, palette.danger)
      mirrorBlock(17, 20 + y, 4, 3, ink)
      mirrorBlock(18, 21 + y, 2, 1, eye)
    } else if (eyes === 'shock') {
      mirrorBlock(17, 19 + y, 5, 5, ink)
      mirrorBlock(18, 20 + y, 3, 3, eye)
      mirrorDot(19, 20 + y, '#ffffff')
    } else if (eyes === 'cry') {
      mirrorBlock(17, 20 + y, 4, 3, ink)
      mirrorBlock(18, 21 + y, 2, 1, eye)
      mirrorBlock(19, 23 + y, 2, 3, '#59c8ff')
    } else {
      mirrorBlock(17, 20 + y, 4, 4, ink)
      mirrorBlock(18, 21 + y, 2, 2, eye)
      mirrorDot(18, 20 + y, '#ffffff')
    }

    mirrorBlock(17, 25 + y, 3, 1, palette.blush)
    if (mouth === 'talk') {
      block(22, 24 + y, 5, pulse ? 2 : 1, pulse ? palette.muzzle : ink)
      if (pulse) block(23, 24 + y, 3, 1, '#fff6f0')
    } else if (mouth === 'bigSmile') {
      block(21, 24 + y, 7, 1, ink)
      block(22, 25 + y, 5, 1, '#fff6f0')
    } else if (mouth === 'smallOpen' || mouth === 'crying') {
      block(23, 24 + y, 3, 2, ink)
      block(24, 24 + y, 1, 1, '#fff6f0')
    } else if (mouth === 'snarl') {
      block(21, 24 + y, 7, 1, ink)
      dot(22, 25 + y, '#fff6f0')
      dot(27, 25 + y, '#fff6f0')
    } else if (mouth === 'flat') {
      block(22, 25 + y, 5, 1, ink)
    } else if (mouth === 'sleep') {
      block(23, 25 + y, 3, 1, ink)
    } else {
      block(22, 25 + y, 4, 1, ink)
    }
    dot(23, 24 + y, colorMix(skin, '#ffffff', 0.18))

    mirrorDot(11, 12 + y, flower)
    mirrorDot(10, 13 + y, flower)
    mirrorDot(12, 13 + y, flower)
    mirrorDot(11, 14 + y, flower)
    mirrorDot(11, 13 + y, flowerCore)
  }

  const drawBody = (y = 0): void => {
    block(21, 29 + y, 6, 2, ink)
    block(22, 29 + y, 4, 2, skin)
    block(15, 31 + y, 18, 12, ink)
    block(16, 32 + y, 16, 10, shirt)
    block(18, 32 + y, 12, 3, colorMix(shirt, '#ffffff', 0.42))
    block(18, 36 + y, 12, 5, shirtShade)
  }

  const drawStandingLegs = (y = 0, walking = false): void => {
    const step = walking ? alt : 0
    mirrorBlock(18 + step, 42 + y, 4, 4, ink)
    mirrorBlock(19 + step, 42 + y, 2, 3, skin)
    block(16 + step, 45 + y, 7, 2, shoe)
    block(25 - step, 45 + y, 7, 2, shoe)
  }

  const drawArms = (y = 0, armType: PixelPetState['arms'] = state.arms): void => {
    if (armType === 'wave') {
      block(12, 33 + y, 4, 8, ink)
      block(13, 34 + y, 2, 6, skin)
      block(33, 25 - alt + y, 4, 12, ink)
      block(34, 24 - alt + y, 2, 10, skin)
      block(32, 23 - alt + y, 5, 2, skin)
      return
    }
    if (armType === 'panic') {
      mirrorBlock(10, 24 - alt + y, 4, 12, ink)
      mirrorBlock(11, 23 - alt + y, 2, 10, skin)
      mirrorBlock(9, 22 - alt + y, 5, 2, skin)
      return
    }
    if (armType === 'think') {
      block(12, 33 + y, 4, 8, ink)
      block(13, 34 + y, 2, 6, skin)
      block(31, 28 + y, 5, 7, ink)
      block(31, 27 + y, 4, 5, skin)
      dot(31, 26 + y, skinDark)
      return
    }
    if (armType === 'shrug' || armType === 'swipe') {
      block(11, 32 + y, 7, 4, ink)
      block(11, 31 + y, 6, 3, skin)
      block(31, 30 - alt + y, 8, 4, ink)
      block(31, 29 - alt + y, 7, 3, skin)
      return
    }
    if (armType === 'type' || armType === 'book') {
      block(12, 34 + alt + y, 8, 3, ink)
      block(13, 34 + alt + y, 7, 2, skin)
      block(28, 35 - alt + y, 8, 3, ink)
      block(28, 35 - alt + y, 7, 2, skin)
      return
    }
    if (armType === 'sleep') {
      block(12, 35 + y, 8, 3, ink)
      block(13, 35 + y, 7, 2, skin)
      block(28, 35 + y, 8, 3, ink)
      block(28, 35 + y, 7, 2, skin)
      return
    }
    mirrorBlock(12, 33 + y, 4, 8, ink)
    mirrorBlock(13, 34 + y, 2, 6, skin)
  }

  const drawStandingPose = (): void => {
    const drop = state.pose === 'slump' ? 2 : 0
    const headDrop = state.pose === 'slump' ? 2 : 0
    drawTwinTails(drop)
    drawHead(headDrop)
    drawBody(drop)
    drawArms(drop)
    drawStandingLegs(drop, state.pose === 'walk')
  }

  const drawSittingPose = (): void => {
    drawTwinTails(4, true)
    drawHead(5)
    drawBody(6)
    block(13, 42, 11, 4, ink)
    block(25, 42, 11, 4, ink)
    block(14, 42, 9, 3, skin)
    block(26, 42, 9, 3, skin)
    block(13, 45, 11, 2, shoe)
    block(25, 45, 11, 2, shoe)
    drawArms(6, state.arms === 'sleep' ? 'sleep' : state.arms)
  }

  const drawSleepingPose = (): void => {
    block(10, 40, 32, 2, 'rgba(82, 55, 39, 0.12)')
    block(13, 32, 27, 10, ink)
    block(14, 33, 25, 8, shirt)
    block(17, 34, 19, 4, colorMix(shirt, '#ffffff', 0.42))
    block(28, 38, 9, 2, shirtShade)
    block(34, 36, 5, 3, skin)
    target.save()
    target.translate(-2, 10)
    drawTwinTails(2, true)
    drawHead(5, 'sleepy', 'sleep')
    target.restore()
  }

  target.save()
  if (state.pose === 'sleep') {
    drawSleepingPose()
    target.restore()
    return
  }
  target.translate(0, -5)
  if (state.pose === 'sit') drawSittingPose()
  else drawStandingPose()
  target.restore()
}

function drawReferenceBlueCompanionProp(target: CanvasRenderingContext2D, palette: PixelPetPalette, prop: PixelPetState['prop'], phase: number, settings: ReferenceDrawSettings): void {
  if (!prop) return
  if (prop === 'bubble') {
    const alt = settings.motion ? Math.floor(phase * 6) % 2 : 0
    const ink = palette.ink || '#17171b'
    px(target, 39, 10 - alt, 13, 8, ink)
    px(target, 40, 11 - alt, 11, 6, '#ffffff')
    px(target, 38, 16 - alt, 3, 3, ink)
    px(target, 42, 13 - alt, 2, 2, palette.accent)
    px(target, 47, 13 - alt, 2, 2, palette.accent2)
    return
  }
  drawReferenceBlueCompanionGenericProp(target, palette, prop, phase, settings)
}

function drawReferenceBlueCompanionGenericProp(target: CanvasRenderingContext2D, palette: PixelPetPalette, prop: NonNullable<PixelPetState['prop']>, phase: number, settings: ReferenceDrawSettings): void {
  const alt = settings.motion ? Math.floor(phase * 6) % 2 : 0
  const ink = palette.ink
  const panel = colorMix(palette.belly, '#ffffff', 0.18)

  if (prop === 'book') {
    px(target, 16, 31, 8, 7, ink)
    px(target, 24, 31, 8, 7, ink)
    px(target, 17, 32, 7, 5, palette.belly)
    px(target, 25, 32, 6, 5, panel)
    px(target, 24, 31, 1, 7, palette.inkSoft)
    px(target, 19, 34, 3, 1, palette.accent2)
    px(target, 27, 34, 3, 1, palette.accent)
    return
  }

  if (prop === 'headphones') {
    px(target, 13, 16, 2, 7, ink)
    px(target, 34, 16, 2, 7, ink)
    px(target, 14, 14, 2, 2, palette.accent)
    px(target, 32, 14, 2, 2, palette.accent)
    px(target, 16, 12, 16, 1, ink)
    px(target, 18, 11, 12, 1, palette.accent2)
    return
  }

  if (prop === 'browser') {
    const scroll = settings.motion ? Math.floor(phase * 5) % 4 : 1
    px(target, 31, 21, 15, 18, ink)
    px(target, 32, 22, 13, 16, '#eef8ff')
    px(target, 33, 23, 11, 3, colorMix(palette.accent, '#ffffff', 0.35))
    px(target, 34, 28 - scroll, 8, 1, palette.accent)
    px(target, 34, 31 - scroll, 6, 1, palette.accent2)
    px(target, 34, 34 - scroll, 9, 1, colorMix(palette.accent, '#000000', 0.06))
    px(target, 34, 37 - scroll, 5, 1, palette.accent)
    px(target, 36 + alt, 40, 4, 1, palette.accent2)
    return
  }

  if (prop === 'codeRig') {
    const cursor = settings.motion ? Math.floor(phase * 6) % 2 : 1
    px(target, 8, 30, 32, 12, ink)
    px(target, 10, 31, 28, 9, '#1d293d')
    drawReferencePixelString(target, 12, 33, '101', palette.accent, 1, 1)
    drawReferencePixelString(target, 23, 33, '0', palette.accent2, 1, 1)
    drawReferencePixelString(target, 12, 37, '0 10', colorMix(palette.accent, '#ffffff', 0.24), 1, 1)
    if (cursor) px(target, 34, 37, 2, 4, palette.accent2)
    px(target, 6, 42, 36, 3, ink)
    px(target, 13, 41, 22, 1, palette.inkSoft)
    px(target, 18 + alt * 6, 43, 4, 1, colorMix(palette.accent2, '#ffffff', 0.2))
    return
  }

  if (prop === 'magnifier') {
    px(target, 34, 28, 7, 7, ink)
    px(target, 35, 29, 5, 5, '#ffffff')
    px(target, 36, 30, 3, 3, colorMix(palette.accent, '#ffffff', 0.46))
    px(target, 40, 34, 2, 2, ink)
    px(target, 42, 36, 2, 2, palette.shoe)
    return
  }

  if (prop === 'cards') {
    px(target, 12, 31, 9, 8, ink)
    px(target, 22, 30, 9, 8, ink)
    px(target, 17, 35, 9, 8, ink)
    px(target, 13, 32, 7, 6, '#ffffff')
    px(target, 23, 31, 7, 6, panel)
    px(target, 18, 36, 7, 6, colorMix(palette.accent, '#ffffff', 0.62))
    px(target, 15, 34, 3, 1, palette.accent2)
    px(target, 25, 33, 3, 1, palette.accent)
    return
  }

  if (prop === 'battery') {
    const fill = 1 + (settings.motion ? Math.floor(phase * 2) % 4 : 3)
    px(target, 36, 31, 8, 12, ink)
    px(target, 38, 29, 4, 2, ink)
    px(target, 37, 32, 6, 10, '#ffffff')
    px(target, 38, 41 - fill * 2, 4, fill * 2, palette.accent)
    px(target, 31, 39, 5, 1, palette.accent2)
    px(target, 29, 38, 2, 2, palette.accent2)
  }
}

function drawReferenceBlueCompanionEffects(target: CanvasRenderingContext2D, palette: PixelPetPalette, fx: PixelPetState['fx'], phase: number, settings: ReferenceDrawSettings): void {
  if (!settings.effects) return
  const active = Math.floor(phase * 3) % 3

  if (fx === 'dots') {
    ;[0, 1, 2].forEach((dot) => {
      const color = dot === active ? palette.accent2 : colorMix(palette.accent2, '#000000', 0.42)
      px(target, 7 + dot * 5, 7 - (dot === active ? 1 : 0), 2, 2, color)
    })
  }

  if (fx === 'sparkle') {
    const lift = Math.floor(Math.sin(phase * 2) + 1)
    drawReferenceSpark(target, 11, 10 - lift, palette.accent2)
    drawReferenceSpark(target, 36, 13 + lift, palette.accent)
    drawReferenceSpark(target, 9, 29, palette.accent)
  }

  if (fx === 'question') {
    const y = 5 + Math.round(Math.sin(phase * 2) * 1)
    drawReferencePixelText(target, 40, y, '?', palette.accent2, 2)
  }

  if (fx === 'exclaim') {
    drawReferencePixelText(target, 45, 4, '!', palette.danger, 2)
    px(target, 4, 24, 3, 5, '#75d6ff')
    px(target, 5, 30, 2, 2, '#75d6ff')
  }

  if (fx === 'rage') {
    const pulse = settings.motion ? Math.floor(phase * 8) % 2 : 0
    drawReferencePixelText(target, 43, 3 - pulse, '!', palette.danger, 2)
    px(target, 7, 8, 3, 2, palette.danger)
    px(target, 10, 6, 2, 2, palette.danger)
    px(target, 38, 10, 5, 2, palette.danger)
    px(target, 41, 8, 3, 2, colorMix(palette.danger, '#ffffff', 0.14))
  }

  if (fx === 'tears') {
    const drop = settings.motion ? Math.floor(phase * 6) % 7 : 3
    px(target, 14, 23 + drop, 2, 3, '#59c8ff')
    px(target, 33, 22 + ((drop + 3) % 7), 2, 3, '#59c8ff')
    px(target, 10, 36, 4, 1, 'rgba(89, 200, 255, 0.42)')
    px(target, 35, 37, 5, 1, 'rgba(89, 200, 255, 0.34)')
  }

  if (fx === 'zzz') {
    const drift = Math.floor(phase * 2) % 3
    drawReferencePixelText(target, 35, 8 - drift, 'Z', palette.accent, 1)
    drawReferencePixelText(target, 40, 3 - drift, 'Z', colorMix(palette.accent, '#ffffff', 0.28), 1)
  }

  if (fx === 'flow') {
    const offset = Math.floor(phase * 10) % 14
    px(target, 17 + offset, 39, 2, 1, palette.accent2)
    px(target, 31 - offset, 32, 1, 1, palette.accent)
    px(target, 12 + (offset % 8), 12, 1, 1, colorMix(palette.accent, '#ffffff', 0.25))
  }

  if (fx === 'idea') {
    const lift = Math.floor(Math.sin(phase * 2) + 1)
    px(target, 42, 4 - lift, 6, 6, palette.accent2)
    px(target, 44, 3 - lift, 2, 1, colorMix(palette.accent2, '#ffffff', 0.35))
    px(target, 44, 10 - lift, 2, 2, palette.ink)
    px(target, 42, 13 - lift, 6, 1, palette.accent2)
  }

  if (fx === 'music') {
    const bounce = Math.floor(phase * 4) % 2
    px(target, 39, 5 - bounce, 2, 8, palette.accent)
    px(target, 41, 5 - bounce, 5, 2, palette.accent)
    px(target, 45, 7 - bounce, 2, 7, palette.accent)
    px(target, 37, 13 - bounce, 4, 3, palette.accent2)
    px(target, 43, 14 - bounce, 4, 3, palette.accent2)
  }

  if (fx === 'book') {
    px(target, 8, 11, 2, 1, palette.accent2)
    px(target, 11, 9, 2, 1, colorMix(palette.accent2, '#ffffff', 0.18))
    px(target, 14, 12, 2, 1, palette.accent)
  }
}

function drawReferenceBlueCompanionActionBackdrop(target: CanvasRenderingContext2D, palette: PixelPetPalette, state: PixelPetState, phase: number, settings: ReferenceDrawSettings): void {
  if (!settings.effects) return
  if (state.fx === 'code') drawReferenceBlueCompanionCodeBackdrop(target, palette, phase, settings)
  if (state.fx === 'web') drawReferenceBlueCompanionWebBackdrop(target, palette, phase, settings)
}

function drawReferenceBlueCompanionCodeBackdrop(target: CanvasRenderingContext2D, palette: PixelPetPalette, phase: number, settings: ReferenceDrawSettings): void {
  const streams = ['0 10', '101', '0101', '1 0', '10 1', '001']
  const scroll = settings.motion ? Math.floor(phase * 7) % 12 : 0
  const inkGlow = colorMix(palette.accent, '#ffffff', 0.28)
  const hotGlow = colorMix(palette.accent2, '#ffffff', 0.18)
  px(target, 4, 8, 19, 40, 'rgba(43, 62, 86, 0.10)')
  px(target, 56, 5, 18, 45, 'rgba(43, 62, 86, 0.08)')
  px(target, 2, 48, 76, 1, 'rgba(43, 62, 86, 0.08)')
  streams.forEach((text, index) => {
    let y = 6 + index * 9 - scroll
    while (y < -6) y += 58
    const x = index % 2 ? 56 + (index % 3) * 2 : 5 + (index % 3)
    const color = index === Math.floor(phase * 2) % streams.length ? hotGlow : inkGlow
    drawReferencePixelString(target, x, y, text, color, 1, 1)
  })
}

function drawReferenceBlueCompanionWebBackdrop(target: CanvasRenderingContext2D, palette: PixelPetPalette, phase: number, settings: ReferenceDrawSettings): void {
  const drift = settings.motion ? Math.floor(phase * 5) % 18 : 0
  const cards = [
    { x: 5, y: 10, w: 18, h: 12, speed: 1 },
    { x: 55, y: 8, w: 19, h: 14, speed: -1 },
    { x: 3, y: 40, w: 21, h: 11, speed: -1 },
    { x: 58, y: 43, w: 16, h: 10, speed: 1 },
  ]
  cards.forEach((card, index) => {
    const y = card.y + Math.round(Math.sin((phase + index) * 1.7) * 2) + (card.speed * drift) % 6
    const fill = index % 2 === 0 ? 'rgba(255, 255, 255, 0.72)' : 'rgba(229, 246, 255, 0.72)'
    px(target, card.x, y, card.w, card.h, 'rgba(70, 90, 113, 0.20)')
    px(target, card.x + 1, y + 1, card.w - 2, card.h - 2, fill)
    px(target, card.x + 2, y + 2, card.w - 4, 2, colorMix(palette.accent, '#ffffff', 0.28))
    px(target, card.x + 3, y + 6, card.w - 8, 1, palette.accent)
    px(target, card.x + 3, y + 8, Math.max(4, card.w - 11), 1, palette.accent2)
  })
}

function drawReferenceBlueCompanionActionCues(target: CanvasRenderingContext2D, palette: PixelPetPalette, state: PixelPetState, phase: number, settings: ReferenceDrawSettings): void {
  if (!settings.effects) return
  const pulse = settings.motion ? Math.floor(phase * 6) % 2 : 0

  if (state.pose === 'walk') {
    const step = Math.floor(phase * 6) % 2
    px(target, 9 + step * 3, 43, 5, 1, 'rgba(82, 55, 39, 0.20)')
    px(target, 31 - step * 2, 43, 5, 1, 'rgba(82, 55, 39, 0.16)')
  }

  if (state.pose === 'jump') {
    px(target, 10, 33 + pulse, 1, 6, colorMix(palette.accent, '#ffffff', 0.3))
    px(target, 37, 34 - pulse, 1, 5, palette.accent2)
    px(target, 18, 43, 12, 1, 'rgba(82, 55, 39, 0.13)')
  }

  if (state.pose === 'stomp' || state.pose === 'error') {
    px(target, 12, 42, 7, 1, palette.danger)
    px(target, 28, 42, 7, 1, palette.danger)
    px(target, 9 + pulse, 40, 2, 1, colorMix(palette.danger, '#ffffff', 0.18))
  }

  if (state.pose === 'talk') {
    px(target, 14, 15 + pulse, 6, 1, palette.accent)
    px(target, 14, 17 + pulse, 4, 1, palette.accent2)
  }

  if (state.pose === 'think') {
    px(target, 37, 13 - pulse, 2, 2, colorMix(palette.accent, '#ffffff', 0.3))
    px(target, 41, 10 + pulse, 2, 2, palette.accent2)
    px(target, 35, 18, 1, 1, colorMix(palette.accent, '#000000', 0.18))
  }

  if (state.prop === 'headphones') {
    ;[0, 1, 2].forEach((bar) => {
      const height = 2 + ((Math.floor(phase * 5) + bar) % 3)
      px(target, 40 + bar * 2, 18 - height, 1, height, bar % 2 ? palette.accent2 : palette.accent)
    })
  }

  if (state.prop === 'battery') {
    px(target, 34, 29 - pulse, 2, 2, palette.accent2)
    px(target, 31, 33 + pulse, 2, 2, palette.accent)
  }
}

function drawReferenceBlueCompanionStanding(target: CanvasRenderingContext2D, palette: PixelPetPalette): void {
  const ink = palette.ink || '#17171b'
  const hair = palette.hair || palette.mane
  const hairDark = colorMix(hair, '#223949', 0.24)
  const hairMid = colorMix(hair, palette.hairLight || palette.maneLight, 0.24)
  const hairLight = palette.hairLight || palette.maneLight
  const skin = palette.skin || palette.muzzle
  const skinDark = palette.skinDark || colorMix(skin, '#b98579', 0.34)
  const shirt = palette.shirt
  const shirtShade = colorMix(shirt, palette.accent, 0.1)
  const shoe = palette.shoe
  const flower = palette.fang || '#fff8ef'
  const centerWidth = 48
  const dot = (x: number, y: number, color: string) => px(target, x, y, 1, 1, color)
  const block = (x: number, y: number, w: number, h: number, color: string) => {
    for (let row = 0; row < h; row += 1) for (let col = 0; col < w; col += 1) dot(x + col, y + row, color)
  }
  const mirrorBlock = (x: number, y: number, w: number, h: number, color: string) => {
    block(x, y, w, h, color)
    block(centerWidth - x - w, y, w, h, color)
  }
  const mirrorDot = (x: number, y: number, color: string) => {
    dot(x, y, color)
    dot(centerWidth - x - 1, y, color)
  }

  target.save()
  target.translate(0, -5)
  mirrorBlock(7, 13, 7, 4, ink)
  mirrorBlock(5, 17, 10, 16, ink)
  mirrorBlock(7, 33, 7, 5, ink)
  mirrorBlock(8, 14, 5, 3, hairLight)
  mirrorBlock(6, 18, 8, 14, hair)
  mirrorBlock(8, 32, 5, 5, hairDark)
  mirrorBlock(8, 20, 2, 11, hairMid)
  mirrorBlock(12, 19, 2, 13, colorMix(hairDark, '#000000', 0.05))
  block(18, 6, 12, 1, ink)
  block(15, 7, 18, 1, ink)
  block(13, 8, 22, 2, ink)
  block(12, 10, 24, 5, ink)
  block(13, 15, 22, 3, ink)
  block(18, 7, 12, 1, hairLight)
  block(15, 8, 18, 2, hairLight)
  block(14, 10, 20, 3, hair)
  block(13, 13, 22, 4, hair)
  block(16, 15, 16, 2, hairLight)
  mirrorBlock(12, 18, 3, 7, ink)
  mirrorBlock(13, 18, 2, 6, hairDark)
  block(14, 17, 20, 12, ink)
  block(15, 18, 18, 10, skin)
  mirrorBlock(11, 20, 3, 5, ink)
  mirrorBlock(12, 21, 2, 3, skinDark)
  block(16, 27, 16, 2, colorMix(skin, skinDark, 0.18))
  mirrorBlock(17, 20, 4, 4, ink)
  mirrorBlock(18, 21, 2, 2, palette.accent)
  mirrorDot(18, 20, '#ffffff')
  mirrorBlock(17, 25, 3, 1, palette.blush)
  block(22, 25, 4, 1, ink)
  dot(23, 24, colorMix(skin, '#ffffff', 0.18))
  mirrorDot(11, 12, flower)
  mirrorDot(10, 13, flower)
  mirrorDot(12, 13, flower)
  mirrorDot(11, 14, flower)
  mirrorDot(11, 13, palette.accent2)
  block(21, 29, 6, 2, ink)
  block(22, 29, 4, 2, skin)
  block(15, 31, 18, 12, ink)
  block(16, 32, 16, 10, shirt)
  block(18, 32, 12, 3, colorMix(shirt, '#ffffff', 0.42))
  block(18, 36, 12, 5, shirtShade)
  mirrorBlock(12, 33, 4, 8, ink)
  mirrorBlock(13, 34, 2, 6, skin)
  mirrorBlock(18, 42, 4, 4, ink)
  mirrorBlock(19, 42, 2, 3, skin)
  mirrorBlock(16, 45, 7, 2, shoe)
  target.restore()
}

function drawReferenceHumanLegs(target: CanvasRenderingContext2D, palette: PixelPetPalette, tick: number): void {
  const step = tick % 2
  const ink = palette.ink || '#17171b'
  const skin = palette.skin || palette.muzzle
  px(target, 19, 33, 4, 8, ink)
  px(target, 26, 33, 4, 8, ink)
  px(target, 20, 33, 2, 8, skin)
  px(target, 27, 33, 2, 8, skin)
  px(target, 19, 38, 4, 3, palette.shoe)
  px(target, 26, 38, 4, 3, palette.shoe)
  px(target, 18 + step, 40, 6, 2, palette.shoe)
  px(target, 26 - step, 40, 6, 2, palette.shoe)
}

function drawReferenceHumanBody(target: CanvasRenderingContext2D, palette: PixelPetPalette): void {
  const ink = palette.ink || '#17171b'
  const skin = palette.skin || palette.muzzle
  const shirtDark = palette.shirtDark || colorMix(palette.shirt, palette.ink, 0.2)
  px(target, 21, 22, 7, 4, ink)
  px(target, 22, 22, 5, 4, skin)
  px(target, 17, 25, 15, 11, ink)
  px(target, 18, 25, 13, 10, palette.shirt)
  px(target, 16, 26, 4, 5, ink)
  px(target, 29, 26, 4, 5, ink)
  px(target, 17, 26, 3, 4, palette.shirt)
  px(target, 29, 26, 3, 4, palette.shirt)
  px(target, 19, 25, 11, 3, colorMix(palette.shirt, '#ffffff', 0.4))
  px(target, 20, 28, 9, 5, colorMix(palette.shirt, skin, 0.06))
  px(target, 18, 33, 13, 3, shirtDark)
  px(target, 19, 36, 12, 2, ink)
  px(target, 20, 35, 10, 3, palette.skirt || shirtDark)
  px(target, 23, 25, 3, 1, colorMix(skin, '#ffffff', 0.18))
  px(target, 22, 28, 5, 1, colorMix(palette.shirt, '#ffffff', 0.48))
}

function drawReferenceHumanBackHair(target: CanvasRenderingContext2D, palette: PixelPetPalette, headTilt: number, phase: number, settings: ReferenceDrawSettings, features: PixelPetFeatures): void {
  const ink = palette.ink || '#17171b'
  const hair = palette.hair || palette.mane
  const hairLight = palette.hairLight || palette.maneLight
  const sway = settings.motion ? Math.round(Math.sin(phase * 1.3) * settings.intensity) : 0
  target.save()
  target.translate(headTilt + sway, 0)
  if (features.maneStyle === 'long') {
    px(target, 12, 7, 24, 6, ink)
    px(target, 11, 12, 26, 8, ink)
    px(target, 10, 19, 9, 20, ink)
    px(target, 30, 18, 9, 23, ink)
    px(target, 12, 38, 7, 4, ink)
    px(target, 31, 40, 7, 4, ink)
    px(target, 13, 8, 22, 5, hair)
    px(target, 12, 13, 24, 7, hair)
    px(target, 11, 20, 7, 18, hair)
    px(target, 31, 19, 7, 21, hair)
    px(target, 13, 38, 5, 3, colorMix(hair, '#000000', 0.12))
    px(target, 32, 40, 5, 3, colorMix(hair, '#000000', 0.16))
    px(target, 15, 10, 6, 1, hairLight)
    px(target, 16, 13, 3, 22, hairLight)
    px(target, 29, 14, 2, 22, colorMix(hairLight, hair, 0.28))
    px(target, 34, 19, 2, 17, hairLight)
  }
  target.restore()
}

function drawReferenceHumanArms(target: CanvasRenderingContext2D, palette: PixelPetPalette, armType: PixelPetState['arms'], phase: number, settings: ReferenceDrawSettings): void {
  const alt = Math.floor(phase * 6) % 2
  const ink = palette.ink || '#17171b'
  const skin = palette.skin || palette.muzzle
  const skinDark = palette.skinDark || colorMix(skin, '#b98579', 0.34)
  if (armType === 'wave') {
    px(target, 14, 25, 3, 8, ink)
    px(target, 14, 26, 2, 6, skin)
    px(target, 32, 20 - alt, 3, 8, ink)
    px(target, 33, 18 - alt, 2, 8, skin)
    px(target, 35, 17 - alt, 3, 2, skin)
    return
  }
  if (armType === 'think') {
    px(target, 14, 26, 3, 7, ink)
    px(target, 15, 27, 2, 5, skin)
    px(target, 31, 26, 3, 6, ink)
    px(target, 30, 24, 4, 4, skin)
    px(target, 30, 23, 3, 2, skinDark)
    return
  }
  if (armType === 'type') {
    px(target, 14, 27 + alt, 5, 3, ink)
    px(target, 15, 27 + alt, 4, 2, skin)
    px(target, 30, 28 - alt, 5, 3, ink)
    px(target, 30, 28 - alt, 4, 2, skin)
    px(target, 16, 36, 17, 2, ink)
    px(target, 18, 35, 13, 1, palette.inkSoft || '#62606a')
    px(target, 20 + alt * 5, 34, 2, 1, palette.accent2)
    return
  }
  if (armType === 'swipe') {
    px(target, 14, 26, 3, 8, ink)
    px(target, 15, 27, 2, 6, skin)
    px(target, 30, 24 - alt, 7, 3, ink)
    px(target, 30, 24 - alt, 6, 2, skin)
    px(target, 36, 23 - alt, 2, 2, skin)
    return
  }
  if (armType === 'panic') {
    px(target, 12, 19, 3, 9, ink)
    px(target, 13, 17, 2, 10, skin)
    px(target, 34, 19, 3, 9, ink)
    px(target, 34, 17, 2, 10, skin)
    px(target, 11, 16, 4, 2, skin)
    px(target, 34, 16, 4, 2, skin)
    return
  }
  if (armType === 'shrug') {
    px(target, 12, 25, 5, 4, ink)
    px(target, 12, 24, 4, 3, skin)
    px(target, 32, 25, 5, 4, ink)
    px(target, 33, 24, 4, 3, skin)
    return
  }
  if (armType === 'sleep') {
    px(target, 13, 29, 8, 3, ink)
    px(target, 14, 29, 7, 2, skin)
    px(target, 28, 29, 8, 3, ink)
    px(target, 28, 29, 7, 2, skin)
    return
  }
  px(target, 14, 28, 4, 7, ink)
  px(target, 15, 29, 2, 5, skin)
  px(target, 31, 28, 4, 7, ink)
  px(target, 32, 29, 2, 5, skin)
  px(target, 14, 34, 3, 2, skinDark)
  px(target, 32, 34, 3, 2, skinDark)
  void settings
}

function drawReferenceHumanHead(target: CanvasRenderingContext2D, palette: PixelPetPalette, headTilt: number, features: PixelPetFeatures): void {
  const ink = palette.ink || '#17171b'
  const skin = palette.skin || palette.muzzle
  const skinDark = palette.skinDark || colorMix(skin, '#b98579', 0.34)
  const hair = palette.hair || palette.mane
  const hairLight = palette.hairLight || palette.maneLight
  target.save()
  target.translate(headTilt, 0)
  px(target, 13, 16, 3, 6, ink)
  px(target, 33, 16, 3, 6, ink)
  px(target, 14, 17, 2, 4, skinDark)
  px(target, 33, 17, 2, 4, skinDark)
  px(target, 15, 10, 19, 2, ink)
  px(target, 14, 12, 21, 12, ink)
  px(target, 15, 24, 19, 2, ink)
  px(target, 16, 11, 17, 2, skin)
  px(target, 15, 13, 19, 9, skin)
  px(target, 16, 22, 17, 3, colorMix(skin, skinDark, 0.22))
  px(target, 18, 24, 13, 1, colorMix(skin, '#ffffff', 0.16))
  if (features.maneStyle === 'long') {
    px(target, 13, 7, 23, 6, ink)
    px(target, 12, 12, 24, 6, ink)
    px(target, 12, 17, 5, 7, ink)
    px(target, 31, 16, 5, 8, ink)
    px(target, 14, 8, 21, 5, hair)
    px(target, 13, 13, 22, 5, hair)
    px(target, 13, 17, 4, 6, hair)
    px(target, 31, 17, 4, 7, hair)
    px(target, 16, 8, 6, 2, hairLight)
    px(target, 22, 9, 8, 1, colorMix(hairLight || hair, '#ffffff', 0.18))
    px(target, 17, 12, 5, 8, hair)
    px(target, 20, 12, 5, 6, colorMix(hair, '#ffffff', 0.08))
    px(target, 25, 12, 5, 5, hair)
    px(target, 29, 13, 3, 7, colorMix(hair, '#000000', 0.08))
    px(target, 23, 12, 3, 10, hairLight)
  }
  target.restore()
}

function drawReferenceHumanAccessory(target: CanvasRenderingContext2D, palette: PixelPetPalette, features: PixelPetFeatures, headTilt: number): void {
  if (features.accessory !== 'flower') return
  target.save()
  target.translate(headTilt, 0)
  px(target, 31, 7, 3, 2, palette.fang || '#fffdf2')
  px(target, 29, 9, 3, 2, palette.fang || '#fffdf2')
  px(target, 33, 9, 3, 2, palette.fang || '#fffdf2')
  px(target, 31, 11, 3, 2, palette.fang || '#fffdf2')
  px(target, 32, 9, 2, 2, palette.accent2)
  px(target, 33, 9, 1, 1, colorMix(palette.accent2, '#ffffff', 0.28))
  target.restore()
}

function drawReferenceHumanFace(target: CanvasRenderingContext2D, palette: PixelPetPalette, eyes: PixelPetState['eyes'], mouth: PixelPetState['mouth'], phase: number, isBlink: boolean, headTilt: number): void {
  const dark = palette.ink || '#242027'
  const white = '#fff8ed'
  const blush = colorMix(palette.skin || palette.muzzle, '#e96f91', 0.34)
  target.save()
  target.translate(headTilt, 0)
  if (isBlink && eyes !== 'shock' && eyes !== 'sleepy') {
    px(target, 18, 18, 5, 1, dark)
    px(target, 27, 18, 5, 1, dark)
  } else if (eyes === 'happy') {
    px(target, 18, 18, 1, 1, dark)
    px(target, 19, 17, 3, 1, dark)
    px(target, 22, 18, 1, 1, dark)
    px(target, 27, 18, 1, 1, dark)
    px(target, 28, 17, 3, 1, dark)
    px(target, 31, 18, 1, 1, dark)
    px(target, 17, 21, 3, 1, blush)
    px(target, 30, 21, 3, 1, blush)
  } else if (eyes === 'focused') {
    px(target, 18, 16, 5, 1, dark)
    px(target, 27, 16, 5, 1, dark)
    px(target, 19, 18, 4, 2, dark)
    px(target, 27, 18, 4, 2, dark)
    px(target, 21, 18, 1, 1, white)
    px(target, 29, 18, 1, 1, white)
  } else if (eyes === 'confused') {
    px(target, 18, 16, 5, 1, dark)
    px(target, 28, 15, 4, 1, dark)
    px(target, 19, 18, 3, 2, dark)
    px(target, 28, 18, 3, 1, dark)
  } else if (eyes === 'shock') {
    px(target, 18, 17, 5, 4, dark)
    px(target, 27, 17, 5, 4, dark)
    px(target, 19, 18, 3, 2, white)
    px(target, 28, 18, 3, 2, white)
  } else if (eyes === 'sleepy') {
    px(target, 18, 18, 5, 1, dark)
    px(target, 27, 18, 5, 1, dark)
  } else {
    px(target, 18, 17, 5, 4, dark)
    px(target, 27, 17, 5, 4, dark)
    px(target, 19, 18, 3, 2, palette.accent)
    px(target, 28, 18, 3, 2, palette.accent)
    px(target, 20, 17, 1, 1, white)
    px(target, 29, 17, 1, 1, white)
  }
  const talkFrame = mouth === 'talk' ? Math.floor(phase * 8) % 4 : -1
  const effectiveMouth = mouth === 'talk' ? (talkFrame === 0 ? 'tiny' : talkFrame === 2 ? 'smallOpen' : 'talkOpen') : mouth
  if (effectiveMouth === 'talkOpen') {
    px(target, 24, 22, 4, 3, dark)
    px(target, 25, 23, 2, 1, '#d46a6a')
  } else if (effectiveMouth === 'bigSmile') {
    px(target, 24, 22, 1, 1, dark)
    px(target, 25, 23, 3, 1, dark)
    px(target, 28, 22, 1, 1, dark)
    px(target, 26, 22, 1, 1, white)
  } else if (effectiveMouth === 'flat' || effectiveMouth === 'crying') {
    px(target, 23, 23, 4, 1, dark)
  } else if (effectiveMouth === 'tiny') {
    px(target, 24, 23, 2, 1, dark)
  } else if (effectiveMouth === 'smallOpen') {
    px(target, 24, 22, 3, 2, dark)
    px(target, 25, 23, 1, 1, '#d46a6a')
  } else if (effectiveMouth === 'wave' || effectiveMouth === 'snarl') {
    px(target, 22, 23, 1, 1, dark)
    px(target, 23, 22, 2, 1, dark)
    px(target, 25, 23, 2, 1, dark)
    px(target, 27, 22, 2, 1, dark)
  } else if (effectiveMouth === 'sleep') {
    px(target, 24, 23, 1, 1, dark)
    px(target, 25, 24, 2, 1, dark)
    px(target, 27, 23, 1, 1, dark)
  } else {
    px(target, 24, 23, 3, 1, dark)
    px(target, 27, 22, 1, 1, dark)
  }
  target.restore()
}

function drawReferenceHumanSitting(target: CanvasRenderingContext2D, palette: PixelPetPalette, phase: number, settings: ReferenceDrawSettings, headTilt: number, state: PixelPetState, features: PixelPetFeatures): void {
  const ink = palette.ink || '#17171b'
  const skin = palette.skin || palette.muzzle
  const sway = settings.motion ? Math.round(Math.sin(phase * 1.2) * settings.intensity) : 0
  target.save()
  target.translate(0, 7)
  drawReferenceHumanBackHair(target, palette, headTilt, phase, settings, features)
  target.restore()
  px(target, 16, 31, 17, 9, ink)
  px(target, 17, 31, 15, 8, palette.shirt)
  px(target, 18, 34, 13, 3, palette.shirtDark || colorMix(palette.shirt, palette.ink, 0.2))
  px(target, 13, 38, 11, 4, ink)
  px(target, 25, 38, 11, 4, ink)
  px(target, 14, 38, 9, 3, skin)
  px(target, 26, 38, 9, 3, skin)
  px(target, 13, 41, 10, 2, palette.shoe)
  px(target, 26, 41, 10, 2, palette.shoe)
  px(target, 12, 32 + (sway > 0 ? 1 : 0), 7, 3, ink)
  px(target, 13, 32 + (sway > 0 ? 1 : 0), 6, 2, skin)
  px(target, 30, 32 - (sway > 0 ? 1 : 0), 7, 3, ink)
  px(target, 30, 32 - (sway > 0 ? 1 : 0), 6, 2, skin)
  target.save()
  target.translate(0, 8)
  drawReferenceHumanHead(target, palette, headTilt, features)
  drawReferenceHumanFace(target, palette, state.eyes, state.mouth, phase, false, headTilt)
  drawReferenceHumanAccessory(target, palette, features, headTilt)
  target.restore()
}

function drawReferenceHumanSleeping(target: CanvasRenderingContext2D, palette: PixelPetPalette, phase: number, settings: ReferenceDrawSettings, features: PixelPetFeatures): void {
  const ink = palette.ink || '#17171b'
  const skin = palette.skin || palette.muzzle
  const breathe = settings.motion ? Math.round(Math.sin(phase * 2) > 0 ? 1 : 0) : 0
  px(target, 15, 31 - breathe, 23, 9 + breathe, ink)
  px(target, 16, 32 - breathe, 21, 7 + breathe, palette.shirt)
  px(target, 20, 36, 15, 3, palette.shirtDark || colorMix(palette.shirt, palette.ink, 0.2))
  px(target, 35, 35, 5, 3, skin)
  px(target, 14, 39, 25, 1, 'rgba(82, 55, 39, 0.13)')
  target.save()
  target.translate(-1, 13)
  drawReferenceHumanBackHair(target, palette, 0, phase, { ...settings, motion: false }, features)
  drawReferenceHumanHead(target, palette, 0, features)
  drawReferenceHumanFace(target, palette, 'sleepy', 'sleep', phase, false, 0)
  drawReferenceHumanAccessory(target, palette, features, 0)
  target.restore()
  px(target, 18, 31, 18, 1, colorMix(palette.hair || palette.mane, '#ffffff', 0.16))
}

function drawReferenceHumanDetails(target: CanvasRenderingContext2D, palette: PixelPetPalette, _state: PixelPetState, phase: number, settings: ReferenceDrawSettings, features: PixelPetFeatures): void {
  const pulse = settings.motion ? Math.floor(phase * 4) % 2 : 0
  const hairLight = palette.hairLight || palette.maneLight
  px(target, 16, 11, 7, 1, hairLight)
  px(target, 18, 14, 2, 18, colorMix(hairLight, '#ffffff', 0.08))
  px(target, 30, 15, 2, 19, colorMix(hairLight, palette.hair || palette.mane, 0.38))
  px(target, 35, 20, 1, 17, colorMix(hairLight, '#ffffff', 0.02))
  px(target, 20, 19, 1, 1, '#ffffff')
  px(target, 29, 19, 1, 1, '#ffffff')
  px(target, 18, 25, 13, 1, colorMix(palette.shirt, '#ffffff', 0.48))
  px(target, 20, 30, 9, 1, colorMix(palette.shirtDark || palette.shirt, '#ffffff', 0.18))
  px(target, 15 + pulse, 36, 2, 1, palette.skinDark || palette.muzzle)
  px(target, 32 - pulse, 36, 2, 1, palette.skinDark || palette.muzzle)
  if (features.accessory === 'flower') {
    px(target, 32, 9, 1, 1, '#ffffff')
    px(target, 33, 9, 1, 1, palette.accent2)
  }
}

function drawReferenceShadow(target: CanvasRenderingContext2D, phase: number, settings: ReferenceDrawSettings, lift = 0): void {
  const jumpSpread = Math.max(0, Math.abs(lift))
  const walkPulse = settings.motion ? Math.abs(Math.sin(phase * 2)) : 0
  const width = 22 + Math.round(walkPulse * 2) - Math.round(jumpSpread * 0.8)
  px(target, 24 - width / 2, 42, width, 1, 'rgba(82, 55, 39, 0.20)')
  px(target, 19, 43, 10, 1, 'rgba(82, 55, 39, 0.12)')
}

function drawReferenceMascotTail(target: CanvasRenderingContext2D, palette: PixelPetPalette, phase: number, settings: ReferenceDrawSettings, features: PixelPetFeatures): void {
  const wag = settings.motion ? Math.round(Math.sin(phase * 3.2) * settings.intensity) : 0
  const ink = palette.ink
  if (features.tailStyle === 'none') return
  if (features.tailStyle === 'curled') {
    px(target, 34, 31 - wag, 4, 3, ink)
    px(target, 38, 28 - wag, 5, 3, ink)
    px(target, 41, 30 - wag, 3, 5, ink)
    px(target, 39, 35 - wag, 4, 3, ink)
    px(target, 35, 31 - wag, 3, 2, palette.mane)
    px(target, 39, 29 - wag, 3, 2, palette.furDark)
    px(target, 41, 31 - wag, 2, 4, palette.belly)
    return
  }
  if (features.tailStyle === 'long') {
    px(target, 33, 32 - wag, 5, 3, ink)
    px(target, 37, 30 - wag, 7, 4, ink)
    px(target, 42, 29 - wag, 4, 5, ink)
    px(target, 34, 32 - wag, 4, 2, palette.mane)
    px(target, 38, 31 - wag, 6, 2, palette.furDark)
    px(target, 43, 30 - wag, 2, 4, palette.belly)
    return
  }
  px(target, 34, 31 - wag, 4, 3, ink)
  px(target, 37, 29 - wag, 5, 4, ink)
  px(target, 40, 27 - wag, 3, 6, ink)
  px(target, 42, 29 - wag, 3, 5, ink)
  px(target, 35, 31 - wag, 4, 2, palette.mane)
  px(target, 38, 29 - wag, 4, 3, palette.furDark)
  px(target, 41, 28 - wag, 2, 5, palette.muzzle)
  px(target, 42, 31 - wag, 2, 2, palette.belly)
}

function drawReferenceMascotLegs(target: CanvasRenderingContext2D, palette: PixelPetPalette, tick: number, pose: PixelPetState['pose']): void {
  const step = tick % 2
  const ink = palette.ink
  if (pose === 'sit' || pose === 'sleep') {
    px(target, 15, 38, 8, 3, ink)
    px(target, 26, 38, 8, 3, ink)
    px(target, 16, 37, 6, 3, palette.fur)
    px(target, 27, 37, 6, 3, palette.fur)
    px(target, 15, 40, 8, 2, palette.shoe)
    px(target, 26, 40, 8, 2, palette.shoe)
    return
  }
  if (pose === 'jump') {
    px(target, 16, 35, 7, 5, ink)
    px(target, 27, 35, 7, 5, ink)
    px(target, 17, 35, 5, 4, palette.fur)
    px(target, 28, 35, 5, 4, palette.fur)
    px(target, 14, 38, 8, 2, palette.shoe)
    px(target, 29, 38, 8, 2, palette.shoe)
    return
  }
  if (pose === 'stomp') {
    const stamp = tick % 2
    px(target, 15, 35, 8, 6, ink)
    px(target, 27, 35, 8, 6, ink)
    px(target, 16, 35, 6, 5, palette.fur)
    px(target, 28, 35, 6, 5, palette.fur)
    px(target, 13 + stamp, 40, 10, 2, palette.shoe)
    px(target, 27 - stamp, 40, 10, 2, palette.shoe)
    px(target, 12 + stamp * 22, 42, 6, 1, palette.danger)
    return
  }
  const walk = pose === 'walk' ? step : 0
  px(target, 16, 35, 7, 6, ink)
  px(target, 27, 35, 7, 6, ink)
  px(target, 17, 35, 5, 5, palette.fur)
  px(target, 28, 35, 5, 5, palette.fur)
  px(target, 15 + walk, 40, 8, 2, palette.shoe)
  px(target, 27 - walk, 40, 8, 2, palette.shoe)
  px(target, 17, 41, 1, 1, colorMix(palette.shoe, '#ffffff', 0.24))
  px(target, 29, 41, 1, 1, colorMix(palette.shoe, '#ffffff', 0.24))
}

function drawReferenceMascotBody(target: CanvasRenderingContext2D, palette: PixelPetPalette, features: PixelPetFeatures): void {
  const ink = palette.ink
  px(target, 14, 25, 20, 14, ink)
  px(target, 15, 26, 18, 12, palette.fur)
  px(target, 19, 26, 10, 13, palette.belly)
  px(target, 20, 27, 8, 11, colorMix(palette.belly, '#ffffff', 0.18))
  px(target, 20, 26, 2, 2, palette.belly)
  px(target, 26, 26, 2, 2, palette.belly)
  if (features.spotStyle === 'stripes') {
    px(target, 15, 28, 4, 1, palette.spot)
    px(target, 30, 30, 3, 1, palette.spot)
    px(target, 16, 34, 4, 1, palette.spot)
    px(target, 29, 36, 3, 1, palette.spot)
  } else if (features.spotStyle === 'heart') {
    px(target, 15, 28, 2, 2, palette.spot)
    px(target, 18, 28, 2, 2, palette.spot)
    px(target, 16, 30, 3, 2, palette.spot)
    px(target, 30, 35, 2, 2, palette.spot)
  } else if (features.spotStyle !== 'none') {
    px(target, 15, 27, 3, 2, palette.spot)
    px(target, 31, 29, 2, 2, palette.spot)
    px(target, 16, 33, 2, 2, palette.spot)
    px(target, 30, 35, 2, 2, palette.spot)
  }
}

function drawReferenceMascotArms(target: CanvasRenderingContext2D, palette: PixelPetPalette, armType: PixelPetState['arms'], phase: number): void {
  const alt = Math.floor(phase * 6) % 2
  const ink = palette.ink
  if (armType === 'wave') {
    px(target, 11, 25, 4, 8, ink)
    px(target, 12, 26, 3, 6, palette.fur)
    px(target, 33, 20 - alt, 4, 9, ink)
    px(target, 34, 20 - alt, 3, 7, palette.fur)
    px(target, 35, 18 - alt, 4, 3, palette.shoe)
    return
  }
  if (armType === 'think') {
    px(target, 12, 27, 4, 7, ink)
    px(target, 13, 28, 3, 5, palette.fur)
    px(target, 32, 25, 4, 8, ink)
    px(target, 32, 25, 3, 6, palette.fur)
    px(target, 30, 21, 5, 4, palette.shoe)
    return
  }
  if (armType === 'type') {
    px(target, 11, 29 + alt, 7, 3, ink)
    px(target, 12, 29 + alt, 5, 2, palette.fur)
    px(target, 31, 29 - alt, 7, 3, ink)
    px(target, 32, 29 - alt, 5, 2, palette.fur)
    return
  }
  if (armType === 'swipe') {
    px(target, 11, 28, 5, 7, ink)
    px(target, 12, 29, 3, 5, palette.fur)
    px(target, 31, 25 - alt, 9, 3, ink)
    px(target, 32, 25 - alt, 7, 2, palette.fur)
    px(target, 39, 24 - alt, 3, 3, palette.shoe)
    px(target, 41, 23 - alt, 1, 1, palette.accent2)
    return
  }
  if (armType === 'book') {
    px(target, 11, 29, 7, 4, ink)
    px(target, 12, 29, 5, 3, palette.fur)
    px(target, 30, 29, 7, 4, ink)
    px(target, 31, 29, 5, 3, palette.fur)
    return
  }
  if (armType === 'panic') {
    px(target, 10, 20, 4, 10, ink)
    px(target, 11, 19, 3, 9, palette.fur)
    px(target, 34, 20, 4, 10, ink)
    px(target, 34, 19, 3, 9, palette.fur)
    px(target, 9, 18, 4, 3, palette.shoe)
    px(target, 35, 18, 4, 3, palette.shoe)
    return
  }
  if (armType === 'shrug') {
    px(target, 10, 26, 6, 4, ink)
    px(target, 10, 25, 5, 3, palette.fur)
    px(target, 32, 26, 6, 4, ink)
    px(target, 33, 25, 5, 3, palette.fur)
    return
  }
  if (armType === 'sleep') {
    px(target, 11, 31, 8, 3, ink)
    px(target, 12, 31, 6, 2, palette.fur)
    px(target, 30, 31, 8, 3, ink)
    px(target, 31, 31, 6, 2, palette.fur)
    return
  }
  px(target, 11, 26, 5, 8, ink)
  px(target, 12, 27, 3, 6, palette.fur)
  px(target, 32, 26, 5, 8, ink)
  px(target, 33, 27, 3, 6, palette.fur)
  px(target, 12, 32, 4, 3, palette.shoe)
  px(target, 32, 32, 4, 3, palette.shoe)
}

function drawReferenceMascotEarsAndMane(target: CanvasRenderingContext2D, palette: PixelPetPalette, headTilt: number, phase: number, settings: ReferenceDrawSettings, features: PixelPetFeatures): void {
  const ink = palette.ink
  const sway = settings.motion ? Math.round(Math.sin(phase * 1.4) * settings.intensity) : 0
  target.save()
  target.translate(headTilt + sway, 0)
  if (features.earShape === 'pointy') {
    px(target, 6, 8, 7, 13, ink)
    px(target, 8, 10, 5, 10, palette.furDark)
    px(target, 9, 13, 3, 6, palette.earInner)
    px(target, 35, 8, 7, 13, ink)
    px(target, 35, 10, 5, 10, palette.furDark)
    px(target, 36, 13, 3, 6, palette.earInner)
  } else if (features.earShape === 'long') {
    px(target, 4, 7, 8, 17, ink)
    px(target, 6, 9, 5, 14, palette.furDark)
    px(target, 7, 12, 3, 9, palette.earInner)
    px(target, 36, 7, 8, 17, ink)
    px(target, 37, 9, 5, 14, palette.furDark)
    px(target, 38, 12, 3, 9, palette.earInner)
  } else if (features.earShape !== 'none') {
    px(target, 5, 9, 8, 15, ink)
    px(target, 7, 10, 6, 12, palette.furDark)
    px(target, 8, 12, 4, 8, palette.earInner)
    px(target, 35, 9, 8, 15, ink)
    px(target, 35, 10, 6, 12, palette.furDark)
    px(target, 36, 12, 4, 8, palette.earInner)
  }

  if (features.maneStyle !== 'none') {
    if (features.maneStyle === 'long') {
      px(target, 7, 11, 7, 22, ink)
      px(target, 9, 12, 5, 20, palette.mane)
      px(target, 10, 15, 2, 14, palette.maneLight)
      px(target, 35, 10, 8, 24, ink)
      px(target, 35, 11, 6, 22, palette.mane)
      px(target, 37, 13, 2, 16, palette.maneLight)
      px(target, 17, 3, 17, 7, ink)
      px(target, 15, 7, 21, 6, ink)
      px(target, 18, 4, 15, 5, palette.mane)
      px(target, 16, 8, 19, 4, palette.mane)
      px(target, 17, 11, 5, 5, palette.mane)
      px(target, 23, 10, 4, 7, palette.maneLight)
      px(target, 28, 11, 5, 5, palette.mane)
      px(target, 21, 5, 7, 1, palette.maneLight)
      px(target, 31, 8, 3, 1, palette.maneLight)
    } else {
      px(target, 19, features.maneStyle === 'fluffy' ? 3 : 2, 9, 4, ink)
      px(target, 16, 5, 16, 4, ink)
      px(target, 14, 8, 17, 4, ink)
      px(target, 20, features.maneStyle === 'fluffy' ? 4 : 3, 7, 3, palette.mane)
      px(target, 17, 6, 14, 3, palette.mane)
      px(target, 15, 9, 13, 3, palette.mane)
      if (features.maneStyle === 'bangs') {
        px(target, 16, 11, 5, 3, palette.mane)
        px(target, 27, 11, 4, 3, palette.mane)
      }
      px(target, 21, 4, 3, 1, palette.maneLight)
      px(target, 27, 6, 2, 1, palette.maneLight)
    }
  }
  px(target, 35, 18, 4, 10, ink)
  px(target, 35, 18, 3, 9, palette.mane)
  px(target, 36, 25, 3, 3, colorMix(palette.mane, '#000000', 0.16))
  target.restore()
}

function drawReferenceMascotHead(target: CanvasRenderingContext2D, palette: PixelPetPalette, headTilt: number): void {
  const ink = palette.ink
  target.save()
  target.translate(headTilt, 0)
  px(target, 10, 13, 28, 14, ink)
  px(target, 12, 11, 24, 18, ink)
  px(target, 13, 12, 22, 16, palette.fur)
  px(target, 11, 18, 26, 8, palette.fur)
  px(target, 13, 24, 22, 4, colorMix(palette.fur, palette.furDark, 0.22))
  px(target, 18, 21, 12, 6, palette.muzzle)
  px(target, 20, 19, 8, 4, palette.muzzle)
  px(target, 22, 18, 5, 3, ink)
  px(target, 23, 19, 3, 2, '#1e1b1e')
  px(target, 23, 18, 2, 1, palette.lensLight)
  px(target, 13, 24, 3, 2, palette.blush)
  px(target, 32, 24, 3, 2, palette.blush)
  px(target, 13, 14, 3, 2, palette.belly)
  px(target, 32, 14, 3, 2, palette.belly)
  target.restore()
}

function drawReferenceMascotAccessory(target: CanvasRenderingContext2D, palette: PixelPetPalette, headTilt: number, features: PixelPetFeatures): void {
  const ink = palette.ink
  if (features.accessory === 'none') return
  target.save()
  target.translate(headTilt, 0)
  if (features.accessory === 'bow') {
    px(target, 29, 7, 3, 3, palette.accent2)
    px(target, 33, 7, 3, 3, palette.accent2)
    px(target, 32, 8, 2, 2, palette.accent)
  } else if (features.accessory === 'flower') {
    px(target, 31, 6, 3, 2, palette.fang)
    px(target, 29, 8, 3, 2, palette.fang)
    px(target, 33, 8, 3, 2, palette.fang)
    px(target, 31, 10, 3, 2, palette.fang)
    px(target, 32, 8, 2, 2, palette.accent2)
  } else if (features.accessory === 'scarf') {
    px(target, 17, 27, 17, 2, palette.accent2)
    px(target, 30, 29, 3, 5, palette.accent2)
  } else if (features.accessory === 'collar') {
    px(target, 18, 27, 15, 2, palette.accent2)
    px(target, 24, 28, 2, 2, palette.accent)
  } else {
    px(target, 15, 9, 8, 5, ink)
    px(target, 26, 9, 8, 5, ink)
    px(target, 16, 10, 6, 3, palette.lens)
    px(target, 27, 10, 6, 3, palette.lens)
    px(target, 22, 11, 5, 1, ink)
    px(target, 17, 10, 1, 2, colorMix(palette.lensLight, '#ffffff', 0.26))
    px(target, 28, 10, 1, 2, colorMix(palette.lensLight, '#ffffff', 0.26))
    px(target, 19, 10, 1, 1, palette.lensLight)
    px(target, 30, 10, 1, 1, palette.lensLight)
  }
  target.restore()
}

function drawReferenceMascotFace(
  target: CanvasRenderingContext2D,
  palette: PixelPetPalette,
  eyes: PixelPetState['eyes'],
  mouth: PixelPetState['mouth'],
  isBlink: boolean,
  headTilt: number,
  phase = 0,
  settings: Pick<ReferenceDrawSettings, 'motion'> = { motion: true }
): void {
  const ink = palette.ink
  const white = '#fff7dc'
  const iris = colorMix(palette.furDark, '#2f1d1a', 0.34)
  const mouthFrame = settings.motion ? Math.floor(phase * 8) % 4 : 1
  const effectiveMouth = mouth === 'talk' ? (mouthFrame === 0 ? 'talkClosed' : mouthFrame === 2 ? 'talkWide' : 'talkOpen') : mouth
  const customBrow = eyes === 'angry' || eyes === 'cry'
  target.save()
  target.translate(headTilt, 0)
  if (!customBrow) {
    px(target, 15, 17, 6, 1, ink)
    px(target, 28, 17, 6, 1, ink)
  }
  if (isBlink || eyes === 'sleepy') {
    px(target, 16, 20, 6, 1, ink)
    px(target, 27, 20, 6, 1, ink)
  } else if (eyes === 'angry') {
    px(target, 14, 16, 3, 1, ink)
    px(target, 17, 17, 4, 1, ink)
    px(target, 20, 18, 3, 1, ink)
    px(target, 31, 16, 3, 1, ink)
    px(target, 28, 17, 4, 1, ink)
    px(target, 26, 18, 3, 1, ink)
    px(target, 15, 19, 7, 3, ink)
    px(target, 27, 19, 7, 3, ink)
    px(target, 16, 20, 5, 1, white)
    px(target, 28, 20, 5, 1, white)
    px(target, 17, 20, 2, 2, iris)
    px(target, 30, 20, 2, 2, iris)
    px(target, 13, 22, 3, 1, palette.danger)
    px(target, 33, 22, 3, 1, palette.danger)
  } else if (eyes === 'cry') {
    const tearPulse = settings.motion ? Math.floor(phase * 5) % 2 : 0
    const tear = '#59c8ff'
    px(target, 15, 18, 3, 1, ink)
    px(target, 18, 19, 4, 1, ink)
    px(target, 28, 19, 4, 1, ink)
    px(target, 32, 18, 3, 1, ink)
    px(target, 16, 21, 6, 1, ink)
    px(target, 27, 21, 6, 1, ink)
    px(target, 16, 22, 5, 1, tear)
    px(target, 28, 22, 5, 1, tear)
    px(target, 17, 23 + tearPulse, 2, 4, tear)
    px(target, 30, 23 + (1 - tearPulse), 2, 4, tear)
  } else if (eyes === 'happy') {
    px(target, 16, 20, 1, 1, ink)
    px(target, 17, 19, 4, 1, ink)
    px(target, 21, 20, 1, 1, ink)
    px(target, 27, 20, 1, 1, ink)
    px(target, 28, 19, 4, 1, ink)
    px(target, 32, 20, 1, 1, ink)
  } else if (eyes === 'shock') {
    px(target, 15, 18, 7, 5, ink)
    px(target, 27, 18, 7, 5, ink)
    px(target, 16, 19, 5, 3, white)
    px(target, 28, 19, 5, 3, white)
    px(target, 18, 20, 2, 2, iris)
    px(target, 30, 20, 2, 2, iris)
  } else if (eyes === 'confused') {
    px(target, 15, 18, 7, 4, ink)
    px(target, 28, 19, 5, 2, ink)
    px(target, 16, 19, 5, 2, white)
    px(target, 17, 19, 2, 2, iris)
    px(target, 30, 19, 2, 1, white)
  } else {
    px(target, 15, 18, 7, 4, ink)
    px(target, 27, 18, 7, 4, ink)
    px(target, 16, 19, 5, 2, white)
    px(target, 28, 19, 5, 2, white)
    px(target, 17, 19, 3, 3, iris)
    px(target, 30, 19, 3, 3, iris)
    px(target, 18, 19, 1, 1, white)
    px(target, 31, 19, 1, 1, white)
  }

  if (effectiveMouth === 'talkClosed') {
    px(target, 22, 25, 7, 1, ink)
    px(target, 23, 26, 5, 1, ink)
  } else if (effectiveMouth === 'talkOpen') {
    px(target, 22, 24, 7, 4, ink)
    px(target, 23, 25, 5, 2, palette.blush)
    px(target, 24, 24, 2, 1, palette.fang)
  } else if (effectiveMouth === 'talkWide') {
    px(target, 21, 24, 9, 4, ink)
    px(target, 22, 25, 7, 2, palette.blush)
    px(target, 23, 24, 2, 1, palette.fang)
    px(target, 28, 24, 1, 2, palette.fang)
  } else if (effectiveMouth === 'snarl') {
    px(target, 20, 24, 10, 4, ink)
    px(target, 21, 25, 8, 1, palette.fang)
    px(target, 22, 26, 6, 1, colorMix(palette.fang, palette.danger, 0.12))
    px(target, 21, 24, 2, 2, palette.fang)
    px(target, 28, 24, 1, 2, palette.fang)
    px(target, 22, 28, 7, 1, ink)
  } else if (effectiveMouth === 'crying') {
    px(target, 22, 25, 1, 1, ink)
    px(target, 23, 24, 2, 1, ink)
    px(target, 25, 24, 3, 1, ink)
    px(target, 28, 25, 1, 1, ink)
    px(target, 23, 26, 5, 2, ink)
    px(target, 24, 27, 3, 1, palette.blush)
  } else if (effectiveMouth === 'wave') {
    px(target, 21, 25, 2, 1, ink)
    px(target, 23, 26, 3, 1, ink)
    px(target, 26, 25, 2, 1, ink)
    px(target, 28, 24, 1, 1, ink)
  } else if (effectiveMouth === 'smallOpen') {
    px(target, 23, 25, 4, 3, ink)
    px(target, 24, 26, 2, 1, palette.blush)
  } else if (effectiveMouth === 'flat' || effectiveMouth === 'tiny') {
    px(target, 22, 26, 6, 1, ink)
  } else if (effectiveMouth === 'sleep') {
    px(target, 23, 25, 1, 1, ink)
    px(target, 24, 26, 2, 1, ink)
    px(target, 26, 25, 1, 1, ink)
  } else {
    px(target, 21, 25, 2, 1, ink)
    px(target, 23, 26, 4, 1, ink)
    px(target, 27, 25, 3, 1, ink)
    px(target, 29, 24, 1, 1, ink)
    px(target, 28, 26, 1, 2, palette.fang)
  }
  target.restore()
}

function drawReferenceMascotSitting(target: CanvasRenderingContext2D, palette: PixelPetPalette, phase: number, settings: ReferenceDrawSettings, headTilt: number, state: PixelPetState, features: PixelPetFeatures): void {
  const ink = palette.ink
  const pawLift = settings.motion ? Math.floor(phase * 4) % 2 : 0
  px(target, 34, 33, 5, 4, ink)
  px(target, 38, 31, 5, 5, ink)
  px(target, 40, 34, 4, 5, ink)
  px(target, 35, 34, 4, 2, palette.mane)
  px(target, 38, 32, 4, 4, palette.furDark)
  px(target, 41, 35, 2, 3, palette.belly)
  px(target, 12, 28, 24, 12, ink)
  px(target, 13, 29, 22, 10, palette.fur)
  px(target, 18, 29, 12, 11, palette.belly)
  px(target, 20, 30, 8, 9, colorMix(palette.belly, '#ffffff', 0.18))
  px(target, 14, 31, 3, 2, palette.spot)
  px(target, 31, 34, 2, 2, palette.spot)
  px(target, 14, 37, 9, 4, ink)
  px(target, 26, 37, 9, 4, ink)
  px(target, 15, 37, 7, 3, palette.fur)
  px(target, 27, 37, 7, 3, palette.fur)
  px(target, 13, 40, 10, 2, palette.shoe)
  px(target, 26, 40, 10, 2, palette.shoe)
  px(target, 11, 31 + pawLift, 8, 3, ink)
  px(target, 12, 31 + pawLift, 6, 2, palette.fur)
  px(target, 30, 31 - pawLift, 8, 3, ink)
  px(target, 31, 31 - pawLift, 6, 2, palette.fur)
  target.save()
  target.translate(0, 9)
  drawReferenceMascotEarsAndMane(target, palette, headTilt, phase, settings, features)
  drawReferenceMascotHead(target, palette, headTilt)
  drawReferenceMascotAccessory(target, palette, headTilt, features)
  drawReferenceMascotFace(target, palette, state.eyes, state.mouth, false, headTilt, phase, settings)
  target.restore()
}

function drawReferenceMascotSleeping(target: CanvasRenderingContext2D, palette: PixelPetPalette, phase: number, settings: ReferenceDrawSettings, features: PixelPetFeatures): void {
  const breathe = settings.motion ? Math.round(Math.sin(phase * 2) > 0 ? 1 : 0) : 0
  const ink = palette.ink
  px(target, 25, 31 - breathe, 15, 10 + breathe, ink)
  px(target, 26, 32 - breathe, 13, 8 + breathe, palette.fur)
  px(target, 29, 33 - breathe, 8, 6 + breathe, palette.belly)
  px(target, 38, 32, 5, 4, ink)
  px(target, 39, 33, 4, 3, palette.furDark)
  px(target, 40, 36, 3, 3, palette.belly)
  px(target, 32, 39, 9, 2, palette.shoe)
  px(target, 27, 34, 2, 2, palette.spot)
  px(target, 35, 35, 2, 2, palette.spot)
  px(target, 12, 37, 12, 3, ink)
  px(target, 13, 37, 10, 2, palette.fur)
  px(target, 22, 38, 7, 2, ink)
  px(target, 23, 38, 5, 1, palette.fur)
  target.save()
  target.translate(0, 12)
  drawReferenceMascotEarsAndMane(target, palette, 0, phase, { ...settings, motion: false }, features)
  drawReferenceMascotHead(target, palette, 0)
  drawReferenceMascotAccessory(target, palette, 0, features)
  drawReferenceMascotFace(target, palette, 'sleepy', 'sleep', false, 0)
  target.restore()
  px(target, 12, 42, 28, 1, 'rgba(82, 55, 39, 0.14)')
}

function drawReferenceMascotProp(target: CanvasRenderingContext2D, palette: PixelPetPalette, prop: PixelPetState['prop'], phase: number, settings: ReferenceDrawSettings): void {
  if (!prop) return
  const alt = settings.motion ? Math.floor(phase * 6) % 2 : 0
  const ink = palette.ink
  const panel = colorMix(palette.belly, '#ffffff', 0.18)
  if (prop === 'bubble') {
    px(target, 5, 10, 10, 6, ink)
    px(target, 6, 11, 8, 4, '#ffffff')
    px(target, 9, 16, 2, 2, ink)
    px(target, 7, 12, 2, 2, palette.accent)
    px(target, 11, 12, 2, 2, palette.accent2)
  } else if (prop === 'book') {
    px(target, 16, 31, 8, 7, ink)
    px(target, 24, 31, 8, 7, ink)
    px(target, 17, 32, 7, 5, palette.belly)
    px(target, 25, 32, 6, 5, panel)
    px(target, 24, 31, 1, 7, palette.inkSoft)
    px(target, 19, 34, 3, 1, palette.accent2)
    px(target, 27, 34, 3, 1, palette.accent)
  } else if (prop === 'headphones') {
    px(target, 13, 16, 2, 7, ink)
    px(target, 34, 16, 2, 7, ink)
    px(target, 14, 14, 2, 2, palette.accent)
    px(target, 32, 14, 2, 2, palette.accent)
    px(target, 16, 12, 16, 1, ink)
    px(target, 18, 11, 12, 1, palette.accent2)
  } else if (prop === 'browser') {
    const scroll = settings.motion ? Math.floor(phase * 5) % 4 : 1
    px(target, 31, 21, 15, 18, ink)
    px(target, 32, 22, 13, 16, '#eef8ff')
    px(target, 33, 23, 11, 3, colorMix(palette.accent, '#ffffff', 0.35))
    px(target, 34, 28 - scroll, 8, 1, palette.accent)
    px(target, 34, 31 - scroll, 6, 1, palette.accent2)
    px(target, 34, 34 - scroll, 9, 1, colorMix(palette.accent, '#000000', 0.06))
    px(target, 34, 37 - scroll, 5, 1, palette.accent)
    px(target, 36 + alt, 40, 4, 1, palette.accent2)
  } else if (prop === 'codeRig') {
    const cursor = settings.motion ? Math.floor(phase * 6) % 2 : 1
    px(target, 8, 30, 32, 12, ink)
    px(target, 10, 31, 28, 9, '#1d293d')
    drawReferencePixelString(target, 12, 33, '101', palette.accent, 1, 1)
    drawReferencePixelString(target, 23, 33, '0', palette.accent2, 1, 1)
    drawReferencePixelString(target, 12, 37, '0 10', colorMix(palette.accent, '#ffffff', 0.24), 1, 1)
    if (cursor) px(target, 34, 37, 2, 4, palette.accent2)
    px(target, 6, 42, 36, 3, ink)
    px(target, 13, 41, 22, 1, palette.inkSoft)
    px(target, 18 + alt * 6, 43, 4, 1, colorMix(palette.accent2, '#ffffff', 0.2))
  } else if (prop === 'magnifier') {
    px(target, 34, 28, 7, 7, ink)
    px(target, 35, 29, 5, 5, '#ffffff')
    px(target, 36, 30, 3, 3, colorMix(palette.accent, '#ffffff', 0.46))
    px(target, 40, 34, 2, 2, ink)
    px(target, 42, 36, 2, 2, palette.shoe)
  } else if (prop === 'cards') {
    px(target, 12, 31, 9, 8, ink)
    px(target, 22, 30, 9, 8, ink)
    px(target, 17, 35, 9, 8, ink)
    px(target, 13, 32, 7, 6, '#ffffff')
    px(target, 23, 31, 7, 6, panel)
    px(target, 18, 36, 7, 6, colorMix(palette.accent, '#ffffff', 0.62))
    px(target, 15, 34, 3, 1, palette.accent2)
    px(target, 25, 33, 3, 1, palette.accent)
  } else if (prop === 'battery') {
    const fill = 1 + (settings.motion ? Math.floor(phase * 2) % 4 : 3)
    px(target, 36, 31, 8, 12, ink)
    px(target, 38, 29, 4, 2, ink)
    px(target, 37, 32, 6, 10, '#ffffff')
    px(target, 38, 41 - fill * 2, 4, fill * 2, palette.accent)
    px(target, 31, 39, 5, 1, palette.accent2)
    px(target, 29, 38, 2, 2, palette.accent2)
  }
}

function drawReferenceMascotDetails(target: CanvasRenderingContext2D, palette: PixelPetPalette, state: PixelPetState, phase: number, settings: ReferenceDrawSettings, features: PixelPetFeatures): void {
  const pulse = settings.motion ? Math.floor(phase * 4) % 2 : 0
  px(target, 15, 14, 6, 1, colorMix(palette.fur, '#ffffff', 0.28))
  px(target, 27, 14, 6, 1, colorMix(palette.fur, '#ffffff', 0.18))
  px(target, 19, 23, 3, 1, colorMix(palette.muzzle, '#ffffff', 0.16))
  px(target, 24, 19, 2, 1, colorMix(palette.lensLight, '#ffffff', 0.24))
  px(target, 20, 29, 8, 1, colorMix(palette.belly, '#ffffff', 0.3))
  px(target, 15, 35, 3, 1, colorMix(palette.spot, '#000000', 0.08))
  px(target, 31, 34 + pulse, 2, 1, palette.spot)
  if (features.accessory === 'flower') px(target, 33, 9, 1, 1, palette.accent2)
  if (state.pose === 'slump') px(target, 20, 39, 8, 1, hexToRgba(palette.accent, 0.2))
}

function drawReferenceActionBackdrop(target: CanvasRenderingContext2D, palette: PixelPetPalette, state: PixelPetState, phase: number, settings: ReferenceDrawSettings): void {
  if (!settings.effects) return
  if (state.fx === 'code') drawReferenceCodeBackdrop(target, palette, phase, settings)
  if (state.fx === 'web') drawReferenceWebBackdrop(target, palette, phase, settings)
}

function drawReferenceCodeBackdrop(target: CanvasRenderingContext2D, palette: PixelPetPalette, phase: number, settings: ReferenceDrawSettings): void {
  const streams = ['0 10', '101', '0101', '1 0', '10 1', '001']
  const scroll = settings.motion ? Math.floor(phase * 7) % 12 : 0
  const inkGlow = colorMix(palette.accent, '#ffffff', 0.28)
  const hotGlow = colorMix(palette.accent2, '#ffffff', 0.18)
  px(target, 4, 8, 19, 40, 'rgba(43, 62, 86, 0.10)')
  px(target, 56, 5, 18, 45, 'rgba(43, 62, 86, 0.08)')
  streams.forEach((text, index) => {
    const side = index % 2
    let y = 6 + index * 9 - scroll
    while (y < -6) y += 58
    const x = side ? 56 + (index % 3) * 2 : 5 + (index % 3)
    drawReferencePixelString(target, x, y, text, index === Math.floor(phase * 2) % streams.length ? hotGlow : inkGlow, 1, 1)
  })
}

function drawReferenceWebBackdrop(target: CanvasRenderingContext2D, palette: PixelPetPalette, phase: number, settings: ReferenceDrawSettings): void {
  const drift = settings.motion ? Math.floor(phase * 5) % 18 : 0
  const cards = [
    { x: 5, y: 10, w: 18, h: 12, speed: 1 },
    { x: 55, y: 8, w: 19, h: 14, speed: -1 },
    { x: 3, y: 40, w: 21, h: 11, speed: -1 },
    { x: 58, y: 43, w: 16, h: 10, speed: 1 },
  ]
  cards.forEach((card, index) => {
    const y = card.y + Math.round(Math.sin((phase + index) * 1.7) * 2) + (card.speed * drift) % 6
    px(target, card.x, y, card.w, card.h, 'rgba(70, 90, 113, 0.20)')
    px(target, card.x + 1, y + 1, card.w - 2, card.h - 2, index % 2 === 0 ? 'rgba(255, 255, 255, 0.72)' : 'rgba(229, 246, 255, 0.72)')
    px(target, card.x + 2, y + 2, card.w - 4, 2, colorMix(palette.accent, '#ffffff', 0.28))
    px(target, card.x + 3, y + 6, card.w - 8, 1, palette.accent)
    px(target, card.x + 3, y + 8, Math.max(4, card.w - 11), 1, palette.accent2)
  })
}

function drawReferenceActionCues(target: CanvasRenderingContext2D, palette: PixelPetPalette, state: PixelPetState, phase: number, settings: ReferenceDrawSettings, features: PixelPetFeatures): void {
  if (!settings.effects) return
  const pulse = settings.motion ? Math.floor(phase * 6) % 2 : 0
  const accentSoft = colorMix(palette.accent, '#ffffff', 0.3)
  if (state.pose === 'walk') {
    const step = Math.floor(phase * 6) % 2
    px(target, 9 + step * 3, 43, 5, 1, 'rgba(82, 55, 39, 0.20)')
    px(target, 31 - step * 2, 43, 5, 1, 'rgba(82, 55, 39, 0.16)')
  }
  if (state.pose === 'jump') {
    px(target, 10, 33 + pulse, 1, 6, accentSoft)
    px(target, 37, 34 - pulse, 1, 5, palette.accent2)
  }
  if (state.pose === 'stomp' || state.pose === 'error') {
    px(target, 12, 42, 7, 1, palette.danger)
    px(target, 28, 42, 7, 1, palette.danger)
  }
  if (state.pose === 'think') {
    px(target, 37, 13 - pulse, 2, 2, accentSoft)
    px(target, 41, 10 + pulse, 2, 2, palette.accent2)
  }
  if (state.prop === 'headphones') {
    ;[0, 1, 2].forEach((bar) => {
      const height = 2 + ((Math.floor(phase * 5) + bar) % 3)
      px(target, 40 + bar * 2, 18 - height, 1, height, bar % 2 ? palette.accent2 : palette.accent)
    })
  }
  if (features.avatarType === 'mascot' && state.pose !== 'sleep') px(target, 16, 41, 16, 1, 'rgba(82, 55, 39, 0.12)')
}

function drawReferenceSpriteEffects(target: CanvasRenderingContext2D, palette: PixelPetPalette, fx: PixelPetState['fx'], phase: number, settings: ReferenceDrawSettings): void {
  if (!settings.effects) return
  target.save()
  target.translate(PIXEL_PET_SPRITE_X, PIXEL_PET_SPRITE_Y)
  drawReferenceEffects(target, palette, fx, phase, settings)
  target.restore()
}

function drawReferenceEffects(target: CanvasRenderingContext2D, palette: PixelPetPalette, fx: PixelPetState['fx'], phase: number, settings: ReferenceDrawSettings): void {
  const active = Math.floor(phase * 3) % 3
  if (fx === 'dots') {
    ;[0, 1, 2].forEach((dot) => px(target, 7 + dot * 5, 7 - (dot === active ? 1 : 0), 2, 2, dot === active ? palette.accent2 : colorMix(palette.accent2, '#000000', 0.42)))
  } else if (fx === 'sparkle') {
    const lift = Math.floor(Math.sin(phase * 2) + 1)
    drawReferenceSpark(target, 11, 10 - lift, palette.accent2)
    drawReferenceSpark(target, 36, 13 + lift, palette.accent)
    drawReferenceSpark(target, 9, 29, palette.accent)
  } else if (fx === 'question') {
    drawReferencePixelText(target, 40, 5 + Math.round(Math.sin(phase * 2) * 1), '?', palette.accent2, 2)
  } else if (fx === 'exclaim') {
    drawReferencePixelText(target, 45, 4, '!', palette.danger, 2)
    px(target, 4, 24, 3, 5, '#75d6ff')
    px(target, 5, 30, 2, 2, '#75d6ff')
  } else if (fx === 'rage') {
    const pulse = settings.motion ? Math.floor(phase * 8) % 2 : 0
    drawReferencePixelText(target, 43, 3 - pulse, '!', palette.danger, 2)
    px(target, 7, 8, 3, 2, palette.danger)
    px(target, 10, 6, 2, 2, palette.danger)
  } else if (fx === 'tears') {
    const drop = settings.motion ? Math.floor(phase * 6) % 7 : 3
    px(target, 14, 23 + drop, 2, 3, '#59c8ff')
    px(target, 33, 22 + ((drop + 3) % 7), 2, 3, '#59c8ff')
  } else if (fx === 'zzz') {
    const drift = Math.floor(phase * 2) % 3
    drawReferencePixelText(target, 35, 8 - drift, 'Z', palette.accent, 1)
    drawReferencePixelText(target, 40, 3 - drift, 'Z', colorMix(palette.accent, '#ffffff', 0.28), 1)
  } else if (fx === 'flow') {
    const offset = Math.floor(phase * 10) % 14
    px(target, 17 + offset, 39, 2, 1, palette.accent2)
    px(target, 31 - offset, 32, 1, 1, palette.accent)
  } else if (fx === 'idea') {
    const lift = Math.floor(Math.sin(phase * 2) + 1)
    px(target, 42, 4 - lift, 6, 6, palette.accent2)
    px(target, 44, 10 - lift, 2, 2, palette.ink)
  } else if (fx === 'music') {
    const bounce = Math.floor(phase * 4) % 2
    px(target, 39, 5 - bounce, 2, 8, palette.accent)
    px(target, 41, 5 - bounce, 5, 2, palette.accent)
    px(target, 45, 7 - bounce, 2, 7, palette.accent)
    px(target, 37, 13 - bounce, 4, 3, palette.accent2)
    px(target, 43, 14 - bounce, 4, 3, palette.accent2)
  } else if (fx === 'book') {
    px(target, 8, 11, 2, 1, palette.accent2)
    px(target, 11, 9, 2, 1, colorMix(palette.accent2, '#ffffff', 0.18))
    px(target, 14, 12, 2, 1, palette.accent)
  } else if (fx === 'code' || fx === 'web') {
    px(target, 42, 8, 1, 1, palette.accent)
    px(target, 40, 6, 1, 1, palette.accent)
    px(target, 44, 6, 1, 1, palette.accent2)
  }
}

function drawReferenceSpark(target: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  px(target, x + 1, y, 1, 3, color)
  px(target, x, y + 1, 3, 1, color)
  px(target, x + 1, y + 1, 1, 1, '#ffffff')
}

function drawReferencePixelText(target: CanvasRenderingContext2D, x: number, y: number, glyph: keyof typeof REFERENCE_GLYPHS, color: string, scale = 1): void {
  const map = REFERENCE_GLYPHS[glyph]
  map.forEach((row, rowIndex) => {
    row.split('').forEach((cell, columnIndex) => {
      if (cell === '1') px(target, x + columnIndex * scale, y + rowIndex * scale, scale, scale, color)
    })
  })
}

function drawReferencePixelString(target: CanvasRenderingContext2D, x: number, y: number, text: string, color: string, scale = 1, gap = 1): void {
  let cursor = x
  String(text).split('').forEach((glyph) => {
    if (glyph === ' ') {
      cursor += 3 * scale + gap
      return
    }
    if (!(glyph in REFERENCE_GLYPHS)) {
      cursor += 3 * scale + gap
      return
    }
    const typedGlyph = glyph as keyof typeof REFERENCE_GLYPHS
    drawReferencePixelText(target, cursor, y, typedGlyph, color, scale)
    cursor += Math.max(...REFERENCE_GLYPHS[typedGlyph].map((row) => row.length)) * scale + gap
  })
}

const REFERENCE_GLYPHS = {
  '?': ['1110', '0001', '0010', '0100', '0000', '0100'],
  '!': ['1', '1', '1', '1', '0', '1'],
  Z: ['111', '001', '010', '100', '111'],
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
}

function drawGround(target: CanvasRenderingContext2D, palette: PixelPetPalette, pose: PixelPetState['pose'], phase: number, jump: number): void {
  const width = pose === 'sleep' ? 42 : 36 - Math.round(jump / 2)
  const x = Math.round((PIXEL_PET_WIDTH - width) / 2)
  const y = 56
  px(target, x + 4, y, width - 8, 2, hexToRgba(palette.ink, 0.16))
  px(target, x, y + 2, width, 2, hexToRgba(palette.ink, 0.08))
  if (pose === 'walk') px(target, 23 + Math.round(Math.sin(phase) * 3), y - 2, 6, 1, hexToRgba(palette.accent, 0.24))
}

function drawMascotPet(
  target: CanvasRenderingContext2D,
  state: PixelPetState,
  palette: PixelPetPalette,
  features: PixelPetFeatures,
  phase: number,
  tick: number,
  motion: boolean,
  intensity: number
): void {
  if (state.pose === 'sleep') {
    drawMascotSleeping(target, palette, phase, motion)
    return
  }
  const headTilt = state.pose === 'tilt' ? Math.round(Math.sin(phase) * 2 || 2) : state.pose === 'slump' ? 2 : 0
  drawMascotTail(target, palette, features, phase, motion)
  drawMascotLegs(target, palette, state.pose, tick)
  drawMascotBody(target, palette, features, state.pose)
  drawMascotArms(target, palette, state.arms, phase, motion, intensity)
  drawMascotEars(target, palette, features, headTilt)
  drawMascotMane(target, palette, features, headTilt)
  drawMascotHead(target, palette, headTilt, state.pose)
  drawMascotFace(target, palette, state.eyes, state.mouth, headTilt, phase, motion)
  drawMascotAccessory(target, palette, features, headTilt)
}

function drawMascotSleeping(target: CanvasRenderingContext2D, palette: PixelPetPalette, phase: number, motion: boolean): void {
  const breath = motion ? Math.round(Math.sin(phase) * 1) : 0
  px(target, 7, 24 + breath, 35, 15, palette.ink)
  px(target, 9, 26 + breath, 31, 11, palette.fur)
  px(target, 6, 28 + breath, 8, 10, palette.ink)
  px(target, 39, 28 + breath, 6, 10, palette.ink)
  px(target, 8, 29 + breath, 5, 7, palette.earInner)
  px(target, 36, 29 + breath, 4, 7, palette.earInner)
  px(target, 18, 19 + breath, 13, 6, palette.ink)
  px(target, 19, 20 + breath, 11, 4, palette.mane)
  px(target, 16, 31 + breath, 17, 7, palette.muzzle)
  px(target, 18, 32 + breath, 5, 1, palette.ink)
  px(target, 27, 32 + breath, 5, 1, palette.ink)
  px(target, 22, 35 + breath, 6, 1, palette.ink)
  px(target, 17, 38 + breath, 22, 5, palette.ink)
  px(target, 18, 38 + breath, 20, 3, palette.belly)
}

function drawMascotTail(target: CanvasRenderingContext2D, palette: PixelPetPalette, features: PixelPetFeatures, phase: number, motion: boolean): void {
  if (features.tailStyle === 'none') return
  const wag = motion ? Math.round(Math.sin(phase) * 2) : 0
  if (features.tailStyle === 'curled') {
    px(target, 35, 32 + wag, 10, 4, palette.ink)
    px(target, 41, 28 + wag, 4, 8, palette.ink)
    px(target, 36, 33 + wag, 8, 2, palette.furDark)
    px(target, 40, 29 + wag, 2, 6, palette.furDark)
    return
  }
  px(target, 35, 31 + wag, 8, 5, palette.ink)
  px(target, 42, 28 + wag, 5, 8, palette.ink)
  px(target, 36, 32 + wag, 8, 3, palette.furDark)
  px(target, 43, 29 + wag, 3, 5, palette.accent2)
}

function drawMascotLegs(target: CanvasRenderingContext2D, palette: PixelPetPalette, pose: PixelPetState['pose'], tick: number): void {
  if (pose === 'sit') {
    px(target, 14, 41, 20, 6, palette.ink)
    px(target, 16, 40, 6, 5, palette.furDark)
    px(target, 27, 40, 6, 5, palette.furDark)
    px(target, 15, 46, 9, 2, palette.shoe)
    px(target, 27, 46, 9, 2, palette.shoe)
    return
  }
  px(target, 15, 40 + Math.max(0, tick), 8, 8, palette.ink)
  px(target, 27, 40 + Math.max(0, -tick), 8, 8, palette.ink)
  px(target, 17, 40 + Math.max(0, tick), 5, 6, palette.furDark)
  px(target, 29, 40 + Math.max(0, -tick), 5, 6, palette.furDark)
  px(target, 15, 47 + Math.max(0, tick), 10, 2, palette.shoe)
  px(target, 27, 47 + Math.max(0, -tick), 10, 2, palette.shoe)
}

function drawMascotBody(target: CanvasRenderingContext2D, palette: PixelPetPalette, features: PixelPetFeatures, pose: PixelPetState['pose']): void {
  const y = pose === 'sit' ? 28 : 29
  px(target, 13, y, 23, 16, palette.ink)
  px(target, 15, y + 1, 19, 13, palette.fur)
  px(target, 19, y + 2, 11, 12, palette.belly)
  if (features.spotStyle === 'stripes') {
    px(target, 15, y + 4, 4, 2, palette.spot)
    px(target, 31, y + 5, 3, 2, palette.spot)
  } else if (features.spotStyle === 'heart') {
    px(target, 16, y + 5, 2, 2, palette.spot)
    px(target, 18, y + 6, 2, 2, palette.spot)
  } else if (features.spotStyle !== 'none') {
    px(target, 16, y + 5, 3, 3, palette.spot)
    px(target, 31, y + 8, 3, 3, palette.spot)
  }
}

function drawMascotArms(target: CanvasRenderingContext2D, palette: PixelPetPalette, armType: PixelPetState['arms'], phase: number, motion: boolean, intensity: number): void {
  const wave = armType === 'wave' && motion ? Math.round(Math.sin(phase) * 3 * intensity) : 0
  if (armType === 'panic') {
    px(target, 8, 26, 6, 15, palette.ink)
    px(target, 9, 27, 3, 11, palette.furDark)
    px(target, 35, 25, 6, 15, palette.ink)
    px(target, 36, 26, 3, 11, palette.furDark)
    return
  }
  if (armType === 'think') {
    px(target, 10, 32, 7, 8, palette.ink)
    px(target, 11, 33, 4, 5, palette.furDark)
    px(target, 32, 26, 5, 12, palette.ink)
    px(target, 33, 27, 3, 9, palette.furDark)
    return
  }
  if (armType === 'sleep') {
    px(target, 10, 36, 7, 5, palette.ink)
    px(target, 33, 36, 7, 5, palette.ink)
    px(target, 12, 36, 4, 3, palette.furDark)
    px(target, 34, 36, 4, 3, palette.furDark)
    return
  }
  if (armType === 'type' || armType === 'swipe' || armType === 'book') {
    px(target, 10, 32, 7, 8, palette.ink)
    px(target, 33, 32, 7, 8, palette.ink)
    px(target, 12, 33, 4, 5, palette.furDark)
    px(target, 34, 33, 4, 5, palette.furDark)
    return
  }
  px(target, 8, 31 - Math.max(0, wave), 7, 11, palette.ink)
  px(target, 10, 32 - Math.max(0, wave), 4, 8, palette.furDark)
  px(target, 34, 31 + Math.min(0, wave), 7, 11, palette.ink)
  px(target, 35, 32 + Math.min(0, wave), 4, 8, palette.furDark)
}

function drawMascotEars(target: CanvasRenderingContext2D, palette: PixelPetPalette, features: PixelPetFeatures, headTilt: number): void {
  const leftY = 12 + Math.max(0, headTilt)
  const rightY = 12 + Math.max(0, -headTilt)
  if (features.earShape === 'long') {
    px(target, 1, leftY, 9, 17, palette.ink)
    px(target, 39, rightY, 8, 17, palette.ink)
    px(target, 4, leftY + 3, 4, 11, palette.earInner)
    px(target, 40, rightY + 3, 4, 11, palette.earInner)
    return
  }
  if (features.earShape === 'pointy') {
    px(target, 5, leftY + 4, 8, 10, palette.ink)
    px(target, 2, leftY + 8, 8, 9, palette.ink)
    px(target, 38, rightY + 4, 8, 10, palette.ink)
    px(target, 40, rightY + 8, 8, 9, palette.ink)
    px(target, 6, leftY + 8, 4, 8, palette.earInner)
    px(target, 40, rightY + 8, 4, 8, palette.earInner)
    return
  }
  px(target, 2, leftY + 5, 10, 13, palette.ink)
  px(target, 38, rightY + 5, 9, 13, palette.ink)
  px(target, 5, leftY + 8, 5, 8, palette.earInner)
  px(target, 40, rightY + 8, 4, 8, palette.earInner)
}

function drawMascotMane(target: CanvasRenderingContext2D, palette: PixelPetPalette, features: PixelPetFeatures, headTilt: number): void {
  if (features.maneStyle === 'none') return
  const y = 3 + Math.round(headTilt / 2)
  if (features.maneStyle === 'long') {
    px(target, 13, y + 1, 23, 9, palette.ink)
    px(target, 15, y + 2, 19, 6, palette.mane)
    px(target, 19, y + 3, 10, 2, palette.maneLight)
    return
  }
  px(target, 18, y, 14, 7, palette.ink)
  px(target, 15, y + 5, 20, 5, palette.ink)
  px(target, 19, y + 1, 12, 5, palette.mane)
  px(target, 17, y + 6, 16, 3, palette.mane)
  px(target, 22, y + 2, 5, 2, palette.maneLight)
}

function drawMascotHead(target: CanvasRenderingContext2D, palette: PixelPetPalette, headTilt: number, pose: PixelPetState['pose']): void {
  const y = pose === 'slump' ? 12 : 10
  px(target, 8 + headTilt, y, 32, 22, palette.ink)
  px(target, 10 + headTilt, y + 2, 28, 18, palette.fur)
  px(target, 13 + headTilt, y + 18, 23, 4, palette.furDark)
  px(target, 17 + headTilt, y + 14, 14, 9, palette.muzzle)
  px(target, 14 + headTilt, y + 21, 4, 3, palette.blush)
  px(target, 31 + headTilt, y + 21, 4, 3, palette.blush)
}

function drawMascotFace(
  target: CanvasRenderingContext2D,
  palette: PixelPetPalette,
  eyes: PixelPetState['eyes'],
  mouth: PixelPetState['mouth'],
  headTilt: number,
  phase: number,
  motion: boolean
): void {
  const blink = motion && Math.sin(phase * 0.55) > 0.96
  const x = headTilt
  if (eyes === 'shock') {
    px(target, 14 + x, 17, 7, 7, palette.ink)
    px(target, 28 + x, 17, 7, 7, palette.ink)
    px(target, 16 + x, 19, 3, 3, palette.fang)
    px(target, 30 + x, 19, 3, 3, palette.fang)
  } else if (eyes === 'sleepy') {
    px(target, 15 + x, 19, 6, 1, palette.ink)
    px(target, 29 + x, 19, 6, 1, palette.ink)
  } else if (eyes === 'happy') {
    px(target, 15 + x, 18, 6, 2, palette.ink)
    px(target, 29 + x, 18, 6, 2, palette.ink)
    px(target, 16 + x, 17, 3, 1, palette.ink)
    px(target, 31 + x, 17, 3, 1, palette.ink)
  } else if (eyes === 'angry') {
    px(target, 14 + x, 16, 8, 2, palette.ink)
    px(target, 29 + x, 16, 8, 2, palette.ink)
    px(target, 17 + x, 20, 3, 3, palette.fang)
    px(target, 30 + x, 20, 3, 3, palette.fang)
  } else if (eyes === 'cry') {
    px(target, 15 + x, 18, 6, 5, palette.ink)
    px(target, 29 + x, 18, 6, 5, palette.ink)
    px(target, 17 + x, 20, 2, 2, palette.fang)
    px(target, 31 + x, 20, 2, 2, palette.fang)
    px(target, 13 + x, 23, 2, 4, palette.accent)
    px(target, 35 + x, 23, 2, 4, palette.accent)
  } else {
    px(target, 15 + x, 18, 6, blink ? 1 : 5, palette.ink)
    px(target, 29 + x, 18, 6, blink ? 1 : 5, palette.ink)
    if (!blink) {
      px(target, 17 + x, 20, 2, 2, palette.fang)
      px(target, 31 + x, 20, 2, 2, palette.fang)
    }
  }
  if (mouth === 'bigSmile') {
    px(target, 21 + x, 26, 9, 3, palette.ink)
    px(target, 23 + x, 27, 5, 1, palette.fang)
  } else if (mouth === 'snarl') {
    px(target, 20 + x, 25, 10, 2, palette.ink)
    px(target, 21 + x, 27, 2, 3, palette.fang)
    px(target, 27 + x, 27, 2, 3, palette.fang)
  } else if (mouth === 'smallOpen' || mouth === 'talk' || mouth === 'wave') {
    const open = mouth === 'talk' && motion ? 1 + Math.round(Math.abs(Math.sin(phase * 2)) * 2) : 3
    px(target, 22 + x, 25, 7, open, palette.ink)
    px(target, 24 + x, 26, 3, 1, palette.blush)
  } else if (mouth === 'flat') {
    px(target, 22 + x, 26, 7, 1, palette.ink)
  } else if (mouth === 'sleep') {
    px(target, 22 + x, 25, 7, 1, palette.ink)
    px(target, 23 + x, 26, 5, 1, palette.ink)
  } else {
    px(target, 22 + x, 25, 6, 2, palette.ink)
    px(target, 23 + x, 25, 4, 1, palette.fang)
  }
}

function drawMascotAccessory(target: CanvasRenderingContext2D, palette: PixelPetPalette, features: PixelPetFeatures, headTilt: number): void {
  const x = headTilt
  if (features.accessory === 'sunglasses') {
    px(target, 12 + x, 15, 11, 6, palette.ink)
    px(target, 27 + x, 15, 11, 6, palette.ink)
    px(target, 14 + x, 16, 7, 3, palette.lens)
    px(target, 29 + x, 16, 7, 3, palette.lens)
    px(target, 16 + x, 16, 3, 1, palette.lensLight)
    px(target, 31 + x, 16, 3, 1, palette.lensLight)
    px(target, 23 + x, 17, 4, 2, palette.ink)
  } else if (features.accessory === 'bow') {
    px(target, 32 + x, 7, 4, 4, palette.danger)
    px(target, 38 + x, 7, 4, 4, palette.danger)
    px(target, 36 + x, 8, 2, 2, palette.accent2)
  } else if (features.accessory === 'collar' || features.accessory === 'scarf') {
    px(target, 17, 30, 16, 3, palette.danger)
    px(target, 30, 31, 5, 5, palette.accent2)
  }
}

function drawHumanPet(
  target: CanvasRenderingContext2D,
  state: PixelPetState,
  palette: PixelPetPalette,
  features: PixelPetFeatures,
  phase: number,
  tick: number,
  motion: boolean,
  intensity: number
): void {
  if (state.pose === 'sleep') {
    drawHumanSleeping(target, palette, phase, motion)
    return
  }
  if (features.characterStyle === 'blueCompanion' && state.pose === 'idle') {
    drawBlueCompanionStanding(target, palette, phase, motion)
    return
  }
  const headTilt = state.pose === 'tilt' ? 2 : state.pose === 'slump' ? 1 : 0
  drawHumanBackHair(target, palette, features, phase, motion)
  drawHumanLegs(target, palette, state.pose, tick)
  drawHumanBody(target, palette, state.pose)
  drawHumanArms(target, palette, state.arms, phase, motion, intensity)
  drawHumanHead(target, palette, features, headTilt)
  drawHumanFace(target, palette, state.eyes, state.mouth, headTilt, phase, motion)
  drawHumanAccessory(target, palette, features, headTilt)
}

function drawHumanSleeping(target: CanvasRenderingContext2D, palette: PixelPetPalette, phase: number, motion: boolean): void {
  const breath = motion ? Math.round(Math.sin(phase) * 1) : 0
  px(target, 9, 27 + breath, 31, 13, palette.ink)
  px(target, 11, 28 + breath, 27, 10, palette.hair || palette.mane)
  px(target, 16, 30 + breath, 18, 9, palette.skin || palette.muzzle)
  px(target, 19, 34 + breath, 5, 1, palette.ink)
  px(target, 29, 34 + breath, 5, 1, palette.ink)
  px(target, 22, 37 + breath, 8, 1, palette.ink)
  px(target, 14, 39 + breath, 24, 6, palette.ink)
  px(target, 16, 39 + breath, 20, 4, palette.shirt)
}

function drawBlueCompanionStanding(target: CanvasRenderingContext2D, palette: PixelPetPalette, phase: number, motion: boolean): void {
  const bob = motion ? Math.round(Math.sin(phase) * 1) : 0
  const ink = palette.ink
  const skin = palette.skin || palette.muzzle
  const hair = palette.hair || palette.mane
  const hairDark = colorMix(hair, ink, 0.32)
  const hairLight = palette.hairLight || palette.maneLight
  const shirt = palette.accent
  const shoe = palette.shoe
  px(target, 11, 13 + bob, 7, 4, ink)
  px(target, 30, 13 + bob, 7, 4, ink)
  px(target, 7, 17 + bob, 10, 18, ink)
  px(target, 31, 17 + bob, 10, 18, ink)
  px(target, 9, 18 + bob, 7, 15, hair)
  px(target, 32, 18 + bob, 7, 15, hairDark)
  px(target, 14, 7 + bob, 22, 10, ink)
  px(target, 15, 8 + bob, 20, 8, hair)
  px(target, 17, 8 + bob, 8, 2, hairLight)
  px(target, 14, 17 + bob, 20, 13, ink)
  px(target, 15, 18 + bob, 18, 11, skin)
  px(target, 17, 21 + bob, 4, 4, ink)
  px(target, 28, 21 + bob, 4, 4, ink)
  px(target, 18, 22 + bob, 2, 2, palette.accent)
  px(target, 29, 22 + bob, 2, 2, palette.accent)
  px(target, 17, 26 + bob, 3, 1, palette.blush)
  px(target, 30, 26 + bob, 3, 1, palette.blush)
  px(target, 23, 26 + bob, 4, 1, ink)
  px(target, 15, 31 + bob, 18, 13, ink)
  px(target, 16, 32 + bob, 16, 10, shirt)
  px(target, 19, 33 + bob, 9, 2, colorMix(shirt, '#ffffff', 0.42))
  px(target, 11, 33 + bob, 5, 11, ink)
  px(target, 34, 33 + bob, 5, 11, ink)
  px(target, 12, 34 + bob, 3, 8, skin)
  px(target, 35, 34 + bob, 3, 8, skin)
  px(target, 18, 44 + bob, 6, 5, ink)
  px(target, 28, 44 + bob, 6, 5, ink)
  px(target, 18, 48 + bob, 8, 2, shoe)
  px(target, 27, 48 + bob, 8, 2, shoe)
  px(target, 33, 8 + bob, 4, 3, palette.accent2)
}

function drawHumanBackHair(target: CanvasRenderingContext2D, palette: PixelPetPalette, features: PixelPetFeatures, phase: number, motion: boolean): void {
  const swing = motion ? Math.round(Math.sin(phase) * 1) : 0
  if (features.maneStyle === 'long') {
    px(target, 9, 12 + swing, 9, 27, palette.ink)
    px(target, 31, 12 - swing, 8, 27, palette.ink)
    px(target, 11, 14 + swing, 6, 22, palette.hair || palette.mane)
    px(target, 32, 14 - swing, 5, 22, colorMix(palette.hair || palette.mane, palette.ink, 0.22))
  }
}

function drawHumanLegs(target: CanvasRenderingContext2D, palette: PixelPetPalette, pose: PixelPetState['pose'], tick: number): void {
  if (pose === 'sit') {
    px(target, 16, 42, 18, 5, palette.ink)
    px(target, 17, 42, 7, 3, palette.pants)
    px(target, 27, 42, 7, 3, palette.pants)
    return
  }
  px(target, 17, 41 + Math.max(0, tick), 7, 8, palette.ink)
  px(target, 27, 41 + Math.max(0, -tick), 7, 8, palette.ink)
  px(target, 18, 41 + Math.max(0, tick), 5, 6, palette.pants)
  px(target, 28, 41 + Math.max(0, -tick), 5, 6, palette.pants)
  px(target, 16, 48 + Math.max(0, tick), 9, 2, palette.shoe)
  px(target, 27, 48 + Math.max(0, -tick), 9, 2, palette.shoe)
}

function drawHumanBody(target: CanvasRenderingContext2D, palette: PixelPetPalette, pose: PixelPetState['pose']): void {
  const y = pose === 'sit' ? 30 : 31
  px(target, 15, y, 19, 13, palette.ink)
  px(target, 16, y + 1, 17, 10, palette.shirt)
  px(target, 19, y + 2, 11, 2, colorMix(palette.shirt, '#ffffff', 0.36))
  px(target, 17, y + 9, 15, 2, palette.shirtDark || colorMix(palette.shirt, palette.ink, 0.2))
}

function drawHumanArms(target: CanvasRenderingContext2D, palette: PixelPetPalette, armType: PixelPetState['arms'], phase: number, motion: boolean, intensity: number): void {
  const wave = armType === 'wave' && motion ? Math.round(Math.sin(phase) * 3 * intensity) : 0
  const skin = palette.skin || palette.muzzle
  if (armType === 'panic') {
    px(target, 10, 27, 5, 13, palette.ink)
    px(target, 35, 27, 5, 13, palette.ink)
    px(target, 11, 28, 3, 10, skin)
    px(target, 36, 28, 3, 10, skin)
    return
  }
  if (armType === 'think') {
    px(target, 12, 32, 5, 8, palette.ink)
    px(target, 33, 27, 5, 11, palette.ink)
    px(target, 13, 33, 3, 5, skin)
    px(target, 34, 28, 3, 8, skin)
    return
  }
  px(target, 11, 32 - Math.max(0, wave), 5, 11, palette.ink)
  px(target, 34, 32 + Math.min(0, wave), 5, 11, palette.ink)
  px(target, 12, 33 - Math.max(0, wave), 3, 8, skin)
  px(target, 35, 33 + Math.min(0, wave), 3, 8, skin)
}

function drawHumanHead(target: CanvasRenderingContext2D, palette: PixelPetPalette, features: PixelPetFeatures, headTilt: number): void {
  const x = headTilt
  const skin = palette.skin || palette.muzzle
  const hair = palette.hair || palette.mane
  px(target, 14 + x, 10, 21, 10, palette.ink)
  px(target, 12 + x, 18, 25, 13, palette.ink)
  px(target, 15 + x, 18, 19, 12, skin)
  px(target, 13 + x, 13, 23, 7, hair)
  px(target, 17 + x, 12, 14, 2, palette.hairLight || palette.maneLight)
  if (features.maneStyle === 'bangs' || features.maneStyle === 'long') {
    px(target, 14 + x, 18, 5, 5, hair)
    px(target, 28 + x, 18, 7, 5, colorMix(hair, palette.ink, 0.18))
  }
}

function drawHumanFace(target: CanvasRenderingContext2D, palette: PixelPetPalette, eyes: PixelPetState['eyes'], mouth: PixelPetState['mouth'], headTilt: number, phase: number, motion: boolean): void {
  const x = headTilt
  const blink = motion && Math.sin(phase * 0.55) > 0.96
  if (eyes === 'sleepy') {
    px(target, 18 + x, 22, 4, 1, palette.ink)
    px(target, 28 + x, 22, 4, 1, palette.ink)
  } else if (eyes === 'shock') {
    px(target, 17 + x, 21, 5, 5, palette.ink)
    px(target, 28 + x, 21, 5, 5, palette.ink)
    px(target, 18 + x, 22, 2, 2, palette.fang)
    px(target, 29 + x, 22, 2, 2, palette.fang)
  } else {
    px(target, 18 + x, 21, 5, blink ? 1 : 4, palette.ink)
    px(target, 28 + x, 21, 5, blink ? 1 : 4, palette.ink)
    if (!blink) {
      px(target, 19 + x, 22, 2, 2, palette.accent)
      px(target, 29 + x, 22, 2, 2, palette.accent)
    }
  }
  px(target, 17 + x, 27, 3, 1, palette.blush)
  px(target, 31 + x, 27, 3, 1, palette.blush)
  if (mouth === 'talk' || mouth === 'smallOpen') {
    px(target, 23 + x, 27, 5, 3, palette.ink)
  } else if (mouth === 'bigSmile') {
    px(target, 22 + x, 27, 7, 2, palette.ink)
    px(target, 24 + x, 27, 3, 1, palette.fang)
  } else if (mouth === 'flat') {
    px(target, 23 + x, 28, 5, 1, palette.ink)
  } else {
    px(target, 23 + x, 27, 4, 1, palette.ink)
  }
}

function drawHumanAccessory(target: CanvasRenderingContext2D, palette: PixelPetPalette, features: PixelPetFeatures, headTilt: number): void {
  const x = headTilt
  if (features.accessory === 'flower') {
    px(target, 35 + x, 10, 2, 2, palette.accent2)
    px(target, 33 + x, 9, 2, 2, palette.danger)
    px(target, 37 + x, 9, 2, 2, palette.danger)
  } else if (features.accessory === 'bow') {
    px(target, 31 + x, 11, 4, 3, palette.danger)
    px(target, 36 + x, 11, 4, 3, palette.danger)
  }
}

function drawProp(target: CanvasRenderingContext2D, state: PixelPetState, palette: PixelPetPalette, features: PixelPetFeatures, phase: number, motion: boolean): void {
  const human = features.avatarType === 'human'
  const xOffset = human ? 0 : 0
  if (state.prop === 'book') {
    px(target, 15 + xOffset, 34, 20, 9, palette.ink)
    px(target, 16 + xOffset, 35, 8, 7, palette.fang)
    px(target, 26 + xOffset, 35, 8, 7, palette.belly)
    px(target, 24 + xOffset, 35, 1, 7, palette.danger)
  } else if (state.prop === 'headphones') {
    px(target, 11, 15, 3, 11, palette.ink)
    px(target, 36, 15, 3, 11, palette.ink)
    px(target, 14, 12, 22, 2, palette.ink)
    px(target, 10, 21, 4, 6, palette.accent)
    px(target, 36, 21, 4, 6, palette.accent)
  } else if (state.prop === 'browser') {
    px(target, 31, 11, 14, 12, palette.ink)
    px(target, 32, 12, 12, 10, '#ffffff')
    px(target, 32, 12, 12, 2, palette.accent)
    px(target, 34, 16, 7, 1, palette.inkSoft)
    px(target, 34, 18, 5, 1, palette.inkSoft)
  } else if (state.prop === 'codeRig') {
    px(target, 32, 14, 14, 16, palette.ink)
    px(target, 33, 15, 12, 14, '#1c2430')
    const color = motion && Math.sin(phase * 2) > 0 ? palette.accent : palette.accent2
    px(target, 35, 17, 2, 2, color)
    px(target, 39, 20, 2, 2, color)
    px(target, 36, 24, 7, 1, palette.lensLight)
  } else if (state.prop === 'magnifier') {
    px(target, 34, 17, 8, 8, palette.ink)
    px(target, 35, 18, 6, 6, '#ffffff')
    px(target, 40, 24, 6, 3, palette.ink)
  } else if (state.prop === 'cards') {
    px(target, 32, 17, 12, 9, palette.ink)
    px(target, 33, 18, 10, 7, palette.fang)
    px(target, 35, 20, 6, 1, palette.accent)
    px(target, 30, 23, 12, 9, palette.inkSoft)
  } else if (state.prop === 'battery') {
    px(target, 34, 28, 11, 7, palette.ink)
    px(target, 45, 30, 2, 3, palette.ink)
    px(target, 35, 29, 8, 5, palette.accent)
  } else if (state.prop === 'bubble') {
    px(target, 34, 9, 12, 8, palette.ink)
    px(target, 35, 10, 10, 6, '#ffffff')
    px(target, 37, 12, 2, 2, palette.accent)
    px(target, 41, 12, 2, 2, palette.accent)
  }
}

function drawPixelPetEffects(target: CanvasRenderingContext2D, palette: PixelPetPalette, fx: PixelPetState['fx'], phase: number, motion: boolean): void {
  const float = motion ? Math.round(Math.sin(phase) * 2) : 0
  if (fx === 'none') return
  if (fx === 'sparkle' || fx === 'idea') {
    drawSpark(target, 58, 17 + float, palette.accent2)
    drawSpark(target, 21, 19 - float, palette.accent)
    if (fx === 'idea') {
      px(target, 55, 9 + float, 7, 7, palette.accent2)
      px(target, 57, 16 + float, 3, 2, palette.ink)
    }
  } else if (fx === 'rage') {
    px(target, 57, 15 + float, 7, 2, palette.danger)
    px(target, 59, 11 + float, 2, 7, palette.danger)
  } else if (fx === 'tears') {
    px(target, 23, 33 + float, 2, 5, palette.accent)
    px(target, 56, 32 - float, 2, 5, palette.accent)
  } else if (fx === 'music') {
    drawMusicNote(target, 57, 14 + float, palette.accent)
    drawMusicNote(target, 22, 19 - float, palette.accent2)
  } else if (fx === 'exclaim') {
    drawGlyph(target, 58, 12 + float, '!', palette.danger, 2)
  } else if (fx === 'question') {
    drawGlyph(target, 58, 12 + float, '?', palette.accent2, 2)
  } else if (fx === 'zzz') {
    drawGlyph(target, 55, 9 + float, 'Z', palette.accent2, 1)
    drawGlyph(target, 61, 4 + float, 'Z', palette.accent2, 1)
  } else if (fx === 'dots') {
    px(target, 56, 16 + float, 2, 2, palette.accent)
    px(target, 61, 16 + float, 2, 2, palette.accent)
    px(target, 66, 16 + float, 2, 2, palette.accent)
  } else if (fx === 'code') {
    drawGlyph(target, 58, 12 + float, '1', palette.accent, 1)
    drawGlyph(target, 64, 18 - float, '0', palette.accent2, 1)
  } else if (fx === 'web' || fx === 'flow' || fx === 'book') {
    px(target, 54, 16 + float, 14, 1, hexToRgba(palette.accent, 0.65))
    px(target, 58, 20 - float, 10, 1, hexToRgba(palette.accent2, 0.65))
  }
}

function drawSpark(target: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  px(target, x + 2, y, 1, 5, color)
  px(target, x, y + 2, 5, 1, color)
  px(target, x + 1, y + 1, 3, 3, hexToRgba(color, 0.25))
}

function drawMusicNote(target: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  px(target, x, y, 2, 8, color)
  px(target, x + 2, y, 5, 2, color)
  px(target, x - 3, y + 6, 5, 4, color)
}

function drawGlyph(target: CanvasRenderingContext2D, x: number, y: number, glyph: keyof typeof GLYPHS, color: string, scale = 1): void {
  const rows = GLYPHS[glyph]
  rows.forEach((row, rowIndex) => {
    row.split('').forEach((cell, columnIndex) => {
      if (cell === '1') px(target, x + columnIndex * scale, y + rowIndex * scale, scale, scale, color)
    })
  })
}

const GLYPHS = {
  '!': ['1', '1', '1', '0', '1'],
  '?': ['111', '001', '011', '000', '010'],
  Z: ['111', '001', '010', '100', '111'],
  '1': ['01', '11', '01', '01', '11'],
  '0': ['111', '101', '101', '101', '111'],
}

function px(target: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  target.fillStyle = color
  target.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)))
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = String(hex || '#000000').replace('#', '').padEnd(6, '0')
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  }
}

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
}

function pickFeature<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value as T) ? (value as T) : fallback
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const numberValue = typeof value === 'number' && Number.isFinite(value) ? value : Number(value)
  if (!Number.isFinite(numberValue)) return fallback
  return Math.min(max, Math.max(min, numberValue))
}

function normalizeName(value: unknown, fallback: string): string {
  const text = typeof value === 'string' ? value.trim() : ''
  return (text || fallback).slice(0, 12)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}