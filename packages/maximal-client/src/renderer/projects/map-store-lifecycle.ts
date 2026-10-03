import { useEffect, useState } from 'react'
import type { ProjectMapStore } from '@maximal/maximal-project-browser'

export function useOwnedMapStoreCleanup(
  store: ProjectMapStore,
  externalStore?: ProjectMapStore,
): void {
  const [generations] = useState(() => new WeakMap<ProjectMapStore, number>())
  useEffect(() => {
    const lifecycle = (generations.get(store) ?? 0) + 1
    generations.set(store, lifecycle)
    return () => {
      queueMicrotask(() => {
        if (!externalStore && generations.get(store) === lifecycle) store.destroy()
      })
    }
  }, [externalStore, generations, store])
}
