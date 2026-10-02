import { useCallback } from 'react'
import type { ShellIconName } from '@maximal/maximal-electron/renderer'
import { useQuery, useQueryClient } from '@tanstack/react-query'

export const WORKBAR_ITEMS = [
  { id: 'home', label: 'Home', icon: 'map' },
  { id: 'projects', label: 'Projects', icon: 'folder' },
  { id: 'overview', label: 'Overview', icon: 'document' },
  { id: 'traffic', label: 'Traffic', icon: 'folder' },
  { id: 'terminals', label: 'Terminals', icon: 'terminal' },
  { id: 'browsers', label: 'Browsers', icon: 'browser' },
] as const satisfies readonly {
  id: string
  label: string
  icon: ShellIconName
}[]

export type WorkbarItemId = (typeof WORKBAR_ITEMS)[number]['id']

export interface WorkbarLayout {
  order: WorkbarItemId[]
  visible: WorkbarItemId[]
}

const WORKBAR_ITEM_IDS = WORKBAR_ITEMS.map(({ id }) => id)
const workbarLayoutQueryKey = ['workbar', 'layout'] as const

export function defaultWorkbarLayout(): WorkbarLayout {
  return { order: [...WORKBAR_ITEM_IDS], visible: [...WORKBAR_ITEM_IDS] }
}

export function useWorkbarLayout(): {
  layout: WorkbarLayout
  move: (id: WorkbarItemId, direction: -1 | 1) => void
  setVisible: (id: WorkbarItemId, visible: boolean) => void
} {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: workbarLayoutQueryKey,
    queryFn: defaultWorkbarLayout,
    initialData: defaultWorkbarLayout,
    staleTime: Number.POSITIVE_INFINITY,
  })
  const layout = query.data

  const update = useCallback((next: WorkbarLayout): void => {
    queryClient.setQueryData(workbarLayoutQueryKey, next)
  }, [queryClient])

  const move = useCallback((id: WorkbarItemId, direction: -1 | 1): void => {
    const from = layout.order.indexOf(id)
    const to = from + direction
    if (from < 0 || to < 0 || to >= layout.order.length) return
    const order = [...layout.order]
    order.splice(to, 0, ...order.splice(from, 1))
    update({ ...layout, order })
  }, [layout, update])

  const setVisible = useCallback((id: WorkbarItemId, visible: boolean): void => {
    update({
      ...layout,
      visible: visible
        ? [...new Set([...layout.visible, id])]
        : layout.visible.filter((entry) => entry !== id),
    })
  }, [layout, update])

  return { layout, move, setVisible }
}
