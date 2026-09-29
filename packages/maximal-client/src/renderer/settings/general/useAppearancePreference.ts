import { useCallback, useEffect, useState } from 'react'

import type {
  AppearancePreference,
  SettingsCapabilities,
} from '../capabilities'
import { describeError } from '../../shared/errors'

export function useAppearancePreference(capabilities: SettingsCapabilities) {
  const [state, setState] = useState<AppearancePreference | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let settled = false
    let changed = false
    const unsubscribe = capabilities.general.onAppearanceChange((next) => {
      changed = true
      setState(next)
      setError(null)
    })
    void capabilities.general.appearance().then(
      (next) => {
        if (!settled && !changed) setState(next)
      },
      (cause: unknown) => {
        // Stryker disable next-line ConditionalExpression: React ignores state updates after unmount; this guard avoids needless work.
        if (!settled) setError(describeError(cause))
      },
    )
    return () => {
      // Stryker disable next-line BooleanLiteral: React ignores state updates after unmount, making the false mutant externally equivalent.
      settled = true
      unsubscribe()
    }
  }, [capabilities])

  const update = useCallback(
    async (request: () => Promise<AppearancePreference>) => {
      setBusy(true)
      setError(null)
      try {
        setState(await request())
      } catch (cause) {
        setError(describeError(cause))
      } finally {
        setBusy(false)
      }
    },
    // Stryker disable next-line ArrayDeclaration: this callback has no reactive dependencies, and a stable constant dependency is equivalent.
    [],
  )

  const setVibrancyEnabled = useCallback(
    (enabled: boolean) =>
      update(() => capabilities.general.setVibrancyEnabled(enabled)),
    [capabilities, update],
  )

  const setBackgroundEffectsEnabled = useCallback(
    (enabled: boolean) =>
      update(() => capabilities.general.setBackgroundEffectsEnabled(enabled)),
    [capabilities, update],
  )

  const setReducedMotionEnabled = useCallback(
    (enabled: boolean) =>
      update(() => capabilities.general.setReducedMotionEnabled(enabled)),
    [capabilities, update],
  )

  return {
    state,
    busy,
    error,
    setVibrancyEnabled,
    setBackgroundEffectsEnabled,
    setReducedMotionEnabled,
  }
}
