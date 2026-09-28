import type { MaximalHost } from '@maximal/maximal-client/shared/host'
import { TrafficInvalidationSchema } from '@maximal/maximal-observability-contract'
import { contextBridge, ipcRenderer } from 'electron'

import { BRIDGE_CHANNELS } from '../shared/bridge-channels.js'

function subscribe<T>(channel: string, listener: (value: T) => void): () => void {
  const handler = (_event: unknown, value: T): void => listener(value)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.off(channel, handler)
}

// `satisfies` types every parameter from the client's contract and rejects a
// member the client did not ask for.
const bridge = {
  getProxyUrl: () => ipcRenderer.invoke(BRIDGE_CHANNELS.proxyUrl),
  licenses: {
    text: () => ipcRenderer.invoke(BRIDGE_CHANNELS.licensesText),
  },
  openExternal: (url) => ipcRenderer.invoke(BRIDGE_CHANNELS.openExternal, url),
  getCoreStatus: () => ipcRenderer.invoke(BRIDGE_CHANNELS.lifecycleCurrent),
  /** Subscribe without exposing Electron's IpcRendererEvent. */
  onCoreStatus: (listener) => subscribe(BRIDGE_CHANNELS.lifecycleChanged, listener),
  shutdown: {
    current: () => ipcRenderer.invoke(BRIDGE_CHANNELS.shutdownCurrent),
    force: () => ipcRenderer.invoke(BRIDGE_CHANNELS.shutdownForce),
    onChange: (listener) => subscribe(BRIDGE_CHANNELS.shutdownChanged, listener),
  },
  pendingSettingsRequest: () => ipcRenderer.invoke(BRIDGE_CHANNELS.pendingSettingsRequest),
  logs: {
    location: () => ipcRenderer.invoke(BRIDGE_CHANNELS.logsLocation),
    list: () => ipcRenderer.invoke(BRIDGE_CHANNELS.logsList),
    reveal: () => ipcRenderer.invoke(BRIDGE_CHANNELS.logsReveal),
    coreLocation: () => ipcRenderer.invoke(BRIDGE_CHANNELS.coreLogsLocation),
    revealCore: () => ipcRenderer.invoke(BRIDGE_CHANNELS.coreLogsReveal),
  },
  localModels: {
    list: () => ipcRenderer.invoke(BRIDGE_CHANNELS.localModelsList),
    ensure: (modelKey) => ipcRenderer.invoke(BRIDGE_CHANNELS.localModelsEnsure, modelKey),
    cancel: (operationId) => ipcRenderer.invoke(BRIDGE_CHANNELS.localModelsCancel, operationId),
    openFolder: () => ipcRenderer.invoke(BRIDGE_CHANNELS.localModelsOpenFolder),
    onChange: (listener) => subscribe(BRIDGE_CHANNELS.localModelsChanged, listener),
  },
  ollamaRuntime: {
    status: () => ipcRenderer.invoke(BRIDGE_CHANNELS.ollamaRuntimeStatus),
    launch: () => ipcRenderer.invoke(BRIDGE_CHANNELS.ollamaRuntimeLaunch),
    updateContextLength: (value) => ipcRenderer.invoke(BRIDGE_CHANNELS.ollamaRuntimeUpdateContext, value),
  },
  clientInstallations: {
    list: () => ipcRenderer.invoke(BRIDGE_CHANNELS.clientInstallationsList),
  },
  menuBarMode: {
    get: () => ipcRenderer.invoke(BRIDGE_CHANNELS.menuBarModeGet),
    beginEnable: () => ipcRenderer.invoke(BRIDGE_CHANNELS.menuBarModeBeginEnable),
    confirmEnable: (attemptId) => ipcRenderer.invoke(BRIDGE_CHANNELS.menuBarModeConfirmEnable, attemptId),
    cancelEnable: (attemptId) => ipcRenderer.invoke(BRIDGE_CHANNELS.menuBarModeCancelEnable, attemptId),
    disable: () => ipcRenderer.invoke(BRIDGE_CHANNELS.menuBarModeDisable),
  },
  providerOnboarding: {
    get: () => ipcRenderer.invoke(BRIDGE_CHANNELS.providerOnboardingGet),
    setDismissed: (dismissed) => ipcRenderer.invoke(BRIDGE_CHANNELS.providerOnboardingSet, dismissed),
  },
  harness: {
    hide: () => ipcRenderer.invoke(BRIDGE_CHANNELS.harnessHide),
    provider: () => ipcRenderer.invoke(BRIDGE_CHANNELS.harnessProvider),
    ask: (prompt) => ipcRenderer.invoke(BRIDGE_CHANNELS.harnessAsk, { prompt }),
    abort: () => ipcRenderer.invoke(BRIDGE_CHANNELS.harnessAbort),
    approve: (request) => ipcRenderer.invoke(BRIDGE_CHANNELS.harnessApprove, request),
    ensureModel: () => ipcRenderer.invoke(BRIDGE_CHANNELS.harnessEnsureModel),
    onDelta: (listener) =>
      subscribe<{ text: string }>(BRIDGE_CHANNELS.harnessDelta, ({ text }) => listener(text)),
    onTool: (listener) => subscribe(BRIDGE_CHANNELS.harnessTool, listener),
    onApproval: (listener) => subscribe(BRIDGE_CHANNELS.harnessApproval, listener),
    onEnd: (listener) => subscribe(BRIDGE_CHANNELS.harnessEnd, listener),
    onModelProgress: (listener) => subscribe(BRIDGE_CHANNELS.harnessModelProgress, listener),
  },
  terminal: {
    spawn: (request) => ipcRenderer.invoke(BRIDGE_CHANNELS.terminalSpawn, request),
    write: (id, data) => ipcRenderer.invoke(BRIDGE_CHANNELS.terminalWrite, { id, data }),
    resize: (id, cols, rows) => ipcRenderer.invoke(BRIDGE_CHANNELS.terminalResize, { id, cols, rows }),
    acknowledge: (id, sequence) => ipcRenderer.invoke(BRIDGE_CHANNELS.terminalAck, { id, sequence }),
    terminate: (id) => ipcRenderer.invoke(BRIDGE_CHANNELS.terminalTerminate, { id }),
    list: () => ipcRenderer.invoke(BRIDGE_CHANNELS.terminalList),
    profiles: () => ipcRenderer.invoke(BRIDGE_CHANNELS.terminalProfiles),
    discover: () => ipcRenderer.invoke(BRIDGE_CHANNELS.terminalDiscover),
    launch: (request) => ipcRenderer.invoke(BRIDGE_CHANNELS.terminalLaunch, request),
    frameId: () => ipcRenderer.invoke(BRIDGE_CHANNELS.terminalFrameId),
    undock: (request) => ipcRenderer.invoke(BRIDGE_CHANNELS.terminalUndock, request),
    copy: (request) => ipcRenderer.invoke(BRIDGE_CHANNELS.terminalCopy, request),
    redock: (request) => ipcRenderer.invoke(BRIDGE_CHANNELS.terminalRedock, request),
    syncPane: (id, pane) => ipcRenderer.invoke(BRIDGE_CHANNELS.terminalPaneSync, { id, pane }),
    onData: (listener) => subscribe(BRIDGE_CHANNELS.terminalData, listener),
    onExit: (listener) => subscribe(BRIDGE_CHANNELS.terminalExit, listener),
    onTabRedocked: (listener) => subscribe(BRIDGE_CHANNELS.terminalTabRedocked, listener),
    onPaneChanged: (listener) => subscribe(BRIDGE_CHANNELS.terminalPaneChanged, listener),
  },
  onOpenSettings: (listener) => subscribe(BRIDGE_CHANNELS.menuOpenSettings, listener),
  onOpenLicenses: (listener) => {
    const handler = (): void => listener()
    ipcRenderer.on(BRIDGE_CHANNELS.menuOpenLicenses, handler)
    return () => {
      ipcRenderer.off(BRIDGE_CHANNELS.menuOpenLicenses, handler)
    }
  },
  control: {
    authStatus: () => ipcRenderer.invoke(BRIDGE_CHANNELS.authStatus),
    authStart: () => ipcRenderer.invoke(BRIDGE_CHANNELS.authStart),
    authCancel: () => ipcRenderer.invoke(BRIDGE_CHANNELS.authCancel),
    authSignOut: () => ipcRenderer.invoke(BRIDGE_CHANNELS.authSignOut),
    accountsList: () => ipcRenderer.invoke(BRIDGE_CHANNELS.accountsList),
    accountsSwitch: (key) => ipcRenderer.invoke(BRIDGE_CHANNELS.accountsSwitch, key),
    accountsSetEnabled: (key, enabled) => ipcRenderer.invoke(BRIDGE_CHANNELS.accountsSetEnabled, key, enabled),
    accountsReorder: (priority) => ipcRenderer.invoke(BRIDGE_CHANNELS.accountsReorder, priority),
    ollamaAccountsList: () => ipcRenderer.invoke(BRIDGE_CHANNELS.ollamaAccountsList),
    ollamaSettingsGet: () => ipcRenderer.invoke(BRIDGE_CHANNELS.ollamaSettingsGet),
    ollamaSettingsUpdate: (input) => ipcRenderer.invoke(BRIDGE_CHANNELS.ollamaSettingsUpdate, input),
    observabilityOverview: (query) => ipcRenderer.invoke(BRIDGE_CHANNELS.observabilityOverview, query),
    observabilityRequests: (query) => ipcRenderer.invoke(BRIDGE_CHANNELS.observabilityRequests, query),
    observabilityRequest: (query) => ipcRenderer.invoke(BRIDGE_CHANNELS.observabilityRequest, query),
    connectionsList: () => ipcRenderer.invoke(BRIDGE_CHANNELS.connectionsList),
    connectionsAct: (id, action) => ipcRenderer.invoke(BRIDGE_CHANNELS.connectionsAct, id, action),
    connectionsRevealCredential: (id) => ipcRenderer.invoke(BRIDGE_CHANNELS.connectionsRevealCredential, id),
    appsList: () => ipcRenderer.invoke(BRIDGE_CHANNELS.appsList),
    appsSetEnabled: (appId, enabled) => ipcRenderer.invoke(BRIDGE_CHANNELS.appsSetEnabled, appId, enabled),
    apiKeysList: () => ipcRenderer.invoke(BRIDGE_CHANNELS.apiKeysList),
    apiKeysCreate: (input) => ipcRenderer.invoke(BRIDGE_CHANNELS.apiKeysCreate, input),
    apiKeysUpdate: (id, update) => ipcRenderer.invoke(BRIDGE_CHANNELS.apiKeysUpdate, id, update),
    apiKeysRemove: (id) => ipcRenderer.invoke(BRIDGE_CHANNELS.apiKeysRemove, id),
    apiKeysSetEnforcement: (enforcing) => ipcRenderer.invoke(BRIDGE_CHANNELS.apiKeysSetEnforcement, enforcing),
    modelsList: () => ipcRenderer.invoke(BRIDGE_CHANNELS.modelsList),
    modelsRefresh: () => ipcRenderer.invoke(BRIDGE_CHANNELS.modelsRefresh),
    usageGet: (period) => ipcRenderer.invoke(BRIDGE_CHANNELS.usageGet, period),
    diagnosticsGet: () => ipcRenderer.invoke(BRIDGE_CHANNELS.diagnosticsGet),
    searchSettingsGet: () => ipcRenderer.invoke(BRIDGE_CHANNELS.searchSettingsGet),
    searchSettingsUpdate: (input) => ipcRenderer.invoke(BRIDGE_CHANNELS.searchSettingsUpdate, input),
    searchProviderValidate: (input) => ipcRenderer.invoke(BRIDGE_CHANNELS.searchProviderValidate, input),
    onChange: (listener) => {
      const handler = (): void => {
        listener()
      }
      ipcRenderer.on(BRIDGE_CHANNELS.controlChanged, handler)
      return () => {
        ipcRenderer.off(BRIDGE_CHANNELS.controlChanged, handler)
      }
    },
    onTrafficInvalidation: (listener) => {
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
} satisfies MaximalHost

contextBridge.exposeInMainWorld('maximal', bridge)
