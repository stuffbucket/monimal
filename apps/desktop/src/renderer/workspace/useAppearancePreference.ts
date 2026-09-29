import { useEffect, useState } from 'react'

import type {
  AppearancePreference,
  SettingsCapabilities,
} from '@maximal/maximal-client/renderer/settings/capabilities'

function setBooleanAttribute(name: string, enabled: boolean): void {
  if (enabled) document.documentElement.setAttribute(name, 'true')
  else document.documentElement.removeAttribute(name)
}

function applyAppearance(preference: AppearancePreference): void {
  setBooleanAttribute('data-vibrancy', preference.vibrancyEnabled)
  setBooleanAttribute(
    'data-background-effects',
    preference.backgroundEffectsEnabled,
  )
  setBooleanAttribute('data-reduced-motion', preference.reducedMotionEnabled)
}

export function useAppearancePreference(
  settings: SettingsCapabilities,
): AppearancePreference | null {
  const [preference, setPreference] = useState<AppearancePreference | null>(null)

  useEffect(() => {
    let settled = false
    let changed = false
    const unsubscribe = settings.general.onAppearanceChange((preference) => {
      changed = true
      applyAppearance(preference)
      setPreference(preference)
    })
    void settings.general.appearance().then((preference) => {
      if (!settled && !changed) {
        applyAppearance(preference)
        setPreference(preference)
      }
    })
    return () => {
      settled = true
      unsubscribe()
    }
  }, [settings])

  return preference
}
