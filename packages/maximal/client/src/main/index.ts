import { createHash } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { resolveLocalModelsPath } from '@stuffbucket/local-model-registry'
import {
  ApiKeyCreateRequest,
  ApiKeyUpdateRequest,
  AppSetEnabledRequest,
  ConnectionActionRequest,
  ConnectionCredentialIdRequest,
  OllamaSettingsUpdateRequest,
  SearchProviderValidationRequest,
  SearchSettingsUpdateRequest,
  TokenUsagePeriod,
} from '@stuffbucket/maximal-core/settings-types'
import {
  TrafficOverviewQuerySchema,
  TrafficRequestDetailQuerySchema,
  TrafficRequestListQuerySchema,
} from '@stuffbucket/maximal-observability-contract'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { z } from 'zod'

import { BRIDGE_CHANNELS } from '../shared/bridge-channels.js'
import type {
  PendingSettingsRequest,
  TerminalRedockRequest,
  TerminalWindowRequest,
} from '../shared/bridge-types.js'
import { createControlSession, type ControlSession } from './control-session.js'
import {
  type CoreStatus,
  awaitProxyUrl,
  coreHomePath,
  currentCoreStatus,
  killCore,
  onCoreStatus,
  spawnCore,
} from './core.js'
import { applyAppName, applyDockIcon, installApplicationMenu } from './identity.js'
import { listClientInstallations } from './client-installations.js'
import { toLifecycleStatus } from './lifecycle-status.js'
import { MenuBarModeController } from './menu-bar-mode.js'
import {
  getOllamaRuntimeStatus,
  launchOllama,
  updateOllamaContextLength,
} from './ollama-runtime.js'
import { runShell } from './shell.js'
import {
  showHarnessHost,
  startHarnessHost,
  stopHarnessHost,
} from './harness-host.js'
import {
  configureTerminalHost,
  configureTerminalWindowActions,
  copyTerminalSessions,
  moveTerminalSessions,
  registerTerminalIpc,
  stopTerminalHost,
} from './terminal-host.js'

function isolateDevelopmentUserData(): void {
  if (app.isPackaged || app.commandLine.hasSwitch('user-data-dir')) return
  const checkoutId = createHash('sha256')
    .update(app.getAppPath())
    .digest('hex')
    .slice(0, 8)
  app.setPath('userData', `${app.getPath('userData')}-${checkoutId}`)
}

// Before `whenReady`, not inside it: `app.name` is read when the default menu
// and the About panel are built, so setting it later leaves both stale.
isolateDevelopmentUserData()
applyAppName()

let controlSession: ControlSession | null = null
let mainWindow: BrowserWindow | null = null
let pendingSettingsRequest: PendingSettingsRequest | null = null
let menuBarMode: MenuBarModeController | null = null

const nonEmptyString = z.string().min(1)
const localModelIdentifier = z.string().min(1).max(200)

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

function registerIpc(
  session: ControlSession,
  mode: MenuBarModeController,
): void {
  ipcMain.handle(BRIDGE_CHANNELS.lifecycleCurrent, () =>
    toLifecycleStatus(currentCoreStatus()),
  )
  ipcMain.handle(BRIDGE_CHANNELS.proxyUrl, () => awaitProxyUrl())
  ipcMain.handle(BRIDGE_CHANNELS.openExternal, (_event, url: unknown) =>
    openExternalUrl(url),
  )
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
  ipcMain.handle(BRIDGE_CHANNELS.ollamaAccountsList, () =>
    session.ollamaAccountsList(),
  )
  ipcMain.handle(BRIDGE_CHANNELS.ollamaSettingsGet, () =>
    session.ollamaSettingsGet(),
  )
  ipcMain.handle(BRIDGE_CHANNELS.ollamaSettingsUpdate, (_event, input: unknown) =>
    session.ollamaSettingsUpdate(OllamaSettingsUpdateRequest.parse(input)),
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
  ipcMain.handle(BRIDGE_CHANNELS.logsLocation, () => join(coreHomePath(), 'logs'))
  ipcMain.handle(BRIDGE_CHANNELS.logsReveal, async () => {
    const error = await shell.openPath(join(coreHomePath(), 'logs'))
    if (error) throw new Error(error)
  })
  ipcMain.handle(
    BRIDGE_CHANNELS.localModelsOpenFolder,
    openLocalModelsDirectory,
  )
  ipcMain.handle(BRIDGE_CHANNELS.ollamaRuntimeStatus, () =>
    getOllamaRuntimeStatus(),
  )
  ipcMain.handle(BRIDGE_CHANNELS.ollamaRuntimeLaunch, () => launchOllama())
  ipcMain.handle(
    BRIDGE_CHANNELS.ollamaRuntimeUpdateContext,
    (_event, value: unknown) =>
      updateOllamaContextLength(z.number().int().parse(value)),
  )
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
  if (win.isMinimized()) win.restore()
  if (!win.isVisible()) win.show()
  win.focus()
}

function createWindow(): BrowserWindow {
  const win = runShell({
    preloadPath: join(__dirname, 'preload.js'),
    title: 'Maximal',
    width: 1280,
    height: 768,
    loadRenderer,
  })
  mainWindow = win
  menuBarMode?.applyToWindow(win)
  win.on('closed', () => {
    menuBarMode?.cancelPending()
    if (mainWindow === win) mainWindow = null
  })
  return win
}

function createTerminalWindow(request: TerminalWindowRequest): BrowserWindow {
  const win = runShell({
    preloadPath: join(__dirname, 'preload.js'),
    title: request.title,
    x: request.x,
    y: request.y,
    width: 1000,
    height: 700,
    showWhenReady: false,
    loadRenderer: (win) => loadRenderer(win, request),
  })
  return win
}

function openTransferredTerminal(
  owner: BrowserWindow | undefined,
  request: TerminalWindowRequest,
  transfer: (
    owner: BrowserWindow | undefined,
    recipient: BrowserWindow | undefined,
    request: TerminalWindowRequest,
  ) => boolean,
): boolean {
  if (!owner) return false
  const detached = createTerminalWindow(request)
  const transferred = transfer(owner, detached, request)
  if (!transferred) {
    detached.close()
    return false
  }
  detached.once('ready-to-show', () => {
    detached.show()
    focusWindow(detached)
  })
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
  applyDockIcon()
  const nativeMode = new MenuBarModeController(() => {
    activateWindow()
  })
  menuBarMode = nativeMode
  await nativeMode.initialize()

  installApplicationMenu({
    onCheckForUpdates: () => {
      void openExternalUrl('https://github.com/stuffbucket/maximal/releases/latest')
    },
    onOpenSettings: openSettings,
  })

  controlSession = createControlSession({
    onChange: () => broadcast(BRIDGE_CHANNELS.controlChanged),
    onLocalModelEvent: (event) =>
      broadcast(BRIDGE_CHANNELS.localModelsChanged, event),
    onTrafficInvalidation: (invalidation) =>
      broadcast(BRIDGE_CHANNELS.trafficInvalidated, invalidation),
  })
  configureTerminalHost()
  configureTerminalWindowActions({
    undock: (owner, request) =>
      openTransferredTerminal(owner, request, moveTerminalSessions),
    copy: (owner, request) =>
      openTransferredTerminal(owner, request, copyTerminalSessions),
    redock: redockTerminal,
  })
  registerIpc(controlSession, nativeMode)
  startHarnessHost()

  onCoreStatus((status) => {
    if (status.phase === 'ready') {
      console.log(
        `[maximal-client] core ready — control ${status.controlOrigin}, proxy ${status.proxyUrl}`,
      )
    }
    broadcastCoreStatus(status)
  })

  // Window first, then core, so the renderer can narrate a slow sidecar boot.
  createWindow()
  if (process.env.STUFFBUCKET_HARNESS_START_OPEN === '1') showHarnessHost()
  app.on('activate', () => {
    activateWindow()
  })

  try {
    await spawnCore()
  } catch (error) {
    // `spawnCore()` emits a failed lifecycle state for the in-app problem screen.
    // A native blocking error dialog can prevent `app.quit()` from completing.
    console.error('[maximal-client] core failed to start:', error)
  }
})

// On macOS the sidecar is app-scoped, not window-scoped: closing every window
// leaves it alive so `activate` can reopen immediately. Other platforms quit.
app.on('window-all-closed', () => {
  if (process.platform === 'darwin' || menuBarMode?.keepsAlive() === true) return
  controlSession?.dispose()
  void killCore()
  app.quit()
})

let harnessStopped = false
let harnessShutdown: Promise<void> | undefined

app.on('before-quit', (event) => {
  if (harnessStopped) return
  event.preventDefault()
  if (mainWindow?.isDestroyed() === false) mainWindow.hide()
  menuBarMode?.dispose()
  controlSession?.dispose()
  stopTerminalHost()

  // Core must finish configurator cleanup and release shared target locks
  // before Forge launches a replacement Electron process.
  harnessShutdown ??= Promise.all([killCore(), stopHarnessHost()])
    .then(() => undefined)
    .catch((error: unknown) => {
      console.error('[maximal-client] shutdown failed:', error)
    })
    .finally(() => {
      harnessStopped = true
      app.exit(0)
    })
})
