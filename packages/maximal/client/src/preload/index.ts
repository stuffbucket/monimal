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
  TokenUsagePeriod,
  TokenUsageSummary,
} from '@stuffbucket/maximal-core/settings-types'
import {
  TrafficInvalidationSchema,
  type TrafficInvalidation,
  type TrafficOverview,
  type TrafficOverviewQuery,
  type TrafficRequestDetail,
  type TrafficRequestDetailQuery,
  type TrafficRequestListQuery,
  type TrafficRequestPage,
} from '@stuffbucket/maximal-observability-contract'
import { contextBridge, ipcRenderer } from 'electron'

import { BRIDGE_CHANNELS } from '../shared/bridge-channels.js'
import type {
  ControlResult,
  LifecycleStatus,
  MenuBarModeAttempt,
  MenuBarModeState,
  PendingSettingsRequest,
} from '../shared/bridge-types.js'

const bridge = {
  /** Base URL where `/v1` is served for external programs (to display/copy). */
  getProxyUrl: (): Promise<string> =>
    ipcRenderer.invoke(BRIDGE_CHANNELS.proxyUrl),
  /** Open a URL in the user's default browser (device-flow verification, etc.). */
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke(BRIDGE_CHANNELS.openExternal, url),
  /** Current renderer-safe sidecar lifecycle state. */
  getCoreStatus: (): Promise<LifecycleStatus> =>
    ipcRenderer.invoke(BRIDGE_CHANNELS.lifecycleCurrent),
  /** Subscribe without exposing Electron's IpcRendererEvent. */
  onCoreStatus: (
    listener: (status: LifecycleStatus) => void,
  ): (() => void) => {
    const handler = (_event: unknown, status: LifecycleStatus): void => {
      listener(status)
    }
    ipcRenderer.on(BRIDGE_CHANNELS.lifecycleChanged, handler)
    return () => {
      ipcRenderer.off(BRIDGE_CHANNELS.lifecycleChanged, handler)
    }
  },
  pendingSettingsRequest: (): Promise<PendingSettingsRequest | null> =>
    ipcRenderer.invoke(BRIDGE_CHANNELS.pendingSettingsRequest),
  logs: {
    location: (): Promise<string> =>
      ipcRenderer.invoke(BRIDGE_CHANNELS.logsLocation),
    reveal: (): Promise<void> => ipcRenderer.invoke(BRIDGE_CHANNELS.logsReveal),
  },
  menuBarMode: {
    get: (): Promise<MenuBarModeState> =>
      ipcRenderer.invoke(BRIDGE_CHANNELS.menuBarModeGet),
    beginEnable: (): Promise<MenuBarModeAttempt> =>
      ipcRenderer.invoke(BRIDGE_CHANNELS.menuBarModeBeginEnable),
    confirmEnable: (attemptId: string): Promise<MenuBarModeState> =>
      ipcRenderer.invoke(BRIDGE_CHANNELS.menuBarModeConfirmEnable, attemptId),
    cancelEnable: (attemptId: string): Promise<MenuBarModeState> =>
      ipcRenderer.invoke(BRIDGE_CHANNELS.menuBarModeCancelEnable, attemptId),
    disable: (): Promise<MenuBarModeState> =>
      ipcRenderer.invoke(BRIDGE_CHANNELS.menuBarModeDisable),
  },
  /** The application menu asking for the Settings surface. The payload is a
   *  section id to scroll to, or null for the surface itself. */
  onOpenSettings: (
    listener: (sectionId: string | null) => void,
  ): (() => void) => {
    const handler = (_event: unknown, sectionId: string | null): void => {
      listener(sectionId)
    }
    ipcRenderer.on(BRIDGE_CHANNELS.menuOpenSettings, handler)
    return () => {
      ipcRenderer.off(BRIDGE_CHANNELS.menuOpenSettings, handler)
    }
  },
  control: {
    authStatus: (): Promise<ControlResult<AuthStatus>> =>
      ipcRenderer.invoke(BRIDGE_CHANNELS.authStatus),
    authStart: (): Promise<ControlResult<AuthStatus>> =>
      ipcRenderer.invoke(BRIDGE_CHANNELS.authStart),
    authCancel: (): Promise<ControlResult<AuthStatus>> =>
      ipcRenderer.invoke(BRIDGE_CHANNELS.authCancel),
    authSignOut: (): Promise<ControlResult<null>> =>
      ipcRenderer.invoke(BRIDGE_CHANNELS.authSignOut),
    accountsList: (): Promise<ControlResult<AccountsListResponse>> =>
      ipcRenderer.invoke(BRIDGE_CHANNELS.accountsList),
    accountsSwitch: (key: string): Promise<ControlResult<null>> =>
      ipcRenderer.invoke(BRIDGE_CHANNELS.accountsSwitch, key),
    observabilityOverview: (
      query: TrafficOverviewQuery,
    ): Promise<ControlResult<TrafficOverview>> =>
      ipcRenderer.invoke(BRIDGE_CHANNELS.observabilityOverview, query),
    observabilityRequests: (
      query: TrafficRequestListQuery,
    ): Promise<ControlResult<TrafficRequestPage>> =>
      ipcRenderer.invoke(BRIDGE_CHANNELS.observabilityRequests, query),
    observabilityRequest: (
      query: TrafficRequestDetailQuery,
    ): Promise<ControlResult<TrafficRequestDetail | null>> =>
      ipcRenderer.invoke(BRIDGE_CHANNELS.observabilityRequest, query),
    connectionsList: (): Promise<ControlResult<ConnectionsListResponse>> =>
      ipcRenderer.invoke(BRIDGE_CHANNELS.connectionsList),
    connectionsAct: (
      id: string,
      action: ConnectionAction,
    ): Promise<ControlResult<ConnectionEntry>> =>
      ipcRenderer.invoke(BRIDGE_CHANNELS.connectionsAct, id, action),
    connectionsRevealCredential: (
      id: string,
    ): Promise<ControlResult<ConnectionCredentialReveal>> =>
      ipcRenderer.invoke(BRIDGE_CHANNELS.connectionsRevealCredential, id),
    appsList: (): Promise<ControlResult<AppsListResponse>> =>
      ipcRenderer.invoke(BRIDGE_CHANNELS.appsList),
    appsSetEnabled: (
      appId: AppEntry['id'],
      enabled: boolean,
    ): Promise<ControlResult<AppEntry>> =>
      ipcRenderer.invoke(BRIDGE_CHANNELS.appsSetEnabled, appId, enabled),
    apiKeysList: (): Promise<ControlResult<ApiKeysListResponse>> =>
      ipcRenderer.invoke(BRIDGE_CHANNELS.apiKeysList),
    apiKeysCreate: (
      input: ApiKeyCreateRequest,
    ): Promise<ControlResult<ApiKeyEntry>> =>
      ipcRenderer.invoke(BRIDGE_CHANNELS.apiKeysCreate, input),
    apiKeysUpdate: (
      id: string,
      update: ApiKeyUpdateRequest,
    ): Promise<ControlResult<ApiKeyEntry>> =>
      ipcRenderer.invoke(BRIDGE_CHANNELS.apiKeysUpdate, id, update),
    apiKeysRemove: (id: string): Promise<ControlResult<null>> =>
      ipcRenderer.invoke(BRIDGE_CHANNELS.apiKeysRemove, id),
    apiKeysSetEnforcement: (
      enforcing: boolean,
    ): Promise<ControlResult<ApiKeysListResponse>> =>
      ipcRenderer.invoke(BRIDGE_CHANNELS.apiKeysSetEnforcement, enforcing),
    modelsList: (): Promise<ControlResult<ModelsListResponse>> =>
      ipcRenderer.invoke(BRIDGE_CHANNELS.modelsList),
    modelsRefresh: (): Promise<ControlResult<ModelsListResponse>> =>
      ipcRenderer.invoke(BRIDGE_CHANNELS.modelsRefresh),
    usageGet: (
      period: TokenUsagePeriod,
    ): Promise<ControlResult<TokenUsageSummary>> =>
      ipcRenderer.invoke(BRIDGE_CHANNELS.usageGet, period),
    diagnosticsGet: (): Promise<ControlResult<DiagnosticsResponse>> =>
      ipcRenderer.invoke(BRIDGE_CHANNELS.diagnosticsGet),
    onChange: (listener: () => void): (() => void) => {
      const handler = (): void => {
        listener()
      }
      ipcRenderer.on(BRIDGE_CHANNELS.controlChanged, handler)
      return () => {
        ipcRenderer.off(BRIDGE_CHANNELS.controlChanged, handler)
      }
    },
    onTrafficInvalidation: (
      listener: (invalidation: TrafficInvalidation) => void,
    ): (() => void) => {
      const handler = (_event: unknown, payload: unknown): void => {
        const invalidation = TrafficInvalidationSchema.safeParse(payload)
        if (invalidation.success) listener(invalidation.data)
      }
      ipcRenderer.on(BRIDGE_CHANNELS.trafficInvalidated, handler)
      return () => {
        ipcRenderer.off(BRIDGE_CHANNELS.trafficInvalidated, handler)
      }
    },
  },
}

contextBridge.exposeInMainWorld('maximal', bridge)

export type MaximalBridge = typeof bridge
