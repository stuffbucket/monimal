import { useCallback, useEffect, useState } from 'react'

import type { AccountsListResponse, SettingsCapabilities } from '../capabilities'
import { describeError } from '../../shared/errors'

export function useAccounts(capabilities: SettingsCapabilities) {
  const [list, setList] = useState<AccountsListResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [switchingKey, setSwitchingKey] = useState<string | null>(null)
  const [togglingKey, setTogglingKey] = useState<string | null>(null)
  const [reordering, setReordering] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let settled = false

    const refresh = async () => {
      try {
        const next = await capabilities.accounts.list()
        if (!settled) {
          setList(next)
          setError(null)
        }
      } catch (cause) {
        if (!settled) setError(describeError(cause))
      }
    }

    void refresh()
    const unsubscribe = capabilities.subscribe(() => void refresh())

    return () => {
      settled = true
      unsubscribe()
    }
  }, [capabilities, reloadKey])

  const switchAccount = useCallback(async (key: string) => {
    setSwitchingKey(key)
    setError(null)
    try {
      await capabilities.accounts.switchTo(key)
      setList(await capabilities.accounts.list())
    } catch (cause) {
      setError(describeError(cause))
    } finally {
      setSwitchingKey(null)
    }
  }, [capabilities])

  const setAccountEnabled = useCallback(async (key: string, enabled: boolean) => {
    setTogglingKey(key)
    setError(null)
    try {
      await capabilities.accounts.setEnabled(key, enabled)
      setList(await capabilities.accounts.list())
    } catch (cause) {
      setError(describeError(cause))
    } finally {
      setTogglingKey(null)
    }
  }, [capabilities])

  const reorderAccounts = useCallback(async (index: number, direction: -1 | 1) => {
    if (!list) return
    const next = [...list.accounts]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setReordering(true)
    try {
      await capabilities.accounts.reorder(next.map((account) => account.key))
      setList({ ...list, accounts: next })
    } catch (cause) {
      setError(describeError(cause))
    } finally {
      setReordering(false)
    }
  }, [capabilities, list])

  return {
    list,
    error,
    switchingKey,
    togglingKey,
    busy: switchingKey !== null || togglingKey !== null || reordering,
    reload: () => setReloadKey((key) => key + 1),
    switchAccount,
    setAccountEnabled,
    reorderAccounts,
  }
}