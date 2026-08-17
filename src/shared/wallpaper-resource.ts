import type { WallpaperResourceInstallState } from './types'

export const WALLPAPER_RESOURCE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,95}$/
export const WALLPAPER_RESOURCE_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

export function isValidWallpaperResourceId(value: string): boolean {
  return WALLPAPER_RESOURCE_ID_PATTERN.test(value)
}

export function compareWallpaperResourceVersions(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
}

export function resolveWallpaperResourceInstallState(
  installedVersion: string | undefined,
  availableVersion: string,
): WallpaperResourceInstallState {
  if (!installedVersion) return 'not-installed'
  return compareWallpaperResourceVersions(installedVersion, availableVersion) >= 0
    ? 'installed'
    : 'update-available'
}
