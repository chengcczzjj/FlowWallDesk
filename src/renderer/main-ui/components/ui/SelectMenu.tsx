import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

export interface SelectOption<T extends string | number> {
  value: T
  label: string
  description?: string
  icon?: ReactNode
  disabled?: boolean
}

type MenuPhase = 'closed' | 'open' | 'closing'

interface MenuPosition {
  top: number
  left: number
  width: number
  maxHeight: number
  side: 'top' | 'bottom'
  origin: string
}

const VIEWPORT_GUTTER = 8
const MENU_OFFSET = 6
const CLOSE_FALLBACK_MS = 220

/** Portal inside the app shell so popovers inherit the active theme tokens. */
function portalRoot(): HTMLElement {
  return document.querySelector<HTMLElement>('.app-shell') ?? document.body
}

/**
 * Listbox dropdown shared by the wallpaper UI. It replaces the native/base
 * select: the trigger keeps a fixed metric box (no baseline drift between
 * Latin and CJK glyphs) and the menu grows out of the trigger edge.
 */
export function SelectMenu<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
  disabled = false,
  align = 'start',
  menuWidth = 'trigger',
  leading,
  renderValue,
  placeholder = '请选择',
  title,
  className = '',
  menuClassName = '',
}: {
  value: T | undefined
  options: SelectOption<T>[]
  onChange: (value: T) => void
  ariaLabel: string
  disabled?: boolean
  align?: 'start' | 'end'
  menuWidth?: number | 'trigger'
  leading?: ReactNode
  renderValue?: (option: SelectOption<T> | undefined) => ReactNode
  placeholder?: string
  title?: string
  className?: string
  menuClassName?: string
}) {
  const id = useId()
  const listboxId = `${id}-listbox`
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<number>(0)
  const [phase, setPhase] = useState<MenuPhase>('closed')
  const [position, setPosition] = useState<MenuPosition | null>(null)
  const [activeIndex, setActiveIndex] = useState(-1)
  const selectedIndex = options.findIndex((option) => option.value === value)
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined
  const open = phase === 'open'

  const firstEnabled = useCallback((from: number, step: 1 | -1): number => {
    for (let i = 0, index = from; i < options.length; i++, index += step) {
      const wrapped = (index + options.length) % options.length
      if (!options[wrapped]?.disabled) return wrapped
    }
    return -1
  }, [options])

  const finishClose = useCallback(() => {
    window.clearTimeout(closeTimer.current)
    setPhase((current) => (current === 'closing' ? 'closed' : current))
  }, [])

  const close = useCallback((restoreFocus: boolean) => {
    setPhase((current) => (current === 'open' ? 'closing' : current))
    window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(finishClose, CLOSE_FALLBACK_MS)
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true })
  }, [finishClose])

  const openMenu = useCallback((preferred?: 'first' | 'last') => {
    if (disabled || options.length === 0) return
    window.clearTimeout(closeTimer.current)
    const start = preferred === 'first'
      ? firstEnabled(0, 1)
      : preferred === 'last'
        ? firstEnabled(options.length - 1, -1)
        : selectedIndex >= 0 && !options[selectedIndex]?.disabled ? selectedIndex : firstEnabled(0, 1)
    setActiveIndex(start)
    setPosition(null)
    setPhase('open')
  }, [disabled, firstEnabled, options, selectedIndex])

  const choose = useCallback((index: number) => {
    const option = options[index]
    if (!option || option.disabled) return
    close(true)
    if (option.value !== value) onChange(option.value)
  }, [close, onChange, options, value])

  // Measure after mount, then place the menu against the trigger edge with room to spare.
  useLayoutEffect(() => {
    if (phase !== 'open') return
    const place = () => {
      const trigger = triggerRef.current
      const menu = menuRef.current
      if (!trigger || !menu) return
      const rect = trigger.getBoundingClientRect()
      const width = Math.min(
        menuWidth === 'trigger' ? Math.max(rect.width, 160) : menuWidth,
        window.innerWidth - VIEWPORT_GUTTER * 2,
      )
      const natural = menu.scrollHeight
      const below = window.innerHeight - rect.bottom - MENU_OFFSET - VIEWPORT_GUTTER
      const above = rect.top - MENU_OFFSET - VIEWPORT_GUTTER
      const side: 'top' | 'bottom' = below < Math.min(natural, 220) && above > below ? 'top' : 'bottom'
      const maxHeight = Math.max(120, side === 'bottom' ? below : above)
      const height = Math.min(natural, maxHeight)
      const rawLeft = align === 'end' ? rect.right - width : rect.left
      const left = Math.min(Math.max(VIEWPORT_GUTTER, rawLeft), window.innerWidth - width - VIEWPORT_GUTTER)
      const top = side === 'bottom' ? rect.bottom + MENU_OFFSET : rect.top - MENU_OFFSET - height
      const originX = Math.min(Math.max(rect.left + rect.width / 2 - left, 12), width - 12)
      setPosition({ top, left, width, maxHeight, side, origin: `${originX}px ${side === 'bottom' ? '0' : '100%'}` })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [align, menuWidth, phase])

  // Focus once placed: a still-hidden listbox cannot take focus.
  const placed = position !== null
  useEffect(() => {
    if (phase === 'open' && placed) listRef.current?.focus({ preventScroll: true })
  }, [phase, placed])

  useEffect(() => {
    if (phase !== 'open') return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      close(false)
    }
    // Clicking the embedded FlowWall page or another app blurs the whole window.
    const onBlur = () => close(false)
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('blur', onBlur)
    }
  }, [close, phase])

  useEffect(() => {
    if (disabled && phase === 'open') close(false)
  }, [close, disabled, phase])

  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  useEffect(() => {
    if (!open || activeIndex < 0) return
    document.getElementById(`${id}-option-${activeIndex}`)?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, id, open])

  const onTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (open) {
      onListKeyDown(event)
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openMenu()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      openMenu('last')
    }
  }

  const onListKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setActiveIndex((index) => firstEnabled(index + 1, 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        setActiveIndex((index) => firstEnabled(index - 1, -1))
        break
      case 'Home':
        event.preventDefault()
        setActiveIndex(firstEnabled(0, 1))
        break
      case 'End':
        event.preventDefault()
        setActiveIndex(firstEnabled(options.length - 1, -1))
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        choose(activeIndex)
        break
      case 'Escape':
        event.preventDefault()
        event.stopPropagation()
        close(true)
        break
      case 'Tab':
        close(false)
        break
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`ly-select ${className}`}
        data-state={open ? 'open' : 'closed'}
        data-value={value === undefined ? '' : String(value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        title={title}
        disabled={disabled}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={onTriggerKeyDown}
      >
        {leading && <span className="ly-select__leading" aria-hidden="true">{leading}</span>}
        <span className="ly-select__value">
          {renderValue ? renderValue(selected) : selected?.label ?? placeholder}
        </span>
        <ChevronDown className="ly-select__chevron" size={14} strokeWidth={2.2} aria-hidden="true" />
      </button>
      {phase !== 'closed' && createPortal(
        <div
          ref={menuRef}
          className={`ly-menu ${menuClassName}`}
          data-state={phase}
          data-side={position?.side ?? 'bottom'}
          data-placed={position ? 'true' : 'false'}
          data-ly-overlay=""
          style={{
            top: position?.top ?? -9999,
            left: position?.left ?? -9999,
            width: position?.width,
            maxHeight: position?.maxHeight,
            transformOrigin: position?.origin,
          }}
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget && phase === 'closing') finishClose()
          }}
        >
          <div
            ref={listRef}
            id={listboxId}
            className="ly-menu__list"
            role="listbox"
            tabIndex={-1}
            aria-label={ariaLabel}
            aria-activedescendant={activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
            onKeyDown={onListKeyDown}
          >
            {options.map((option, index) => {
              const isSelected = option.value === value
              return (
                <div
                  key={String(option.value)}
                  id={`${id}-option-${index}`}
                  role="option"
                  className="ly-menu__option"
                  aria-selected={isSelected}
                  aria-disabled={option.disabled || undefined}
                  data-value={String(option.value)}
                  data-active={index === activeIndex ? 'true' : undefined}
                  style={{ '--i': index } as CSSProperties}
                  onPointerMove={() => {
                    if (!option.disabled && index !== activeIndex) setActiveIndex(index)
                  }}
                  onClick={() => choose(index)}
                >
                  {option.icon && <span className="ly-menu__icon" aria-hidden="true">{option.icon}</span>}
                  <span className="ly-menu__text">
                    <span className="ly-menu__label">{option.label}</span>
                    {option.description && <span className="ly-menu__description">{option.description}</span>}
                  </span>
                  <Check className="ly-menu__check" size={15} strokeWidth={2.4} aria-hidden="true" />
                </div>
              )
            })}
          </div>
        </div>,
        portalRoot(),
      )}
    </>
  )
}
