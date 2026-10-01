import {
  useCallback,
  useEffect,
  useState,
} from 'react'
import type { ShellIconName } from '@maximal/maximal-electron/renderer'

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

export const WORKBAR_STORAGE_KEY = 'maximal.workbar.layout'
const WORKBAR_LAYOUT_EVENT = 'maximal:workbar-layout-changed'
const WORKBAR_ITEM_IDS = WORKBAR_ITEMS.map(({ id }) => id)

export function defaultWorkbarLayout(): WorkbarLayout {
  return { order: [...WORKBAR_ITEM_IDS], visible: [...WORKBAR_ITEM_IDS] }
}

function isWorkbarItemId(value: unknown): value is WorkbarItemId {
  return typeof value === 'string'
    && WORKBAR_ITEM_IDS.includes(value as WorkbarItemId)
}

export function loadWorkbarLayout(): WorkbarLayout {
  const fallback = defaultWorkbarLayout()
  if (typeof localStorage === 'undefined') return fallback
  const stored = localStorage.getItem(WORKBAR_STORAGE_KEY)
  if (stored === null) return fallback

  try {
    const parsed = JSON.parse(stored) as Partial<WorkbarLayout>
    const savedOrder = Array.isArray(parsed.order)
      ? parsed.order.filter(isWorkbarItemId)
      : []
    const order = [
      ...new Set(savedOrder),
      ...fallback.order.filter((id) => !savedOrder.includes(id)),
    ]
    const visible = Array.isArray(parsed.visible)
      ? [...new Set(parsed.visible.filter(isWorkbarItemId))]
      : fallback.visible
    return { order, visible }
  } catch (error) {
    console.warn('Ignoring invalid workbar layout preference.', error)
    return fallback
  }
}

function saveWorkbarLayout(layout: WorkbarLayout): void {
  localStorage.setItem(WORKBAR_STORAGE_KEY, JSON.stringify(layout))
  window.dispatchEvent(new CustomEvent(WORKBAR_LAYOUT_EVENT, { detail: layout }))
}

export function useWorkbarLayout(): {
  layout: WorkbarLayout
  move: (id: WorkbarItemId, direction: -1 | 1) => void
  setVisible: (id: WorkbarItemId, visible: boolean) => void
} {
  const [layout, setLayout] = useState(loadWorkbarLayout)

  useEffect(() => {
    const sync = (event: Event): void => {
      const next = (event as CustomEvent<WorkbarLayout>).detail
      setLayout(next ?? loadWorkbarLayout())
    }
    const syncStorage = (): void => setLayout(loadWorkbarLayout())
    window.addEventListener(WORKBAR_LAYOUT_EVENT, sync)
    window.addEventListener('storage', syncStorage)
    return () => {
      window.removeEventListener(WORKBAR_LAYOUT_EVENT, sync)
      window.removeEventListener('storage', syncStorage)
    }
  }, [])

  const update = useCallback((next: WorkbarLayout): void => {
    setLayout(next)
    saveWorkbarLayout(next)
  }, [])

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
