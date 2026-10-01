import { useCallback, useMemo } from 'react'

import type {
  AppearancePreference,
  SettingsCapabilities,
} from '../capabilities'
import { usePreferenceQuery } from '../../usePreferenceQuery'

export const appearancePreferenceQueryKey = [
  'settings',
  'general',
  'appearance',
] as const

export function useAppearancePreference(capabilities: SettingsCapabilities) {
  const preference = usePreferenceQuery(
    useMemo(
      () => ({
        queryKey: appearancePreferenceQueryKey,
        query: () => capabilities.general.appearance(),
        mutate: (request: () => Promise<AppearancePreference>) => request(),
        subscribe: (listener: (next: AppearancePreference) => void) =>
          capabilities.general.onAppearanceChange(listener),
        resolveEvent: (next: AppearancePreference) => next,
      }),
      [capabilities],
    ),
  )

  const setVibrancyEnabled = useCallback(
    (enabled: boolean) =>
      preference.update(() =>
        capabilities.general.setVibrancyEnabled(enabled),
      ),
    [capabilities, preference],
  )

  const setBackgroundEffectsEnabled = useCallback(
    (enabled: boolean) =>
      preference.update(() =>
        capabilities.general.setBackgroundEffectsEnabled(enabled),
      ),
    [capabilities, preference],
  )

  const setReducedMotionEnabled = useCallback(
    (enabled: boolean) =>
      preference.update(() =>
        capabilities.general.setReducedMotionEnabled(enabled),
      ),
    [capabilities, preference],
  )

  return {
    state: preference.state,
    busy: preference.busy,
    error: preference.error,
    setVibrancyEnabled,
    setBackgroundEffectsEnabled,
    setReducedMotionEnabled,
  }
}
