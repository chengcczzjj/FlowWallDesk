import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type { WidgetInstance } from '@shared/types'
import type { GeneratedWidgetBlock, GeneratedWidgetDefinition } from '@shared/generated-widget'
import { isGeneratedWidgetDefinition } from '@shared/generated-widget'
import { FrostedGlassBackground } from '../FrostedGlassBackground'

const FALLBACK_DEFINITION: GeneratedWidgetDefinition = {
  version: 1,
  name: 'AI Widget',
  title: '新组件',
  theme: 'glass',
  accent: '#ffb86b',
  blocks: [{ type: 'text', text: '在对话里告诉我你希望这个组件显示什么。', style: 'body' }],
}

function themeStyle(definition: GeneratedWidgetDefinition): CSSProperties {
  const common: CSSProperties = {
    color: definition.theme === 'paper' ? '#27231f' : '#f8f5ef',
    borderRadius: definition.theme === 'minimal' ? 6 : 22,
  }
  if (definition.theme === 'minimal') return { ...common, background: 'transparent', textShadow: '0 2px 18px rgba(0,0,0,.42)' }
  if (definition.theme === 'paper') return { ...common, background: 'linear-gradient(145deg, rgba(255,250,236,.97), rgba(242,229,201,.94))', boxShadow: '0 22px 60px rgba(58,43,25,.24)' }
  if (definition.theme === 'solid') return { ...common, background: 'linear-gradient(145deg, rgba(25,31,35,.96), rgba(12,16,18,.96))', boxShadow: '0 20px 60px rgba(0,0,0,.35)' }
  if (definition.theme === 'neon') return { ...common, background: 'rgba(7,13,18,.86)', border: `1px solid ${definition.accent}88`, boxShadow: `0 0 32px ${definition.accent}35, inset 0 0 28px rgba(0,0,0,.3)` }
  return { ...common, border: '1px solid rgba(255,255,255,.22)', boxShadow: '0 20px 60px rgba(0,0,0,.28)' }
}

function formatCountdown(targetAt: string, now: number, completedText = '已完成'): string {
  const target = Date.parse(targetAt)
  if (!Number.isFinite(target)) return '时间无效'
  const distance = target - now
  if (distance <= 0) return completedText
  const totalSeconds = Math.floor(distance / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return days > 0
    ? `${days}天 ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
    : `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function GeneratedWidget({ widget }: { widget: WidgetInstance }) {
  const definition = isGeneratedWidgetDefinition(widget.config?.definition)
    ? widget.config.definition
    : FALLBACK_DEFINITION
  const hasLiveTime = definition.blocks.some((block) => block.type === 'clock' || block.type === 'countdown')
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!hasLiveTime) return undefined
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [hasLiveTime])

  const formatter = useMemo(() => new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: 'short', day: 'numeric', weekday: 'short',
  }), [])

  const updateDefinition = (next: GeneratedWidgetDefinition): void => {
    void window.canvasBridge?.updateWidgetConfig(widget.id, { definition: next })
  }

  const toggleListItem = (blockIndex: number, itemId: string): void => {
    const blocks = definition.blocks.map((block, index) => {
      if (index !== blockIndex || block.type !== 'list' || !block.interactive) return block
      return {
        ...block,
        items: block.items.map((item) => item.id === itemId ? { ...item, done: !item.done } : item),
      }
    })
    updateDefinition({ ...definition, blocks })
  }

  return (
    <section
      aria-label={definition.name}
      style={{
        ...themeStyle(definition),
        width: '100%',
        height: '100%',
        minWidth: 220,
        minHeight: 120,
        position: 'relative',
        overflow: 'hidden',
        padding: '20px 22px',
        fontFamily: '"Segoe UI Variable Display", "Microsoft YaHei UI", sans-serif',
      }}
    >
      {definition.theme === 'glass' && <FrostedGlassBackground overlayColor="rgba(15,21,24,.52)" blurPx={24} />}
      <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <header>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ width: 9, height: 9, borderRadius: 99, background: definition.accent, boxShadow: `0 0 16px ${definition.accent}` }} />
            <h2 style={{ margin: 0, fontSize: 17, lineHeight: 1.2, fontWeight: 720, letterSpacing: '.02em' }}>{definition.title}</h2>
          </div>
          {definition.subtitle && <p style={{ margin: '6px 0 0 18px', fontSize: 11, opacity: .62 }}>{definition.subtitle}</p>}
        </header>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'auto' }}>
          {definition.blocks.map((block, index) => (
            <GeneratedBlock
              key={`${block.type}-${index}`}
              block={block}
              now={now}
              accent={definition.accent}
              dateFormatter={formatter}
              onToggle={(itemId) => toggleListItem(index, itemId)}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

function GeneratedBlock({
  block,
  now,
  accent,
  dateFormatter,
  onToggle,
}: {
  block: GeneratedWidgetBlock
  now: number
  accent: string
  dateFormatter: Intl.DateTimeFormat
  onToggle: (itemId: string) => void
}) {
  if (block.type === 'divider') return <div style={{ height: 1, flex: '0 0 auto', background: 'currentColor', opacity: .12 }} />
  if (block.type === 'text') {
    const size = block.style === 'headline' ? 22 : block.style === 'caption' ? 11 : block.style === 'quote' ? 16 : 13
    return <p style={{ margin: 0, fontSize: size, lineHeight: 1.55, textAlign: block.align, opacity: block.style === 'caption' ? .62 : .92, fontStyle: block.style === 'quote' ? 'italic' : undefined }}>{block.text}</p>
  }
  if (block.type === 'metric') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'end', gap: 8 }}>
        <span style={{ fontSize: 11, opacity: .62 }}>{block.label}</span>
        {block.trend && <span style={{ gridColumn: 1, fontSize: 10, color: accent }}>{block.trend}</span>}
        <strong style={{ gridColumn: 2, gridRow: '1 / span 2', fontSize: 27, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{block.value}<small style={{ marginLeft: 4, fontSize: 11, opacity: .58 }}>{block.unit}</small></strong>
      </div>
    )
  }
  if (block.type === 'progress') {
    const max = Math.max(1, block.max ?? 100)
    const ratio = Math.max(0, Math.min(1, block.value / max))
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 11 }}><span>{block.label}</span><span style={{ opacity: .58 }}>{block.detail ?? `${Math.round(ratio * 100)}%`}</span></div>
        <div style={{ height: 7, marginTop: 7, borderRadius: 99, background: 'rgba(127,127,127,.2)', overflow: 'hidden' }}><div style={{ width: `${ratio * 100}%`, height: '100%', borderRadius: 99, background: accent, boxShadow: `0 0 12px ${accent}88` }} /></div>
      </div>
    )
  }
  if (block.type === 'clock') {
    const date = new Date(now)
    const value = block.format === 'date'
      ? dateFormatter.format(date)
      : block.format === 'datetime'
        ? `${dateFormatter.format(date)} ${date.toLocaleTimeString(block.locale ?? 'zh-CN', { hour: '2-digit', minute: '2-digit', second: block.showSeconds ? '2-digit' : undefined })}`
        : date.toLocaleTimeString(block.locale ?? 'zh-CN', { hour: '2-digit', minute: '2-digit', second: block.showSeconds ? '2-digit' : undefined })
    return <time style={{ fontSize: 28, fontWeight: 760, lineHeight: 1, letterSpacing: '.02em', fontVariantNumeric: 'tabular-nums' }}>{value}</time>
  }
  if (block.type === 'countdown') {
    return <div><span style={{ display: 'block', fontSize: 11, opacity: .6 }}>{block.label}</span><strong style={{ display: 'block', marginTop: 5, color: accent, fontSize: 24, fontVariantNumeric: 'tabular-nums' }}>{formatCountdown(block.targetAt, now, block.completedText)}</strong></div>
  }
  return (
    <div>
      {block.title && <div style={{ marginBottom: 6, fontSize: 11, opacity: .6 }}>{block.title}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {block.items.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={!block.interactive}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => { event.stopPropagation(); onToggle(item.id) }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 0, border: 0, color: 'inherit', background: 'transparent', textAlign: 'left', font: 'inherit', cursor: block.interactive ? 'pointer' : 'default', opacity: item.done ? .48 : .9 }}
          >
            <span style={{ width: 14, height: 14, flex: '0 0 auto', borderRadius: 4, border: `1px solid ${item.done ? accent : 'currentColor'}`, background: item.done ? accent : 'transparent', opacity: item.done ? 1 : .4 }} />
            <span style={{ fontSize: 12, textDecoration: item.done ? 'line-through' : undefined }}>{item.text}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
