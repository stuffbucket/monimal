import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import type {
  AgentEffort,
  AssistantOutputFont,
} from '@maximal/maximal-harness'

import type {
  AssistantOverlayPreferences,
  SettingsCapabilities,
} from '../capabilities'
import { describeError } from '../../shared/errors'

const assistantOverlayQueryKey = ['settings', 'assistant-overlay'] as const
const assistantProviderQueryKey = ['settings', 'assistant-provider'] as const

export function useAssistantOverlay(capabilities: SettingsCapabilities) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: assistantOverlayQueryKey,
    queryFn: () => capabilities.general.assistantOverlay(),
  })
  const providerQuery = useQuery({
    queryKey: assistantProviderQueryKey,
    queryFn: () => capabilities.general.assistantProvider(),
  })
  const preferenceMutation = useMutation({
    mutationFn: (
      update: Partial<Pick<AssistantOverlayPreferences, 'candy' | 'outputFont'>>,
    ) => capabilities.general.updateAssistantOverlay(update),
    onSuccess: (next) => {
      queryClient.setQueryData(assistantOverlayQueryKey, next)
    },
  })
  const modelMutation = useMutation({
    mutationFn: (modelKey: string) =>
      capabilities.general.setAssistantModel(modelKey),
    onSuccess: (next) => {
      queryClient.setQueryData(assistantProviderQueryKey, next)
    },
  })
  const effortMutation = useMutation({
    mutationFn: (effort: AgentEffort) =>
      capabilities.general.setAssistantEffort(effort),
    onSuccess: (next) => {
      queryClient.setQueryData(assistantProviderQueryKey, next)
    },
  })

  const setCandy = useCallback(async (candy: boolean) => {
    await preferenceMutation.mutateAsync({ candy }).catch(() => undefined)
  }, [preferenceMutation])

  const setOutputFont = useCallback(async (outputFont: AssistantOutputFont) => {
    await preferenceMutation.mutateAsync({ outputFont }).catch(() => undefined)
  }, [preferenceMutation])

  const setModel = useCallback(async (modelKey: string) => {
    await modelMutation.mutateAsync(modelKey).catch(() => undefined)
  }, [modelMutation])

  const setEffort = useCallback(async (effort: AgentEffort) => {
    await effortMutation.mutateAsync(effort).catch(() => undefined)
  }, [effortMutation])

  const error =
    preferenceMutation.error
    ?? modelMutation.error
    ?? effortMutation.error
    ?? query.error
    ?? providerQuery.error
  return {
    busy:
      preferenceMutation.isPending
      || modelMutation.isPending
      || effortMutation.isPending,
    error: error === null ? null : describeError(error),
    preferences: query.data ?? null,
    provider: providerQuery.data ?? null,
    setCandy,
    setEffort,
    setModel,
    setOutputFont,
  }
}
