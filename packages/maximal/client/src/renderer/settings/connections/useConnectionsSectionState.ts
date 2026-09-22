import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, RefObject, SetStateAction } from 'react'

import type {
  ApiKeysListResponse,
  AppEntry,
  AppsListResponse,
  ClientInstallation,
  ConnectionAction,
  ConnectionEntry,
  ConnectionsListResponse,
  SettingsCapabilities,
} from '../capabilities'
import { describeError } from '../../shared/errors'
import { configuredApps, manualClients } from './connections-section-content'

function useConnectionsInventory(capabilities: SettingsCapabilities) {
  const mounted = useRef(true)
  const [proxyUrl, setProxyUrl] = useState<string | null>(null)
  const [connections, setConnections] = useState<ConnectionsListResponse | null>(null)
  const [apps, setApps] = useState<AppsListResponse | null>(null)
  const [installations, setInstallations] = useState<ReadonlyMap<string, ClientInstallation>>(new Map())
  const [refreshing, setRefreshing] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [nextProxyUrl, nextConnections, nextApps, nextInstallations] = await Promise.all([
        capabilities.connection.proxyUrl(),
        capabilities.connections.list(),
        capabilities.apps.list(),
        capabilities.connections.installations(),
      ])
      if (!mounted.current) return
      setProxyUrl(nextProxyUrl)
      setConnections(nextConnections)
      setApps(nextApps)
      setInstallations(new Map(nextInstallations.map((entry) => [entry.id, entry])))
      setError(null)
    } catch (cause) {
      if (mounted.current) setError(describeError(cause))
    }
  }, [capabilities])

  useEffect(() => {
    let cancelled = false
    mounted.current = true
    queueMicrotask(() => {
      if (cancelled) return
      void refresh().finally(() => {
        if (!cancelled && mounted.current) setRefreshing(false)
      })
    })
    const unsubscribe = capabilities.subscribe(() => {
      void refresh()
    })
    return () => {
      cancelled = true
      mounted.current = false
      unsubscribe()
    }
  }, [capabilities, refresh])

  const rescan = useCallback(() => {
    setRefreshing(true)
    setError(null)
    void refresh().finally(() => {
      if (mounted.current) setRefreshing(false)
    })
  }, [refresh])

  return {
    mounted,
    proxyUrl,
    connections,
    apps,
    installations,
    refreshing,
    error,
    setConnections,
    setApps,
    setError,
    rescan,
  }
}

function useManagedConnectionActions(
  capabilities: SettingsCapabilities,
  mounted: RefObject<boolean>,
  setConnections: Dispatch<SetStateAction<ConnectionsListResponse | null>>,
  setRevealed: Dispatch<SetStateAction<Record<string, string>>>,
  setBusyAction: Dispatch<SetStateAction<string | null>>,
  setError: Dispatch<SetStateAction<string | null>>,
) {
  const actOnConnection = useCallback(async (connection: ConnectionEntry, action: ConnectionAction) => {
    setBusyAction(`${connection.id}:${action}`)
    setError(null)
    try {
      const updated = await capabilities.connections.act(connection.id, action)
      if (!mounted.current) return
      setConnections((current) =>
        current === null
          ? current
          : {
              ...current,
              clients: current.clients.map((entry) => (entry.id === updated.id ? updated : entry)),
            },
      )
      setRevealed((current) => {
        if (updated.credential?.id === connection.credential?.id) return current
        const next = { ...current }
        if (connection.credential) delete next[connection.credential.id]
        return next
      })
    } catch (cause) {
      if (mounted.current) setError(describeError(cause))
    } finally {
      if (mounted.current) setBusyAction(null)
    }
  }, [capabilities, mounted, setBusyAction, setConnections, setError, setRevealed])

  const revealCredential = useCallback(async (connection: ConnectionEntry) => {
    const credential = connection.credential
    if (!credential) return
    setBusyAction(`reveal:${credential.id}`)
    setError(null)
    try {
      const result = await capabilities.connections.revealCredential(credential.id)
      if (mounted.current) {
        setRevealed((current) => ({ ...current, [result.id]: result.key }))
      }
    } catch (cause) {
      if (mounted.current) setError(describeError(cause))
    } finally {
      if (mounted.current) setBusyAction(null)
    }
  }, [capabilities, mounted, setBusyAction, setError, setRevealed])

  const hideCredential = useCallback((credentialId: string) => {
    setRevealed((current) => {
      const next = { ...current }
      delete next[credentialId]
      return next
    })
  }, [setRevealed])

  return { actOnConnection, revealCredential, hideCredential }
}

function useManualKeyActions(
  capabilities: SettingsCapabilities,
  mounted: RefObject<boolean>,
  setConnections: Dispatch<SetStateAction<ConnectionsListResponse | null>>,
  setManualKeys: Dispatch<SetStateAction<ApiKeysListResponse | null>>,
  setKeysOpen: Dispatch<SetStateAction<boolean>>,
  setBusyAction: Dispatch<SetStateAction<string | null>>,
  setError: Dispatch<SetStateAction<string | null>>,
) {
  const mutateManualKeys = useCallback(async (action: () => Promise<void>) => {
    setBusyAction('manual-keys')
    setError(null)
    try {
      await action()
      const [nextKeys, nextConnections] = await Promise.all([
        capabilities.apiKeys.list(),
        capabilities.connections.list(),
      ])
      if (!mounted.current) return
      setManualKeys(nextKeys)
      setConnections(nextConnections)
    } catch (cause) {
      if (mounted.current) setError(describeError(cause))
    } finally {
      if (mounted.current) setBusyAction(null)
    }
  }, [capabilities, mounted, setBusyAction, setConnections, setError, setManualKeys])

  const openManualKeys = useCallback(async () => {
    setBusyAction('manual-keys')
    setError(null)
    try {
      const list = await capabilities.apiKeys.list()
      if (!mounted.current) return
      setManualKeys(list)
      setKeysOpen(true)
    } catch (cause) {
      if (mounted.current) setError(describeError(cause))
    } finally {
      if (mounted.current) setBusyAction(null)
    }
  }, [capabilities, mounted, setBusyAction, setError, setKeysOpen, setManualKeys])

  const addManualClient = useCallback((label: string) => {
    void mutateManualKeys(async () => {
      await capabilities.apiKeys.create({ label })
    })
  }, [capabilities, mutateManualKeys])

  const removeManualClient = useCallback((id: string) => {
    void mutateManualKeys(async () => {
      await capabilities.apiKeys.remove(id)
    })
  }, [capabilities, mutateManualKeys])

  const toggleManualClient = useCallback((id: string, enabled: boolean) => {
    void mutateManualKeys(async () => {
      await capabilities.apiKeys.update(id, { enabled })
    })
  }, [capabilities, mutateManualKeys])

  return { openManualKeys, addManualClient, removeManualClient, toggleManualClient }
}

function useAppActions(
  capabilities: SettingsCapabilities,
  mounted: RefObject<boolean>,
  setConnections: Dispatch<SetStateAction<ConnectionsListResponse | null>>,
  setApps: Dispatch<SetStateAction<AppsListResponse | null>>,
  setFixTarget: Dispatch<SetStateAction<AppEntry | null>>,
  setBusyAction: Dispatch<SetStateAction<string | null>>,
  setError: Dispatch<SetStateAction<string | null>>,
) {
  const setEnforcement = useCallback(async (enforcing: boolean) => {
    setBusyAction('access-policy')
    setError(null)
    try {
      await capabilities.apiKeys.setEnforcement(enforcing)
      const nextConnections = await capabilities.connections.list()
      if (mounted.current) setConnections(nextConnections)
    } catch (cause) {
      if (mounted.current) setError(describeError(cause))
    } finally {
      if (mounted.current) setBusyAction(null)
    }
  }, [capabilities, mounted, setBusyAction, setConnections, setError])

  const fixApp = useCallback(async (app: AppEntry) => {
    setBusyAction(`fix:${app.id}`)
    setError(null)
    try {
      const updated = await capabilities.apps.setEnabled(app.id, true)
      if (!mounted.current) return
      setApps((current) =>
        current === null
          ? current
          : {
              ...current,
              apps: current.apps.map((entry) => (entry.id === updated.id ? updated : entry)),
            },
      )
    } catch (cause) {
      if (mounted.current) setError(describeError(cause))
    } finally {
      if (mounted.current) {
        setBusyAction(null)
        setFixTarget(null)
      }
    }
  }, [capabilities, mounted, setApps, setBusyAction, setError, setFixTarget])

  return { setEnforcement, fixApp }
}

export function useConnectionsSectionState(capabilities: SettingsCapabilities) {
  const inventory = useConnectionsInventory(capabilities)
  const [fixTarget, setFixTarget] = useState<AppEntry | null>(null)
  const [manualKeys, setManualKeys] = useState<ApiKeysListResponse | null>(null)
  const [keysOpen, setKeysOpen] = useState(false)
  const [revealed, setRevealed] = useState<Record<string, string>>({})
  const [busyAction, setBusyAction] = useState<string | null>(null)

  const managedActions = useManagedConnectionActions(
    capabilities,
    inventory.mounted,
    inventory.setConnections,
    setRevealed,
    setBusyAction,
    inventory.setError,
  )
  const manualKeyActions = useManualKeyActions(
    capabilities,
    inventory.mounted,
    inventory.setConnections,
    setManualKeys,
    setKeysOpen,
    setBusyAction,
    inventory.setError,
  )
  const appActions = useAppActions(
    capabilities,
    inventory.mounted,
    inventory.setConnections,
    inventory.setApps,
    setFixTarget,
    setBusyAction,
    inventory.setError,
  )

  return {
    proxyUrl: inventory.proxyUrl,
    openAiUrl: inventory.proxyUrl === null ? null : `${inventory.proxyUrl}/v1`,
    connections: inventory.connections,
    apps: inventory.apps,
    installations: inventory.installations,
    fixTarget,
    keysOpen,
    revealed,
    refreshing: inventory.refreshing,
    busyAction,
    error: inventory.error,
    busy: inventory.refreshing || busyAction !== null,
    clients: useMemo(() => manualClients(manualKeys), [manualKeys]),
    appEntries: useMemo(() => configuredApps(inventory.apps), [inventory.apps]),
    rescan: inventory.rescan,
    setKeysOpen,
    setFixTarget,
    dismissManualKeys: useCallback(() => setManualKeys(null), []),
    dismissFixTarget: useCallback(() => setFixTarget(null), []),
    actOnConnection: managedActions.actOnConnection,
    revealCredential: managedActions.revealCredential,
    hideCredential: managedActions.hideCredential,
    openManualKeys: manualKeyActions.openManualKeys,
    addManualClient: manualKeyActions.addManualClient,
    removeManualClient: manualKeyActions.removeManualClient,
    toggleManualClient: manualKeyActions.toggleManualClient,
    setEnforcement: appActions.setEnforcement,
    fixApp: appActions.fixApp,
  }
}