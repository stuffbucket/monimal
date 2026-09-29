import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import type { AuthStatus, SettingsCapabilities } from './settings/capabilities'

const POLL_MS = 3_000
export const accountStatusQueryKey = ['account', 'status'] as const

export function useAccountStatus(settings: SettingsCapabilities): AuthStatus | null {
  const queryClient = useQueryClient()
  const { data } = useQuery({
    queryKey: accountStatusQueryKey,
    queryFn: () => settings.account.status(),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: true,
  })

  useEffect(
    () =>
      settings.subscribe(() => {
        void queryClient.invalidateQueries({ queryKey: accountStatusQueryKey })
      }),
    [queryClient, settings],
  )

  return data ?? null
}
