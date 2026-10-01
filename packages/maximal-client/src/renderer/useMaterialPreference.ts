import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect } from 'react'

import type { SettingsCapabilities } from './settings/capabilities'
import {
  DEFAULT_MATERIAL_PREFERENCE,
  type MaterialPreference,
  type PersistedMaterialPreference,
} from './material-preference'
import { describeError } from './shared/errors'

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
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: materialPreferenceQueryKey,
    queryFn: async () =>
      withSessionCoordinates(await capabilities.general.material()),
  })
  const mutation = useMutation({
    mutationFn: async (next: MaterialPreference) =>
      withSessionCoordinates(
        await capabilities.general.setMaterial(persistedPreference(next)),
        next,
      ),
    onSuccess: (next) =>
      queryClient.setQueryData(materialPreferenceQueryKey, next),
  })
  const mutateAsync = mutation.mutateAsync
  const resetMutation = mutation.reset

  useEffect(() => {
    const unsubscribe = capabilities.general.onMaterialChange((next) => {
      void queryClient.cancelQueries({
        queryKey: materialPreferenceQueryKey,
        exact: true,
      })
      queryClient.setQueryData<MaterialPreference>(
        materialPreferenceQueryKey,
        (current) => withSessionCoordinates(next, current),
      )
      resetMutation()
    })
    return unsubscribe
  }, [capabilities, queryClient, resetMutation])

  const set = useCallback(
    async (next: MaterialPreference) => {
      await mutateAsync(next).catch(() => undefined)
    },
    [mutateAsync],
  )

  return {
    state: query.data ?? null,
    busy: mutation.isPending,
    error:
      mutation.error === null
        ? mutation.isPending || query.error === null
          ? null
          : describeError(query.error)
        : describeError(mutation.error),
    set,
  }
}
