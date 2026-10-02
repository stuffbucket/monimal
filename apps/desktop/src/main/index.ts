import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { resolveLocalModelsPath } from '@maximal/local-model-registry'
import {
  ApiKeyCreateRequest,
  ApiKeyUpdateRequest,
  AppSetEnabledRequest,
  ConnectionActionRequest,
  ConnectionCredentialIdRequest,
  OllamaSettingsUpdateRequest,
  OllamaApiKeyTestRequest,
  SearchProviderValidationRequest,
  SearchSettingsUpdateRequest,
  SystemOneSettingsUpdateRequest,
  TokenUsagePeriod,
} from '@maximal/maximal-core-contract/settings'
import {
  TrafficOverviewQuerySchema,
  TrafficRequestDetailQuerySchema,
  TrafficRequestListQuerySchema,
} from '@maximal/maximal-observability-contract'
import { listLogFiles, resolveLogDirectory } from '@maximal/maximal-logging'
import {
  getOllamaCloudDisabled,
  getOllamaRuntimeStatus,
  launchOllama,
  updateOllamaCloudDisabled,
} from '@maximal/maximal-ollama'
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  type MessageBoxOptions,
} from 'electron'
import {
  createHostWindow,
  getSystemNotificationStatus,
  openSystemNotificationSettings,
  waitForHostWindowReady,
} from '@maximal/maximal-electron/host'
import { ShutdownLifecycle } from '@maximal/maximal-electron/main'
import { z } from 'zod'

import { BRIDGE_CHANNELS } from '../shared/bridge-channels.js'
import type {
  AppearancePreference,
  PersistedMaterialPreference,
  PendingSettingsRequest,
  TerminalRedockRequest,
  TerminalWindowRequest,
} from '@maximal/maximal-client/shared/host'
import { createCoreControlConnection, type CoreControlConnection } from './adapters/core-control-connection.js'
import {
  type CoreStatus,
  awaitProxyUrl,
  coreHomePath,
  currentCoreStatus,
  killCore,
  onCoreStatus,
  spawnCore,
} from './sidecar/core.js'
import { applyAppName, installApplicationMenu } from './native/identity.js'
import { developmentUserDataPath } from './development-profile.js'
import {
  createDesktopRecording,
  revealRecordingsDirectory,
  type DesktopRecording,
} from './native/recording.js'
import { resolveLicenseBundlePath } from './native/license-bundle.js'
import { listClientInstallations } from './native/client-installations.js'
import { registerAppearanceIpc } from './native/appearance-ipc.js'
import { registerWorkbarIpc } from './native/workbar-ipc.js'
import { toLifecycleStatus } from './sidecar/lifecycle-status.js'
import { registerOllamaRuntimeIpc } from './ollama-runtime-ipc.js'
import { DesktopProjectCatalog } from './adapters/project-catalog.js'
import { MenuBarModeController } from './native/menu-bar-mode.js'
import {
  getGeneralDesktopSettings,
  setStartOnLogin,
} from './native/general-settings.js'
import { mainLogger } from './main-logger.js'
import {
  getProviderOnboardingPreference,
  setProviderOnboardingPreference,
} from './preferences/provider-onboarding-preference.js'
import {
  closeSplashWindow,
  createSplashWindow,
  updateSplashStatus,
} from './windows/splash-window.js'
import { centerOnPrimaryDisplay } from './windows/window-placement.js'
import {
  isHarnessBusy,
  showHarnessHost,
  startHarnessHost,
  stopHarnessHost,
  toggleHarnessHost,
} from './adapters/harness.js'
import {
  activeTerminalCount,
  configureTerminalHost,
  configureTerminalProjectTrust,
  configureTerminalWindowActions,
  moveTerminalSessions,
  registerTerminalIpc,
  stageTerminalSessions,
  stopTerminalHost,
} from './adapters/terminal.js'
import {
  setBackgroundEffectsEnabled,
  loadApplicationSettings,
  materialPreferenceFrom,
  setOllamaStartOnLaunch,
  setReducedMotionEnabled,
  setMaterialPreference,
  setVibrancyEnabled,
} from './preferences/application-settings.js'
import { startBrowserHost } from './adapters/browser.js'
import {
  applyVibrancy,
  vibrancyPreference,
} from './native/vibrancy.js'

const SPLASH_PREVIEW_FLAG = '--splash-preview'

function isSplashPreview(): boolean { return !app.isPackaged && process.argv.includes(SPLASH_PREVIEW_FLAG) }

function isolateDevelopmentUserData(): void {
  if (app.isPackaged || app.commandLine.hasSwitch('user-data-dir')) return
  app.setPath(
    'userData',
    developmentUserDataPath(
      app.getPath('userData'),
      app.getAppPath(),
      process.env.MAXIMAL_DEV_PROFILE,
    ),
  )
}

// Before `whenReady`, not inside it: `app.name` is read when the default menu
// and the About panel are built, so setting it later leaves both stale.
isolateDevelopmentUserData()
applyAppName()

let coreControlConnection: CoreControlConnection | null = null
let mainWindow: BrowserWindow | null = null
let mainWindowRevealAllowed = true
const vibrancyWindows = new Set<BrowserWindow>()
let typographyPreviewWindow: BrowserWindow | null = null
let pendingSettingsRequest: PendingSettingsRequest | null = null
let menuBarMode: MenuBarModeController | null = null
let recording: DesktopRecording | null = null
let projectCatalog: DesktopProjectCatalog | null = null
let quitting = false
let stopBrowserHost: (() => void) | undefined
const MAIN_WINDOW_REVEAL_DELAY_MS = 120

const nonEmptyString = z.string().min(1)
const localModelIdentifier = z.string().min(1).max(200)
const ollamaRuntimePreferencesUpdate = z.object({
  start_on_maximal_launch: z.boolean().optional(),
  cloud_disabled: z.boolean().optional(),
})

function ollamaRuntimePreferences(restartRequired = false) {
  return {
    start_on_maximal_launch: loadApplicationSettings(app.getPath('userData'))
      .settings.ollamaStartOnLaunch,
    cloud_disabled: getOllamaCloudDisabled(),
    restart_required: restartRequired,
  }
}

function appearancePreference(): AppearancePreference {
  const settings = loadApplicationSettings(app.getPath('userData')).settings
  const vibrancy = vibrancyPreference(settings.vibrancyEnabled)
  return {
    vibrancyEnabled: vibrancy.enabled,
    vibrancySupported: vibrancy.supported,
    backgroundEffectsEnabled: settings.backgroundEffectsEnabled,
    reducedMotionEnabled: settings.reducedMotionEnabled,
  }
}

function materialPreference(): PersistedMaterialPreference {
  return materialPreferenceFrom(
    loadApplicationSettings(app.getPath('userData')).settings,
  )
}

function applySavedVibrancy(window: BrowserWindow): void {
  applyVibrancy(
    window,
    loadApplicationSettings(app.getPath('userData')).settings.vibrancyEnabled,
  )
}

async function updateVibrancy(enabled: boolean) {
  const saved = await setVibrancyEnabled(app.getPath('userData'), enabled)
  for (const window of vibrancyWindows) {
    if (!window.isDestroyed()) applyVibrancy(window, saved)
  }
  const preference = appearancePreference()
  broadcast(BRIDGE_CHANNELS.appearanceChanged, preference)
  return preference
}

async function updateBackgroundEffects(enabled: boolean) {
  await setBackgroundEffectsEnabled(app.getPath('userData'), enabled)
  const preference = appearancePreference()
  broadcast(BRIDGE_CHANNELS.appearanceChanged, preference)
  return preference
}

async function updateReducedMotion(enabled: boolean) {
  await setReducedMotionEnabled(app.getPath('userData'), enabled)
  const preference = appearancePreference()
  broadcast(BRIDGE_CHANNELS.appearanceChanged, preference)
  return preference
}

async function updateMaterialPreference(input: unknown) {
  const preference = await setMaterialPreference(app.getPath('userData'), input)
  broadcast(BRIDGE_CHANNELS.materialChanged, preference)
  return preference
}

function registerVibrancyWindow(window: BrowserWindow): void {
  vibrancyWindows.add(window)
  applySavedVibrancy(window)
  window.on('closed', () => vibrancyWindows.delete(window))
}

async function updateOllamaRuntimePreferences(input: unknown) {
  const update = ollamaRuntimePreferencesUpdate.parse(input)
  if (update.start_on_maximal_launch !== undefined) {
    await setOllamaStartOnLaunch(
      app.getPath('userData'),
      update.start_on_maximal_launch,
    )
  }
  let restartRequired = false
  if (update.cloud_disabled !== undefined) {
    const previous = getOllamaCloudDisabled()
    await updateOllamaCloudDisabled(update.cloud_disabled)
    const status = await getOllamaRuntimeStatus()
    restartRequired = previous !== update.cloud_disabled
      && (status.running || status.process_id !== null)
  }
  return ollamaRuntimePreferences(restartRequired)
}

function openExternalUrl(input: unknown): Promise<void> {
  const url = nonEmptyString.parse(input)
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return Promise.reject(new Error('External URL must be a valid HTTP(S) URL'))
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return Promise.reject(new Error('External URL must use HTTP or HTTPS'))
  }
  return shell.openExternal(parsed.href)
}

function localModelsDirectory(): string {
  const suiteDataRoot = app.commandLine.hasSwitch('user-data-dir')
    ? join(app.getPath('userData'), 'stuffbucket')
    : undefined
  return resolveLocalModelsPath({ suiteDataRoot })
}

async function openLocalModelsDirectory(): Promise<void> {
  const directory = localModelsDirectory()
  await mkdir(directory, { recursive: true })
  const error = await shell.openPath(directory)
  if (error) throw new Error(error)
}

async function readLicenseText(): Promise<string> {
  const path = resolveLicenseBundlePath({
    appPath: app.getAppPath(),
    isPackaged: app.isPackaged,
  })
  try {
    return await readFile(path, 'utf8')
  } catch {
    return 'Licenses information is unavailable.\n\nNo bundled third-party license text was found.'
  }
}

function registerIpc(
  session: CoreControlConnection,
  mode: MenuBarModeController,
  projects: DesktopProjectCatalog,
): void {
  ipcMain.handle(BRIDGE_CHANNELS.lifecycleCurrent, () =>
    toLifecycleStatus(currentCoreStatus()),
  )
  ipcMain.handle(BRIDGE_CHANNELS.shutdownCurrent, () => shutdownLifecycle.snapshot())
  ipcMain.handle(BRIDGE_CHANNELS.shutdownForce, async () => {
    const pending = shutdownLifecycle.snapshot().operations
      .filter(({ phase }) => phase === 'waiting')
    if (pending.length === 0) return false
    const detail = pending.map(({ label, detail: progress }) =>
      progress ? `${label}: ${progress}` : label,
    ).join('\n')
    const options: MessageBoxOptions = {
      type: 'warning',
      buttons: ['Keep waiting', 'Force quit'],
      defaultId: 0,
      cancelId: 0,
      message: 'Shutdown work is still running.',
      detail,
    }
    const result = mainWindow === null
      ? await dialog.showMessageBox(options)
      : await dialog.showMessageBox(mainWindow, options)
    return result.response === 1 && shutdownLifecycle.force()
  })
  ipcMain.handle(BRIDGE_CHANNELS.proxyUrl, () => awaitProxyUrl())
  ipcMain.handle(BRIDGE_CHANNELS.licensesText, readLicenseText)
  ipcMain.handle(BRIDGE_CHANNELS.openExternal, (_event, url: unknown) =>
    openExternalUrl(url),
  )
  ipcMain.handle(BRIDGE_CHANNELS.providerOnboardingGet, () =>
    getProviderOnboardingPreference(),
  )
  ipcMain.handle(BRIDGE_CHANNELS.providerOnboardingSet, (_event, dismissed: unknown) =>
    setProviderOnboardingPreference(z.boolean().parse(dismissed)),
  )
  ipcMain.handle(BRIDGE_CHANNELS.appearanceGet, appearancePreference)
  ipcMain.handle(
    BRIDGE_CHANNELS.appearanceSetVibrancy,
    (_event, enabled: unknown) => updateVibrancy(z.boolean().parse(enabled)),
  )
  ipcMain.handle(
    BRIDGE_CHANNELS.appearanceSetBackgroundEffects,
    (_event, enabled: unknown) =>
      updateBackgroundEffects(z.boolean().parse(enabled)),
  )
  ipcMain.handle(
    BRIDGE_CHANNELS.appearanceSetReducedMotion,
    (_event, enabled: unknown) =>
      updateReducedMotion(z.boolean().parse(enabled)),
  )
  ipcMain.handle(BRIDGE_CHANNELS.materialGet, materialPreference)
  ipcMain.handle(
    BRIDGE_CHANNELS.materialSet,
    (_event, preference: unknown) => updateMaterialPreference(preference),
  )
  ipcMain.handle(BRIDGE_CHANNELS.projectsSnapshot, () => projects.snapshot())
  ipcMain.handle(
    BRIDGE_CHANNELS.projectsSearch,
    (_event, query: unknown, limit: unknown) =>
      projects.search(
        z.string().max(500).parse(query),
        limit === undefined ? undefined : z.number().int().min(1).max(200).parse(limit),
      ),
  )
  ipcMain.handle(BRIDGE_CHANNELS.projectsAddRoot, async () => {
    const options = {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Add project discovery root',
    } satisfies Electron.OpenDialogOptions
    const selection = mainWindow === null
      ? await dialog.showOpenDialog(options)
      : await dialog.showOpenDialog(mainWindow, options)
    if (selection.canceled || selection.filePaths[0] === undefined) return null
    const root = projects.addRoot(selection.filePaths[0])
    await projects.refresh(root.id)
    broadcast(BRIDGE_CHANNELS.projectsChanged)
    return projects.roots().find(({ id }) => id === root.id) ?? root
  })
  ipcMain.handle(
    BRIDGE_CHANNELS.projectsUpdateRoot,
    (_event, id: unknown, update: unknown) => {
      const value = z.object({
        enabled: z.boolean().optional(),
        trusted: z.boolean().optional(),
        trustSubtrees: z.boolean().optional(),
        maxDepth: z.number().int().min(0).max(20).optional(),
        includeHidden: z.boolean().optional(),
        exclusions: z.array(z.string().min(1).max(255)).max(200).optional(),
      }).parse(update)
      const result = projects.updateRoot(nonEmptyString.parse(id), value)
      broadcast(BRIDGE_CHANNELS.projectsChanged)
      return result
    },
  )
  ipcMain.handle(BRIDGE_CHANNELS.projectsRemoveRoot, (_event, id: unknown) => {
    projects.removeRoot(nonEmptyString.parse(id))
    broadcast(BRIDGE_CHANNELS.projectsChanged)
  })
  ipcMain.handle(BRIDGE_CHANNELS.projectsRefresh, async (_event, rootId: unknown) => {
    const result = await projects.refresh(
      rootId === undefined ? undefined : nonEmptyString.parse(rootId),
    )
    broadcast(BRIDGE_CHANNELS.projectsChanged)
    return result
  })
  ipcMain.handle(BRIDGE_CHANNELS.projectsOpened, (_event, projectId: unknown) => {
    projects.opened(nonEmptyString.parse(projectId))
    broadcast(BRIDGE_CHANNELS.projectsChanged)
  })
  registerAppearanceIpc(broadcast, openTypographyPreviewWindow)
  registerWorkbarIpc(broadcast)
  ipcMain.handle(BRIDGE_CHANNELS.authStatus, () => session.authStatus())
  ipcMain.handle(BRIDGE_CHANNELS.authStart, () => session.authStart())
  ipcMain.handle(BRIDGE_CHANNELS.authCancel, () => session.authCancel())
  ipcMain.handle(BRIDGE_CHANNELS.authSignOut, () => session.authSignOut())
  ipcMain.handle(BRIDGE_CHANNELS.accountsList, () => session.accountsList())
  ipcMain.handle(BRIDGE_CHANNELS.accountsSwitch, (_event, key: unknown) =>
    session.accountsSwitch(nonEmptyString.parse(key)),
  )
  ipcMain.handle(
    BRIDGE_CHANNELS.accountsSetEnabled,
    (_event, key: unknown, enabled: unknown) =>
      session.accountsSetEnabled(
        nonEmptyString.parse(key),
        z.boolean().parse(enabled),
      ),
  )
  ipcMain.handle(BRIDGE_CHANNELS.accountsReorder, (_event, priority: unknown) =>
    session.accountsReorder(z.array(nonEmptyString).parse(priority)),
  )
  ipcMain.handle(BRIDGE_CHANNELS.copilotUsageGet, () =>
    session.copilotUsageGet(),
  )
  ipcMain.handle(BRIDGE_CHANNELS.ollamaAccountsList, () =>
    session.ollamaAccountsList(),
  )
  ipcMain.handle(BRIDGE_CHANNELS.ollamaSettingsGet, () =>
    session.ollamaSettingsGet(),
  )
  ipcMain.handle(BRIDGE_CHANNELS.ollamaSettingsUpdate, (_event, input: unknown) =>
    session.ollamaSettingsUpdate(OllamaSettingsUpdateRequest.parse(input)),
  )
  ipcMain.handle(BRIDGE_CHANNELS.ollamaApiKeyTest, (_event, input: unknown) =>
    session.ollamaApiKeyTest(OllamaApiKeyTestRequest.parse(input)),
  )
  ipcMain.handle(BRIDGE_CHANNELS.systemOneSettingsGet, () =>
    session.systemOneSettingsGet(),
  )
  ipcMain.handle(
    BRIDGE_CHANNELS.systemOneSettingsUpdate,
    (_event, input: unknown) =>
      session.systemOneSettingsUpdate(
        SystemOneSettingsUpdateRequest.parse(input),
      ),
  )
  ipcMain.handle(
    BRIDGE_CHANNELS.observabilityOverview,
    (_event, query: unknown) =>
      session.observabilityOverview(TrafficOverviewQuerySchema.parse(query)),
  )
  ipcMain.handle(
    BRIDGE_CHANNELS.observabilityRequests,
    (_event, query: unknown) =>
      session.observabilityRequests(TrafficRequestListQuerySchema.parse(query)),
  )
  ipcMain.handle(
    BRIDGE_CHANNELS.observabilityRequest,
    (_event, query: unknown) =>
      session.observabilityRequest(TrafficRequestDetailQuerySchema.parse(query)),
  )
  ipcMain.handle(BRIDGE_CHANNELS.connectionsList, () =>
    session.connectionsList(),
  )
  ipcMain.handle(
    BRIDGE_CHANNELS.connectionsAct,
    (_event, id: unknown, action: unknown) => {
      const input = ConnectionActionRequest.parse({ id, action })
      return session.connectionsAct(input.id, input.action)
    },
  )
  ipcMain.handle(
    BRIDGE_CHANNELS.connectionsRevealCredential,
    (_event, id: unknown) => {
      const input = ConnectionCredentialIdRequest.parse({ id })
      return session.connectionsRevealCredential(input.id)
    },
  )
  ipcMain.handle(BRIDGE_CHANNELS.clientInstallationsList, () =>
    listClientInstallations(),
  )
  ipcMain.handle(BRIDGE_CHANNELS.appsList, () => session.appsList())
  ipcMain.handle(
    BRIDGE_CHANNELS.appsSetEnabled,
    (_event, appId: unknown, enabled: unknown) => {
      const input = AppSetEnabledRequest.parse({ appId, enabled })
      return session.appsSetEnabled(input.appId, input.enabled)
    },
  )
  ipcMain.handle(BRIDGE_CHANNELS.apiKeysList, () => session.apiKeysList())
  ipcMain.handle(BRIDGE_CHANNELS.apiKeysCreate, (_event, input: unknown) =>
    session.apiKeysCreate(ApiKeyCreateRequest.parse(input)),
  )
  ipcMain.handle(
    BRIDGE_CHANNELS.apiKeysUpdate,
    (_event, id: unknown, update: unknown) =>
      session.apiKeysUpdate(
        nonEmptyString.parse(id),
        ApiKeyUpdateRequest.parse(update),
      ),
  )
  ipcMain.handle(BRIDGE_CHANNELS.apiKeysRemove, (_event, id: unknown) =>
    session.apiKeysRemove(nonEmptyString.parse(id)),
  )
  ipcMain.handle(
    BRIDGE_CHANNELS.apiKeysSetEnforcement,
    (_event, enforcing: unknown) =>
      session.apiKeysSetEnforcement(z.boolean().parse(enforcing)),
  )
  ipcMain.handle(BRIDGE_CHANNELS.modelsList, () => session.modelsList())
  ipcMain.handle(BRIDGE_CHANNELS.modelsRefresh, () => session.modelsRefresh())
  ipcMain.handle(BRIDGE_CHANNELS.localModelsList, () => session.localModelsList())
  ipcMain.handle(BRIDGE_CHANNELS.localModelsEnsure, (_event, modelKey: unknown) =>
    session.localModelsEnsure(localModelIdentifier.parse(modelKey)),
  )
  ipcMain.handle(
    BRIDGE_CHANNELS.localModelsCancel,
    (_event, operationId: unknown) =>
      session.localModelsCancel(localModelIdentifier.parse(operationId)),
  )
  ipcMain.handle(BRIDGE_CHANNELS.usageGet, (_event, period: unknown) =>
    session.usageGet(TokenUsagePeriod.parse(period)),
  )
  ipcMain.handle(BRIDGE_CHANNELS.diagnosticsGet, () => session.diagnosticsGet())
  ipcMain.handle(BRIDGE_CHANNELS.searchSettingsGet, () =>
    session.searchSettingsGet(),
  )
  ipcMain.handle(
    BRIDGE_CHANNELS.searchSettingsUpdate,
    (_event, input: unknown) =>
      session.searchSettingsUpdate(SearchSettingsUpdateRequest.parse(input)),
  )
  ipcMain.handle(
    BRIDGE_CHANNELS.searchProviderValidate,
    (_event, input: unknown) =>
      session.searchProviderValidate(SearchProviderValidationRequest.parse(input)),
  )
  ipcMain.handle(BRIDGE_CHANNELS.logsLocation, () => resolveLogDirectory())
  ipcMain.handle(BRIDGE_CHANNELS.logsList, () => listLogFiles())
  ipcMain.handle(BRIDGE_CHANNELS.logsReveal, async () => {
    const directory = resolveLogDirectory()
    await mkdir(directory, { recursive: true })
    const error = await shell.openPath(directory)
    if (error) throw new Error(error)
  })
  ipcMain.handle(BRIDGE_CHANNELS.coreLogsLocation, () => join(coreHomePath(), 'logs'))
  ipcMain.handle(BRIDGE_CHANNELS.coreLogsReveal, async () => {
    const error = await shell.openPath(join(coreHomePath(), 'logs'))
    if (error) throw new Error(error)
  })
  ipcMain.handle(
    BRIDGE_CHANNELS.recordingsRevealFolder,
    revealRecordingsDirectory,
  )
  ipcMain.handle(
    BRIDGE_CHANNELS.localModelsOpenFolder,
    openLocalModelsDirectory,
  )
  registerOllamaRuntimeIpc({
    preferences: ollamaRuntimePreferences,
    updatePreferences: updateOllamaRuntimePreferences,
  })
  ipcMain.handle(BRIDGE_CHANNELS.pendingSettingsRequest, () => {
    const request = pendingSettingsRequest
    pendingSettingsRequest = null
    return request
  })
  ipcMain.handle(BRIDGE_CHANNELS.menuBarModeGet, () => mode.state())
  ipcMain.handle(BRIDGE_CHANNELS.menuBarModeBeginEnable, () => mode.beginEnable())
  ipcMain.handle(
    BRIDGE_CHANNELS.menuBarModeConfirmEnable,
    (_event, attemptId: unknown) =>
      mode.confirmEnable(nonEmptyString.parse(attemptId)),
  )
  ipcMain.handle(
    BRIDGE_CHANNELS.menuBarModeCancelEnable,
    (_event, attemptId: unknown) =>
      mode.cancelEnable(nonEmptyString.parse(attemptId)),
  )
  ipcMain.handle(BRIDGE_CHANNELS.menuBarModeDisable, () => mode.disable())
  ipcMain.handle(
    BRIDGE_CHANNELS.systemNotificationsStatus,
    () => getSystemNotificationStatus(),
  )
  ipcMain.handle(
    BRIDGE_CHANNELS.systemNotificationsOpenSettings,
    () => openSystemNotificationSettings(),
  )
  ipcMain.handle(
    BRIDGE_CHANNELS.generalSettingsGet,
    getGeneralDesktopSettings,
  )
  ipcMain.handle(
    BRIDGE_CHANNELS.generalSettingsSetStartOnLogin,
    (_event, enabled: unknown) => setStartOnLogin(z.boolean().parse(enabled)),
  )
  registerTerminalIpc()
}

function broadcast(channel: string, payload?: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    if (payload === undefined) win.webContents.send(channel)
    else win.webContents.send(channel, payload)
  }
}

/** Fan renderer-safe lifecycle transitions out to every open window. */
function broadcastCoreStatus(status: CoreStatus): void {
  broadcast(BRIDGE_CHANNELS.lifecycleChanged, toLifecycleStatus(status))
}

function loadRenderer(win: BrowserWindow, terminal?: TerminalWindowRequest): void {
  const query = new URLSearchParams()
  if (terminal) {
    query.set('terminalSessionId', terminal.id)
    query.set('terminalTitle', terminal.title)
    query.set('terminalCanRunInBackground', String(terminal.canRunInBackground))
    if (terminal.pane) query.set('terminalPane', JSON.stringify(terminal.pane))
  }
  loadRendererQuery(win, query)
}

function loadRendererQuery(win: BrowserWindow, query: URLSearchParams): void {
  const search = query.toString()
  if (
    typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== 'undefined' &&
    MAIN_WINDOW_VITE_DEV_SERVER_URL
  ) {
    void win.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}${search === '' ? '' : `?${search}`}`)
  } else {
    void win.loadFile(
      join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
      search === '' ? undefined : { search },
    )
  }
}

function focusWindow(win: BrowserWindow): void {
  if (win === mainWindow && !mainWindowRevealAllowed) return
  if (win.isMinimized()) win.restore()
  if (!win.isVisible()) win.show()
  win.focus()
}

function installRendererRecovery(win: BrowserWindow): void {
  let closing = false
  let recoveryPromptOpen = false
  let rendererExitPending = false
  let automaticReloadAttempted = false

  win.on('close', () => {
    closing = true
  })

  const promptReload = (
    message: string,
    detail: string,
    secondaryLabel: string,
    secondaryAction: () => void = () => undefined,
  ): void => {
    if (quitting || closing || win.isDestroyed() || recoveryPromptOpen) return
    recoveryPromptOpen = true
    void dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['Reload Window', secondaryLabel],
      defaultId: 0,
      cancelId: 1,
      message,
      detail,
    }).then(({ response }) => {
      recoveryPromptOpen = false
      if (quitting || closing || win.isDestroyed()) return
      if (rendererExitPending) {
        rendererExitPending = false
        recoverFromUnexpectedExit()
        return
      }
      if (response === 0) win.webContents.reload()
      else secondaryAction()
    }).catch((error: unknown) => {
      recoveryPromptOpen = false
      mainLogger.error(
        { errorName: error instanceof Error ? error.name : 'unknown' },
        'Renderer recovery prompt failed',
      )
      if (rendererExitPending) {
        rendererExitPending = false
        recoverFromUnexpectedExit()
      }
    })
  }

  const recoverFromUnexpectedExit = (): void => {
    if (quitting || closing || win.isDestroyed()) return
    if (!automaticReloadAttempted) {
      automaticReloadAttempted = true
      win.webContents.reload()
      return
    }

    promptReload(
      'This window stopped unexpectedly',
      'Maximal already tried to restore it once. You can reload it again or close only this window.',
      'Close Window',
      () => win.close(),
    )
  }

  win.webContents.on('render-process-gone', (_event, details) => {
    menuBarMode?.cancelPending()
    if (details.reason === 'clean-exit') return
    mainLogger.error(
      { reason: details.reason, exitCode: details.exitCode },
      'Renderer process exited',
    )
    if (quitting || closing || win.isDestroyed()) return
    if (recoveryPromptOpen) {
      rendererExitPending = true
      return
    }
    recoverFromUnexpectedExit()
  })

  win.webContents.on('unresponsive', () => {
    if (quitting || closing || win.isDestroyed()) return
    mainLogger.error('Renderer became unresponsive')
    promptReload(
      'This window is not responding',
      'Reloading reconnects the view to terminal processes that are still running.',
      'Wait',
    )
  })

  win.webContents.on(
    'did-fail-load',
    (_event, errorCode, _errorDescription, _validatedURL, isMainFrame) => {
      if (quitting || closing || win.isDestroyed() || !isMainFrame || errorCode === -3) return
      mainLogger.error({ errorCode }, 'Renderer failed to load')
      promptReload(
        'This window could not be loaded',
        'Reload the window to try again without restarting the entire application.',
        'Close Window',
        () => win.close(),
      )
    },
  )

  win.webContents.on('console-message', (details) => {
    if (details.level !== 'error') return
    mainLogger.error({ lineNumber: details.lineNumber }, 'Renderer console error')
  })
}

function createWindow(): BrowserWindow {
  const win = createHostWindow({
    preloadPath: join(__dirname, 'preload.js'),
    title: 'Maximal',
    titleBarStyle: 'hiddenInset',
    width: 1280,
    height: 768,
    ...centerOnPrimaryDisplay(1280, 768),
    showWhenReady: mainWindowRevealAllowed,
    loadRenderer,
  })
  registerVibrancyWindow(win)
  mainWindow = win
  menuBarMode?.applyToWindow(win)
  win.on('closed', () => {
    recording?.windowClosed(win)
    menuBarMode?.cancelPending()
    if (mainWindow === win) mainWindow = null
  })
  installRendererRecovery(win)
  return win
}

function openTypographyPreviewWindow(): void {
  if (typographyPreviewWindow !== null && !typographyPreviewWindow.isDestroyed()) {
    if (typographyPreviewWindow.isMinimized()) typographyPreviewWindow.restore()
    if (!typographyPreviewWindow.isVisible()) typographyPreviewWindow.show()
    typographyPreviewWindow.focus()
    return
  }
  const width = 1180
  const height = 760
  const win = createHostWindow({
    preloadPath: join(__dirname, 'preload.js'),
    title: 'Terminal Typography Preview',
    titleBarStyle: 'hiddenInset',
    width,
    height,
    ...centerOnPrimaryDisplay(width, height),
    loadRenderer: (window) => {
      loadRendererQuery(window, new URLSearchParams({ terminalTypographyPreview: 'true' }))
    },
  })
  typographyPreviewWindow = win
  win.on('closed', () => {
    if (typographyPreviewWindow === win) typographyPreviewWindow = null
  })
  installRendererRecovery(win)
}

function createTerminalWindow(request: TerminalWindowRequest): BrowserWindow {
  const win = createHostWindow({
    preloadPath: join(__dirname, 'preload.js'),
    title: request.title,
    titleBarStyle: 'hiddenInset',
    x: request.x,
    y: request.y,
    width: 1000,
    height: 700,
    showWhenReady: false,
    loadRenderer: () => undefined,
  })
  menuBarMode?.applyToWindow(win)
  registerVibrancyWindow(win)
  installRendererRecovery(win)
  return win
}

async function openTransferredTerminal(
  owner: BrowserWindow | undefined,
  request: TerminalWindowRequest,
  mode: 'copy' | 'move',
): Promise<boolean> {
  if (!owner) return false
  const detached = createTerminalWindow(request)
  const transaction = stageTerminalSessions(owner, detached, request, mode)
  if (!transaction) {
    detached.close()
    return false
  }
  const ready = waitForHostWindowReady(detached)
  loadRenderer(detached, request)
  if (!await ready || !transaction.commit()) {
    transaction.rollback()
    if (!detached.isDestroyed()) detached.close()
    return false
  }
  detached.show()
  focusWindow(detached)
  return true
}

function redockTerminal(
  owner: BrowserWindow | undefined,
  request: TerminalRedockRequest,
): boolean {
  if (!owner) return false
  const source = BrowserWindow.fromId(Number(request.sourceFrameId))
  const target = BrowserWindow.fromId(Number(request.targetFrameId))
  if (!source || !target || target !== owner) return false
  const moved = moveTerminalSessions(source, target, request)
  if (!moved) return false
  target.webContents.send(BRIDGE_CHANNELS.terminalTabRedocked, {
    id: request.id,
    title: request.title,
    canRunInBackground: request.canRunInBackground,
    ...(request.pane ? { pane: request.pane } : {}),
  })
  source.close()
  focusWindow(target)
  return true
}

function activateWindow(): BrowserWindow {
  const win = mainWindow?.isDestroyed() === false ? mainWindow : createWindow()
  focusWindow(win)
  return win
}

function openSettings(sectionId: PendingSettingsRequest['sectionId']): void {
  const existing = mainWindow?.isDestroyed() === false ? mainWindow : null
  if (existing === null || existing.webContents.isLoading()) {
    pendingSettingsRequest = { sectionId }
    activateWindow()
    return
  }
  focusWindow(existing)
  existing.webContents.send(BRIDGE_CHANNELS.menuOpenSettings, sectionId)
}

void app.whenReady().then(async () => {
  const splashPreview = isSplashPreview()
  mainWindowRevealAllowed = false
  let coreReady = false
  let rendererReady = false
  let splashClosed = false
  let startupPresentationReady = false
  let harnessStartRequested = process.env.STUFFBUCKET_HARNESS_START_OPEN === '1'
  const canActivateHarness = (): boolean =>
    coreReady && rendererReady && startupPresentationReady
  const activateRequestedHarness = (): void => {
    if (!harnessStartRequested || !canActivateHarness()) return
    harnessStartRequested = false
    showHarnessHost()
  }
  const setSplashStatus = (message: string): void => {
    void updateSplashStatus(message).catch((error: unknown) => {
      mainLogger.error(
        { errorName: error instanceof Error ? error.name : 'unknown' },
        'Failed to update splash startup status',
      )
    })
  }
  const closeReadySplash = (): void => {
    if (!splashPreview && coreReady && rendererReady) {
      setSplashStatus('Finishing startup…')
      closeSplashWindow()
    }
  }

  createSplashWindow({
    name: 'maximal',
    version: app.getVersion(),
    dismissAfterMs: splashPreview ? false : undefined,
    onClosed: () => {
      splashClosed = true
      setTimeout(() => {
        if (!splashClosed) return
        startupPresentationReady = true
        mainWindowRevealAllowed = true
        const target = mainWindow
        if (rendererReady && target !== null && !target.isDestroyed()) {
          focusWindow(target)
        }
        activateRequestedHarness()
      }, MAIN_WINDOW_REVEAL_DELAY_MS)
    },
  })
  setSplashStatus('Loading desktop services…')

  const nativeMode = new MenuBarModeController(() => {
    toggleHarnessHost()
  },
    (win, request) => {
      focusWindow(win)
      win.webContents.send(BRIDGE_CHANNELS.terminalMenuFocus, request)
    },
  )
  menuBarMode = nativeMode
  await nativeMode.initialize()

  const installMenu = (): void => installApplicationMenu({
    onCheckForUpdates: () => {
      void openExternalUrl('https://github.com/stuffbucket/maximal/releases/latest')
    },
    onOpenLicenses: () => {
      activateWindow().webContents.send(BRIDGE_CHANNELS.menuOpenLicenses)
    },
    onOpenSettings: openSettings,
    onRevealRecordings: () => {
      void revealRecordingsDirectory().catch((error: unknown) => {
        mainLogger.error(
          { errorName: error instanceof Error ? error.name : 'unknown' },
          'Failed to reveal recordings folder',
        )
        dialog.showErrorBox(
          'Unable to open recordings folder',
          error instanceof Error ? error.message : String(error),
        )
      })
    },
    isRecording: recording?.isRecording() ?? false,
    onToggleRecording: () => {
      void recording?.toggle().catch((error: unknown) => {
        mainLogger.error({ errorName: error instanceof Error ? error.name : 'unknown' }, 'Window recording failed')
        dialog.showErrorBox('Recording failed', error instanceof Error ? error.message : String(error))
      })
    },
  })
  recording = createDesktopRecording(() => mainWindow, installMenu)
  installMenu()

  coreControlConnection = createCoreControlConnection({
    onChange: () => broadcast(BRIDGE_CHANNELS.controlChanged),
    onLocalModelEvent: (event) =>
      broadcast(BRIDGE_CHANNELS.localModelsChanged, event),
    onTrafficInvalidation: (invalidation) =>
      broadcast(BRIDGE_CHANNELS.trafficInvalidated, invalidation),
  })
  const applicationSettings = loadApplicationSettings(app.getPath('userData')).settings
  configureTerminalHost(applicationSettings, coreControlConnection)
  if (applicationSettings.ollamaStartOnLaunch) {
    void getOllamaRuntimeStatus()
      .then((status) =>
        status.running || status.process_id !== null ? status : launchOllama())
      .catch((error: unknown) => {
        mainLogger.error(
          { errorName: error instanceof Error ? error.name : 'unknown' },
          'Ollama failed to start with Maximal',
        )
      })
  }
  configureTerminalWindowActions({
    undock: (owner, request) =>
      openTransferredTerminal(owner, request, 'move'),
    copy: (owner, request) =>
      openTransferredTerminal(owner, request, 'copy'),
    redock: redockTerminal,
    syncMenu: (owner, entries) => {
      nativeMode.syncTerminalMenu(owner, entries)
    },
  })
  setSplashStatus('Loading project catalog…')
  projectCatalog = await DesktopProjectCatalog.open(app.getPath('userData'))
  configureTerminalProjectTrust((path) => projectCatalog?.isTrustedPath(path) === true)
  registerIpc(coreControlConnection, nativeMode, projectCatalog)
  stopBrowserHost = startBrowserHost(() => mainWindow)
  void projectCatalog.refresh().then(
    () => broadcast(BRIDGE_CHANNELS.projectsChanged),
    (error: unknown) => mainLogger.error(
      { errorName: error instanceof Error ? error.name : 'unknown' },
      'Project catalog startup refresh failed',
    ),
  )
  setSplashStatus('Preparing the assistant…')
  await startHarnessHost({
    modelDirectory: localModelsDirectory(),
    canActivate: canActivateHarness,
    applicationWindow: () => mainWindow,
  })

  onCoreStatus((status) => {
    if (status.phase === 'ready') {
      coreReady = true
      mainLogger.info({ pid: status.pid }, 'Sidecar is ready for desktop requests')
      setSplashStatus(rendererReady
        ? 'Finishing startup…'
        : 'Connecting the workspace…')
      closeReadySplash()
      activateRequestedHarness()
    } else if (status.phase === 'boot-status') {
      setSplashStatus(status.message === 'Checking configuration'
        ? 'Validating local service configuration…'
        : status.message === 'Starting proxy'
          ? 'Opening the secure local model gateway…'
          : status.message)
    } else if (status.phase === 'starting') {
      setSplashStatus('Starting Maximal Core…')
    } else if (status.phase === 'failed') {
      setSplashStatus('Local services could not start.')
    }
    broadcastCoreStatus(status)
  })

  setSplashStatus('Loading the workspace…')
  const win = createWindow()
  if (!splashPreview) {
    win.once('ready-to-show', () => {
      rendererReady = true
      setSplashStatus(coreReady
        ? 'Finishing startup…'
        : 'Waiting for local services…')
      closeReadySplash()
      if (startupPresentationReady && !win.isDestroyed()) focusWindow(win)
      activateRequestedHarness()
    })
  }
  app.on('activate', () => {
    activateWindow()
  })

  try {
    setSplashStatus('Starting Maximal Core…')
    await spawnCore()
  } catch (error) {
    // `spawnCore()` emits a failed lifecycle state for the in-app problem screen.
    // A native blocking error dialog can prevent `app.quit()` from completing.
    mainLogger.error({ errorName: error instanceof Error ? error.name : 'unknown' }, 'Core failed to start')
  }
})

// On macOS the sidecar is app-scoped, not window-scoped: closing every window
// leaves it alive so `activate` can reopen immediately. Other platforms quit.
app.on('window-all-closed', () => {
  if (process.platform === 'darwin' || menuBarMode?.keepsAlive() === true) return
  coreControlConnection?.dispose()
  void killCore()
  app.quit()
})

const shutdownLifecycle = new ShutdownLifecycle()

shutdownLifecycle.subscribe((snapshot) => {
  broadcast(BRIDGE_CHANNELS.shutdownChanged, snapshot)
})

shutdownLifecycle.onBeforeShutdown((event) => {
  if (!app.isPackaged) return
  const impacts = [
    isHarnessBusy() ? 'An agent is still working.' : null,
    activeTerminalCount() > 0 ? 'Terminal sessions are still running.' : null,
  ].filter((impact): impact is string => impact !== null)
  if (impacts.length === 0) return

  const options: MessageBoxOptions = {
    type: 'question',
    buttons: ['Cancel', 'Quit'],
    defaultId: 0,
    cancelId: 0,
    message: 'Quit Maximal?',
    detail: impacts.join('\n'),
  }
  const confirmation = (mainWindow === null
    ? dialog.showMessageBox(options)
    : dialog.showMessageBox(mainWindow, options)
  ).then(({ response }) => response !== 1)
  event.veto(confirmation, { id: 'active-work', label: 'Active work' })
})

shutdownLifecycle.onWillShutdown((event) => {
  quitting = true
  event.report('application', 'Closing application services.')
  event.join(Promise.resolve().then(() => {
    stopBrowserHost?.()
    stopBrowserHost = undefined
    menuBarMode?.dispose()
    coreControlConnection?.dispose()
    projectCatalog?.close()
    projectCatalog = null
    stopTerminalHost()
  }), { id: 'application', label: 'Application services' })

  event.report('core', 'Waiting for Core to exit.')
  event.join(killCore(), { id: 'core', label: 'Core' })

  event.report('agent', 'Waiting for the active agent to stop.')
  event.join(stopHarnessHost(), { id: 'agent', label: 'Agent runtime' })

  if (recording?.isRecording()) {
    event.report('recording', 'Saving the window recording.')
    event.join(recording.stop(), { id: 'recording', label: 'Window recording' })
  }
})

let shutdownComplete = false

app.on('before-quit', (event) => {
  if (shutdownComplete) return
  event.preventDefault()
  void shutdownLifecycle.request('quit').then((result) => {
    if (result === 'vetoed' || shutdownComplete) return
    shutdownComplete = true
    app.quit()
  }).catch((error: unknown) => {
    mainLogger.error({ errorName: error instanceof Error ? error.name : 'unknown' }, 'Desktop shutdown failed')
  })
})
