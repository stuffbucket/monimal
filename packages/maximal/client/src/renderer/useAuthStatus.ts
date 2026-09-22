import { useEffect, useState } from 'react'

import type { SettingsCapabilities } from './settings/capabilities'

const POLL_MS = 3_000

export function useAuthStatus(settings: SettingsCapabilities): boolean | null {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false

    const refresh = async (): Promise<void> => {
      try {
        const status = await settings.account.status()
        if (!cancelled) setAuthenticated(status.state === 'authenticated')
      } catch {
        // Keep the current answer while Core is unavailable or still starting.
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

  return authenticated
}