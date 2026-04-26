import { Activity, Clock, CloudSun, type LucideProps, Music } from 'lucide-react'

// ── Color Themes ──
export const COLOR_THEMES = [
  {
    id: 'white',
    label: 'Frost',
    base: '#e2e8f0',
    textGradient: 'linear-gradient(to bottom right, #e2e8f0, #94a3b8)',
    glow: 'rgba(255,255,255,0.3)',
    accent: '#cbd5e1',
    borderColor: 'rgba(255,255,255,0.6)',
  },
  {
    id: 'black',
    label: 'Obsidian',
    base: '#1e293b',
    textGradient: 'linear-gradient(to bottom right, #475569, #0f172a)',
    glow: 'rgba(0,0,0,0.3)',
    accent: '#64748b',
    borderColor: 'rgba(0,0,0,0.6)',
  },
  {
    id: 'orange',
    label: 'Sunset',
    base: '#fb923c',
    textGradient: 'linear-gradient(to bottom right, #fdba74, #f87171)',
    glow: 'rgba(249, 115, 22, 0.4)',
    accent: '#fdba74',
    borderColor: '#fb923c',
  },
  {
    id: 'blue',
    label: 'Ocean',
    base: '#60a5fa',
    textGradient: 'linear-gradient(to bottom right, #93c5fd, #3b82f6)',
    glow: 'rgba(59, 130, 246, 0.4)',
    accent: '#bfdbfe',
    borderColor: '#60a5fa',
  },
  {
    id: 'purple',
    label: 'Nebula',
    base: '#c084fc',
    textGradient: 'linear-gradient(to bottom right, #e879f9, #a855f7)',
    glow: 'rgba(168, 85, 247, 0.4)',
    accent: '#e9d5ff',
    borderColor: '#c084fc',
  },
  {
    id: 'green',
    label: 'Forest',
    base: '#4ade80',
    textGradient: 'linear-gradient(to bottom right, #86efac, #22c55e)',
    glow: 'rgba(34, 197, 94, 0.4)',
    accent: '#bbf7d0',
    borderColor: '#4ade80',
  },
  {
    id: 'pink',
    label: 'Sakura',
    base: '#f472b6',
    textGradient: 'linear-gradient(to bottom right, #fbcfe8, #ec4899)',
    glow: 'rgba(236, 72, 153, 0.4)',
    accent: '#fce7f3',
    borderColor: '#f472b6',
  },
  {
    id: 'cyan',
    label: 'Glacier',
    base: '#22d3ee',
    textGradient: 'linear-gradient(to bottom right, #67e8f9, #06b6d4)',
    glow: 'rgba(6, 182, 212, 0.4)',
    accent: '#cffafe',
    borderColor: '#22d3ee',
  },
  {
    id: 'yellow',
    label: 'Gold',
    base: '#facc15',
    textGradient: 'linear-gradient(to bottom right, #fef08a, #eab308)',
    glow: 'rgba(234, 179, 8, 0.4)',
    accent: '#fef9c3',
    borderColor: '#facc15',
  },
  {
    id: 'red',
    label: 'Crimson',
    base: '#f87171',
    textGradient: 'linear-gradient(to bottom right, #fca5a5, #ef4444)',
    glow: 'rgba(239, 68, 68, 0.4)',
    accent: '#fee2e2',
    borderColor: '#f87171',
  },
  {
    id: 'indigo',
    label: 'Deep',
    base: '#818cf8',
    textGradient: 'linear-gradient(to bottom right, #a5b4fc, #6366f1)',
    glow: 'rgba(99, 102, 241, 0.4)',
    accent: '#e0e7ff',
    borderColor: '#818cf8',
  },
  {
    id: 'teal',
    label: 'Teal',
    base: '#2dd4bf',
    textGradient: 'linear-gradient(to bottom right, #5eead4, #14b8a6)',
    glow: 'rgba(20, 184, 166, 0.4)',
    accent: '#ccfbf1',
    borderColor: '#2dd4bf',
  },
  {
    id: 'lime',
    label: 'Acid',
    base: '#a3e635',
    textGradient: 'linear-gradient(to bottom right, #d9f99d, #65a30d)',
    glow: 'rgba(163, 230, 53, 0.4)',
    accent: '#ecfccb',
    borderColor: '#a3e635',
  },
  {
    id: 'rose',
    label: 'Rose',
    base: '#fb7185',
    textGradient: 'linear-gradient(to bottom right, #fecdd3, #e11d48)',
    glow: 'rgba(251, 113, 133, 0.4)',
    accent: '#ffe4e6',
    borderColor: '#fb7185',
  },
]

// ── Clock Styles ──
export const CLOCK_STYLES = [
  { id: 'minimal', name: 'Minimal', description: 'Clean & Large' },
  { id: 'stacked', name: 'Stacked', description: 'Vertical Layout' },
]

// ── Pixel Clock Styles ──
export const PIXEL_CLOCK_STYLES = [
  { id: 'minimal', name: 'Pixel Time', description: 'Retro Digital' },
  { id: 'weekday', name: 'Pixel Week', description: 'Weekday Layout' },
]

// ── Weather Styles ──
export const WEATHER_STYLES = [
  { id: 'minimal', name: 'Minimal', description: 'Clean Lucide Icons' },
  { id: 'realism', name: 'Realism', description: 'Vibrant Gradients' },
  { id: 'glass', name: '3D Minimal', description: 'Clean Card Style' },
  { id: 'neon', name: 'Neon', description: 'Glowing Strokes' },
]

// ── White Noise Styles ──
export const NOISE_STYLES = [
  { id: 'glass', name: 'Glass', description: 'Frosted Blur' },
  { id: 'cd', name: 'CD', description: 'Shiny Disc' },
  { id: 'minimal', name: 'Minimal White', description: 'Clean & Simple' },
]

// ── Audio Visualizer Styles ──
export const AUDIO_STYLES = [
  { id: 'bars', name: 'Frequency Bars', description: 'Classic Spectrum' },
  { id: 'wave', name: 'Oscilloscope', description: 'Time Domain Wave' },
  { id: 'circle', name: 'Radial Pulse', description: 'Circular Bars' },
  { id: 'spectrum', name: 'Smooth Curve', description: 'Filled Area' },
  { id: 'dna', name: 'DNA Mirror', description: 'Symmetric Pattern' },
]

// ── Widget Type → Identifier ──
export type WidgetTypeId =
  | 'clock'
  | 'elegantclock'
  | 'pixelclock'
  | 'graphicdatetime'
  | 'weather'
  | 'whitenoise'
  | 'audio'

export interface WidgetStyleDef {
  id: string
  name: string
  description: string
}

export const WIDGET_CATALOG: {
  id: WidgetTypeId
  name: string
  icon: React.ReactElement<LucideProps>
}[] = [
  { id: 'clock', name: '时间', icon: <Clock size={18} /> },
  { id: 'elegantclock', name: '日期时钟', icon: <Clock size={18} /> },
  { id: 'pixelclock', name: '像素时钟', icon: <Clock size={18} /> },
  { id: 'graphicdatetime', name: '图形时间', icon: <Clock size={18} /> },
  { id: 'weather', name: '天气', icon: <CloudSun size={18} /> },
  { id: 'whitenoise', name: '白噪音', icon: <Music size={18} /> },
  { id: 'audio', name: '音频可视化', icon: <Activity size={18} /> },
]

export function getStylesForType(type: string): WidgetStyleDef[] {
  switch (type) {
    case 'clock':
      return CLOCK_STYLES
    case 'elegantclock':
      return []
    case 'pixelclock':
      return PIXEL_CLOCK_STYLES
    case 'graphicdatetime':
      return []
    case 'weather':
      return WEATHER_STYLES
    case 'whitenoise':
      return NOISE_STYLES
    case 'audio':
      return AUDIO_STYLES
    default:
      return []
  }
}
