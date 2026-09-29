import type {
  BrowserBounds,
  BrowserCommand,
  BrowserControl,
  BrowserEvent,
  BrowserHostBridge,
  BrowserScreenshot,
  BrowserSession,
  BrowserSnapshot,
} from '@maximal/maximal-browser'
import type {
  ControlErrorReason,
  LocalModelCancelResult,
  LocalModelCatalogEntry,
  LocalModelCatalogSnapshot,
  LocalModelEnsureResult,
  LocalModelOperationEvent,
} from '@maximal/maximal-core-contract/control'
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
  DiagnosticsResponse,
  ModelsListResponse,
  OllamaApiKeyTestRequest,
  OllamaApiKeyTestResponse,
  OllamaAccountsListResponse,
  OllamaSettingsResponse,
  OllamaSettingsUpdateRequest,
  SearchProviderValidationRequest,
  SearchProviderValidationResponse,
  SearchSettingsResponse,
  SearchSettingsUpdateRequest,
  TokenUsagePeriod,
  TokenUsageSummary,
} from '@maximal/maximal-core-contract/settings'
import type {
  AgentApprovalRequest,
  AgentEffort,
  AgentEnd,
  AgentToolEvent,
  ApproveRequest,
  AskAccepted,
  ModelProgress,
  ProviderStatus,
} from '@maximal/maximal-harness'
import type { LogFile } from '@maximal/maximal-logging'
import type { OllamaRuntimeStatus } from '@maximal/maximal-ollama/contract'
import type {
  TrafficInvalidationListener,
  TrafficOverview,
  TrafficOverviewQuery,
  TrafficRequestDetail,
  TrafficRequestDetailQuery,
  TrafficRequestList,
  TrafficRequestListQuery,
} from '@maximal/maximal-observability-contract'
import type {
  TerminalDataMessage,
  TerminalExitMessage,
  TerminalSession,
} from '@maximal/maximal-terminal/renderer'
import type { ShutdownSnapshot } from '@maximal/maximal-electron/main'
import type {
  DiscoveryRoot,
  ProjectCatalogSnapshot,
  ProjectSearchResult,
  UpdateDiscoveryRoot,
} from '@maximal/project-catalog'
import type {
  TerminalDiscovery,
  TerminalLaunchRequest,
  TerminalLaunchResult,
  TerminalProfileSummary,
} from '@maximal/maximal-electron/renderer'

export type {
  LocalModelCancelResult,
  LocalModelCatalogEntry,
  LocalModelCatalogSnapshot,
  LocalModelEnsureResult,
  LocalModelOperationEvent,
}
export type { ShutdownSnapshot }
export type {
  BrowserBounds,
  BrowserCommand,
  BrowserControl,
  BrowserEvent,
  BrowserScreenshot,
  BrowserSession,
  BrowserSnapshot,
}

/** Sidecar lifecycle state that is safe to expose to the product renderer. */
export type LifecycleStatus =
  | { phase: 'starting' }
  | { phase: 'boot-status'; message: string }
  | { phase: 'ready'; proxyUrl: string; pid: number }
  | {
      phase: 'crashed'
      code: number | null
      signal: string | null
      attempt: number
      willRetry: boolean
    }
  | { phase: 'restarting'; attempt: number; delayMs: number }
  | { phase: 'failed'; reason: string }
  | { phase: 'stopped' }

export type ControlFailureReason =
  | ControlErrorReason
  | 'transport'
  | 'unsupported'

/** Serializable control failure; Electron does not preserve custom Error fields. */
export interface ControlFailure {
  reason: ControlFailureReason
  message: string
  retryable: boolean
  requestId?: string
  remediationUrl?: string
  code?: number
}

export type ControlResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ControlFailure }

/** The observability subset of the host's control surface. */
export type ObservabilityControlBridge = Pick<
  MaximalHost['control'],
  | 'observabilityOverview'
  | 'observabilityRequests'
  | 'observabilityRequest'
  | 'onTrafficInvalidation'
>

export interface PendingSettingsRequest {
  sectionId: string | null
}

export interface MenuBarModeState {
  enabled: boolean
  pending: boolean
}

export interface MenuBarModeAttempt {
  attemptId: string
  deadlineMs: number
}

export interface ProviderOnboardingPreference {
  dismissed: boolean
}

export interface AppearancePreference {
  vibrancyEnabled: boolean
  vibrancySupported: boolean
  backgroundEffectsEnabled: boolean
  reducedMotionEnabled: boolean
}

export interface OllamaRuntimePreferences {
  start_on_maximal_launch: boolean
  cloud_disabled: boolean
  restart_required: boolean
}

export interface OllamaRuntimePreferencesUpdate {
  start_on_maximal_launch?: boolean
  cloud_disabled?: boolean
}

export type { OllamaRuntimeStatus }

export interface ClientInstallation {
  id: string
  client_path: string | null
  configuration_path: string | null
}

export type TerminalPaneLayout =
  | { sessionId: string }
  | {
      direction: 'right' | 'down'
      first: TerminalPaneLayout
      second: TerminalPaneLayout
    }

export interface TerminalWindowRequest {
  id: string
  cols: number
  rows: number
  x: number
  y: number
  title: string
  canRunInBackground: boolean
  sessionIds?: string[]
  pane?: TerminalPaneLayout
}

export interface TerminalRedockRequest extends TerminalWindowRequest {
  sourceFrameId: string
  targetFrameId: string
}

export interface TerminalRedockedEvent {
  id: string
  title: string
  canRunInBackground: boolean
  pane?: TerminalPaneLayout
}

export interface TerminalPaneChangedEvent {
  id: string
  pane: TerminalPaneLayout
  revision: number
  origin: string
}

type Unsubscribe = () => void

/**
 * Everything this client asks of the host that renders it, exposed as
 * `window.maximal`. The host decides how each call is carried.
 */
export interface MaximalHost {
  /** Base URL where `/v1` is served for external programs (to display/copy). */
  getProxyUrl: () => Promise<string>
  licenses: {
    text: () => Promise<string>
  }
  /** Open a URL in the user's default browser (device-flow verification, etc.). */
  openExternal: (url: string) => Promise<void>
  getCoreStatus: () => Promise<LifecycleStatus>
  onCoreStatus: (listener: (status: LifecycleStatus) => void) => Unsubscribe
  shutdown: {
    current: () => Promise<ShutdownSnapshot>
    force: () => Promise<boolean>
    onChange: (listener: (snapshot: ShutdownSnapshot) => void) => Unsubscribe
  }
  pendingSettingsRequest: () => Promise<PendingSettingsRequest | null>
  logs: {
    location: () => Promise<string>
    list: () => Promise<LogFile[]>
    reveal: () => Promise<void>
    coreLocation: () => Promise<string>
    revealCore: () => Promise<void>
  }
  localModels: {
    list: () => Promise<ControlResult<LocalModelCatalogSnapshot>>
    ensure: (modelKey: string) => Promise<ControlResult<LocalModelEnsureResult>>
    cancel: (operationId: string) => Promise<ControlResult<LocalModelCancelResult>>
    openFolder: () => Promise<void>
    onChange: (listener: (event: LocalModelOperationEvent) => void) => Unsubscribe
  }
  ollamaRuntime: {
    status: (endpoint?: string) => Promise<OllamaRuntimeStatus>
    launch: (endpoint?: string) => Promise<OllamaRuntimeStatus>
    updateContextLength: (value: number) => Promise<OllamaRuntimeStatus>
    preferences: () => Promise<OllamaRuntimePreferences>
    updatePreferences: (input: OllamaRuntimePreferencesUpdate) => Promise<OllamaRuntimePreferences>
  }
  clientInstallations: {
    list: () => Promise<ClientInstallation[]>
  }
  menuBarMode: {
    get: () => Promise<MenuBarModeState>
    beginEnable: () => Promise<MenuBarModeAttempt>
    confirmEnable: (attemptId: string) => Promise<MenuBarModeState>
    cancelEnable: (attemptId: string) => Promise<MenuBarModeState>
    disable: () => Promise<MenuBarModeState>
  }
  providerOnboarding: {
    get: () => Promise<ProviderOnboardingPreference>
    setDismissed: (dismissed: boolean) => Promise<ProviderOnboardingPreference>
  }
  appearance: {
    get: () => Promise<AppearancePreference>
    setVibrancyEnabled: (enabled: boolean) => Promise<AppearancePreference>
    setBackgroundEffectsEnabled: (enabled: boolean) => Promise<AppearancePreference>
    setReducedMotionEnabled: (enabled: boolean) => Promise<AppearancePreference>
    onChange: (listener: (preference: AppearancePreference) => void) => Unsubscribe
  }
  projects: {
    snapshot: () => Promise<ProjectCatalogSnapshot>
    search: (query: string, limit?: number) => Promise<ProjectSearchResult[]>
    addRoot: () => Promise<DiscoveryRoot | null>
    updateRoot: (id: string, update: UpdateDiscoveryRoot) => Promise<DiscoveryRoot>
    removeRoot: (id: string) => Promise<void>
    refresh: (rootId?: string) => Promise<ProjectCatalogSnapshot>
    opened: (projectId: string) => Promise<void>
    onChange: (listener: () => void) => Unsubscribe
  }
  harness: {
    show: () => Promise<void>
    hide: () => Promise<void>
    provider: () => Promise<ProviderStatus>
    selectModel: (modelKey: string) => Promise<ProviderStatus>
    selectEffort: (effort: AgentEffort) => Promise<ProviderStatus>
    ask: (prompt: string) => Promise<AskAccepted>
    abort: () => Promise<void>
    approve: (request: ApproveRequest) => Promise<void>
    ensureModel: () => Promise<ModelProgress>
    onDelta: (listener: (text: string) => void) => Unsubscribe
    onTool: (listener: (event: AgentToolEvent) => void) => Unsubscribe
    onApproval: (listener: (request: AgentApprovalRequest) => void) => Unsubscribe
    onEnd: (listener: (result: AgentEnd) => void) => Unsubscribe
    onModelProgress: (listener: (progress: ModelProgress) => void) => Unsubscribe
  }
  browser: BrowserHostBridge
  terminal: {
    spawn: (request: { id: string; cols: number; rows: number; shell?: string; cwd?: string }) => Promise<void>
    write: (id: string, data: string) => Promise<void>
    resize: (id: string, cols: number, rows: number) => Promise<void>
    acknowledge: (id: string, sequence: number) => Promise<void>
    terminate: (id: string) => Promise<void>
    list: () => Promise<TerminalSession[]>
    profiles: () => Promise<TerminalProfileSummary[]>
    discover: () => Promise<TerminalDiscovery>
    launch: (request: TerminalLaunchRequest) => Promise<TerminalLaunchResult>
    frameId: () => Promise<string>
    undock: (request: TerminalWindowRequest) => Promise<boolean>
    copy: (request: TerminalWindowRequest) => Promise<boolean>
    redock: (request: TerminalRedockRequest) => Promise<boolean>
    syncPane: (id: string, pane: TerminalPaneLayout) => Promise<void>
    onData: (listener: (message: TerminalDataMessage) => void) => Unsubscribe
    onExit: (listener: (message: TerminalExitMessage) => void) => Unsubscribe
    onTabRedocked: (listener: (message: TerminalRedockedEvent) => void) => Unsubscribe
    onPaneChanged: (listener: (message: TerminalPaneChangedEvent) => void) => Unsubscribe
  }
  /** The application menu asking for Settings: a section id to scroll to, or null for the surface. */
  onOpenSettings: (listener: (sectionId: string | null) => void) => Unsubscribe
  onOpenLicenses: (listener: () => void) => Unsubscribe
  control: {
    authStatus: () => Promise<ControlResult<AuthStatus>>
    authStart: () => Promise<ControlResult<AuthStatus>>
    authCancel: () => Promise<ControlResult<AuthStatus>>
    authSignOut: () => Promise<ControlResult<null>>
    accountsList: () => Promise<ControlResult<AccountsListResponse>>
    accountsSwitch: (key: string) => Promise<ControlResult<null>>
    accountsSetEnabled: (key: string, enabled: boolean) => Promise<ControlResult<null>>
    accountsReorder: (priority: string[]) => Promise<ControlResult<null>>
    ollamaAccountsList: () => Promise<ControlResult<OllamaAccountsListResponse>>
    ollamaSettingsGet: () => Promise<ControlResult<OllamaSettingsResponse>>
    ollamaSettingsUpdate: (input: OllamaSettingsUpdateRequest) => Promise<ControlResult<OllamaSettingsResponse>>
    ollamaApiKeyTest: (input: OllamaApiKeyTestRequest) => Promise<ControlResult<OllamaApiKeyTestResponse>>
    observabilityOverview: (query: TrafficOverviewQuery) => Promise<ControlResult<TrafficOverview>>
    observabilityRequests: (query: TrafficRequestListQuery) => Promise<ControlResult<TrafficRequestList>>
    observabilityRequest: (query: TrafficRequestDetailQuery) => Promise<ControlResult<TrafficRequestDetail | null>>
    connectionsList: () => Promise<ControlResult<ConnectionsListResponse>>
    connectionsAct: (id: string, action: ConnectionAction) => Promise<ControlResult<ConnectionEntry>>
    connectionsRevealCredential: (id: string) => Promise<ControlResult<ConnectionCredentialReveal>>
    appsList: () => Promise<ControlResult<AppsListResponse>>
    appsSetEnabled: (appId: AppEntry['id'], enabled: boolean) => Promise<ControlResult<AppEntry>>
    apiKeysList: () => Promise<ControlResult<ApiKeysListResponse>>
    apiKeysCreate: (input: ApiKeyCreateRequest) => Promise<ControlResult<ApiKeyEntry>>
    apiKeysUpdate: (id: string, update: ApiKeyUpdateRequest) => Promise<ControlResult<ApiKeyEntry>>
    apiKeysRemove: (id: string) => Promise<ControlResult<null>>
    apiKeysSetEnforcement: (enforcing: boolean) => Promise<ControlResult<ApiKeysListResponse>>
    modelsList: () => Promise<ControlResult<ModelsListResponse>>
    modelsRefresh: () => Promise<ControlResult<ModelsListResponse>>
    usageGet: (period: TokenUsagePeriod) => Promise<ControlResult<TokenUsageSummary>>
    diagnosticsGet: () => Promise<ControlResult<DiagnosticsResponse>>
    searchSettingsGet: () => Promise<ControlResult<SearchSettingsResponse>>
    searchSettingsUpdate: (input: SearchSettingsUpdateRequest) => Promise<ControlResult<SearchSettingsResponse>>
    searchProviderValidate: (input: SearchProviderValidationRequest) => Promise<ControlResult<SearchProviderValidationResponse>>
    onChange: (listener: () => void) => Unsubscribe
    onTrafficInvalidation: (listener: TrafficInvalidationListener) => Unsubscribe
  }
}
