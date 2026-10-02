import { useCallback, useEffect } from 'react'
import type { SettingsSurface, ShellIconName } from '@maximal/maximal-electron/renderer'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  WORKBAR_ITEM_IDS,
  type WorkbarItemId,
  type WorkbarLayout,
} from '../../shared/host'
import type { SettingsCapabilities } from '../settings/capabilities'
import type { SettingsSectionId } from '../../shared/settings-sections'

export type { WorkbarItemId, WorkbarLayout } from '../../shared/host'

export const WORKBAR_PROFILE_SECTIONS: Record<SettingsSurface, SettingsSectionId> = {
  'model-cards': 'settings-models-heading',
  'api-keys': 'settings-connections-heading',
  'app-toggles': 'settings-connections-heading',
  diagnostics: 'settings-diagnostics-heading',
  usage: 'settings-usage-heading',
}

export const WORKBAR_ITEMS = [
  { id: 'home', label: 'Home', icon: 'home', description: 'Start work and return to open documents.' },
  { id: 'projects', label: 'Projects', icon: 'folder', description: 'Find and open local projects on the spatial board.' },
  { id: 'overview', label: 'Overview', icon: 'overview', description: 'See live request activity and aggregate traffic statistics.' },
  { id: 'traffic', label: 'Traffic', icon: 'traffic', description: 'Inspect individual requests, responses, and their context.' },
  { id: 'terminals', label: 'Terminals', icon: 'terminal', description: 'Open terminal tabs and resume background sessions.' },
  { id: 'browsers', label: 'Browsers', icon: 'browser', description: 'Open and manage user and agent browser tabs.' },
] as const satisfies readonly {
  id: WorkbarItemId
  label: string
  icon: ShellIconName
  description: string
}[]

const workbarLayoutQueryKey = ['workbar', 'layout'] as const

export function defaultWorkbarLayout(): WorkbarLayout {
  return {
    order: [...WORKBAR_ITEM_IDS],
    visible: [...WORKBAR_ITEM_IDS],
  }
}

export function useWorkbarLayout(
  capabilities: SettingsCapabilities['workbar'],
): {
  layout: WorkbarLayout
  move: (id: WorkbarItemId, direction: -1 | 1) => void
  setVisible: (id: WorkbarItemId, visible: boolean) => void
  busy: boolean
  error: string | undefined
} {
  const queryClient = useQueryClient()
  const query = useQuery<WorkbarLayout>({
    queryKey: workbarLayoutQueryKey,
    queryFn: () => capabilities.get(),
  })
  const layout = query.data ?? defaultWorkbarLayout()

  useEffect(
    () => capabilities.subscribe((next) => {
      queryClient.setQueryData(workbarLayoutQueryKey, next)
    }),
    [capabilities, queryClient],
  )

  const mutation = useMutation({
    mutationFn: (next: WorkbarLayout) => capabilities.update(next),
    onMutate: async (next: WorkbarLayout) => {
      await queryClient.cancelQueries({ queryKey: workbarLayoutQueryKey })
      const previous = queryClient.getQueryData<WorkbarLayout>(workbarLayoutQueryKey)
      queryClient.setQueryData(workbarLayoutQueryKey, next)
      return previous
    },
    onError: (_error, _next, previous) => {
      if (previous) queryClient.setQueryData(workbarLayoutQueryKey, previous)
    },
    onSuccess: (next) => {
      queryClient.setQueryData(workbarLayoutQueryKey, next)
    },
  })

  const move = useCallback((id: WorkbarItemId, direction: -1 | 1): void => {
    const from = layout.order.indexOf(id)
    const to = from + direction
    if (from < 0 || to < 0 || to >= layout.order.length) return
    const order = [...layout.order]
    order.splice(to, 0, ...order.splice(from, 1))
    mutation.mutate({ ...layout, order })
  }, [layout, mutation])

  const setVisible = useCallback((id: WorkbarItemId, visible: boolean): void => {
    mutation.mutate({
      ...layout,
      visible: visible
        ? [...new Set([...layout.visible, id])]
        : layout.visible.filter((entry) => entry !== id),
    })
  }, [layout, mutation])

  const queryError = query.error
  const mutationError = mutation.error

  return {
    layout,
    move,
    setVisible,
    busy: query.isPending || mutation.isPending,
    error: queryError
      ? `Could not load workbar layout: ${queryError instanceof Error ? queryError.message : String(queryError)}`
      : mutationError
        ? `Could not save workbar layout: ${mutationError instanceof Error ? mutationError.message : String(mutationError)}`
        : undefined,
  }
}
