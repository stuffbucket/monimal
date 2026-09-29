import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'

import type {
  MenuBarModeAttempt,
  MenuBarModeState,
  SettingsCapabilities,
} from '../capabilities'
import { describeError } from '../../shared/errors'

function secondsRemaining(deadlineMs: number): number {
  return Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1_000))
}

export const menuBarModeQueryKey = [
  'settings',
  'general',
  'menu-bar-mode',
] as const

export function useMenuBarPresence(capabilities: SettingsCapabilities) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: menuBarModeQueryKey,
    queryFn: () => capabilities.general.menuBarMode(),
  })
  const [attempt, setAttempt] = useState<MenuBarModeAttempt | null>(null)
  const [remaining, setRemaining] = useState(0)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const setState = useCallback(
    (state: MenuBarModeState) =>
      queryClient.setQueryData(menuBarModeQueryKey, state),
    [queryClient],
  )

  useEffect(() => {
    if (attempt === null) return
    const update = (): void => {
      const next = secondsRemaining(attempt.deadlineMs)
      setRemaining(next)
      if (next === 0) {
        setAttempt(null)
        setState({ enabled: false, pending: false })
      }
    }
    update()
    const timer = window.setInterval(update, 250)
    return () => window.clearInterval(timer)
  }, [attempt, setState])

  const cancel = useCallback(async () => {
    if (attempt === null) return
    setBusy(true)
    setActionError(null)
    try {
      setState(await capabilities.general.cancelMenuBarOnly(attempt.attemptId))
      setAttempt(null)
    } catch (cause) {
      setActionError(describeError(cause))
      setAttempt(null)
      await query.refetch()
    } finally {
      setBusy(false)
    }
  }, [attempt, capabilities, query, setState])

  const changeMode = useCallback(
    async (enabled: boolean) => {
      setBusy(true)
      setActionError(null)
      try {
        if (enabled) {
          const nextAttempt = await capabilities.general.beginMenuBarOnly()
          setAttempt(nextAttempt)
          setRemaining(secondsRemaining(nextAttempt.deadlineMs))
          setState({ enabled: true, pending: true })
        } else {
          setState(await capabilities.general.disableMenuBarOnly())
        }
      } catch (cause) {
        setActionError(describeError(cause))
        await query.refetch()
      } finally {
        setBusy(false)
      }
    },
    [capabilities, query, setState],
  )

  const confirm = useCallback(async () => {
    if (attempt === null) return
    setBusy(true)
    setActionError(null)
    try {
      setState(
        await capabilities.general.confirmMenuBarOnly(attempt.attemptId),
      )
      setAttempt(null)
    } catch (cause) {
      setActionError(describeError(cause))
      setAttempt(null)
      await query.refetch()
    } finally {
      setBusy(false)
    }
  }, [attempt, capabilities, query, setState])

  return {
    state: query.data ?? null,
    attempt,
    remaining,
    busy,
    error:
      actionError ?? (query.error === null ? null : describeError(query.error)),
    cancel,
    changeMode,
    confirm,
  }
}