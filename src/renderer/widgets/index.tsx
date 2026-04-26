import type { WidgetInstance } from '@shared/types'
import { Clock } from './Clock/Clock'
import { CalendarWidget } from './Calendar/Calendar'
import { SysMonitorWidget } from './SysMonitor/SysMonitor'
import { TextWidget } from './Text/Text'
import { WeatherWidget } from './Weather/Weather'
import { StocksWidget } from './Stocks/Stocks'
import { NewsWidget } from './News/News'
import { QuickToolsWidget } from './QuickTools/QuickTools'
import { PetWidget } from './Pet/Pet'
import { AudioWidget } from './Audio/Audio'
import { WhiteNoiseWidget } from './WhiteNoise/WhiteNoise'
import { ElegantClock } from './ElegantClock/ElegantClock'
import { PixelClock } from './PixelClock/PixelClock'
import { GraphicDateTime } from './GraphicDateTime/GraphicDateTime'

/** 组件类型 → 组件实现 的注册表 */
export function renderWidget(w: WidgetInstance) {
  switch (w.type) {
    case 'clock':
      return <Clock config={w.config} />
    case 'elegantclock':
      return <ElegantClock config={w.config} />
    case 'pixelclock':
      return <PixelClock config={w.config} />
    case 'graphicdatetime':
      return <GraphicDateTime config={w.config} />
    case 'calendar':
      return <CalendarWidget />
    case 'sysmonitor':
      return <SysMonitorWidget />
    case 'text':
      return <TextWidget config={w.config} />
    case 'weather':
      return <WeatherWidget config={w.config} />
    case 'stocks':
      return <StocksWidget config={w.config} />
    case 'news':
      return <NewsWidget config={w.config} />
    case 'quicktools':
      return <QuickToolsWidget />
    case 'pet':
      return <PetWidget />
    case 'audio':
      return <AudioWidget config={w.config} />
    case 'whitenoise':
      return <WhiteNoiseWidget config={w.config} />
    default:
      return <div style={{ color: '#fff' }}>未知组件: {w.type}</div>
  }
}

/** 判断组件类型是否支持浮动工具栏（无底板组件） */
export function hasFloatingToolbar(type: string): boolean {
  return ['clock', 'elegantclock', 'pixelclock', 'graphicdatetime', 'audio', 'weather', 'whitenoise'].includes(type)
}

/** 判断组件类型是否为悬浮组件（可自由调整大小） */
export function isFloatingType(type: string): boolean {
  return ['clock', 'elegantclock', 'pixelclock', 'graphicdatetime', 'audio', 'weather', 'whitenoise', 'text'].includes(
    type
  )
}

/** 判断组件是否为自适应填充类型（不按 naturalSize 等比缩放，而是 stretch-fill） */
export function isStretchFillType(type: string): boolean {
  return type === 'audio'
}
