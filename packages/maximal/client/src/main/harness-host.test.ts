import { homedir } from 'node:os'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BRIDGE_CHANNELS } from '../shared/bridge-channels'

interface HarnessCallbacks {
  onDelta(text: string): void
  onTool(name: string, phase: string, isError: boolean): void
  onApproval(request: unknown): void
  onEnd(result: unknown): void
}

type InvokeHandler = (
  event: { sender: unknown },
  input?: unknown,
) => unknown

const {
  abortAgentMock,
  appGetPath,
  configureAgentMock,
  configureLlamaHostMock,
  configureModelMock,
  createElectronPanelMock,
  discoverProviderMock,
  ensureModelMock,
  globalShortcutRegister,
  globalShortcutUnregister,
  handlers,
  ipcMainHandle,
  ipcMainRemoveHandler,
  isAgentBusyMock,
  overlayWebContents,
  panel,
  panelState,
  resolveApprovalMock,
  runAgentMock,
  shutdownAgentMock,
  stopEngineMock,
} = vi.hoisted(() => {
  const handlers = new Map<string, InvokeHandler>()
  const overlayWebContents = { send: vi.fn() }
  const panelState = { destroyed: false }
  const overlayWindow = {
    isDestroyed: () => panelState.destroyed,
    webContents: overlayWebContents,
  }
  const panel = {
    window: vi.fn(() => overlayWindow),
    show: vi.fn(),
    hide: vi.fn(),
    toggle: vi.fn(),
    destroy: vi.fn(),
  }

  return {
    abortAgentMock: vi.fn(),
    appGetPath: vi.fn(() => '/tmp/maximal-client-test'),
    configureAgentMock: vi.fn(),
    configureLlamaHostMock: vi.fn(),
    configureModelMock: vi.fn(),
    createElectronPanelMock: vi.fn(() => panel),
    discoverProviderMock: vi.fn(() => ({ id: 'local-provider' })),
    ensureModelMock: vi.fn((..._args: unknown[]) => Promise.resolve()),
    globalShortcutRegister: vi.fn(
      (_accelerator: string, _callback: () => void) => true,
    ),
    globalShortcutUnregister: vi.fn(),
    handlers,
    ipcMainHandle: vi.fn((channel: string, handler: InvokeHandler) => {
      handlers.set(channel, handler)
    }),
    ipcMainRemoveHandler: vi.fn((channel: string) => {
      handlers.delete(channel)
    }),
    isAgentBusyMock: vi.fn(() => false),
    overlayWebContents,
    panel,
    panelState,
    resolveApprovalMock: vi.fn(),
    runAgentMock: vi.fn((..._args: unknown[]) => Promise.resolve()),
    shutdownAgentMock: vi.fn(() => Promise.resolve()),
    stopEngineMock: vi.fn(),
  }
})

vi.mock('electron', () => ({
  app: { getPath: appGetPath },
  globalShortcut: {
    register: globalShortcutRegister,
    unregister: globalShortcutUnregister,
  },
  ipcMain: {
    handle: ipcMainHandle,
    removeHandler: ipcMainRemoveHandler,
  },
}))

vi.mock('@stuffbucket/maximal-electron/electron-panel', () => ({
  createElectronPanel: createElectronPanelMock,
}))

vi.mock('@stuffbucket/maximal-harness/host', () => ({
  abortAgent: abortAgentMock,
  configureAgent: configureAgentMock,
  configureLlamaHost: configureLlamaHostMock,
  configureModel: configureModelMock,
  discoverProvider: discoverProviderMock,
  ensureModel: ensureModelMock,
  isAgentBusy: isAgentBusyMock,
  resolveApproval: resolveApprovalMock,
  runAgent: runAgentMock,
  shutdownAgent: shutdownAgentMock,
  stopEngine: stopEngineMock,
}))

const invokeChannels = [
  BRIDGE_CHANNELS.harnessHide,
  BRIDGE_CHANNELS.harnessProvider,
  BRIDGE_CHANNELS.harnessAsk,
  BRIDGE_CHANNELS.harnessAbort,
  BRIDGE_CHANNELS.harnessApprove,
  BRIDGE_CHANNELS.harnessEnsureModel,
]

async function startHost() {
  vi.resetModules()
  const host = await import('./harness-host.js')
  host.startHarnessHost()
  return host
}

function handler(channel: string): InvokeHandler {
  const registered = handlers.get(channel)
  if (!registered) throw new Error(`No handler registered for ${channel}`)
  return registered
}

function overlayEvent(): { sender: unknown } {
  return { sender: panel.window()?.webContents }
}

beforeEach(() => {
  handlers.clear()
  vi.clearAllMocks()
  panelState.destroyed = false
  globalShortcutRegister.mockReturnValue(true)
  isAgentBusyMock.mockReturnValue(false)
  shutdownAgentMock.mockResolvedValue(undefined)
})

describe('harness host IPC boundary', () => {
  it('registers and removes exactly the harness invoke channels', async () => {
    const host = await startHost()

    expect(ipcMainHandle.mock.calls.map(([channel]) => channel)).toEqual(
      invokeChannels,
    )

    await host.stopHarnessHost()

    expect(ipcMainRemoveHandler.mock.calls.map(([channel]) => channel)).toEqual(
      invokeChannels,
    )
    expect(handlers.size).toBe(0)
  })

  it('rejects every request from a sender other than the overlay', async () => {
    await startHost()
    const foreignEvent = { sender: { send: vi.fn() } }
    const inputs = new Map<string, unknown>([
      [BRIDGE_CHANNELS.harnessAsk, { prompt: 'hello' }],
      [
        BRIDGE_CHANNELS.harnessApprove,
        { id: 'approval-1', allow: true, remember: false },
      ],
    ])

    for (const channel of invokeChannels) {
      expect(() => handler(channel)(foreignEvent, inputs.get(channel))).toThrow(
        'Harness requests are accepted only from the overlay window.',
      )
    }

    expect(panel.hide).not.toHaveBeenCalled()
    expect(discoverProviderMock).not.toHaveBeenCalled()
    expect(runAgentMock).not.toHaveBeenCalled()
    expect(abortAgentMock).not.toHaveBeenCalled()
    expect(resolveApprovalMock).not.toHaveBeenCalled()
    expect(ensureModelMock).not.toHaveBeenCalled()
  })

  it('validates and normalizes ask requests before running the agent', async () => {
    await startHost()
    const ask = handler(BRIDGE_CHANNELS.harnessAsk)

    for (const input of [undefined, null, {}, { prompt: 42 }, { prompt: '  ' }]) {
      expect(() => ask(overlayEvent(), input)).toThrow()
    }
    expect(runAgentMock).not.toHaveBeenCalled()

    expect(ask(overlayEvent(), { prompt: '  explain this  ' })).toEqual({
      started: true,
    })
    expect(runAgentMock).toHaveBeenCalledWith(
      'explain this',
      expect.any(Object),
    )
  })

  it('validates approval requests before resolving them', async () => {
    await startHost()
    const approve = handler(BRIDGE_CHANNELS.harnessApprove)

    for (const input of [
      undefined,
      {},
      { id: '', allow: true, remember: false },
      { id: 'approval-1', allow: 'yes', remember: false },
      { id: 'approval-1', allow: true },
    ]) {
      expect(() => approve(overlayEvent(), input)).toThrow()
    }
    expect(resolveApprovalMock).not.toHaveBeenCalled()

    const request = { id: 'approval-1', allow: false, remember: true }
    expect(approve(overlayEvent(), request)).toBeUndefined()
    expect(resolveApprovalMock).toHaveBeenCalledWith(request)
  })

  it('streams agent and model events only to the live overlay', async () => {
    await startHost()
    const foreignWebContents = { send: vi.fn() }

    handler(BRIDGE_CHANNELS.harnessAsk)(overlayEvent(), { prompt: 'hello' })
    const callbacks = runAgentMock.mock.calls[0]?.[1] as
      | HarnessCallbacks
      | undefined
    if (!callbacks) throw new Error('Agent callbacks were not installed')

    callbacks.onDelta('partial')
    callbacks.onTool('bash', 'start', false)
    callbacks.onApproval({ id: 'approval-1' })
    callbacks.onEnd({ status: 'complete' })

    const modelResult = handler(BRIDGE_CHANNELS.harnessEnsureModel)(overlayEvent())
    await expect(modelResult).resolves.toBeUndefined()
    const onProgress = ensureModelMock.mock.calls[0]?.[0] as
      | ((progress: unknown) => void)
      | undefined
    onProgress?.({ completed: 2, total: 10 })

    expect(overlayWebContents.send.mock.calls).toEqual([
      [BRIDGE_CHANNELS.harnessDelta, { text: 'partial' }],
      [
        BRIDGE_CHANNELS.harnessTool,
        { name: 'bash', phase: 'start', isError: false },
      ],
      [BRIDGE_CHANNELS.harnessApproval, { id: 'approval-1' }],
      [BRIDGE_CHANNELS.harnessEnd, { status: 'complete' }],
      [
        BRIDGE_CHANNELS.harnessModelProgress,
        { completed: 2, total: 10 },
      ],
    ])
    expect(foreignWebContents.send).not.toHaveBeenCalled()

    panelState.destroyed = true
    callbacks.onDelta('late')
    expect(overlayWebContents.send).toHaveBeenCalledTimes(5)
  })
})

describe('harness host lifecycle', () => {
  it('creates the panel, binds its hotkey, and tears both down', async () => {
    const host = await startHost()

    expect(configureLlamaHostMock).toHaveBeenCalledWith({
      workerPath: expect.stringMatching(/llama-worker\.js$/) as unknown,
    })
    expect(configureModelMock).toHaveBeenCalledWith({
      directory: '/tmp/maximal-client-test/models',
    })
    expect(configureAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        codingTools: true,
        approval: 'writes',
        cwd: homedir(),
      }),
    )
    expect(createElectronPanelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        preloadPath: expect.stringMatching(/preload\.js$/) as unknown,
        loadRenderer: expect.any(Function) as unknown,
      }),
    )

    const hotkey = globalShortcutRegister.mock.calls[0]?.[1]
    expect(globalShortcutRegister.mock.calls[0]?.[0]).toBe(
      'CommandOrControl+Shift+Space',
    )
    hotkey?.()
    expect(panel.toggle).toHaveBeenCalledTimes(1)

    handler(BRIDGE_CHANNELS.harnessHide)(overlayEvent())
    expect(panel.hide).toHaveBeenCalledTimes(1)

    host.showHarnessHost()
    expect(panel.show).toHaveBeenCalledTimes(1)

    await host.stopHarnessHost()
    expect(globalShortcutUnregister).toHaveBeenCalledWith(
      'CommandOrControl+Shift+Space',
    )
    expect(panel.destroy).toHaveBeenCalledTimes(1)
    expect(shutdownAgentMock).toHaveBeenCalledTimes(1)
    expect(stopEngineMock).toHaveBeenCalledTimes(1)
  })

  it('awaits agent shutdown before stopping the engine and removing IPC', async () => {
    const host = await startHost()
    let releaseShutdown: (() => void) | undefined
    shutdownAgentMock.mockImplementation(
      () => new Promise<void>((resolve) => {
        releaseShutdown = resolve
      }),
    )

    const stopping = host.stopHarnessHost()
    await Promise.resolve()

    expect(globalShortcutUnregister).toHaveBeenCalledTimes(1)
    expect(panel.destroy).toHaveBeenCalledTimes(1)
    expect(shutdownAgentMock).toHaveBeenCalledTimes(1)
    expect(stopEngineMock).not.toHaveBeenCalled()
    expect(ipcMainRemoveHandler).not.toHaveBeenCalled()

    releaseShutdown?.()
    await stopping

    expect(stopEngineMock).toHaveBeenCalledTimes(1)
    expect(ipcMainRemoveHandler).toHaveBeenCalledTimes(invokeChannels.length)
    expect(
      shutdownAgentMock.mock.invocationCallOrder[0],
    ).toBeLessThan(stopEngineMock.mock.invocationCallOrder[0] ?? 0)
  })
})
