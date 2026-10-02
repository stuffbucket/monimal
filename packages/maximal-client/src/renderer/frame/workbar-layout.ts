import { useCallback, useEffect } from 'react'
import type { ShellIconName } from '@maximal/maximal-electron/renderer'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  WORKBAR_ITEM_IDS,
  type WorkbarItemId,
  type WorkbarLayout,
} from '../../shared/host'
import type { SettingsCapabilities } from '../settings/capabilities'

export type { WorkbarItemId, WorkbarLayout } from '../../shared/host'

export const WORKBAR_ITEMS = [
  { id: 'home', label: 'Home', icon: 'map' },
  { id: 'projects', label: 'Projects', icon: 'folder' },
  { id: 'overview', label: 'Overview', icon: 'document' },
  { id: 'traffic', label: 'Traffic', icon: 'folder' },
  { id: 'terminals', label: 'Terminals', icon: 'terminal' },
  { id: 'browsers', label: 'Browsers', icon: 'browser' },
] as const satisfies readonly {
  id: WorkbarItemId
  label: string
  icon: ShellIconName
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
