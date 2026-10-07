import { useMutation, useQuery } from '@tanstack/react-query'

import { UI_MODES, type UiMode, type UiModeState } from '../shared/host'

const UI_MODE_QUERY_KEY = ['native', 'ui-mode'] as const

export interface UiModeControl {
  state: UiModeState | null
  switching: boolean
  switchTo: (mode: UiMode) => void
}

/** The workspace window's renderer choice; switching reloads the window from main. */
export function useUiMode(): UiModeControl {
  const query = useQuery({
    queryKey: UI_MODE_QUERY_KEY,
    queryFn: () => window.maximal.uiMode.get(),
    staleTime: Infinity,
  })
  const mutation = useMutation({
    mutationFn: (mode: UiMode) => window.maximal.uiMode.set(mode),
  })
  return {
    state: query.data ?? null,
    switching: mutation.isPending,
    switchTo: (mode) => mutation.mutate(mode),
  }
}

export const UI_MODE_LABELS: Record<UiMode, string> = {
  legacy: 'Legacy UI',
  'design-system': 'Design system UI',
  spike: 'Design system spike',
}

/** Every mode the switch can offer, in declaration order. */
export const SWITCHABLE_UI_MODES: readonly UiMode[] = UI_MODES
