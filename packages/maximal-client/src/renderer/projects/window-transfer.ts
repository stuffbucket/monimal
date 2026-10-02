import { useCallback, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createYProjectMapStore } from '@maximal/maximal-project-browser'
import {
  decodeTabTransfer,
  TAB_TRANSFER_MIME,
  type TabDetachPosition,
  type TabTransfer,
} from '@maximal/maximal-electron/renderer'

import type { AppTab } from '../frame/AppFrame'
import { describeError } from '../shared/errors'
import { useOwnedMapStoreCleanup } from './map-store-lifecycle'
import {
  encodeProjectWindowState,
  INITIAL_PROJECT_VIEW,
  restoreProjectWindowState,
  type ProjectBrowserView,
} from './window-state'

function projectWindowModel(state?: string) {
  const restored = state === undefined
    ? { store: createYProjectMapStore(), view: structuredClone(INITIAL_PROJECT_VIEW) }
    : restoreProjectWindowState(state)
  return { store: restored.store, view: { current: restored.view } }
}

export function useProjectWindowTransfer({
  detached,
  enabled,
  frameId,
  tabs,
  openProjects,
  closeTab,
  onError,
}: {
  detached: boolean
  enabled: boolean
  frameId: string
  tabs: AppTab[]
  openProjects: () => void
  closeTab: (id: string) => void
  onError: (message: string) => void
}) {
  const [localModel] = useState(projectWindowModel)
  const [receivedModel, setReceivedModel] = useState<ReturnType<typeof projectWindowModel>>()
  const [generation, setGeneration] = useState(0)
  const restore = useCallback((state: string) => {
    setReceivedModel(projectWindowModel(state))
    setGeneration((value) => value + 1)
  }, [])
  const windowStateQuery = useQuery({
    queryKey: ['projects', 'window-state', detached],
    enabled: enabled && detached,
    staleTime: Infinity,
    // Restored documents belong to this controller's lifetime, not a later mount.
    gcTime: 0,
    structuralSharing: false,
    select: projectWindowModel,
    queryFn: async () => {
      const state = await window.maximal.projects.windowState()
      if (state === undefined) throw new Error('The project window state is unavailable.')
      return state
    },
  })
  const { store, view } = receivedModel ?? windowStateQuery.data ?? localModel
  useOwnedMapStoreCleanup(store)
  const ready = !detached || receivedModel !== undefined || windowStateQuery.isSuccess
  const updateView = useCallback((next: ProjectBrowserView) => { view.current = next }, [view])
  const encodeState = useCallback(() => encodeProjectWindowState(store, view.current), [store, view])

  useEffect(() => {
    if (!enabled || !detached) return
    if (windowStateQuery.error) {
      onError(describeError(windowStateQuery.error))
    }
  }, [detached, enabled, onError, windowStateQuery.error])

  useEffect(() => {
    if (!enabled) return
    const stop = window.maximal.projects.onWindowRedocked((state) => {
      try {
        restore(state)
        openProjects()
      } catch (cause) {
        onError(describeError(cause))
      }
    })
    return stop
  }, [enabled, onError, openProjects, restore])

  useEffect(() => {
    if (detached && !tabs.some((tab) => tab.kind === 'projects')) window.close()
  }, [detached, tabs])

  const undock = useCallback(async (position: TabDetachPosition = {
    screenX: window.screenX + 100,
    screenY: window.screenY + 100,
  }) => {
    try {
      if (!ready) throw new Error('The project browser is still restoring its window state.')
      const completed = await window.maximal.projects.undockWindow({
        x: position.screenX, y: position.screenY, state: encodeState(),
      })
      if (!completed) throw new Error('The project browser could not be moved to a new window.')
      closeTab('projects')
    } catch (cause) {
      onError(describeError(cause))
    }
  }, [closeTab, encodeState, onError, ready])

  const receive = useCallback((transfer: TabTransfer) => {
    if (transfer.document?.kind !== 'projects' || transfer.sourceFrameId === frameId) return
    if (frameId === '') { onError('This window is not ready to receive Projects.'); return }
    void window.maximal.projects.redockWindow({
      sourceFrameId: transfer.sourceFrameId,
      targetFrameId: frameId,
      state: transfer.document.state,
    }).then((completed) => {
      if (!completed) onError('The project browser could not be docked into this window.')
    }).catch((cause: unknown) => onError(describeError(cause)))
  }, [frameId, onError])

  useEffect(() => {
    if (!enabled || detached) return
    const drop = (event: DragEvent) => {
      const data = event.dataTransfer?.getData(TAB_TRANSFER_MIME)
      const transfer = data ? decodeTabTransfer(data) : undefined
      if (transfer?.document?.kind !== 'projects' || transfer.sourceFrameId === frameId) return
      event.preventDefault()
      receive(transfer)
    }
    window.addEventListener('drop', drop)
    return () => window.removeEventListener('drop', drop)
  }, [detached, enabled, frameId, receive])

  return { store, view, updateView, generation, ready, encodeState, undock, receive }
}
