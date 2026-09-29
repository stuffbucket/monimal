import { homedir } from 'node:os'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BRIDGE_CHANNELS } from '../../shared/bridge-channels'

interface HarnessCallbacks {
  onDelta(text: string): void
  onTool(id: string, name: string, phase: string, isError: boolean): void
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
  handlers,
  ipcMainHandle,
  ipcMainRemoveHandler,
  isAgentBusyMock,
  keyHookListeners,
  keyHookStart,
  keyHookStop,
  readUserPreferencesMock,
  overlayWebContents,
  panel,
  panelState,
  resolveApprovalMock,
  runAgentMock,
  screenGetDisplayMatching,
  selectAgentModelMock,
  selectAgentEffortMock,
  setAgentEffortPreferenceMock,
  shutdownAgentMock,
  stopEngineMock,
  updateUserPreferencesMock,
} = vi.hoisted(() => {
  const handlers = new Map<string, InvokeHandler>()
  const keyHookListeners = new Map<string, (event: unknown) => void>()
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
    createElectronPanelMock: vi.fn((_options: unknown) => panel),
    discoverProviderMock: vi.fn(() => ({ id: 'local-provider' })),
    ensureModelMock: vi.fn((..._args: unknown[]) =>
      Promise.resolve({ state: 'ready' }),
    ),
    handlers,
    ipcMainHandle: vi.fn((channel: string, handler: InvokeHandler) => {
      handlers.set(channel, handler)
    }),
    ipcMainRemoveHandler: vi.fn((channel: string) => {
      handlers.delete(channel)
    }),
    isAgentBusyMock: vi.fn(() => false),
    keyHookListeners,
    keyHookStart: vi.fn(),
    keyHookStop: vi.fn(),
    readUserPreferencesMock: vi.fn(() => Promise.resolve({})),
    overlayWebContents,
    panel,
    panelState,
    resolveApprovalMock: vi.fn(),
    runAgentMock: vi.fn((..._args: unknown[]) => Promise.resolve()),
    screenGetDisplayMatching: vi.fn((bounds: unknown) => ({ workArea: bounds })),
    selectAgentModelMock: vi.fn((modelKey: string) =>
      Promise.resolve({
        state: 'ready',
        provider: 'embedded',
        model: modelKey.replace('embedded:', ''),
        modelKey,
        models: [],
      }),
    ),
    selectAgentEffortMock: vi.fn((effort: string) =>
      Promise.resolve({
        state: 'ready',
        provider: 'maximal',
        model: 'claude',
        modelKey: 'maximal:claude',
        models: [],
        effort,
      }),
    ),
    setAgentEffortPreferenceMock: vi.fn(),
    shutdownAgentMock: vi.fn(() => Promise.resolve()),
    stopEngineMock: vi.fn(),
    updateUserPreferencesMock: vi.fn(() => Promise.resolve()),
  }
})

vi.mock('electron', () => ({
  app: { getPath: appGetPath },
  ipcMain: {
    handle: ipcMainHandle,
    removeHandler: ipcMainRemoveHandler,
  },
  screen: {
    getDisplayMatching: screenGetDisplayMatching,
  },
}))

vi.mock('uiohook-napi', () => ({
  UiohookKey: { Ctrl: 29, CtrlRight: 3613 },
  uIOhook: {
    on: vi.fn((event: string, listener: (value: unknown) => void) => {
      keyHookListeners.set(event, listener)
    }),
    off: vi.fn((event: string) => {
      keyHookListeners.delete(event)
    }),
    start: keyHookStart,
    stop: keyHookStop,
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
  selectAgentEffort: selectAgentEffortMock,
  selectAgentModel: selectAgentModelMock,
  setAgentEffortPreference: setAgentEffortPreferenceMock,
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
  readUserPreferences: readUserPreferencesMock,
  updateUserPreferences: updateUserPreferencesMock,
}))

const overlayInvokeChannels = [
  BRIDGE_CHANNELS.harnessHide,
  BRIDGE_CHANNELS.harnessProvider,
  BRIDGE_CHANNELS.harnessSelectModel,
  BRIDGE_CHANNELS.harnessSelectEffort,
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
  await host.startHarnessHost({ modelDirectory: '/resolved/local/models' })
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
  keyHookListeners.clear()
  vi.clearAllMocks()
  panelState.destroyed = false
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
  readUserPreferencesMock.mockResolvedValue({})
  screenGetDisplayMatching.mockImplementation((bounds: unknown) => ({
    workArea: bounds,
  }))
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

  it('validates, selects, and persists model effort', async () => {
    await startHost()
    const selectEffort = handler(BRIDGE_CHANNELS.harnessSelectEffort)

    for (const input of [undefined, null, '', 'max', 42]) {
      await expect(
        Promise.resolve(selectEffort(overlayEvent(), input)),
      ).rejects.toThrow()
    }
    expect(selectAgentEffortMock).not.toHaveBeenCalled()

    await expect(
      selectEffort(overlayEvent(), 'high'),
    ).resolves.toMatchObject({ state: 'ready', effort: 'high' })
    expect(selectAgentEffortMock).toHaveBeenCalledWith('high')
    expect(updateUserPreferencesMock).toHaveBeenCalledWith({
      agentEffort: 'high',
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
    callbacks.onTool('tool-1', 'bash', 'start', false)
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
        { id: 'tool-1', name: 'bash', phase: 'start', isError: false },
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
  it('honors a menu-bar summon that arrives during startup', async () => {
    vi.resetModules()
    const host = await import('./harness.js')

    host.toggleHarnessHost()
    await host.startHarnessHost({ modelDirectory: '/resolved/local/models' })

    expect(panel.show).toHaveBeenCalledOnce()
  })

  it('restores and persists a work-area-relative dragged anchor', async () => {
    const savedWorkArea = { x: 1280, y: 24, width: 1280, height: 696 }
    readUserPreferencesMock.mockResolvedValue({
      overlayAnchor: {
        displayWorkArea: savedWorkArea,
        offsetX: 160,
        offsetY: 80,
        panelWidth: 640,
        panelHeight: 480,
      },
    })
    screenGetDisplayMatching.mockReturnValue({ workArea: savedWorkArea })
    await startHost()
    await Promise.resolve()

    const panelOptions = createElectronPanelMock.mock.calls[0]?.[0] as {
      bounds: (display: typeof savedWorkArea) => typeof savedWorkArea
      onMoved: (bounds: typeof savedWorkArea) => void
    }
    expect(panelOptions.bounds({ x: 0, y: 0, width: 1024, height: 768 }))
      .toEqual({ x: 1440, y: 104, width: 640, height: 480 })

    panelOptions.onMoved({ x: 1500, y: 140, width: 640, height: 480 })
    expect(updateUserPreferencesMock).toHaveBeenCalledWith({
      overlayAnchor: {
        displayWorkArea: savedWorkArea,
        offsetX: 220,
        offsetY: 116,
        panelWidth: 640,
        panelHeight: 480,
      },
    })
  })

  it('restores a valid saved effort without replacing other agent options', async () => {
    readUserPreferencesMock.mockResolvedValue({ agentEffort: 'medium' })

    await startHost()
    await Promise.resolve()

    expect(setAgentEffortPreferenceMock).toHaveBeenCalledWith('medium')
    expect(configureAgentMock).toHaveBeenCalledTimes(1)
  })

  it('creates the panel, binds quick access, and tears both down', async () => {
    const host = await startHost()

    expect(host.assistantPanelBounds({
      x: 1280,
      y: 0,
      width: 1280,
      height: 720,
    })).toEqual({
      x: 1600,
      y: 120,
      width: 640,
      height: 480,
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
        cwd: homedir(),
      }),
    )
    expect(createElectronPanelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        preloadPath: expect.stringMatching(/preload\.js$/) as unknown,
        loadRenderer: expect.any(Function) as unknown,
        bounds: expect.any(Function) as unknown,
        movable: true,
        onMoved: expect.any(Function) as unknown,
      }),
    )

    const control = {
      type: 4,
      time: 0,
      altKey: false,
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      keycode: 29,
    }
    keyHookListeners.get('keydown')?.(control)
    keyHookListeners.get('keyup')?.(control)
    keyHookListeners.get('keydown')?.(control)
    keyHookListeners.get('keyup')?.(control)
    expect(panel.toggle).toHaveBeenCalledTimes(1)
    expect(keyHookStart).toHaveBeenCalledOnce()

    handler(BRIDGE_CHANNELS.harnessHide)(overlayEvent())
    expect(panel.hide).toHaveBeenCalledTimes(1)

    host.showHarnessHost()
    expect(panel.show).toHaveBeenCalledTimes(1)

    host.toggleHarnessHost()
    expect(panel.toggle).toHaveBeenCalledTimes(2)

    await host.stopHarnessHost()
    expect(keyHookStop).toHaveBeenCalledOnce()
    expect(panel.destroy).toHaveBeenCalledTimes(1)
    expect(shutdownAgentMock).toHaveBeenCalledTimes(1)
    expect(stopEngineMock).toHaveBeenCalledTimes(1)
  })

  it('can disable the global keyboard hook for automated hosts', async () => {
    process.env['MAXIMAL_DISABLE_GLOBAL_KEYBOARD_HOOK'] = '1'
    try {
      const host = await startHost()

      expect(keyHookStart).not.toHaveBeenCalled()
      await host.stopHarnessHost()
      expect(keyHookStop).not.toHaveBeenCalled()
    } finally {
      delete process.env['MAXIMAL_DISABLE_GLOBAL_KEYBOARD_HOOK']
    }
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

    expect(keyHookStop).toHaveBeenCalledTimes(1)
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
