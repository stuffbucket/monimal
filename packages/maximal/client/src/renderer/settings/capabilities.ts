import type {
  AccountsListResponse,
  AccountSummary,
  ApiKeyCreateRequest,
  ApiKeyEntry,
  ApiKeysListResponse,
  ApiKeyUpdateRequest,
  AppEntry,
  AppsListResponse,
  AuthStatus,
  DiagnosticsResponse,
  ModelsListResponse,
  TokenUsagePeriod,
  TokenUsageSummary,
} from '@stuffbucket/maximal-core/settings-types'

import type {
  LocalModelCancelResult,
  LocalModelCatalogSnapshot,
  LocalModelEnsureResult,
  LocalModelOperationEvent,
  MenuBarModeAttempt,
  MenuBarModeState,
} from '../../shared/bridge-types'

import type { MaximalBridge } from '../../preload'
import {
  isSettingsSectionId,
  type SettingsSectionId,
} from '../../shared/settings-sections'
import { unwrapControlResult } from '../shared/control-error'

export type {
  AccountsListResponse,
  AccountSummary,
  ApiKeyCreateRequest,
  ApiKeyEntry,
  ApiKeysListResponse,
  ApiKeyUpdateRequest,
  AppEntry,
  AppsListResponse,
  AuthStatus,
  DiagnosticsResponse,
  MenuBarModeAttempt,
  MenuBarModeState,
  ModelsListResponse,
  LocalModelCancelResult,
  LocalModelCatalogSnapshot,
  LocalModelEnsureResult,
  LocalModelOperationEvent,
  TokenUsagePeriod,
  TokenUsageSummary,
}

/** Narrow UI contract; Electron transport stays inside this adapter. */
export interface SettingsCapabilities {
  readonly kind: 'main-bridge'
  subscribe(onChange: () => void): () => void
  account: {
    status(): Promise<AuthStatus>
    start(): Promise<AuthStatus>
    cancel(): Promise<AuthStatus>
    signOut(): Promise<void>
  }
  accounts: {
    list(): Promise<AccountsListResponse>
    switchTo(key: string): Promise<void>
  }
  general: {
    menuBarMode(): Promise<MenuBarModeState>
    beginMenuBarOnly(): Promise<MenuBarModeAttempt>
    confirmMenuBarOnly(attemptId: string): Promise<MenuBarModeState>
    cancelMenuBarOnly(attemptId: string): Promise<MenuBarModeState>
    disableMenuBarOnly(): Promise<MenuBarModeState>
  }
  apps: {
    list(): Promise<AppsListResponse>
    setEnabled(appId: AppEntry['id'], enabled: boolean): Promise<AppEntry>
  }
  connection: {
    /** Base URL where /v1 is served for external programs (to display/copy). */
    proxyUrl(): Promise<string>
  }
  apiKeys: {
    list(): Promise<ApiKeysListResponse>
    create(input: ApiKeyCreateRequest): Promise<ApiKeyEntry>
    update(id: string, update: ApiKeyUpdateRequest): Promise<ApiKeyEntry>
    remove(id: string): Promise<void>
    setEnforcement(enforcing: boolean): Promise<ApiKeysListResponse>
  }
  models: {
    list(): Promise<ModelsListResponse>
    refresh(): Promise<ModelsListResponse>
  }
  localModels: {
    list(): Promise<LocalModelCatalogSnapshot>
    ensure(modelKey: string): Promise<LocalModelEnsureResult>
    cancel(operationId: string): Promise<LocalModelCancelResult>
    openFolder(): Promise<void>
    subscribe(listener: (event: LocalModelOperationEvent) => void): () => void
  }
  usage: {
    get(period: TokenUsagePeriod): Promise<TokenUsageSummary>
  }
  logs: {
    location(): Promise<string>
    reveal(): Promise<void>
  }
  diagnostics: {
    get(): Promise<DiagnosticsResponse>
  }
  /**
   * The application menu asking for this surface.
   *
   * Here rather than read from `window.maximal` at the call site, because this
   * adapter is the renderer's only boundary to the named bridge and the surface
   * that answers a menu request should not be the exception. `null` means the
   * surface itself, with no section singled out. Returns an unsubscribe.
   */
  onOpenRequest(
    listener: (sectionId: SettingsSectionId | null) => void,
  ): () => void
  openExternal(url: string): Promise<void>
}

/**
 * Track the public proxy URL across sidecar restarts. A ready event is newer
 * than the asynchronous seed and must not be overwritten when that seed lands.
 */
export function createProxyUrlTracker(
  initialProxyUrlPromise: Promise<string>,
  bridge: Pick<MaximalBridge, 'onCoreStatus'>,
): { current(): Promise<string> } {
  let seeded = false
  let value = ''
  let error: Error | null = null
  let waiters: Array<{
    resolve(url: string): void
    reject(cause: unknown): void
  }> = []

  function setValue(url: string): void {
    seeded = true
    value = url
    error = null
    const pending = waiters
    waiters = []
    for (const waiter of pending) waiter.resolve(url)
  }

  function setError(cause: unknown): void {
    if (seeded) return
    error =
      cause instanceof Error
        ? cause
        : new Error('Could not resolve the proxy URL', { cause })
    const pending = waiters
    waiters = []
    for (const waiter of pending) waiter.reject(error)
  }

  bridge.onCoreStatus((status) => {
    if (status.phase === 'ready') setValue(status.proxyUrl)
  })

  void initialProxyUrlPromise.then(
    (url) => {
      if (!seeded && url) setValue(url)
    },
    (cause: unknown) => setError(cause),
  )

  return {
    current: () => {
      if (seeded) return Promise.resolve(value)
      if (error !== null) return Promise.reject(error)
      return new Promise((resolve, reject) =>
        waiters.push({ resolve, reject }),
      )
    },
  }
}

/** The single Settings adapter allowed to touch `window.maximal`. */
export function createCoreSettingsCapabilities(): SettingsCapabilities {
  const bridge = window.maximal
  const proxyUrlTracker = createProxyUrlTracker(
    bridge.getProxyUrl(),
    bridge,
  )

  return {
    kind: 'main-bridge',
    subscribe: (onChange) => bridge.control.onChange(onChange),
    account: {
      status: async () =>
        unwrapControlResult(await bridge.control.authStatus()),
      start: async () =>
        unwrapControlResult(await bridge.control.authStart()),
      cancel: async () =>
        unwrapControlResult(await bridge.control.authCancel()),
      signOut: async () => {
        unwrapControlResult(await bridge.control.authSignOut())
      },
    },
    accounts: {
      list: async () =>
        unwrapControlResult(await bridge.control.accountsList()),
      switchTo: async (key) => {
        unwrapControlResult(await bridge.control.accountsSwitch(key))
      },
    },
    general: {
      menuBarMode: () => bridge.menuBarMode.get(),
      beginMenuBarOnly: () => bridge.menuBarMode.beginEnable(),
      confirmMenuBarOnly: (attemptId) => bridge.menuBarMode.confirmEnable(attemptId),
      cancelMenuBarOnly: (attemptId) => bridge.menuBarMode.cancelEnable(attemptId),
      disableMenuBarOnly: () => bridge.menuBarMode.disable(),
    },
    apps: {
      list: async () => unwrapControlResult(await bridge.control.appsList()),
      setEnabled: async (appId, enabled) =>
        unwrapControlResult(await bridge.control.appsSetEnabled(appId, enabled)),
    },
    connection: {
      proxyUrl: () => proxyUrlTracker.current(),
    },
    apiKeys: {
      list: async () => unwrapControlResult(await bridge.control.apiKeysList()),
      create: async (input) =>
        unwrapControlResult(await bridge.control.apiKeysCreate(input)),
      update: async (id, update) =>
        unwrapControlResult(await bridge.control.apiKeysUpdate(id, update)),
      remove: async (id) => {
        unwrapControlResult(await bridge.control.apiKeysRemove(id))
      },
      setEnforcement: async (enforcing) =>
        unwrapControlResult(
          await bridge.control.apiKeysSetEnforcement(enforcing),
        ),
    },
    models: {
      list: async () => unwrapControlResult(await bridge.control.modelsList()),
      refresh: async () =>
        unwrapControlResult(await bridge.control.modelsRefresh()),
    },
    localModels: {
      list: async () => unwrapControlResult(await bridge.localModels.list()),
      ensure: async (modelKey) =>
        unwrapControlResult(await bridge.localModels.ensure(modelKey)),
      cancel: async (operationId) =>
        unwrapControlResult(await bridge.localModels.cancel(operationId)),
      openFolder: () => bridge.localModels.openFolder(),
      subscribe: (listener) => bridge.localModels.onChange(listener),
    },
    usage: {
      get: async (period) =>
        unwrapControlResult(await bridge.control.usageGet(period)),
    },
    logs: bridge.logs,
    diagnostics: {
      get: async () =>
        unwrapControlResult(await bridge.control.diagnosticsGet()),
    },
    // Subscribe before consuming the startup request. A menu request that lands
    // during this handshake is either delivered live or retained by main; it
    // cannot disappear between the two operations.
    onOpenRequest: (listener) => {
      const unsubscribe = bridge.onOpenSettings((sectionId) => {
        listener(isSettingsSectionId(sectionId) ? sectionId : null)
      })
      void bridge
        .pendingSettingsRequest()
        .then((request) => {
          if (request !== null) {
            listener(
              isSettingsSectionId(request.sectionId) ? request.sectionId : null,
            )
          }
        })
        .catch(() => {
          // A renderer can still receive live requests. Do not turn a failed
          // startup consume into an unhandled rejection that breaks that path.
        })
      return unsubscribe
    },
    openExternal: (url) => bridge.openExternal(url),
  }
}
