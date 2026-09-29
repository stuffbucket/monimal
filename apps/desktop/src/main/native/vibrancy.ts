import type { BrowserWindow } from 'electron'

export const OPAQUE_WINDOW_BACKGROUND = '#16181d'

export interface VibrancyPreference {
  enabled: boolean
  supported: boolean
}

export function vibrancyPreference(
  enabled: boolean,
  platform: NodeJS.Platform = process.platform,
): VibrancyPreference {
  return {
    enabled: platform === 'darwin' && enabled,
    supported: platform === 'darwin',
  }
}

export function applyVibrancy(
  window: Pick<BrowserWindow, 'setBackgroundColor' | 'setVibrancy'>,
  enabled: boolean,
  platform: NodeJS.Platform = process.platform,
): VibrancyPreference {
  const preference = vibrancyPreference(enabled, platform)
  if (!preference.supported) return preference

  window.setVibrancy(preference.enabled ? 'under-window' : null)
  window.setBackgroundColor(
    preference.enabled ? '#00000000' : OPAQUE_WINDOW_BACKGROUND,
  )
  return preference
}
