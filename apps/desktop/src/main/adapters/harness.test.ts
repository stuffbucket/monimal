import { homedir } from 'node:os'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BRIDGE_CHANNELS } from '../../shared/bridge-channels'

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
  selectAgentModelMock,
  shutdownAgentMock,
  stopEngineMock,
  updateUserPreferencesMock,
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
    ensureModelMock: vi.fn((..._args: unknown[]) =>
      Promise.resolve({ state: 'ready' }),
    ),
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
    selectAgentModelMock: vi.fn((modelKey: string) =>
      Promise.resolve({
        state: 'ready',
        provider: 'embedded',
        model: modelKey.replace('embedded:', ''),
        modelKey,
        models: [],
      }),
    ),
    shutdownAgentMock: vi.fn(() => Promise.resolve()),
    stopEngineMock: vi.fn(),
    updateUserPreferencesMock: vi.fn(() => Promise.resolve()),
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

vi.mock('@maximal/maximal-electron/electron-panel', () => ({
  createElectronPanel: createElectronPanelMock,
}))

vi.mock('@maximal/maximal-harness/host', () => ({
  abortAgent: abortAgentMock,
  configureAgent: configureAgentMock,
  discoverProvider: discoverProviderMock,
  isAgentBusy: isAgentBusyMock,
  resolveApproval: resolveApprovalMock,
  runAgent: runAgentMock,
  selectAgentModel: selectAgentModelMock,
  shutdownAgent: shutdownAgentMock,
}))

vi.mock('@maximal/maximal-llama-cpp/host', () => ({
  DEFAULT_EMBEDDED_MODEL_FILE: 'Qwen3-0.6B-Q8_0.gguf',
  configureLlamaHost: configureLlamaHostMock,
  configureModel: configureModelMock,
  ensureModel: ensureModelMock,
  stopEngine: stopEngineMock,
}))

vi.mock('../preferences/user-preferences.js', () => ({
  updateUserPreferences: updateUserPreferencesMock,
}))

const overlayInvokeChannels = [
  BRIDGE_CHANNELS.harnessHide,
  BRIDGE_CHANNELS.harnessProvider,
  BRIDGE_CHANNELS.harnessSelectModel,
  BRIDGE_CHANNELS.harnessAsk,
  BRIDGE_CHANNELS.harnessAbort,
  BRIDGE_CHANNELS.harnessApprove,
  BRIDGE_CHANNELS.harnessEnsureModel,
]
const invokeChannels = [
  BRIDGE_CHANNELS.harnessShow,
  ...overlayInvokeChannels,
]

async function startHost() {
  vi.resetModules()
  const host = await import('./harness.js')
  host.startHarnessHost({ modelDirectory: '/resolved/local/models' })
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
  ensureModelMock.mockResolvedValue({ state: 'ready' })
  selectAgentModelMock.mockImplementation((modelKey: string) => {
    const [provider, ...modelParts] = modelKey.split(':')
    return Promise.resolve({
      state: 'ready',
      provider,
      model: modelParts.join(':'),
      modelKey,
      models: [],
    })
  })
  shutdownAgentMock.mockResolvedValue(undefined)
  updateUserPreferencesMock.mockResolvedValue(undefined)
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

    for (const channel of overlayInvokeChannels) {
      await expect(
        Promise.resolve().then(() =>
          handler(channel)(foreignEvent, inputs.get(channel)),
        ),
      ).rejects.toThrow(
        'Harness requests are accepted only from the overlay window.',
      )
    }

    expect(panel.hide).not.toHaveBeenCalled()
    expect(discoverProviderMock).not.toHaveBeenCalled()
    expect(runAgentMock).not.toHaveBeenCalled()
    expect(abortAgentMock).not.toHaveBeenCalled()
    expect(resolveApprovalMock).not.toHaveBeenCalled()
    expect(ensureModelMock).not.toHaveBeenCalled()
    expect(selectAgentModelMock).not.toHaveBeenCalled()
  })

  it('shows the overlay when the application renderer requests it', async () => {
    await startHost()

    handler(BRIDGE_CHANNELS.harnessShow)({ sender: { send: vi.fn() } })

    expect(panel.show).toHaveBeenCalledOnce()
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

  it('validates, selects, and persists an available model', async () => {
    await startHost()
    const selectModel = handler(BRIDGE_CHANNELS.harnessSelectModel)

    for (const input of [undefined, null, '', '  ', 42]) {
      await expect(
        Promise.resolve(selectModel(overlayEvent(), input)),
      ).rejects.toThrow()
    }
    expect(selectAgentModelMock).not.toHaveBeenCalled()

    const result = selectModel(overlayEvent(), '  ollama:qwen3:4b  ')
    await expect(result).resolves.toMatchObject({
      state: 'ready',
      modelKey: 'ollama:qwen3:4b',
    })
    expect(selectAgentModelMock).toHaveBeenCalledWith('ollama:qwen3:4b')
    expect(updateUserPreferencesMock).toHaveBeenCalledWith({
      agentModel: 'ollama:qwen3:4b',
    })
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
    await expect(modelResult).resolves.toEqual({ state: 'ready' })
    const onProgress = ensureModelMock.mock.calls[0]?.[0] as
      | ((progress: unknown) => void)
      | undefined
    onProgress?.({ state: 'downloading', received: 2, total: 10 })
    expect(selectAgentModelMock).toHaveBeenCalledWith(
      'embedded:Qwen3-0.6B-Q8_0.gguf',
    )
    expect(updateUserPreferencesMock).toHaveBeenCalledWith({
      agentModel: 'embedded:Qwen3-0.6B-Q8_0.gguf',
    })

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
        { state: 'downloading', received: 2, total: 10 },
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

    expect(host.assistantPanelBounds({
      x: 1280,
      y: 0,
      width: 1280,
      height: 720,
    })).toEqual({
      x: 1560,
      y: 48,
      width: 720,
      height: 624,
    })
    expect(configureLlamaHostMock).toHaveBeenCalledWith({
      workerPath: expect.stringMatching(/llama-worker\.js$/) as unknown,
    })
    expect(configureModelMock).toHaveBeenCalledWith({
      directory: '/resolved/local/models',
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
        bounds: host.assistantPanelBounds,
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
