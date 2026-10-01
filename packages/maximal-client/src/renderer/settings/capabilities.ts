import type {
  AccountsListResponse,
  ApiKeyCreateRequest,
  ApiKeyEntry,
  ApiKeysListResponse,
  ApiKeyUpdateRequest,
  AppEntry,
  AppsListResponse,
  AuthStatus,
  ConnectionAction,
  ConnectionCredentialReveal,
  ConnectionEntry,
  ConnectionsListResponse,
  CopilotAccountUsage,
  ConnectorSettingField,
  ConnectorSettingValue,
  DiagnosticsResponse,
  ModelsListResponse,
  OllamaApiKeyTestRequest,
  OllamaApiKeyTestResponse,
  OllamaAccountsListResponse,
  OllamaSettingsResponse,
  OllamaSettingsUpdateRequest,
  SearchSettingsResponse,
  SearchSettingsUpdateRequest,
  SearchProviderValidationRequest,
  SearchProviderValidationResponse,
  SystemOneSettingsResponse,
  SystemOneSettingsUpdateRequest,
  TokenUsagePeriod,
  TokenUsageSummary,
} from '@maximal/maximal-core-contract/settings'
import type { LogFile } from '@maximal/maximal-logging'
import type {
  DiscoveryRoot,
  ProjectCatalogSnapshot,
  UpdateDiscoveryRoot,
} from '@maximal/project-catalog'

import type {
  AppearancePreference,
  ClientInstallation,
  GeneralDesktopSettings,
  LocalModelCancelResult,
  LocalModelCatalogSnapshot,
  LocalModelEnsureResult,
  LocalModelOperationEvent,
  MaximalHost,
  MenuBarModeAttempt,
  MenuBarModeState,
  OllamaRuntimeStatus,
  OllamaRuntimePreferences,
  OllamaRuntimePreferencesUpdate,
  ProviderOnboardingPreference,
  SystemNotificationStatus,
} from '../../shared/host'

import {
  settingsSectionIdFrom,
  type SettingsSectionId,
} from '../../shared/settings-sections'
import { unwrapControlResult } from '../shared/control-error'

export type {
  AccountsListResponse,
  ApiKeyCreateRequest,
  ApiKeyEntry,
  ApiKeysListResponse,
  ApiKeyUpdateRequest,
  AppEntry,
  AppsListResponse,
  AppearancePreference,
  AuthStatus,
  ConnectionAction,
  ConnectionCredentialReveal,
  ConnectionEntry,
  ConnectionsListResponse,
  CopilotAccountUsage,
  ConnectorSettingField,
  ConnectorSettingValue,
  ClientInstallation,
  DiagnosticsResponse,
  GeneralDesktopSettings,
  MenuBarModeAttempt,
  MenuBarModeState,
  ModelsListResponse,
  OllamaApiKeyTestRequest,
  OllamaApiKeyTestResponse,
  OllamaAccountsListResponse,
  OllamaRuntimePreferences,
  OllamaRuntimePreferencesUpdate,
  OllamaSettingsResponse,
  OllamaSettingsUpdateRequest,
  LocalModelCancelResult,
  LocalModelCatalogSnapshot,
  LocalModelEnsureResult,
  LocalModelOperationEvent,
  OllamaRuntimeStatus,
  SearchProviderValidationRequest,
  SearchProviderValidationResponse,
  SearchSettingsResponse,
  SearchSettingsUpdateRequest,
  SystemOneSettingsResponse,
  SystemOneSettingsUpdateRequest,
  SystemNotificationStatus,
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
    usage(): Promise<CopilotAccountUsage>
  }
  accounts: {
    list(): Promise<AccountsListResponse>
    switchTo(key: string): Promise<void>
    setEnabled(key: string, enabled: boolean): Promise<void>
    reorder(priority: string[]): Promise<void>
  }
  ollamaAccounts: {
    list(): Promise<OllamaAccountsListResponse>
  }
  ollamaSettings: {
    get(): Promise<OllamaSettingsResponse>
    update(input: OllamaSettingsUpdateRequest): Promise<OllamaSettingsResponse>
    testApiKey(input: OllamaApiKeyTestRequest): Promise<OllamaApiKeyTestResponse>
  }
  systemOneSettings: {
    get(): Promise<SystemOneSettingsResponse>
    update(input: SystemOneSettingsUpdateRequest): Promise<SystemOneSettingsResponse>
  }
  general: {
    desktopSettings(): Promise<GeneralDesktopSettings>
    setStartOnLogin(enabled: boolean): Promise<GeneralDesktopSettings>
    appearance(): Promise<AppearancePreference>
    setVibrancyEnabled(enabled: boolean): Promise<AppearancePreference>
    setBackgroundEffectsEnabled(enabled: boolean): Promise<AppearancePreference>
    setReducedMotionEnabled(enabled: boolean): Promise<AppearancePreference>
    onAppearanceChange(listener: (preference: AppearancePreference) => void): () => void
    menuBarMode(): Promise<MenuBarModeState>
    beginMenuBarOnly(): Promise<MenuBarModeAttempt>
    confirmMenuBarOnly(attemptId: string): Promise<MenuBarModeState>
    cancelMenuBarOnly(attemptId: string): Promise<MenuBarModeState>
    disableMenuBarOnly(): Promise<MenuBarModeState>
    systemNotificationStatus(): Promise<SystemNotificationStatus>
    openSystemNotificationSettings(): Promise<void>
  }
  providerOnboarding: {
    get(): Promise<ProviderOnboardingPreference>
    setDismissed(dismissed: boolean): Promise<ProviderOnboardingPreference>
  }
  projects: {
    snapshot(): Promise<ProjectCatalogSnapshot>
    addRoot(): Promise<DiscoveryRoot | null>
    updateRoot(id: string, update: UpdateDiscoveryRoot): Promise<DiscoveryRoot>
    removeRoot(id: string): Promise<void>
    refresh(rootId?: string): Promise<ProjectCatalogSnapshot>
    subscribe(listener: () => void): () => void
  }
  connections: {
    list(): Promise<ConnectionsListResponse>
    act(id: string, action: ConnectionAction): Promise<ConnectionEntry>
    revealCredential(id: string): Promise<ConnectionCredentialReveal>
    installations(): Promise<ClientInstallation[]>
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
  ollamaRuntime: {
    status(endpoint?: string): Promise<OllamaRuntimeStatus>
    launch(endpoint?: string): Promise<OllamaRuntimeStatus>
    updateContextLength(value: number): Promise<OllamaRuntimeStatus>
    preferences(): Promise<OllamaRuntimePreferences>
    updatePreferences(input: OllamaRuntimePreferencesUpdate): Promise<OllamaRuntimePreferences>
  }
  usage: {
    get(period: TokenUsagePeriod): Promise<TokenUsageSummary>
  }
  logs: {
    location(): Promise<string>
    list(): Promise<LogFile[]>
    reveal(): Promise<void>
    coreLocation(): Promise<string>
    revealCore(): Promise<void>
  }
  diagnostics: {
    get(): Promise<DiagnosticsResponse>
  }
  search: {
    get(): Promise<SearchSettingsResponse>
    update(input: SearchSettingsUpdateRequest): Promise<SearchSettingsResponse>
    validateProvider(
      input: SearchProviderValidationRequest,
    ): Promise<SearchProviderValidationResponse>
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
  copyText(text: string): Promise<void>
  openExternal(url: string): Promise<void>
}

/**
 * Track the public proxy URL across sidecar restarts. A ready event is newer
 * than the asynchronous seed and must not be overwritten when that seed lands.
 */
export function createProxyUrlTracker(
  initialProxyUrlPromise: Promise<string>,
  bridge: Pick<MaximalHost, 'onCoreStatus'>,
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
      usage: async () =>
        unwrapControlResult(await bridge.control.copilotUsageGet()),
    },
    accounts: {
      list: async () =>
        unwrapControlResult(await bridge.control.accountsList()),
      switchTo: async (key) => {
        unwrapControlResult(await bridge.control.accountsSwitch(key))
      },
      setEnabled: async (key, enabled) => {
        unwrapControlResult(
          await bridge.control.accountsSetEnabled(key, enabled),
        )
      },
      reorder: async (priority) => {
        unwrapControlResult(await bridge.control.accountsReorder(priority))
      },
    },
    ollamaAccounts: {
      list: async () =>
        unwrapControlResult(await bridge.control.ollamaAccountsList()),
    },
    ollamaSettings: {
      get: async () =>
        unwrapControlResult(await bridge.control.ollamaSettingsGet()),
      update: async (input) =>
        unwrapControlResult(await bridge.control.ollamaSettingsUpdate(input)),
      testApiKey: async (input) =>
        unwrapControlResult(await bridge.control.ollamaApiKeyTest(input)),
    },
    systemOneSettings: {
      get: async () =>
        unwrapControlResult(await bridge.control.systemOneSettingsGet()),
      update: async (input) =>
        unwrapControlResult(await bridge.control.systemOneSettingsUpdate(input)),
    },
    general: {
      desktopSettings: () => bridge.generalSettings.get(),
      setStartOnLogin: (enabled) =>
        bridge.generalSettings.setStartOnLogin(enabled),
      appearance: () => bridge.appearance.get(),
      setVibrancyEnabled: (enabled) =>
        bridge.appearance.setVibrancyEnabled(enabled),
      setBackgroundEffectsEnabled: (enabled) =>
        bridge.appearance.setBackgroundEffectsEnabled(enabled),
      setReducedMotionEnabled: (enabled) =>
        bridge.appearance.setReducedMotionEnabled(enabled),
      onAppearanceChange: (listener) => bridge.appearance.onChange(listener),
      menuBarMode: () => bridge.menuBarMode.get(),
      beginMenuBarOnly: () => bridge.menuBarMode.beginEnable(),
      confirmMenuBarOnly: (attemptId) => bridge.menuBarMode.confirmEnable(attemptId),
      cancelMenuBarOnly: (attemptId) => bridge.menuBarMode.cancelEnable(attemptId),
      disableMenuBarOnly: () => bridge.menuBarMode.disable(),
      systemNotificationStatus: () => bridge.systemNotifications.status(),
      openSystemNotificationSettings: () =>
        bridge.systemNotifications.openSettings(),
    },
    providerOnboarding: {
      get: () => bridge.providerOnboarding.get(),
      setDismissed: (dismissed) => bridge.providerOnboarding.setDismissed(dismissed),
    },
    projects: {
      snapshot: () => bridge.projects.snapshot(),
      addRoot: () => bridge.projects.addRoot(),
      updateRoot: (id, update) => bridge.projects.updateRoot(id, update),
      removeRoot: (id) => bridge.projects.removeRoot(id),
      refresh: (rootId) => bridge.projects.refresh(rootId),
      subscribe: (listener) => bridge.projects.onChange(listener),
    },
    connections: {
      list: async () =>
        unwrapControlResult(await bridge.control.connectionsList()),
      act: async (id, action) =>
        unwrapControlResult(await bridge.control.connectionsAct(id, action)),
      revealCredential: async (id) =>
        unwrapControlResult(
          await bridge.control.connectionsRevealCredential(id),
        ),
      installations: () => bridge.clientInstallations.list(),
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
    ollamaRuntime: bridge.ollamaRuntime,
    usage: {
      get: async (period) =>
        unwrapControlResult(await bridge.control.usageGet(period)),
    },
    logs: bridge.logs,
    diagnostics: {
      get: async () =>
        unwrapControlResult(await bridge.control.diagnosticsGet()),
    },
    search: {
      get: async () =>
        unwrapControlResult(await bridge.control.searchSettingsGet()),
      update: async (input) =>
        unwrapControlResult(await bridge.control.searchSettingsUpdate(input)),
      validateProvider: async (input) =>
        unwrapControlResult(await bridge.control.searchProviderValidate(input)),
    },
    // Subscribe before consuming the startup request. A menu request that lands
    // during this handshake is either delivered live or retained by main; it
    // cannot disappear between the two operations.
    onOpenRequest: (listener) => {
      const unsubscribe = bridge.onOpenSettings((sectionId) => {
        listener(settingsSectionIdFrom(sectionId))
      })
      void bridge
        .pendingSettingsRequest()
        .then((request) => {
          if (request !== null) {
            listener(
              settingsSectionIdFrom(request.sectionId),
            )
          }
        })
        .catch(() => {
          // A renderer can still receive live requests. Do not turn a failed
          // startup consume into an unhandled rejection that breaks that path.
        })
      return unsubscribe
    },
    copyText: (text) => navigator.clipboard.writeText(text),
    openExternal: (url) => bridge.openExternal(url),
  }
}
