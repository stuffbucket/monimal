import { useEffect, useState } from 'react'

import type { AuthStatus, SettingsCapabilities } from './settings/capabilities'

const POLL_MS = 3_000

export function useAccountStatus(settings: SettingsCapabilities): AuthStatus | null {
  const [status, setStatus] = useState<AuthStatus | null>(null)

  useEffect(() => {
    let cancelled = false

    const refresh = async (): Promise<void> => {
      try {
        const next = await settings.account.status()
        if (!cancelled) setStatus(next)
      } catch {
        // The subscription and poll retry after transient Core startup failures.
      }
    }

    void refresh()
    const unsubscribe = settings.subscribe(() => void refresh())
    const poll = setInterval(() => void refresh(), POLL_MS)
    return () => {
      cancelled = true
      unsubscribe()
      clearInterval(poll)
    }
  }, [settings])

  return status
}