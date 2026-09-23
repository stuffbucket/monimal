import { useEffect, useState } from 'react'

import type { ShutdownSnapshot } from '../shared/bridge-types'

export function useShutdownStatus(): ShutdownSnapshot | null {
  const [snapshot, setSnapshot] = useState<ShutdownSnapshot | null>(null)

  useEffect(() => {
    let active = true
    void window.maximal.shutdown.current().then((current) => {
      if (active) setSnapshot(current)
    })
    const unsubscribe = window.maximal.shutdown.onChange(setSnapshot)
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  return snapshot
}
