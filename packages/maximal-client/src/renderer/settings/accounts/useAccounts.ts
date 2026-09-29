import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'

import type { AccountsListResponse, SettingsCapabilities } from '../capabilities'
import { describeError } from '../../shared/errors'

export const accountsQueryKey = ['account', 'saved-accounts'] as const

export function useAccounts(capabilities: SettingsCapabilities) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: accountsQueryKey,
    queryFn: () => capabilities.accounts.list(),
  })
  const list: AccountsListResponse | null = query.data ?? null
  const [actionError, setActionError] = useState<string | null>(null)
  const [switchingKey, setSwitchingKey] = useState<string | null>(null)
  const [togglingKey, setTogglingKey] = useState<string | null>(null)
  const [reordering, setReordering] = useState(false)

  useEffect(
    () =>
      capabilities.subscribe(() => {
        void queryClient.invalidateQueries({ queryKey: accountsQueryKey })
      }),
    [capabilities, queryClient],
  )

  const switchAccount = useCallback(async (key: string) => {
    setSwitchingKey(key)
    setActionError(null)
    try {
      await capabilities.accounts.switchTo(key)
      queryClient.setQueryData(
        accountsQueryKey,
        await capabilities.accounts.list(),
      )
    } catch (cause) {
      setActionError(describeError(cause))
    } finally {
      setSwitchingKey(null)
    }
  }, [capabilities, queryClient])

  const setAccountEnabled = useCallback(async (key: string, enabled: boolean) => {
    setTogglingKey(key)
    setActionError(null)
    try {
      await capabilities.accounts.setEnabled(key, enabled)
      queryClient.setQueryData(
        accountsQueryKey,
        await capabilities.accounts.list(),
      )
    } catch (cause) {
      setActionError(describeError(cause))
    } finally {
      setTogglingKey(null)
    }
  }, [capabilities, queryClient])

  const reorderAccounts = useCallback(async (index: number, direction: -1 | 1) => {
    if (!list) return
    const next = [...list.accounts]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setReordering(true)
    try {
      await capabilities.accounts.reorder(next.map((account) => account.key))
      queryClient.setQueryData(accountsQueryKey, { ...list, accounts: next })
    } catch (cause) {
      setActionError(describeError(cause))
    } finally {
      setReordering(false)
    }
  }, [capabilities, list, queryClient])

  const updateAccountLayout = useCallback(async (
    enabledKeys: string[],
    disabledKeys: string[],
  ) => {
    if (!list) return
    const enabled = new Set(enabledKeys)
    setReordering(true)
    setActionError(null)
    try {
      for (const account of list.accounts) {
        const nextEnabled = enabled.has(account.key)
        if (account.enabled !== nextEnabled) {
          await capabilities.accounts.setEnabled(account.key, nextEnabled)
        }
      }
      await capabilities.accounts.reorder([...enabledKeys, ...disabledKeys])
      queryClient.setQueryData(
        accountsQueryKey,
        await capabilities.accounts.list(),
      )
    } catch (cause) {
      setActionError(describeError(cause))
    } finally {
      setReordering(false)
    }
  }, [capabilities, list, queryClient])

  return {
    list,
    error:
      actionError ?? (query.error === null ? null : describeError(query.error)),
    switchingKey,
    togglingKey,
    busy: switchingKey !== null || togglingKey !== null || reordering,
    reload: () =>
      void queryClient.invalidateQueries({ queryKey: accountsQueryKey }),
    switchAccount,
    setAccountEnabled,
    reorderAccounts,
    updateAccountLayout,
  }
}