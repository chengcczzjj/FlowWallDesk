import { useLayoutEffect, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'

export interface SlidingIndicator {
  box: { x: number; width: number } | null
  style: CSSProperties
  /** False until the first measurement, so the thumb does not slide in from 0. */
  ready: boolean
}

/**
 * Tracks the element marked `data-indicator-active="true"` inside the container
 * and returns a transform/width for one shared indicator that slides between
 * items instead of each item drawing its own.
 */
export function useSlidingIndicator(containerRef: RefObject<HTMLElement | null>, activeKey: unknown): SlidingIndicator {
  const [box, setBox] = useState<{ x: number; width: number } | null>(null)
  const [ready, setReady] = useState(false)

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    let frame = 0
    const measure = () => {
      const active = container.querySelector<HTMLElement>('[data-indicator-active="true"]')
      if (!active) {
        setBox(null)
        return
      }
      setBox((previous) => (
        previous && previous.x === active.offsetLeft && previous.width === active.offsetWidth
          ? previous
          : { x: active.offsetLeft, width: active.offsetWidth }
      ))
    }
    measure()
    frame = requestAnimationFrame(() => setReady(true))
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    for (const child of Array.from(container.children)) observer.observe(child)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [containerRef, activeKey])

  return {
    box,
    ready: ready && box !== null,
    style: box
      ? { width: box.width, transform: `translateX(${box.x}px)`, opacity: 1 }
      : { width: 0, opacity: 0 },
  }
}
