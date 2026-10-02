import {
  TrafficOverviewQuerySchema,
  TrafficRequestListQuerySchema,
} from '@maximal/maximal-observability-contract'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { BRIDGE_CHANNELS } from '../shared/bridge-channels'
import type { MaximalHost } from '@maximal/maximal-client/shared/host'

const { exposeInMainWorld, invoke, on, off } = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(() => Promise.resolve(undefined)),
  on: vi.fn(),
  off: vi.fn(),
}))

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke, on, off },
}))

let bridge: MaximalHost

beforeAll(async () => {
  await import('./index.js')
  expect(exposeInMainWorld).toHaveBeenCalledTimes(1)
  bridge = exposeInMainWorld.mock.calls[0]?.[1] as MaximalHost
})

beforeEach(() => {
  invoke.mockClear()
  on.mockClear()
  off.mockClear()
})

describe('preload bridge allowlist', () => {
  it('exposes exactly the documented deep key set', () => {
    expect(Object.keys(bridge).sort()).toEqual([
      'appearance',
      'browser',
      'clientInstallations',
      'control',
      'generalSettings',
      'getCoreStatus',
      'getProxyUrl',
      'harness',
      'licenses',
      'localModels',
      'logs',
      'material',
      'menuBarMode',
      'ollamaRuntime',
      'onCoreStatus',
      'onOpenLicenses',
      'onOpenSettings',
      'openExternal',
      'pendingSettingsRequest',
      'projects',
      'providerOnboarding',
      'recordings',
      'shutdown',
      'systemNotifications',
      'terminal',
      'terminalTypography',
      'workbar',
    ])
    expect(Object.keys(bridge.appearance).sort()).toEqual([
      'get',
      'onChange',
      'setBackgroundEffectsEnabled',
      'setReducedMotionEnabled',
      'setVibrancyEnabled',
    ])
    expect(Object.keys(bridge.material).sort()).toEqual([
      'get',
      'onChange',
      'set',
    ])
    expect(Object.keys(bridge.licenses).sort()).toEqual(['text'])
    expect(Object.keys(bridge.browser).sort()).toEqual([
      'click',
      'close',
      'command',
      'drag',
      'hover',
      'inspect',
      'list',
      'navigate',
      'onEvent',
      'open',
      'press',
      'screenshot',
      'scroll',
      'setControl',
      'setTerminalContext',
      'show',
      'type',
      'wait',
    ])
    expect(Object.keys(bridge.control).sort()).toEqual([
      'accountsList',
      'accountsReorder',
      'accountsSetEnabled',
      'accountsSwitch',
      'apiKeysCreate',
      'apiKeysList',
      'apiKeysRemove',
      'apiKeysSetEnforcement',
      'apiKeysUpdate',
      'appsList',
      'appsSetEnabled',
      'authCancel',
      'authSignOut',
      'authStart',
      'authStatus',
      'connectionsAct',
      'connectionsList',
      'connectionsRevealCredential',
      'copilotUsageGet',
      'diagnosticsGet',
      'modelsList',
      'modelsRefresh',
      'observabilityOverview',
      'observabilityRequest',
      'observabilityRequests',
      'ollamaAccountsList',
      'ollamaApiKeyTest',
      'ollamaSettingsGet',
      'ollamaSettingsUpdate',
      'onChange',
      'onTrafficInvalidation',
      'searchProviderValidate',
      'searchSettingsGet',
      'searchSettingsUpdate',
      'systemOneSettingsGet',
      'systemOneSettingsUpdate',
      'usageGet',
    ])
    expect(Object.keys(bridge.logs).sort()).toEqual(['coreLocation', 'list', 'location', 'reveal', 'revealCore'])
    expect(Object.keys(bridge.recordings).sort()).toEqual(['revealFolder'])
    expect(Object.keys(bridge.localModels).sort()).toEqual([
      'cancel',
      'ensure',
      'list',
      'onChange',
      'openFolder',
    ])
    expect(Object.keys(bridge.ollamaRuntime).sort()).toEqual([
      'launch',
      'preferences',
      'status',
      'updateContextLength',
      'updatePreferences',
    ])
    expect(Object.keys(bridge.harness).sort()).toEqual([
      'abort',
      'approve',
      'ask',
      'ensureModel',
      'hide',
      'onApproval',
      'onDelta',
      'onEnd',
      'onModelProgress',
      'onTool',
      'provider',
      'selectEffort',
      'selectModel',
      'show',
    ])
    expect(Object.keys(bridge.menuBarMode).sort()).toEqual([
      'beginEnable',
      'cancelEnable',
      'confirmEnable',
      'disable',
      'get',
    ])
    expect(Object.keys(bridge.systemNotifications).sort()).toEqual([
      'openSettings',
      'status',
    ])
    expect(Object.keys(bridge.generalSettings).sort()).toEqual([
      'get',
      'setStartOnLogin',
    ])
    expect(Object.keys(bridge.providerOnboarding).sort()).toEqual([
      'get',
      'setDismissed',
    ])
    expect(Object.keys(bridge.projects).sort()).toEqual([
      'addRoot',
      'onChange',
      'opened',
      'refresh',
      'removeRoot',
      'search',
      'snapshot',
      'updateRoot',
    ])
    expect(Object.keys(bridge.terminalTypography).sort()).toEqual([
      'fonts',
      'get',
      'installFont',
      'onChange',
      'openPreview',
      'update',
    ])
    expect(Object.keys(bridge.workbar).sort()).toEqual([
      'get',
      'onChange',
      'update',
    ])
    expect(Object.keys(bridge.terminal).sort()).toEqual([
      'acknowledge',
      'copy',
      'discover',
      'frameId',
      'launch',
      'list',
      'onData',
      'onExit',
      'onPaneChanged',
      'onTabRedocked',
      'profiles',
      'redock',
      'resize',
      'spawn',
      'syncPane',
      'terminate',
      'undock',
      'write',
    ])
    expect(bridge).not.toHaveProperty('getCoreOrigin')
  })

  it('delegates every invoke method to its one named channel', async () => {
    const overviewQuery = TrafficOverviewQuerySchema.parse({})
    const requestsQuery = TrafficRequestListQuerySchema.parse({})

    await bridge.getCoreStatus()
    await bridge.getProxyUrl()
    await bridge.licenses.text()
    await bridge.openExternal('https://github.com/login/device')
    await bridge.control.authStatus()
    await bridge.control.authStart()
    await bridge.control.authCancel()
    await bridge.control.authSignOut()
    await bridge.control.accountsList()
    await bridge.control.accountsSwitch('github.com:octocat')
    await bridge.control.accountsSetEnabled('github.com:octocat', false)
    await bridge.control.copilotUsageGet()
    await bridge.control.ollamaAccountsList()
    await bridge.control.ollamaSettingsGet()
    await bridge.control.ollamaSettingsUpdate({
      prefer_local_models: false,
    })
    await bridge.control.ollamaApiKeyTest({ api_key: 'test-key' })
    await bridge.control.observabilityOverview(overviewQuery)
    await bridge.control.observabilityRequests(requestsQuery)
    await bridge.control.observabilityRequest({ requestId: 'req-1' })
    await bridge.control.connectionsList()
    await bridge.control.connectionsAct('claude-code', 'connect')
    await bridge.control.connectionsRevealCredential('key-1')
    await bridge.control.appsList()
    await bridge.control.appsSetEnabled('claude-code', true)
    await bridge.control.apiKeysList()
    await bridge.control.apiKeysCreate({ label: 'Claude Code' })
    await bridge.control.apiKeysUpdate('key-1', { enabled: false })
    await bridge.control.apiKeysRemove('key-1')
    await bridge.control.apiKeysSetEnforcement(true)
    await bridge.control.modelsList()
    await bridge.control.modelsRefresh()
    await bridge.localModels.list()
    await bridge.localModels.ensure('qwen')
    await bridge.localModels.cancel('operation-1')
    await bridge.control.usageGet('week')
    await bridge.control.diagnosticsGet()
    await bridge.control.searchSettingsGet()
    await bridge.control.searchSettingsUpdate({ settings: { fallback: false } })
    await bridge.control.systemOneSettingsGet()
    await bridge.control.systemOneSettingsUpdate({
      local_provider: 'maximal',
      model_order: ['nimble', 'tev1', 'tev1:0.8b'],
      fallback_to_local: true,
    })
    await bridge.control.searchProviderValidate({
      providerId: 'ollama',
      settings: { apiKey: 'test-key' },
    })
    await bridge.pendingSettingsRequest()
    await bridge.logs.location()
    await bridge.logs.list()
    await bridge.logs.reveal()
    await bridge.logs.coreLocation()
    await bridge.logs.revealCore()
    await bridge.recordings.revealFolder()
    await bridge.localModels.openFolder()
    await bridge.ollamaRuntime.status('http://ollama.lan:11500')
    await bridge.ollamaRuntime.launch('http://ollama.lan:11500')
    await bridge.ollamaRuntime.updateContextLength(8192)
    await bridge.ollamaRuntime.preferences()
    await bridge.ollamaRuntime.updatePreferences({
      start_on_maximal_launch: true,
    })
    await bridge.clientInstallations.list()
    await bridge.menuBarMode.get()
    await bridge.menuBarMode.beginEnable()
    await bridge.menuBarMode.confirmEnable('attempt-1')
    await bridge.menuBarMode.cancelEnable('attempt-1')
    await bridge.menuBarMode.disable()
    await bridge.systemNotifications.status()
    await bridge.systemNotifications.openSettings()
    await bridge.generalSettings.get()
    await bridge.generalSettings.setStartOnLogin(true)
    await bridge.providerOnboarding.get()
    await bridge.providerOnboarding.setDismissed(true)
    await bridge.appearance.get()
    await bridge.appearance.setVibrancyEnabled(true)
    await bridge.appearance.setBackgroundEffectsEnabled(true)
    await bridge.appearance.setReducedMotionEnabled(true)
    await bridge.material.get()
    await bridge.material.set({
      preset: 'water',
      quality: 'high',
      strength: 1,
      motion: 0.25,
      lighting: 'timezone',
      timezone: 'UTC',
    })
    await bridge.terminalTypography.get()
    await bridge.terminalTypography.update({
      fontFamily: 'ui-monospace',
      fontSize: 13,
      fontWeight: 400,
      fontVariations: {},
      cellHeight: 0,
      tracking: 0,
      baseline: 0,
      thicken: false,
      thickenStrength: 50,
      ligatures: true,
    })
    await bridge.terminalTypography.fonts()
    await bridge.terminalTypography.installFont('intel-one-mono')
    await bridge.terminalTypography.openPreview()
    await bridge.workbar.get()
    await bridge.workbar.update({
      order: ['home', 'projects', 'overview', 'traffic', 'terminals', 'browsers'],
      visible: ['home', 'projects'],
    })
    await bridge.harness.show()
    await bridge.harness.hide()
    await bridge.harness.provider()
    await bridge.harness.selectModel('ollama:qwen3:4b')
    await bridge.harness.selectEffort('high')
    await bridge.harness.ask('Explain this file')
    await bridge.harness.abort()
    await bridge.harness.approve({ id: 'approval-1', allow: true, remember: false })
    await bridge.harness.ensureModel()
    await bridge.terminal.spawn({ id: 'terminal-1', cols: 80, rows: 24 })
    await bridge.terminal.write('terminal-1', 'pwd\r')
    await bridge.terminal.resize('terminal-1', 120, 40)
    await bridge.terminal.acknowledge('terminal-1', 4)
    await bridge.terminal.terminate('terminal-1')
    await bridge.terminal.list()
    await bridge.terminal.profiles()
    await bridge.terminal.discover()
    await bridge.terminal.launch({ profileId: 'local', cols: 80, rows: 24 })
    await bridge.terminal.frameId()
    const terminalWindow = {
      id: 'terminal-1',
      cols: 80,
      rows: 24,
      x: 100,
      y: 100,
      title: 'Terminal',
      canRunInBackground: true,
    }
    await bridge.terminal.undock(terminalWindow)
    await bridge.terminal.copy(terminalWindow)
    await bridge.terminal.redock({
      ...terminalWindow,
      sourceFrameId: '2',
      targetFrameId: '1',
    })
    await bridge.terminal.syncPane('terminal-1', { sessionId: 'terminal-1' })
    await bridge.shutdown.current()
    await bridge.shutdown.force()

    expect(invoke.mock.calls).toEqual([
      [BRIDGE_CHANNELS.lifecycleCurrent],
      [BRIDGE_CHANNELS.proxyUrl],
      [BRIDGE_CHANNELS.licensesText],
      [BRIDGE_CHANNELS.openExternal, 'https://github.com/login/device'],
      [BRIDGE_CHANNELS.authStatus],
      [BRIDGE_CHANNELS.authStart],
      [BRIDGE_CHANNELS.authCancel],
      [BRIDGE_CHANNELS.authSignOut],
      [BRIDGE_CHANNELS.accountsList],
      [BRIDGE_CHANNELS.accountsSwitch, 'github.com:octocat'],
      [BRIDGE_CHANNELS.accountsSetEnabled, 'github.com:octocat', false],
      [BRIDGE_CHANNELS.copilotUsageGet],
      [BRIDGE_CHANNELS.ollamaAccountsList],
      [BRIDGE_CHANNELS.ollamaSettingsGet],
      [
        BRIDGE_CHANNELS.ollamaSettingsUpdate,
        { prefer_local_models: false },
      ],
      [BRIDGE_CHANNELS.ollamaApiKeyTest, { api_key: 'test-key' }],
      [BRIDGE_CHANNELS.observabilityOverview, overviewQuery],
      [BRIDGE_CHANNELS.observabilityRequests, requestsQuery],
      [BRIDGE_CHANNELS.observabilityRequest, { requestId: 'req-1' }],
      [BRIDGE_CHANNELS.connectionsList],
      [BRIDGE_CHANNELS.connectionsAct, 'claude-code', 'connect'],
      [BRIDGE_CHANNELS.connectionsRevealCredential, 'key-1'],
      [BRIDGE_CHANNELS.appsList],
      [BRIDGE_CHANNELS.appsSetEnabled, 'claude-code', true],
      [BRIDGE_CHANNELS.apiKeysList],
      [BRIDGE_CHANNELS.apiKeysCreate, { label: 'Claude Code' }],
      [BRIDGE_CHANNELS.apiKeysUpdate, 'key-1', { enabled: false }],
      [BRIDGE_CHANNELS.apiKeysRemove, 'key-1'],
      [BRIDGE_CHANNELS.apiKeysSetEnforcement, true],
      [BRIDGE_CHANNELS.modelsList],
      [BRIDGE_CHANNELS.modelsRefresh],
      [BRIDGE_CHANNELS.localModelsList],
      [BRIDGE_CHANNELS.localModelsEnsure, 'qwen'],
      [BRIDGE_CHANNELS.localModelsCancel, 'operation-1'],
      [BRIDGE_CHANNELS.usageGet, 'week'],
      [BRIDGE_CHANNELS.diagnosticsGet],
      [BRIDGE_CHANNELS.searchSettingsGet],
      [BRIDGE_CHANNELS.searchSettingsUpdate, { settings: { fallback: false } }],
      [BRIDGE_CHANNELS.systemOneSettingsGet],
      [
        BRIDGE_CHANNELS.systemOneSettingsUpdate,
        {
          local_provider: 'maximal',
          model_order: ['nimble', 'tev1', 'tev1:0.8b'],
          fallback_to_local: true,
        },
      ],
      [
        BRIDGE_CHANNELS.searchProviderValidate,
        { providerId: 'ollama', settings: { apiKey: 'test-key' } },
      ],
      [BRIDGE_CHANNELS.pendingSettingsRequest],
      [BRIDGE_CHANNELS.logsLocation],
      [BRIDGE_CHANNELS.logsList],
      [BRIDGE_CHANNELS.logsReveal],
      [BRIDGE_CHANNELS.coreLogsLocation],
      [BRIDGE_CHANNELS.coreLogsReveal],
      [BRIDGE_CHANNELS.recordingsRevealFolder],
      [BRIDGE_CHANNELS.localModelsOpenFolder],
      [BRIDGE_CHANNELS.ollamaRuntimeStatus, 'http://ollama.lan:11500'],
      [BRIDGE_CHANNELS.ollamaRuntimeLaunch, 'http://ollama.lan:11500'],
      [BRIDGE_CHANNELS.ollamaRuntimeUpdateContext, 8192],
      [BRIDGE_CHANNELS.ollamaRuntimePreferences],
      [
        BRIDGE_CHANNELS.ollamaRuntimeUpdatePreferences,
        { start_on_maximal_launch: true },
      ],
      [BRIDGE_CHANNELS.clientInstallationsList],
      [BRIDGE_CHANNELS.menuBarModeGet],
      [BRIDGE_CHANNELS.menuBarModeBeginEnable],
      [BRIDGE_CHANNELS.menuBarModeConfirmEnable, 'attempt-1'],
      [BRIDGE_CHANNELS.menuBarModeCancelEnable, 'attempt-1'],
      [BRIDGE_CHANNELS.menuBarModeDisable],
      [BRIDGE_CHANNELS.systemNotificationsStatus],
      [BRIDGE_CHANNELS.systemNotificationsOpenSettings],
      [BRIDGE_CHANNELS.generalSettingsGet],
      [BRIDGE_CHANNELS.generalSettingsSetStartOnLogin, true],
      [BRIDGE_CHANNELS.providerOnboardingGet],
      [BRIDGE_CHANNELS.providerOnboardingSet, true],
      [BRIDGE_CHANNELS.appearanceGet],
      [BRIDGE_CHANNELS.appearanceSetVibrancy, true],
      [BRIDGE_CHANNELS.appearanceSetBackgroundEffects, true],
      [BRIDGE_CHANNELS.appearanceSetReducedMotion, true],
      [BRIDGE_CHANNELS.materialGet],
      [
        BRIDGE_CHANNELS.materialSet,
        {
          preset: 'water',
          quality: 'high',
          strength: 1,
          motion: 0.25,
          lighting: 'timezone',
          timezone: 'UTC',
        },
      ],
      [BRIDGE_CHANNELS.terminalTypographyGet],
      [
        BRIDGE_CHANNELS.terminalTypographyUpdate,
        {
          fontFamily: 'ui-monospace',
          fontSize: 13,
          fontWeight: 400,
          fontVariations: {},
          cellHeight: 0,
          tracking: 0,
          baseline: 0,
          thicken: false,
          thickenStrength: 50,
          ligatures: true,
        },
      ],
      [BRIDGE_CHANNELS.terminalTypographyFonts],
      [BRIDGE_CHANNELS.terminalTypographyInstallFont, 'intel-one-mono'],
      [BRIDGE_CHANNELS.terminalTypographyOpenPreview],
      [BRIDGE_CHANNELS.workbarGet],
      [BRIDGE_CHANNELS.workbarUpdate, {
        order: ['home', 'projects', 'overview', 'traffic', 'terminals', 'browsers'],
        visible: ['home', 'projects'],
      }],
      [BRIDGE_CHANNELS.harnessShow],
      [BRIDGE_CHANNELS.harnessHide],
      [BRIDGE_CHANNELS.harnessProvider],
      [BRIDGE_CHANNELS.harnessSelectModel, 'ollama:qwen3:4b'],
      [BRIDGE_CHANNELS.harnessSelectEffort, 'high'],
      [BRIDGE_CHANNELS.harnessAsk, { prompt: 'Explain this file' }],
      [BRIDGE_CHANNELS.harnessAbort],
      [BRIDGE_CHANNELS.harnessApprove, { id: 'approval-1', allow: true, remember: false }],
      [BRIDGE_CHANNELS.harnessEnsureModel],
      [BRIDGE_CHANNELS.terminalSpawn, { id: 'terminal-1', cols: 80, rows: 24 }],
      [BRIDGE_CHANNELS.terminalWrite, { id: 'terminal-1', data: 'pwd\r' }],
      [BRIDGE_CHANNELS.terminalResize, { id: 'terminal-1', cols: 120, rows: 40 }],
      [BRIDGE_CHANNELS.terminalAck, { id: 'terminal-1', sequence: 4 }],
      [BRIDGE_CHANNELS.terminalTerminate, { id: 'terminal-1' }],
      [BRIDGE_CHANNELS.terminalList],
      [BRIDGE_CHANNELS.terminalProfiles],
      [BRIDGE_CHANNELS.terminalDiscover],
      [BRIDGE_CHANNELS.terminalLaunch, { profileId: 'local', cols: 80, rows: 24 }],
      [BRIDGE_CHANNELS.terminalFrameId],
      [BRIDGE_CHANNELS.terminalUndock, terminalWindow],
      [BRIDGE_CHANNELS.terminalCopy, terminalWindow],
      [
        BRIDGE_CHANNELS.terminalRedock,
        { ...terminalWindow, sourceFrameId: '2', targetFrameId: '1' },
      ],
      [
        BRIDGE_CHANNELS.terminalPaneSync,
        { id: 'terminal-1', pane: { sessionId: 'terminal-1' } },
      ],
      [BRIDGE_CHANNELS.shutdownCurrent],
      [BRIDGE_CHANNELS.shutdownForce],
    ])
  })

  it('wraps terminal events and removes only their listeners', () => {
    const onData = vi.fn()
    const onExit = vi.fn()
    const unsubscribeData = bridge.terminal.onData(onData)
    const unsubscribeExit = bridge.terminal.onExit(onExit)
    const dataHandler = on.mock.calls[0]?.[1] as (event: unknown, payload: unknown) => void
    const exitHandler = on.mock.calls[1]?.[1] as (event: unknown, payload: unknown) => void
    const data = { id: 'terminal-1', data: 'ready', sequence: 1 }
    const exit = { id: 'terminal-1', exitCode: 0 }

    dataHandler({}, data)
    exitHandler({}, exit)
    expect(onData).toHaveBeenCalledWith(data)
    expect(onExit).toHaveBeenCalledWith(exit)

    unsubscribeData()
    unsubscribeExit()
    expect(off).toHaveBeenCalledWith(BRIDGE_CHANNELS.terminalData, dataHandler)
    expect(off).toHaveBeenCalledWith(BRIDGE_CHANNELS.terminalExit, exitHandler)
  })

  it('wraps lifecycle payloads and removes only its own listener', () => {
    const listener = vi.fn()
    const unsubscribe = bridge.onCoreStatus(listener)
    const handler = on.mock.calls[0]?.[1] as (
      event: unknown,
      status: { phase: 'starting' },
    ) => void

    handler({ raw: 'electron-event' }, { phase: 'starting' })
    expect(listener).toHaveBeenCalledWith({ phase: 'starting' })

    unsubscribe()
    expect(on).toHaveBeenCalledWith(
      BRIDGE_CHANNELS.lifecycleChanged,
      handler,
    )
    expect(off).toHaveBeenCalledWith(
      BRIDGE_CHANNELS.lifecycleChanged,
      handler,
    )
    expect(invoke).not.toHaveBeenCalled()
  })

  it('wraps appearance changes and removes only its own listener', () => {
    const listener = vi.fn()
    const unsubscribe = bridge.appearance.onChange(listener)
    const handler = on.mock.calls[0]?.[1] as (
      event: unknown,
      preference: {
        vibrancyEnabled: boolean
        vibrancySupported: boolean
        backgroundEffectsEnabled: boolean
        reducedMotionEnabled: boolean
      },
    ) => void
    const preference = {
      vibrancyEnabled: true,
      vibrancySupported: true,
      backgroundEffectsEnabled: true,
      reducedMotionEnabled: true,
    }

    handler({ raw: 'electron-event' }, preference)
    expect(listener).toHaveBeenCalledWith(preference)

    unsubscribe()
    expect(on).toHaveBeenCalledWith(BRIDGE_CHANNELS.appearanceChanged, handler)
    expect(off).toHaveBeenCalledWith(BRIDGE_CHANNELS.appearanceChanged, handler)
  })

  it('wraps material changes and removes only its own listener', () => {
    const listener = vi.fn()
    const unsubscribe = bridge.material.onChange(listener)
    const handler = on.mock.calls[0]?.[1] as (
      event: unknown,
      preference: unknown,
    ) => void
    const preference = {
      preset: 'water',
      quality: 'high',
      strength: 1,
      motion: 0.25,
      lighting: 'timezone',
      timezone: 'UTC',
    }

    handler({ raw: 'electron-event' }, preference)
    expect(listener).toHaveBeenCalledWith(preference)

    unsubscribe()
    expect(on).toHaveBeenCalledWith(BRIDGE_CHANNELS.materialChanged, handler)
    expect(off).toHaveBeenCalledWith(BRIDGE_CHANNELS.materialChanged, handler)
  })

  it('wraps local model events and removes only its own listener', () => {
    const listener = vi.fn()
    const unsubscribe = bridge.localModels.onChange(listener)
    const handler = on.mock.calls[0]?.[1] as (
      event: unknown,
      payload: unknown,
    ) => void
    const update = { type: 'catalog', snapshot: { models: [], revision: 1 } }

    handler({ raw: 'electron-event' }, update)
    expect(listener).toHaveBeenCalledWith(update)

    unsubscribe()
    expect(on).toHaveBeenCalledWith(
      BRIDGE_CHANNELS.localModelsChanged,
      handler,
    )
    expect(off).toHaveBeenCalledWith(
      BRIDGE_CHANNELS.localModelsChanged,
      handler,
    )
  })

  it('wraps terminal typography changes and removes only its own listener', () => {
    const listener = vi.fn()
    const unsubscribe = bridge.terminalTypography.onChange(listener)
    const handler = on.mock.calls[0]?.[1] as (
      event: unknown,
      payload: unknown,
    ) => void
    const typography = {
      fontFamily: 'JetBrainsMono Nerd Font',
      fontSize: 14,
      fontWeight: 500,
      fontVariations: {},
      cellHeight: 10,
      tracking: 5,
      baseline: -10,
      thicken: true,
      thickenStrength: 75,
      ligatures: false,
    }

    handler({ raw: 'electron-event' }, typography)
    expect(listener).toHaveBeenCalledWith(typography)

    unsubscribe()
    expect(on).toHaveBeenCalledWith(
      BRIDGE_CHANNELS.terminalTypographyChanged,
      handler,
    )
    expect(off).toHaveBeenCalledWith(
      BRIDGE_CHANNELS.terminalTypographyChanged,
      handler,
    )
  })

  it('wraps payload-free control changes and unsubscribes locally', () => {
    const listener = vi.fn()
    const unsubscribe = bridge.control.onChange(listener)
    const handler = on.mock.calls[0]?.[1] as () => void

    handler()
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    expect(on).toHaveBeenCalledWith(BRIDGE_CHANNELS.controlChanged, handler)
    expect(off).toHaveBeenCalledWith(BRIDGE_CHANNELS.controlChanged, handler)
    expect(invoke).not.toHaveBeenCalled()
  })

  it('validates traffic invalidations and removes only its own listener', () => {
    const listener = vi.fn()
    const unsubscribe = bridge.control.onTrafficInvalidation(listener)
    const handler = on.mock.calls[0]?.[1] as (
      event: unknown,
      payload: unknown,
    ) => void
    const invalidation = {
      contractVersion: 1,
      revision: 3,
      emittedAt: '2026-09-07T20:01:00.000Z',
      activeCount: 0,
      overflow: false,
      scopes: ['requests'],
      requestIds: [],
    }

    handler({ raw: 'electron-event' }, { invalid: true })
    expect(listener).not.toHaveBeenCalled()
    handler({ raw: 'electron-event' }, invalidation)
    expect(listener).toHaveBeenCalledWith(invalidation)

    unsubscribe()
    expect(on).toHaveBeenCalledWith(
      BRIDGE_CHANNELS.trafficInvalidated,
      handler,
    )
    expect(off).toHaveBeenCalledWith(
      BRIDGE_CHANNELS.trafficInvalidated,
      handler,
    )
  })
})
