import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import type { AssistantOutputFont } from '@maximal/maximal-harness'

import type {
  AssistantOverlayPreferences,
  SettingsCapabilities,
} from '../capabilities'
import { describeError } from '../../shared/errors'

const assistantOverlayQueryKey = ['settings', 'assistant-overlay'] as const

export function useAssistantOverlay(capabilities: SettingsCapabilities) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: assistantOverlayQueryKey,
    queryFn: () => capabilities.general.assistantOverlay(),
  })
  const mutation = useMutation({
    mutationFn: (
      update: Partial<Pick<AssistantOverlayPreferences, 'candy' | 'outputFont'>>,
    ) => capabilities.general.updateAssistantOverlay(update),
    onSuccess: (next) => {
      queryClient.setQueryData(assistantOverlayQueryKey, next)
    },
  })

  const setCandy = useCallback(async (candy: boolean) => {
    await mutation.mutateAsync({ candy }).catch(() => undefined)
  }, [mutation])

  const setOutputFont = useCallback(async (outputFont: AssistantOutputFont) => {
    await mutation.mutateAsync({ outputFont }).catch(() => undefined)
  }, [mutation])

  const error = mutation.error ?? query.error
  return {
    busy: mutation.isPending,
    error: error === null ? null : describeError(error),
    preferences: query.data ?? null,
    setCandy,
    setOutputFont,
  }
}
