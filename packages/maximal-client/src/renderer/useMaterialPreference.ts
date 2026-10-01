import { useMemo } from 'react'

import type { SettingsCapabilities } from './settings/capabilities'
import {
  DEFAULT_MATERIAL_PREFERENCE,
  type MaterialPreference,
  type PersistedMaterialPreference,
} from './material-preference'
import { usePreferenceQuery } from './usePreferenceQuery'

export const materialPreferenceQueryKey = [
  'settings',
  'general',
  'material',
] as const

interface MaterialPreferenceCapabilities {
  readonly general: Pick<
    SettingsCapabilities['general'],
    'material' | 'onMaterialChange' | 'setMaterial'
  >
}

function persistedPreference(
  preference: MaterialPreference,
): PersistedMaterialPreference {
  const { latitude: _latitude, longitude: _longitude, ...persisted } = preference
  return persisted
}

function withSessionCoordinates(
  persisted: PersistedMaterialPreference,
  current?: MaterialPreference,
): MaterialPreference {
  return {
    ...persisted,
    latitude: current?.latitude ?? DEFAULT_MATERIAL_PREFERENCE.latitude,
    longitude: current?.longitude ?? DEFAULT_MATERIAL_PREFERENCE.longitude,
  }
}

export function useMaterialPreference(
  capabilities: MaterialPreferenceCapabilities,
) {
  const preference = usePreferenceQuery(
    useMemo(
      () => ({
        queryKey: materialPreferenceQueryKey,
        query: async () =>
          withSessionCoordinates(await capabilities.general.material()),
        mutate: async (next: MaterialPreference) =>
          withSessionCoordinates(
            await capabilities.general.setMaterial(persistedPreference(next)),
            next,
          ),
        subscribe: (listener: (next: PersistedMaterialPreference) => void) =>
          capabilities.general.onMaterialChange(listener),
        resolveEvent: (
          next: PersistedMaterialPreference,
          current?: MaterialPreference,
        ) => withSessionCoordinates(next, current),
      }),
      [capabilities],
    ),
  )

  return {
    state: preference.state,
    busy: preference.busy,
    error: preference.error,
    set: preference.update,
  }
}
