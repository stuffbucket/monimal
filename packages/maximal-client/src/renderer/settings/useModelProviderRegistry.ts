import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type {
  LocalModelCatalogSnapshot,
  LocalModelOperationEvent,
  ModelsListResponse,
  SettingsCapabilities,
} from './capabilities'
import { describeError } from '../shared/errors'
import {
  cloudProviderId,
  configuredCloudProviderIds,
  readProviderAccess,
  type CloudModelProvider,
  useCloudModelProviders,
} from './cloud-model-providers'

interface CachedInventory {
  catalogue: ModelsListResponse | null
  local: LocalModelCatalogSnapshot | null
}

export type ModelInventoryState = 'current' | 'stale' | 'unavailable'

export interface ModelProviderInventory extends CloudModelProvider {
  locations: ReadonlyArray<'cloud' | 'local'>
  modelCount: number
  state: ModelInventoryState
}

const inventoryCache = new WeakMap<SettingsCapabilities, CachedInventory>()

function cachedInventory(capabilities: SettingsCapabilities): CachedInventory {
  const cached = inventoryCache.get(capabilities)
  if (cached !== undefined) return cached
  const created = { catalogue: null, local: null }
  inventoryCache.set(capabilities, created)
  return created
}

export function reconcileProviderInventory(
  catalogue: ModelsListResponse | null,
  local: LocalModelCatalogSnapshot | null,
  providerAccess: ReturnType<typeof useCloudModelProviders>['providers'],
  state: ModelInventoryState,
): ModelProviderInventory[] {
  const providers = new Map<string, ModelProviderInventory>()
  const known = new Map(providerAccess.map((provider) => [provider.id, provider]))

  for (const provider of providerAccess) {
    providers.set(provider.id, {
      id: provider.id,
      name: provider.name,
      active: provider.active,
      available: provider.available,
      configured: provider.configured,
      configurable: provider.configurable,
      description: provider.description,
      enabled: provider.enabled,
      locations: ['cloud'],
      modelCount: 0,
      state,
    })
  }

  for (const model of catalogue?.models ?? []) {
    const id = cloudProviderId(model)
    const access = known.get(id)
    if (access !== undefined && !access.configured) continue
    const location = model.location ?? 'cloud'
    const current = providers.get(id) ?? {
      id,
      name: model.vendor.trim() || id,
      active: true,
      available: true,
      configured: true,
      configurable: false,
      description: 'Enabled · Configured outside Maximal',
      enabled: true,
      locations: [],
      modelCount: 0,
      state,
    }
    providers.set(id, {
      ...current,
      locations: current.locations.includes(location)
        ? current.locations
        : [...current.locations, location],
      modelCount: current.modelCount + 1,
    })
  }

  const localModels = local?.models ?? []
  if (local !== null) {
    providers.set('maximal-local', {
      id: 'maximal-local',
      name: 'Maximal',
      active: true,
      available: localModels.some((model) => model.state === 'ready'),
      configured: true,
      configurable: false,
      description: localModels.some((model) => model.state === 'ready')
        ? 'Enabled · Bundled local runtime'
        : 'Unavailable · Download a bundled model',
      enabled: true,
      locations: ['local'],
      modelCount: localModels.length,
      state,
    })
  }

  return [...providers.values()]
}

export function useModelProviderRegistry(capabilities: SettingsCapabilities) {
  const cached = cachedInventory(capabilities)
  const [catalogue, setCatalogue] = useState(cached.catalogue)
  const [local, setLocal] = useState(cached.local)
  const [refreshing, setRefreshing] = useState(
    cached.catalogue === null || cached.local === null,
  )
  const [error, setError] = useState<string | null>(null)
  const [inventoryState, setInventoryState] = useState<ModelInventoryState>(
    cached.catalogue === null && cached.local === null ? 'unavailable' : 'current',
  )
  const loadRevision = useRef(0)
  const providerState = useCloudModelProviders(capabilities, catalogue)

  const load = useCallback(async (force: boolean) => {
    const revision = loadRevision.current + 1
    loadRevision.current = revision
    setRefreshing(true)
    const [catalogueResult, localResult, accessResult] = await Promise.allSettled([
      force ? capabilities.models.refresh() : capabilities.models.list(),
      capabilities.localModels.list(),
      readProviderAccess(capabilities),
    ])
    if (loadRevision.current !== revision) return

    const failures: string[] = []
    const next = cachedInventory(capabilities)
    if (catalogueResult.status === 'fulfilled') {
      next.catalogue = catalogueResult.value
      setCatalogue(catalogueResult.value)
    } else {
      failures.push(describeError(catalogueResult.reason))
    }
    if (localResult.status === 'fulfilled') {
      next.local = localResult.value
      setLocal(localResult.value)
    } else {
      failures.push(describeError(localResult.reason))
    }
    if (accessResult.status === 'fulfilled' && next.catalogue !== null) {
      const configured = configuredCloudProviderIds(accessResult.value)
      const models = next.catalogue.models.filter((model) => {
        const provider = cloudProviderId(model)
        return provider !== 'github-copilot' && provider !== 'ollama'
          || configured.has(provider)
      })
      if (models.length !== next.catalogue.models.length) {
        next.catalogue = {
          ...next.catalogue,
          models,
          count: models.length,
        }
        setCatalogue(next.catalogue)
      }
    } else if (accessResult.status === 'rejected') {
      failures.push(describeError(accessResult.reason))
    }

    inventoryCache.set(capabilities, next)
    setError(failures.length === 0 ? null : failures.join(' · '))
    setInventoryState(
      failures.length === 0
        ? 'current'
        : next.catalogue !== null || next.local !== null
          ? 'stale'
          : 'unavailable',
    )
    setRefreshing(false)
  }, [capabilities])

  useEffect(() => {
    let active = true
    const refresh = () => {
      if (active) void load(false)
    }
    const unsubscribeSettings = capabilities.subscribe(refresh)
    const unsubscribeLocal = capabilities.localModels.subscribe(
      (event: LocalModelOperationEvent) => {
        if (!active || event.type !== 'catalog') return
        const next = cachedInventory(capabilities)
        next.local = event.snapshot
        inventoryCache.set(capabilities, next)
        setLocal(event.snapshot)
      },
    )
    const current = cachedInventory(capabilities)
    if (current.catalogue === null || current.local === null) refresh()
    return () => {
      active = false
      unsubscribeSettings()
      unsubscribeLocal()
    }
  }, [capabilities, load])

  const providers = useMemo(
    () => reconcileProviderInventory(
      catalogue,
      local,
      providerState.providers,
      inventoryState,
    ),
    [catalogue, inventoryState, local, providerState.providers],
  )
  const refresh = useCallback(() => load(true), [load])

  return {
    catalogue,
    error: error ?? providerState.error,
    inventoryState,
    local,
    providers,
    refresh,
    refreshing,
    setEnabled: providerState.setEnabled,
    updating: providerState.updating,
  }
}
