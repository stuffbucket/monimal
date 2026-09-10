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
  shell: { openExternal: shellOpenExternal },
}))

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

const { createControlSessionMock, disposeControlSessionMock } = vi.hoisted(
  () => {
    const disposeControlSessionMock = vi.fn()
    return {
      disposeControlSessionMock,
      createControlSessionMock: vi.fn((_options: {
        onChange(): void
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
  createControlSessionMock.mockClear()
  disposeControlSessionMock.mockClear()
  onBeforeSendHeaders.mockClear()
  onHeadersReceived.mockClear()
  shellOpenExternal.mockClear()
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
      BRIDGE_CHANNELS.menuOpenSettings,
      BRIDGE_CHANNELS.trafficInvalidated,
      BRIDGE_CHANNELS.terminalData,
      BRIDGE_CHANNELS.terminalExit,
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

    fakeApp.emit('before-quit')
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

  it('before-quit always disposes control and kills core', async () => {
    await loadIndexOn('darwin')

    fakeApp.emit('before-quit')

    expect(disposeControlSessionMock).toHaveBeenCalledTimes(1)
    expect(killCoreMock).toHaveBeenCalledTimes(1)
  })
})
