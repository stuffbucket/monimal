import {
  TrafficOverviewQuerySchema,
  TrafficRequestListQuerySchema,
} from '@stuffbucket/maximal-observability-contract'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { BRIDGE_CHANNELS } from '../shared/bridge-channels'
import type { MaximalBridge } from './index'

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

let bridge: MaximalBridge

beforeAll(async () => {
  await import('./index.js')
  expect(exposeInMainWorld).toHaveBeenCalledTimes(1)
  bridge = exposeInMainWorld.mock.calls[0]?.[1] as MaximalBridge
})

beforeEach(() => {
  invoke.mockClear()
  on.mockClear()
  off.mockClear()
})

describe('preload bridge allowlist', () => {
  it('exposes exactly the documented deep key set', () => {
    expect(Object.keys(bridge).sort()).toEqual([
      'control',
      'getCoreStatus',
      'getProxyUrl',
      'harness',
      'localModels',
      'logs',
      'menuBarMode',
      'onCoreStatus',
      'onOpenSettings',
      'openExternal',
      'pendingSettingsRequest',
      'terminal',
    ])
    expect(Object.keys(bridge.control).sort()).toEqual([
      'accountsList',
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
      'diagnosticsGet',
      'modelsList',
      'modelsRefresh',
      'observabilityOverview',
      'observabilityRequest',
      'observabilityRequests',
      'onChange',
      'onTrafficInvalidation',
      'usageGet',
    ])
    expect(Object.keys(bridge.logs).sort()).toEqual(['location', 'reveal'])
    expect(Object.keys(bridge.localModels).sort()).toEqual([
      'cancel',
      'ensure',
      'list',
      'onChange',
      'openFolder',
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
    ])
    expect(Object.keys(bridge.menuBarMode).sort()).toEqual([
      'beginEnable',
      'cancelEnable',
      'confirmEnable',
      'disable',
      'get',
    ])
    expect(Object.keys(bridge.terminal).sort()).toEqual([
      'acknowledge',
      'discover',
      'launch',
      'list',
      'onData',
      'onExit',
      'profiles',
      'resize',
      'spawn',
      'terminate',
      'write',
    ])
    expect(bridge).not.toHaveProperty('getCoreOrigin')
  })

  it('delegates every invoke method to its one named channel', async () => {
    const overviewQuery = TrafficOverviewQuerySchema.parse({})
    const requestsQuery = TrafficRequestListQuerySchema.parse({})

    await bridge.getCoreStatus()
    await bridge.getProxyUrl()
    await bridge.openExternal('https://github.com/login/device')
    await bridge.control.authStatus()
    await bridge.control.authStart()
    await bridge.control.authCancel()
    await bridge.control.authSignOut()
    await bridge.control.accountsList()
    await bridge.control.accountsSwitch('github.com:octocat')
    await bridge.control.observabilityOverview(overviewQuery)
    await bridge.control.observabilityRequests(requestsQuery)
    await bridge.control.observabilityRequest({ requestId: 'req-1' })
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
    await bridge.pendingSettingsRequest()
    await bridge.logs.location()
    await bridge.logs.reveal()
    await bridge.localModels.openFolder()
    await bridge.menuBarMode.get()
    await bridge.menuBarMode.beginEnable()
    await bridge.menuBarMode.confirmEnable('attempt-1')
    await bridge.menuBarMode.cancelEnable('attempt-1')
    await bridge.menuBarMode.disable()
    await bridge.harness.hide()
    await bridge.harness.provider()
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

    expect(invoke.mock.calls).toEqual([
      [BRIDGE_CHANNELS.lifecycleCurrent],
      [BRIDGE_CHANNELS.proxyUrl],
      [BRIDGE_CHANNELS.openExternal, 'https://github.com/login/device'],
      [BRIDGE_CHANNELS.authStatus],
      [BRIDGE_CHANNELS.authStart],
      [BRIDGE_CHANNELS.authCancel],
      [BRIDGE_CHANNELS.authSignOut],
      [BRIDGE_CHANNELS.accountsList],
      [BRIDGE_CHANNELS.accountsSwitch, 'github.com:octocat'],
      [BRIDGE_CHANNELS.observabilityOverview, overviewQuery],
      [BRIDGE_CHANNELS.observabilityRequests, requestsQuery],
      [BRIDGE_CHANNELS.observabilityRequest, { requestId: 'req-1' }],
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
      [BRIDGE_CHANNELS.pendingSettingsRequest],
      [BRIDGE_CHANNELS.logsLocation],
      [BRIDGE_CHANNELS.logsReveal],
      [BRIDGE_CHANNELS.localModelsOpenFolder],
      [BRIDGE_CHANNELS.menuBarModeGet],
      [BRIDGE_CHANNELS.menuBarModeBeginEnable],
      [BRIDGE_CHANNELS.menuBarModeConfirmEnable, 'attempt-1'],
      [BRIDGE_CHANNELS.menuBarModeCancelEnable, 'attempt-1'],
      [BRIDGE_CHANNELS.menuBarModeDisable],
      [BRIDGE_CHANNELS.harnessHide],
      [BRIDGE_CHANNELS.harnessProvider],
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
