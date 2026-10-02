import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import type { SettingsCapabilities } from '../capabilities'

export const terminalTypographyQueryKey = [
  'settings',
  'terminal',
  'typography',
] as const

export function useTerminalTypographyQuery(
  capabilities: SettingsCapabilities['terminalTypography'],
) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: terminalTypographyQueryKey,
    queryFn: () => capabilities.get(),
  })

  useEffect(() => capabilities.subscribe((settings) => {
    queryClient.setQueryData(terminalTypographyQueryKey, settings)
  }), [capabilities, queryClient])

  return query
}
