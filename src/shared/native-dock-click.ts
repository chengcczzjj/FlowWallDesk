export const NATIVE_DOCK_CLICK_MAX_MOVEMENT_PX = 12
export const NATIVE_DOCK_CLICK_MAX_DURATION_MS = 700
export const NATIVE_DOCK_RENDERER_ACK_LOOKBEHIND_MS = 80

export interface NativeDockClickDecisionInput {
  startedAt: number
  endedAt: number
  start: { x: number; y: number }
  end: { x: number; y: number }
  widgetId: string
  releaseWidgetId: string | null
  rendererActionPointerDownAt: number
  canvasTopmostAtStart: boolean
  canvasTopmostAtEnd: boolean
}

export function shouldFallbackNativeDockClick(input: NativeDockClickDecisionInput): boolean {
  if (!input.canvasTopmostAtStart || !input.canvasTopmostAtEnd) return false
  if (!input.widgetId || input.releaseWidgetId !== input.widgetId) return false
  const durationMs = input.endedAt - input.startedAt
  if (durationMs < 0 || durationMs > NATIVE_DOCK_CLICK_MAX_DURATION_MS) return false
  const rendererAckMatchesGesture = (
    input.rendererActionPointerDownAt >= input.startedAt - NATIVE_DOCK_RENDERER_ACK_LOOKBEHIND_MS &&
    input.rendererActionPointerDownAt <= input.endedAt
  )
  if (rendererAckMatchesGesture) return false

  const distance = Math.hypot(input.end.x - input.start.x, input.end.y - input.start.y)
  return distance <= NATIVE_DOCK_CLICK_MAX_MOVEMENT_PX
}

export function isNativeCanvasSurfaceHit(input: {
  hitHwnd: number
  rootHwnd: number
  canvasHwnd: number
}): boolean {
  if (!input.canvasHwnd) return false
  return input.hitHwnd === input.canvasHwnd || input.rootHwnd === input.canvasHwnd
}
