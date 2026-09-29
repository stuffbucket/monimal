import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect } from 'react'

import type {
  AppearancePreference,
  SettingsCapabilities,
} from '../capabilities'
import { describeError } from '../../shared/errors'

export const appearancePreferenceQueryKey = [
  'settings',
  'general',
  'appearance',
] as const

export function useAppearancePreference(capabilities: SettingsCapabilities) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: appearancePreferenceQueryKey,
    queryFn: () => capabilities.general.appearance(),
  })
  const mutation = useMutation({
    mutationFn: (request: () => Promise<AppearancePreference>) => request(),
    onSuccess: (next) =>
      queryClient.setQueryData(appearancePreferenceQueryKey, next),
  })
  const mutateAsync = mutation.mutateAsync
  const resetMutation = mutation.reset

  useEffect(() => {
    const unsubscribe = capabilities.general.onAppearanceChange((next) => {
      void queryClient.cancelQueries({
        queryKey: appearancePreferenceQueryKey,
        exact: true,
      })
      queryClient.setQueryData(appearancePreferenceQueryKey, next)
      resetMutation()
    })
    return unsubscribe
  }, [capabilities, queryClient, resetMutation])

  const update = useCallback(
    async (request: () => Promise<AppearancePreference>) => {
      await mutateAsync(request).catch(() => undefined)
    },
    [mutateAsync],
  )

  const setVibrancyEnabled = useCallback(
    (enabled: boolean) =>
      update(() => capabilities.general.setVibrancyEnabled(enabled)),
    [capabilities, update],
  )

  const setBackgroundEffectsEnabled = useCallback(
    (enabled: boolean) =>
      update(() => capabilities.general.setBackgroundEffectsEnabled(enabled)),
    [capabilities, update],
  )

  const setReducedMotionEnabled = useCallback(
    (enabled: boolean) =>
      update(() => capabilities.general.setReducedMotionEnabled(enabled)),
    [capabilities, update],
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
    setVibrancyEnabled,
    setBackgroundEffectsEnabled,
    setReducedMotionEnabled,
  }
}
