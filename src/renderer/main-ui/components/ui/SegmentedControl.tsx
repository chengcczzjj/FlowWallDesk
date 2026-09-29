import { useRef } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { useSlidingIndicator } from './useSlidingIndicator'

export interface SegmentOption<T extends string> {
  value: T
  label: string
  icon?: ReactNode
  badge?: ReactNode
}

/** Radio-style switch with one thumb that glides to the chosen segment. */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  size = 'md',
  stretch = false,
}: {
  value: T
  options: SegmentOption<T>[]
  onChange: (value: T) => void
  ariaLabel: string
  size?: 'sm' | 'md'
  stretch?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const indicator = useSlidingIndicator(containerRef, value)

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const index = options.findIndex((option) => option.value === value)
    const next = options[(index + step + options.length) % options.length]
    onChange(next.value)
    requestAnimationFrame(() => {
      containerRef.current?.querySelector<HTMLElement>('[data-indicator-active="true"]')?.focus()
    })
  }

  return (
    <div
      ref={containerRef}
      className={`ly-segmented ly-segmented--${size}${stretch ? ' ly-segmented--stretch' : ''}`}
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
    >
      <span className="ly-segmented__thumb" data-ready={indicator.ready} style={indicator.style} aria-hidden="true" />
      {options.map((option) => {
        const checked = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            className="ly-segmented__item"
            data-indicator-active={checked ? 'true' : undefined}
            onClick={() => onChange(option.value)}
          >
            {option.icon}
            <span>{option.label}</span>
            {option.badge}
          </button>
        )
      })}
    </div>
  )
}
