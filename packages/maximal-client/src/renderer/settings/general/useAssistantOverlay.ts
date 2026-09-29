import { useCallback, useEffect, useState } from 'react'

import type {
  AssistantOverlayPreferences,
  SettingsCapabilities,
} from '../capabilities'
import { describeError } from '../../shared/errors'

export function useAssistantOverlay(capabilities: SettingsCapabilities) {
  const [preferences, setPreferences] =
    useState<AssistantOverlayPreferences | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    void capabilities.general.assistantOverlay().then(
      (next) => {
        if (active) setPreferences(next)
      },
      (cause: unknown) => {
        if (active) setError(describeError(cause))
      },
    )
    return () => {
      active = false
    }
  }, [capabilities])

  const setCandy = useCallback(async (candy: boolean) => {
    setBusy(true)
    setError(null)
    try {
      setPreferences(
        await capabilities.general.updateAssistantOverlay({ candy }),
      )
    } catch (cause) {
      setError(describeError(cause))
    } finally {
      setBusy(false)
    }
  }, [capabilities])

  return { busy, error, preferences, setCandy }
}
