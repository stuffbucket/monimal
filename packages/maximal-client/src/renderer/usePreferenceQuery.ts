import {
  type QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useCallback, useEffect } from 'react'

import { describeError } from './shared/errors'

interface PreferenceQueryOptions<State, Input, Event> {
  readonly queryKey: QueryKey
  readonly query: () => Promise<State>
  readonly mutate: (input: Input) => Promise<State>
  readonly subscribe: (listener: (event: Event) => void) => () => void
  readonly resolveEvent: (event: Event, current?: State) => State
}

export function usePreferenceQuery<State, Input, Event>(
  options: PreferenceQueryOptions<State, Input, Event>,
) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: options.queryKey,
    queryFn: options.query,
  })
  const mutation = useMutation({
    mutationFn: options.mutate,
    onSuccess: (next) => queryClient.setQueryData(options.queryKey, next),
  })
  const mutateAsync = mutation.mutateAsync
  const resetMutation = mutation.reset

  useEffect(() => {
    const unsubscribe = options.subscribe((event) => {
      void queryClient.cancelQueries({
        queryKey: options.queryKey,
        exact: true,
      })
      queryClient.setQueryData<State>(options.queryKey, (current) =>
        options.resolveEvent(event, current),
      )
      resetMutation()
    })
    return unsubscribe
  }, [options, queryClient, resetMutation])

  const update = useCallback(
    async (input: Input) => {
      await mutateAsync(input).catch(() => undefined)
    },
    [mutateAsync],
  )

  return {
    state: query.data ?? null,
    busy: mutation.isPending,
    error:
      mutation.error === null
        ? mutation.isPending || query.error === null
          ? null
          : describeError(query.error)
        : describeError(mutation.error),
    update,
  }
}
