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

export function useMenuBarPresence(capabilities: SettingsCapabilities) {
  const [state, setState] = useState<MenuBarModeState | null>(null)
  const [attempt, setAttempt] = useState<MenuBarModeAttempt | null>(null)
  const [remaining, setRemaining] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let settled = false
    void capabilities.general
      .menuBarMode()
      .then((next) => {
        if (!settled) setState(next)
      })
      .catch((cause: unknown) => {
        if (!settled) setError(describeError(cause))
      })
    return () => {
      settled = true
    }
  }, [capabilities])

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
  }, [attempt])

  const cancel = useCallback(async () => {
    if (attempt === null) return
    setBusy(true)
    setError(null)
    try {
      setState(await capabilities.general.cancelMenuBarOnly(attempt.attemptId))
      setAttempt(null)
    } catch (cause) {
      setError(describeError(cause))
      setAttempt(null)
      setState(await capabilities.general.menuBarMode())
    } finally {
      setBusy(false)
    }
  }, [attempt, capabilities])

  const changeMode = useCallback(
    async (enabled: boolean) => {
      setBusy(true)
      setError(null)
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
        setError(describeError(cause))
        setState(await capabilities.general.menuBarMode().catch(() => null))
      } finally {
        setBusy(false)
      }
    },
    [capabilities],
  )

  const confirm = useCallback(async () => {
    if (attempt === null) return
    setBusy(true)
    setError(null)
    try {
      setState(
        await capabilities.general.confirmMenuBarOnly(attempt.attemptId),
      )
      setAttempt(null)
    } catch (cause) {
      setError(describeError(cause))
      setAttempt(null)
      setState(await capabilities.general.menuBarMode().catch(() => null))
    } finally {
      setBusy(false)
    }
  }, [attempt, capabilities])

  return {
    state,
    attempt,
    remaining,
    busy,
    error,
    cancel,
    changeMode,
    confirm,
  }
}