import {
  TrafficOverviewQuerySchema,
  TrafficRequestDetailQuerySchema,
  TrafficRequestListQuerySchema,
} from '@stuffbucket/maximal-observability-contract'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  BRIDGE_CHANNELS,
  EVENT_CHANNELS,
  INVOKE_CHANNELS,
} from '../shared/bridge-channels'

interface ControlSessionSpies {
  authStatus: ReturnType<typeof vi.fn>
  authStart: ReturnType<typeof vi.fn>
  authCancel: ReturnType<typeof vi.fn>
  authSignOut: ReturnType<typeof vi.fn>
  accountsList: ReturnType<typeof vi.fn>
  accountsSwitch: ReturnType<typeof vi.fn>
  observabilityOverview: ReturnType<typeof vi.fn>
  observabilityRequests: ReturnType<typeof vi.fn>
  observabilityRequest: ReturnType<typeof vi.fn>
  connectionsList: ReturnType<typeof vi.fn>
  connectionsAct: ReturnType<typeof vi.fn>
  connectionsRevealCredential: ReturnType<typeof vi.fn>
  localModelsList: ReturnType<typeof vi.fn>
  localModelsEnsure: ReturnType<typeof vi.fn>
  localModelsCancel: ReturnType<typeof vi.fn>
  searchSettingsGet: ReturnType<typeof vi.fn>
  searchSettingsUpdate: ReturnType<typeof vi.fn>
    searchProviderValidate: ReturnType<typeof vi.fn>
  dispose: ReturnType<typeof vi.fn>
}

const {
  browserWindows,
  fakeApp,
  fakeWindow,
  installApplicationMenuMock,
  ipcMainHandle,
  onBeforeSendHeaders,
  onHeadersReceived,
  runShellMock,
  shellOpenExternal,
  shellOpenPath,
  webContentsSend,
  windowState,
} = vi.hoisted(() => {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>()
  const windowListeners = new Map<string, (...args: unknown[]) => void>()
  const webContentsListeners = new Map<string, (...args: unknown[]) => void>()
  const webContentsSend = vi.fn()
  const windowState = {
    destroyed: false,
    loading: false,
    minimized: false,
    visible: true,
  }
  const fakeWindow = {
    isDestroyed: () => windowState.destroyed,
    isMinimized: () => windowState.minimized,
    isVisible: () => windowState.visible,
    restore: vi.fn(() => {
      windowState.minimized = false
    }),
    show: vi.fn(() => {
      windowState.visible = true
    }),
    focus: vi.fn(),
    setSkipTaskbar: vi.fn(),
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      windowListeners.set(event, listener)
    }),
    emit: (event: string, ...args: unknown[]) => {
      windowListeners.get(event)?.(...args)
    },
    webContents: {
      isLoading: () => windowState.loading,
      send: webContentsSend,
      on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
        webContentsListeners.set(event, listener)
      }),
      emit: (event: string, ...args: unknown[]) => {
        webContentsListeners.get(event)?.(...args)
      },
    },
  }
  const fakeApp = {
    isPackaged: false,
    commandLine: { hasSwitch: vi.fn(() => false) },
    whenReady: vi.fn(() => Promise.resolve()),
    quit: vi.fn(),
    getPath: vi.fn(() => '/tmp/maximal-client-test'),
    getAppPath: vi.fn(() => '/tmp/maximal-client-test'),
    on(event: string, listener: (...args: unknown[]) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)?.add(listener)
      return fakeApp
    },
    emit(event: string, ...args: unknown[]) {
      for (const listener of listeners.get(event) ?? []) listener(...args)
    },
    removeAllListeners() {
      listeners.clear()
      windowListeners.clear()
      webContentsListeners.clear()
    },
  }
  return {
    browserWindows: [] as Array<{
      isDestroyed(): boolean
      webContents: { send: ReturnType<typeof vi.fn> }
    }>,
    fakeApp,
    fakeWindow,
    installApplicationMenuMock: vi.fn(),
    ipcMainHandle: vi.fn<
      (channel: string, handler: (...args: unknown[]) => unknown) => void
    >(),
    onBeforeSendHeaders: vi.fn(),
    onHeadersReceived: vi.fn(),
    runShellMock: vi.fn(() => fakeWindow),
    shellOpenExternal: vi.fn(() => Promise.resolve()),
    shellOpenPath: vi.fn(() => Promise.resolve('')),
    webContentsSend,
    windowState,
  }
})

vi.mock('electron', () => ({
  app: fakeApp,
  BrowserWindow: { getAllWindows: () => browserWindows },
  ipcMain: { handle: ipcMainHandle },
  // Keep spies available to prove index.ts never installs the old shim.
  session: {
    defaultSession: {
      webRequest: { onBeforeSendHeaders, onHeadersReceived },
    },
  },
  shell: { openExternal: shellOpenExternal, openPath: shellOpenPath },
}))

const { localModelsMkdir, resolveLocalModelsPathMock } = vi.hoisted(() => ({
  localModelsMkdir: vi.fn(() => Promise.resolve()),
  resolveLocalModelsPathMock: vi.fn(() => '/resolved/local/models'),
}))

vi.mock('node:fs/promises', () => ({ mkdir: localModelsMkdir }))

vi.mock('@stuffbucket/local-model-registry', () => ({
  resolveLocalModelsPath: resolveLocalModelsPathMock,
}))

vi.mock('node-pty', () => ({ spawn: vi.fn() }))

vi.mock('./shell.js', () => ({ runShell: runShellMock }))

vi.mock('./menu-bar-mode.js', () => ({
  MenuBarModeController: class {
    initialize = vi.fn(async () => {})
    applyToWindow = vi.fn()
    cancelPending = vi.fn()
    keepsAlive = vi.fn(() => false)
    state = vi.fn(() => ({ enabled: false, pending: false }))
    beginEnable = vi.fn(() => ({ attemptId: 'attempt-1', deadlineMs: 1 }))
    confirmEnable = vi.fn(async () => ({ enabled: true, pending: false }))
    cancelEnable = vi.fn(() => ({ enabled: false, pending: false }))
    disable = vi.fn(async () => ({ enabled: false, pending: false }))
    dispose = vi.fn()
  },
}))

// Identity — the app's name, menu and dock icon — is not what this file is
// about, and it reaches for Electron surfaces (`Menu`, `nativeImage`,
// `app.dock`) that the boundary fake below deliberately does not carry.
// `identity.test.ts` covers it against its own fakes.
vi.mock('./identity.js', () => ({
  applyAppName: vi.fn(),
  applyDockIcon: vi.fn(),
  installApplicationMenu: installApplicationMenuMock,
}))

const { killCoreMock, spawnCoreMock, onCoreStatusMock } = vi.hoisted(() => ({
  killCoreMock: vi.fn(),
  spawnCoreMock: vi.fn(() =>
    Promise.resolve({ controlOrigin: '', proxyUrl: '', port: 0, pid: 0 }),
  ),
  onCoreStatusMock: vi.fn(
    (_listener: (status: unknown) => void) => vi.fn(),
  ),
}))

vi.mock('./core.js', () => ({
  awaitProxyUrl: () => Promise.resolve('http://127.0.0.1:4141'),
  currentCoreStatus: () => ({ phase: 'starting' }),
  killCore: killCoreMock,
  spawnCore: spawnCoreMock,
  onCoreStatus: onCoreStatusMock,
}))

const { showHarnessHostMock, startHarnessHostMock, stopHarnessHostMock } = vi.hoisted(() => ({
  showHarnessHostMock: vi.fn(),
  startHarnessHostMock: vi.fn(),
  stopHarnessHostMock: vi.fn(() => Promise.resolve()),
}))

vi.mock('./harness-host.js', () => ({
  showHarnessHost: showHarnessHostMock,
  startHarnessHost: startHarnessHostMock,
  stopHarnessHost: stopHarnessHostMock,
}))

const {
  configureTerminalHostMock,
  registerTerminalIpcMock,
  stopTerminalHostMock,
} = vi.hoisted(() => ({
  configureTerminalHostMock: vi.fn(),
  registerTerminalIpcMock: vi.fn(),
  stopTerminalHostMock: vi.fn(),
}))

vi.mock('./terminal-host.js', () => ({
  configureTerminalHost: configureTerminalHostMock,
  registerTerminalIpc: registerTerminalIpcMock,
  stopTerminalHost: stopTerminalHostMock,
}))

const { createControlSessionMock, disposeControlSessionMock } = vi.hoisted(
  () => {
    const disposeControlSessionMock = vi.fn()
    return {
      disposeControlSessionMock,
      createControlSessionMock: vi.fn((_options: {
        onChange(): void
        onLocalModelEvent(event: unknown): void
        onTrafficInvalidation(invalidation: unknown): void
      }): ControlSessionSpies => ({
        authStatus: vi.fn(),
        authStart: vi.fn(),
        authCancel: vi.fn(),
        authSignOut: vi.fn(),
        accountsList: vi.fn(),
        accountsSwitch: vi.fn(),
        observabilityOverview: vi.fn(),
        observabilityRequests: vi.fn(),
        observabilityRequest: vi.fn(),
        connectionsList: vi.fn(),
        connectionsAct: vi.fn(),
        connectionsRevealCredential: vi.fn(),
        localModelsList: vi.fn(),
        localModelsEnsure: vi.fn(),
        localModelsCancel: vi.fn(),
        searchSettingsGet: vi.fn(),
        searchSettingsUpdate: vi.fn(),
        searchProviderValidate: vi.fn(),
        dispose: disposeControlSessionMock,
      })),
    }
  },
)

vi.mock('./control-session.js', () => ({
  createControlSession: createControlSessionMock,
}))

/** Import a fresh copy of module-scope Electron lifecycle wiring per test. */
function controlSessionSpies(): ControlSessionSpies {
  const value: unknown = createControlSessionMock.mock.results[0]?.value
  if (value === null || typeof value !== 'object') {
    throw new Error('Control session was not created')
  }
  return value as ControlSessionSpies
}

async function loadIndexOn(platform: NodeJS.Platform): Promise<void> {
  vi.resetModules()
  killCoreMock.mockClear()
  spawnCoreMock.mockClear()
  ipcMainHandle.mockClear()
  showHarnessHostMock.mockClear()
  startHarnessHostMock.mockClear()
  stopHarnessHostMock.mockClear()
  configureTerminalHostMock.mockClear()
  registerTerminalIpcMock.mockClear()
  stopTerminalHostMock.mockClear()
  registerTerminalIpcMock.mockImplementation(() => {
    for (const channel of [
      BRIDGE_CHANNELS.terminalProfiles,
      BRIDGE_CHANNELS.terminalDiscover,
      BRIDGE_CHANNELS.terminalLaunch,
      BRIDGE_CHANNELS.terminalSpawn,
      BRIDGE_CHANNELS.terminalWrite,
      BRIDGE_CHANNELS.terminalResize,
      BRIDGE_CHANNELS.terminalTerminate,
      BRIDGE_CHANNELS.terminalList,
      BRIDGE_CHANNELS.terminalAck,
    ]) ipcMainHandle(channel, vi.fn())
  })
  startHarnessHostMock.mockImplementation(() => {
    for (const channel of [
      BRIDGE_CHANNELS.harnessHide,
      BRIDGE_CHANNELS.harnessProvider,
      BRIDGE_CHANNELS.harnessAsk,
      BRIDGE_CHANNELS.harnessAbort,
      BRIDGE_CHANNELS.harnessApprove,
      BRIDGE_CHANNELS.harnessEnsureModel,
    ]) ipcMainHandle(channel, vi.fn())
  })
  createControlSessionMock.mockClear()
  disposeControlSessionMock.mockClear()
  onBeforeSendHeaders.mockClear()
  onHeadersReceived.mockClear()
  shellOpenExternal.mockClear()
  shellOpenPath.mockClear()
  localModelsMkdir.mockClear()
  resolveLocalModelsPathMock.mockClear()
  fakeApp.commandLine.hasSwitch.mockReset().mockReturnValue(false)
  webContentsSend.mockClear()
  runShellMock.mockClear()
  installApplicationMenuMock.mockClear()
  fakeWindow.restore.mockClear()
  fakeWindow.show.mockClear()
  fakeWindow.focus.mockClear()
  fakeWindow.setSkipTaskbar.mockClear()
  browserWindows.length = 0
  windowState.destroyed = false
  windowState.loading = false
  windowState.minimized = false
  windowState.visible = true
  fakeApp.quit.mockClear()
  fakeApp.removeAllListeners()
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true,
  })
  await import('./index.js')
  await Promise.resolve()
  await Promise.resolve()
}

const realPlatform = process.platform

afterEach(() => {
  Object.defineProperty(process, 'platform', {
    value: realPlatform,
    configurable: true,
  })
  vi.clearAllMocks()
})

describe('closed IPC boundary', () => {
  it('names every renderer event channel in one closed allowlist', () => {
    expect(EVENT_CHANNELS).toEqual([
      BRIDGE_CHANNELS.lifecycleChanged,
      BRIDGE_CHANNELS.controlChanged,
      BRIDGE_CHANNELS.localModelsChanged,
      BRIDGE_CHANNELS.menuOpenSettings,
      BRIDGE_CHANNELS.trafficInvalidated,
      BRIDGE_CHANNELS.terminalData,
      BRIDGE_CHANNELS.terminalExit,
      BRIDGE_CHANNELS.harnessDelta,
      BRIDGE_CHANNELS.harnessTool,
      BRIDGE_CHANNELS.harnessApproval,
      BRIDGE_CHANNELS.harnessEnd,
      BRIDGE_CHANNELS.harnessModelProgress,
    ])
  })

  it('registers exactly the named invoke allowlist', async () => {
    await loadIndexOn('darwin')

    expect(ipcMainHandle.mock.calls.map(([channel]) => channel)).toEqual(
      INVOKE_CHANNELS,
    )
    expect(ipcMainHandle).not.toHaveBeenCalledWith(
      'core:origin',
      expect.anything(),
    )
    expect(ipcMainHandle.mock.calls.map(([channel]) => channel)).not.toContain(
      'maximal:control/call',
    )
  })

  it('routes each observability invoke channel to its named session method', async () => {
    await loadIndexOn('darwin')
    const session = controlSessionSpies()
    const overviewQuery = { filters: {}, tokenBucketMs: null }
    const requestsQuery = { filters: {}, cursor: null, limit: 50 }
    const requestQuery = { requestId: 'req-1' }

    const invoke = async (channel: string, payload: unknown): Promise<void> => {
      const registration = ipcMainHandle.mock.calls.find(
        ([registered]) => registered === channel,
      )
      const handler = registration?.[1] as (
        event: unknown,
        query: unknown,
      ) => Promise<unknown>
      await handler({}, payload)
    }

    await invoke(BRIDGE_CHANNELS.observabilityOverview, overviewQuery)
    await invoke(BRIDGE_CHANNELS.observabilityRequests, requestsQuery)
    await invoke(BRIDGE_CHANNELS.observabilityRequest, requestQuery)

    expect(session.observabilityOverview).toHaveBeenCalledWith(
      TrafficOverviewQuerySchema.parse(overviewQuery),
    )
    expect(session.observabilityRequests).toHaveBeenCalledWith(
      TrafficRequestListQuerySchema.parse(requestsQuery),
    )
    expect(session.observabilityRequest).toHaveBeenCalledWith(
      TrafficRequestDetailQuerySchema.parse(requestQuery),
    )
  })

  it('routes connection channels through validated session methods', async () => {
    await loadIndexOn('darwin')
    const session = controlSessionSpies()
    const handler = (channel: string) => {
      const registration = ipcMainHandle.mock.calls.find(
        ([registered]) => registered === channel,
      )
      if (!registration) throw new Error(`${channel} IPC was not registered`)
      return registration[1]
    }

    await handler(BRIDGE_CHANNELS.connectionsList)({})
    await handler(BRIDGE_CHANNELS.connectionsAct)(
      {},
      'claude-code',
      'reconnect',
    )
    await handler(BRIDGE_CHANNELS.connectionsRevealCredential)(
      {},
      'managed:claude-code',
    )

    expect(session.connectionsList).toHaveBeenCalledOnce()
    expect(session.connectionsAct).toHaveBeenCalledWith(
      'claude-code',
      'reconnect',
    )
    expect(session.connectionsRevealCredential).toHaveBeenCalledWith(
      'managed:claude-code',
    )
  })

  it('routes validated local model operations to named session methods', async () => {
    await loadIndexOn('darwin')
    const session = controlSessionSpies()
    const handlerFor = (channel: string) => {
      const registration = ipcMainHandle.mock.calls.find(
        ([registered]) => registered === channel,
      )
      return registration?.[1] as (
        event: unknown,
        identifier?: unknown,
      ) => unknown
    }

    await handlerFor(BRIDGE_CHANNELS.localModelsList)({})
    await handlerFor(BRIDGE_CHANNELS.localModelsEnsure)({}, 'qwen')
    await handlerFor(BRIDGE_CHANNELS.localModelsCancel)({}, 'operation-1')

    expect(session.localModelsList).toHaveBeenCalledOnce()
    expect(session.localModelsEnsure).toHaveBeenCalledWith('qwen')
    expect(session.localModelsCancel).toHaveBeenCalledWith('operation-1')
    expect(() =>
      handlerFor(BRIDGE_CHANNELS.localModelsEnsure)({}, ''),
    ).toThrow()
    expect(session.localModelsEnsure).toHaveBeenCalledTimes(1)
  })

  it.each([
    [
      BRIDGE_CHANNELS.observabilityOverview,
      'observabilityOverview',
      { filters: {}, tokenBucketMs: null, unexpected: true },
    ],
    [
      BRIDGE_CHANNELS.observabilityRequests,
      'observabilityRequests',
      { filters: {}, cursor: null, limit: 0 },
    ],
    [
      BRIDGE_CHANNELS.observabilityRequest,
      'observabilityRequest',
      { requestId: '' },
    ],
  ] as const)(
    'rejects malformed payloads on %s',
    async (channel, method, payload) => {
      await loadIndexOn('darwin')
      const session = controlSessionSpies()
      const registration = ipcMainHandle.mock.calls.find(
        ([registered]) => registered === channel,
      )
      const handler = registration?.[1] as (
        event: unknown,
        query: unknown,
      ) => unknown

      expect(() => handler({}, payload)).toThrow()
      expect(session[method]).not.toHaveBeenCalled()
    },
  )

  it('rejects malformed connection identifiers and actions before dispatch', async () => {
    await loadIndexOn('darwin')
    const session = controlSessionSpies()
    const actRegistration = ipcMainHandle.mock.calls.find(
      ([channel]) => channel === BRIDGE_CHANNELS.connectionsAct,
    )
    const revealRegistration = ipcMainHandle.mock.calls.find(
      ([channel]) => channel === BRIDGE_CHANNELS.connectionsRevealCredential,
    )
    const actHandler = actRegistration?.[1] as (
      event: unknown,
      id: unknown,
      action: unknown,
    ) => unknown
    const revealHandler = revealRegistration?.[1] as (
      event: unknown,
      id: unknown,
    ) => unknown

    expect(() => actHandler({}, 'Claude Code', 'connect')).toThrow()
    expect(() => actHandler({}, 'claude-code', 'replace')).toThrow()
    expect(() => revealHandler({}, '')).toThrow()
    expect(session.connectionsAct).not.toHaveBeenCalled()
    expect(session.connectionsRevealCredential).not.toHaveBeenCalled()
  })

  it('validates search settings updates before session dispatch', async () => {
    await loadIndexOn('darwin')
    const session = controlSessionSpies()
    const registration = ipcMainHandle.mock.calls.find(
      ([registered]) => registered === BRIDGE_CHANNELS.searchSettingsUpdate,
    )
    const handler = registration?.[1] as (
      event: unknown,
      input: unknown,
    ) => unknown
    const input = { settings: { fallback: false } }

    handler({}, input)
    expect(session.searchSettingsUpdate).toHaveBeenCalledWith(input)
    expect(() => handler({}, { settings: [] })).toThrow()
    expect(session.searchSettingsUpdate).toHaveBeenCalledTimes(1)
  })
  it('validates provider checks before session dispatch', async () => {
    await loadIndexOn('darwin')
    const session = controlSessionSpies()
    const registration = ipcMainHandle.mock.calls.find(
      ([registered]) => registered === BRIDGE_CHANNELS.searchProviderValidate,
    )
    const handler = registration?.[1] as (
      event: unknown,
      input: unknown,
    ) => unknown
    const input = { providerId: 'ollama', settings: { apiKey: 'test-key' } }

    handler({}, input)
    expect(session.searchProviderValidate).toHaveBeenCalledWith(input)
    expect(() => handler({}, { providerId: '' })).toThrow()
    expect(session.searchProviderValidate).toHaveBeenCalledTimes(1)
  })

  it('does not install Electron webRequest header or CORS hooks', async () => {
    await loadIndexOn('darwin')

    expect(onBeforeSendHeaders).not.toHaveBeenCalled()
    expect(onHeadersReceived).not.toHaveBeenCalled()
  })

  it('broadcasts redacted lifecycle state and payload-free control invalidation', async () => {
    await loadIndexOn('darwin')
    browserWindows.push({
      isDestroyed: () => false,
      webContents: { send: webContentsSend },
    })

    const lifecycleListener = onCoreStatusMock.mock.calls[0]?.[0]
    lifecycleListener?.({
      phase: 'ready',
      controlOrigin: 'http://127.0.0.1:54321',
      proxyUrl: 'http://127.0.0.1:4141',
      pid: 42,
    })
    expect(webContentsSend).toHaveBeenCalledWith(
      BRIDGE_CHANNELS.lifecycleChanged,
      {
        phase: 'ready',
        proxyUrl: 'http://127.0.0.1:4141',
        pid: 42,
      },
    )

    createControlSessionMock.mock.calls[0]?.[0].onChange()
    expect(webContentsSend).toHaveBeenCalledWith(
      BRIDGE_CHANNELS.controlChanged,
    )

    const localModelEvent = {
      type: 'catalog',
      snapshot: { models: [], revision: 1 },
    }
    createControlSessionMock.mock.calls[0]?.[0]
      .onLocalModelEvent(localModelEvent)
    expect(webContentsSend).toHaveBeenCalledWith(
      BRIDGE_CHANNELS.localModelsChanged,
      localModelEvent,
    )

    const invalidation = {
      contractVersion: 1,
      revision: 2,
      emittedAt: '2026-09-07T20:01:00.000Z',
      activeCount: 0,
      overflow: false,
      scopes: ['overview'],
      requestIds: [],
    }
    createControlSessionMock.mock.calls[0]?.[0]
      .onTrafficInvalidation(invalidation)
    expect(webContentsSend).toHaveBeenCalledWith(
      BRIDGE_CHANNELS.trafficInvalidated,
      invalidation,
    )
  })

  it('allows only HTTP(S) URLs through the native external opener', async () => {
    await loadIndexOn('darwin')
    const registration = ipcMainHandle.mock.calls.find(
      ([channel]) => channel === BRIDGE_CHANNELS.openExternal,
    )
    const handler = registration?.[1] as (
      event: unknown,
      url: unknown,
    ) => Promise<void>

    await expect(handler({}, 'file:///Applications/Utilities/Terminal.app'))
      .rejects.toThrow('External URL must use HTTP or HTTPS')
    await expect(handler({}, 'not a URL')).rejects.toThrow(
      'External URL must be a valid HTTP(S) URL',
    )
    expect(() => handler({}, false)).toThrow()
    expect(shellOpenExternal).not.toHaveBeenCalled()

    await expect(
      handler({}, ' \thttps://github.com/login/device\n'),
    ).resolves.toBeUndefined()
    expect(shellOpenExternal).toHaveBeenCalledWith(
      'https://github.com/login/device',
    )
  })

  it('opens only the main-owned local models directory', async () => {
    await loadIndexOn('darwin')
    const registration = ipcMainHandle.mock.calls.find(
      ([channel]) => channel === BRIDGE_CHANNELS.localModelsOpenFolder,
    )
    const handler = registration?.[1] as (
      event: unknown,
      untrustedPath?: unknown,
    ) => Promise<void>

    await expect(handler({}, '/tmp/untrusted')).resolves.toBeUndefined()
    expect(resolveLocalModelsPathMock).toHaveBeenCalledWith({
      suiteDataRoot: undefined,
    })
    expect(localModelsMkdir).toHaveBeenCalledWith('/resolved/local/models', {
      recursive: true,
    })
    expect(shellOpenPath).toHaveBeenCalledWith('/resolved/local/models')
  })

  it('isolates local models beneath an explicit user-data directory', async () => {
    fakeApp.commandLine.hasSwitch.mockReturnValue(true)
    await loadIndexOn('darwin')
    fakeApp.commandLine.hasSwitch.mockReturnValue(true)
    const registration = ipcMainHandle.mock.calls.find(
      ([channel]) => channel === BRIDGE_CHANNELS.localModelsOpenFolder,
    )
    const handler = registration?.[1] as () => Promise<void>

    await handler()

    expect(resolveLocalModelsPathMock).toHaveBeenCalledWith({
      suiteDataRoot: '/tmp/maximal-client-test/stuffbucket',
    })
  })

  it('uses the redacted lifecycle channel rather than the legacy channel', async () => {
    await loadIndexOn('darwin')

    expect(INVOKE_CHANNELS).toContain(BRIDGE_CHANNELS.lifecycleCurrent)
    expect(INVOKE_CHANNELS).not.toContain('core:status:current')
  })
})

describe('window defaults', () => {
  it('opens wide enough for the three-panel Overview without horizontal scrolling', async () => {
    await loadIndexOn('darwin')

    expect(runShellMock).toHaveBeenCalledWith(
      expect.objectContaining({ width: 1280, height: 768 }),
    )
  })
})

describe('native Settings requests', () => {
  function onOpenSettings(): (sectionId: string | null) => void {
    const callbacks = installApplicationMenuMock.mock.calls[0]?.[0] as
      | { onOpenSettings?: (sectionId: string | null) => void }
      | undefined
    if (!callbacks?.onOpenSettings) throw new Error('Settings callback not installed')
    return callbacks.onOpenSettings
  }

  function pendingRequestHandler(): () => unknown {
    const registration = ipcMainHandle.mock.calls.find(
      ([channel]) => channel === BRIDGE_CHANNELS.pendingSettingsRequest,
    )
    if (!registration) throw new Error('Pending request IPC not registered')
    return registration[1]
  }

  it('delivers immediately to a live renderer after restoring and focusing its window', async () => {
    await loadIndexOn('darwin')
    windowState.minimized = true
    windowState.visible = false

    onOpenSettings()('settings-usage-heading')

    expect(fakeWindow.restore).toHaveBeenCalledTimes(1)
    expect(fakeWindow.show).toHaveBeenCalledTimes(1)
    expect(fakeWindow.focus).toHaveBeenCalledTimes(1)
    expect(webContentsSend).toHaveBeenCalledWith(
      BRIDGE_CHANNELS.menuOpenSettings,
      'settings-usage-heading',
    )
    expect(pendingRequestHandler()()).toBeNull()
  })

  it('retains a request while the renderer is loading and consumes it once', async () => {
    await loadIndexOn('darwin')
    windowState.loading = true

    onOpenSettings()('settings-models-heading')

    expect(webContentsSend).not.toHaveBeenCalledWith(
      BRIDGE_CHANNELS.menuOpenSettings,
      expect.anything(),
    )
    expect(pendingRequestHandler()()).toEqual({
      sectionId: 'settings-models-heading',
    })
    expect(pendingRequestHandler()()).toBeNull()
  })

  it('creates a reachable window and retains the request when none exists', async () => {
    await loadIndexOn('darwin')
    fakeWindow.emit('closed')

    onOpenSettings()(null)

    expect(runShellMock).toHaveBeenCalledTimes(2)
    expect(fakeWindow.focus).toHaveBeenCalledTimes(1)
    expect(pendingRequestHandler()()).toEqual({ sectionId: null })
  })
})

describe('native update requests', () => {
  it('opens the latest product release from the application menu', async () => {
    await loadIndexOn('darwin')
    const callbacks = installApplicationMenuMock.mock.calls[0]?.[0] as
      | { onCheckForUpdates?: () => void }
      | undefined

    callbacks?.onCheckForUpdates?.()
    await Promise.resolve()

    expect(shellOpenExternal).toHaveBeenCalledWith(
      'https://github.com/stuffbucket/maximal/releases/latest',
    )
  })
})

describe('window-all-closed / before-quit', () => {
  it('on darwin keeps core alive on window close and disposes it on real quit', async () => {
    await loadIndexOn('darwin')

    fakeApp.emit('window-all-closed')
    expect(killCoreMock).not.toHaveBeenCalled()
    expect(disposeControlSessionMock).not.toHaveBeenCalled()
    expect(fakeApp.quit).not.toHaveBeenCalled()

    fakeApp.emit('before-quit', { preventDefault: vi.fn() })
    expect(disposeControlSessionMock).toHaveBeenCalledTimes(1)
    expect(killCoreMock).toHaveBeenCalledTimes(1)
  })

  it('on non-darwin disposes core control before quitting', async () => {
    await loadIndexOn('win32')

    fakeApp.emit('window-all-closed')

    expect(disposeControlSessionMock).toHaveBeenCalledTimes(1)
    expect(killCoreMock).toHaveBeenCalledTimes(1)
    expect(fakeApp.quit).toHaveBeenCalledTimes(1)
  })

  it('defers the first quit until harness shutdown and does not recurse', async () => {
    await loadIndexOn('darwin')
    let resolveShutdown: (() => void) | undefined
    stopHarnessHostMock.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveShutdown = resolve
      }),
    )
    const first = { preventDefault: vi.fn() }

    fakeApp.emit('before-quit', first)

    expect(first.preventDefault).toHaveBeenCalledOnce()
    expect(stopHarnessHostMock).toHaveBeenCalledOnce()
    expect(fakeApp.quit).not.toHaveBeenCalled()

    resolveShutdown?.()
    await vi.waitFor(() => {
      expect(fakeApp.quit).toHaveBeenCalledOnce()
    })

    const second = { preventDefault: vi.fn() }
    fakeApp.emit('before-quit', second)

    expect(second.preventDefault).not.toHaveBeenCalled()
    expect(stopHarnessHostMock).toHaveBeenCalledOnce()
    expect(fakeApp.quit).toHaveBeenCalledOnce()
    expect(disposeControlSessionMock).toHaveBeenCalledTimes(2)
    expect(killCoreMock).toHaveBeenCalledTimes(2)
  })
})
