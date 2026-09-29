import { useQuery, useQueryClient } from '@tanstack/react-query'
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

interface ConnectionsInventory {
  proxyUrl: string
  connections: ConnectionsListResponse
  apps: AppsListResponse
  installations: ReadonlyMap<string, ClientInstallation>
}

const connectionsInventoryQueryKey = ['settings', 'connections', 'inventory'] as const
const EMPTY_INSTALLATIONS: ReadonlyMap<string, ClientInstallation> = new Map()

function useConnectionsInventory(capabilities: SettingsCapabilities) {
  const queryClient = useQueryClient()
  const mounted = useRef(true)
  const query = useQuery({
    queryKey: connectionsInventoryQueryKey,
    queryFn: async (): Promise<ConnectionsInventory> => {
      const [nextProxyUrl, nextConnections, nextApps, nextInstallations] = await Promise.all([
        capabilities.connection.proxyUrl(),
        capabilities.connections.list(),
        capabilities.apps.list(),
        capabilities.connections.installations(),
      ])
      return {
        proxyUrl: nextProxyUrl,
        connections: nextConnections,
        apps: nextApps,
        installations: new Map(nextInstallations.map((entry) => [entry.id, entry])),
      }
    },
  })
  const [actionError, setError] = useState<string | null>(null)
  const refetch = query.refetch

  const setConnections: Dispatch<SetStateAction<ConnectionsListResponse | null>> =
    useCallback((update) => {
      queryClient.setQueryData<ConnectionsInventory>(
        connectionsInventoryQueryKey,
        (current) => {
          if (current === undefined) return current
          const next = typeof update === 'function'
            ? update(current.connections)
            : update
          return next === null ? current : { ...current, connections: next }
        },
      )
    }, [queryClient])

  const setApps: Dispatch<SetStateAction<AppsListResponse | null>> =
    useCallback((update) => {
      queryClient.setQueryData<ConnectionsInventory>(
        connectionsInventoryQueryKey,
        (current) => {
          if (current === undefined) return current
          const next = typeof update === 'function'
            ? update(current.apps)
            : update
          return next === null ? current : { ...current, apps: next }
        },
      )
    }, [queryClient])

  useEffect(() => {
    mounted.current = true
    const unsubscribe = capabilities.subscribe(() => {
      void queryClient.invalidateQueries({
        queryKey: connectionsInventoryQueryKey,
      })
    })
    return () => {
      mounted.current = false
      unsubscribe()
    }
  }, [capabilities, queryClient])

  const rescan = useCallback(() => {
    setError(null)
    void refetch()
  }, [refetch])

  return {
    mounted,
    proxyUrl: query.data?.proxyUrl ?? null,
    connections: query.data?.connections ?? null,
    apps: query.data?.apps ?? null,
    installations: query.data?.installations ?? EMPTY_INSTALLATIONS,
    refreshing: query.isFetching,
    error:
      actionError ?? (query.error === null ? null : describeError(query.error)),
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