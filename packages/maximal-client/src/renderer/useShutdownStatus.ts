import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import type { ShutdownSnapshot } from '../shared/host'

const shutdownStatusQueryKey = ['desktop', 'shutdown', 'status'] as const

export function useShutdownStatus(): ShutdownSnapshot | null {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: shutdownStatusQueryKey,
    queryFn: () => window.maximal.shutdown.current(),
  })

  useEffect(
    () =>
      window.maximal.shutdown.onChange((snapshot) => {
        queryClient.setQueryData(shutdownStatusQueryKey, snapshot)
      }),
    [queryClient],
  )

  return query.data ?? null
}
