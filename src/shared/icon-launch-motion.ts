export const ICON_LAUNCH_FEEDBACK_MS = 500
export const ICON_LAUNCH_SCALE_KEYFRAMES: number[] = [1, 0.82, 1.06, 1]
export const ICON_LAUNCH_SCALE_DURATION_SECONDS = 0.38
export const ICON_LAUNCH_SCALE_EASE: [number, number, number, number] = [0.28, 0, 0.42, 1]
export const ICON_LAUNCH_OVERLAY_INITIAL_OPACITY = 0.7
export const ICON_LAUNCH_OVERLAY_SCALE = 2.6
export const ICON_LAUNCH_OVERLAY_DURATION_SECONDS = 0.48
export const ICON_LAUNCH_OVERLAY_DELAY_SECONDS = 0.15
export const ICON_LAUNCH_OVERLAY_EASE: [number, number, number, number] = [0.22, 0, 0.36, 1]

export function shouldAnimateDockSystemAction(actionId: string): boolean {
  return actionId !== 'desktop'
}
