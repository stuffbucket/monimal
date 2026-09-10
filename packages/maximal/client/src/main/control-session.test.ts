import {
  ControlRpcError,
  type ControlState,
} from '@stuffbucket/maximal-core/client'
import {
  SUPPORTED_PROTOCOL_VERSION,
  type ControlTopic,
} from '@stuffbucket/maximal-core/contract'
import {
  TrafficOverviewQuerySchema,
  TrafficRequestListQuerySchema,
} from '@stuffbucket/maximal-observability-contract'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => '/tmp/maximal-client-test',
    getPath: () => '/tmp/maximal-client-test/userData',
  },
}))

import { createControlSession } from './control-session'
import type { CoreStatus } from './core'

const originOne = 'http://127.0.0.1:50001'
const originTwo = 'http://127.0.0.1:50002'
const authStatus = { state: 'unauthenticated' } as const
const accounts = { accounts: [], active_key: null }
const localModel = {
  key: 'qwen',
  modelId: 'qwen3-0.6b',
  displayName: 'Qwen3 0.6B Q8',
  format: 'gguf',
  expectedBytes: 639_446_688,
  publication: 'provider',
  state: 'registered',
  capabilities: { input: ['text'], output: ['text'] },
  context: { contextWindow: 32_768, maxOutputTokens: 8_192 },
} as const
const localModelCatalogue = { models: [localModel], revision: 1 }
const emptyPercentiles = {
  sampleCount: 0,
  p50Ms: null,
  p90Ms: null,
  p95Ms: null,
  p99Ms: null,
}
const emptyOverview = {
  contractVersion: 1,
  generatedAt: '2026-09-07T20:01:00.000Z',
  range: {
    from: '2026-09-07T19:01:00.000Z',
    to: '2026-09-07T20:01:00.000Z',
  },
  totals: {
    requests: 0,
    active: 0,
    succeeded: 0,
    failed: 0,
    cancelled: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    totalTokens: 0,
    requestBytes: 0,
    responseBytes: 0,
  },
  latency: {
    queue: emptyPercentiles,
    timeToFirstResponse: emptyPercentiles,
    total: emptyPercentiles,
  },
  flow: { nodes: [], edges: [] },
  tokens: { bucketMs: 60_000, points: [] },
}
const emptyRequestPage = {
  contractVersion: 1,
  items: [],
  nextCursor: null,
  hasMore: false,
}
const connectedClaudeCode = {
  id: 'claude-code',
  name: 'Claude Code',
  status: 'connected',
  allowed_actions: ['disconnect'],
  detail: null,
  credential: {
    id: 'managed:claude-code',
    label: 'Claude Code',
    kind: 'managed',
    enabled: true,
  },
  ownership: null,
  recovery: null,
} as const
const connections = {
  clients: [connectedClaudeCode],
  manual_credentials: [],
  require_known_keys: false,
}
const revealedCredential = {
  id: 'managed:claude-code',
  key: 'testkey123',
}
const searchSettings = {
  manifest: {
    id: 'search',
    label: 'Search',
    description: 'Search settings',
    fields: [],
    providers: [],
  },
  settings: {},
  providers: {},
}

function discovery(overrides: Record<string, unknown> = {}): unknown {
  return {
    protocolVersion: SUPPORTED_PROTOCOL_VERSION,
    capabilities: {
      methods: [
        'auth/status',
        'auth/start',
        'auth/cancel',
        'auth/signOut',
        'accounts/list',
        'accounts/switch',
        'observability/overview',
        'observability/requests',
        'observability/request',
        'connections/list',
        'connections/act',
        'connections/revealCredential',
        'localModels/list',
        'localModels/ensure',
        'localModels/cancel',
        'subscriptions/listen',
      ],
      feed: true,
    },
    identity: { name: 'maximal-core', version: '0.6.3' },
    ...overrides,
  }
}

type TestControlState = ControlState & {
  localModels?: unknown
  traffic?: unknown
}

class FakeClient {
  readonly calls: Array<{ method: string; params?: unknown }> = []
  readonly listeners = new Set<
    (state: ControlState, topic: ControlTopic | null) => void
  >()
  readonly staleListeners = new Set<
    (state: ControlState, topic: ControlTopic | null) => void
  >()
  readonly responses = new Map<string, unknown>()
  connected = 0
  closed = 0

  constructor(entries: Record<string, unknown>) {
    for (const [method, response] of Object.entries(entries)) {
      this.responses.set(method, response)
    }
  }

  async call<T>(method: string, params?: unknown): Promise<T> {
    this.calls.push({ method, ...(params === undefined ? {} : { params }) })
    const response = this.responses.get(method)
    if (response instanceof Error) throw response
    return response as T
  }

  onState(
    listener: (state: ControlState, topic: ControlTopic | null) => void,
  ): () => void {
    this.listeners.add(listener)
    this.staleListeners.add(listener)
    listener({}, null)
    return () => this.listeners.delete(listener)
  }

  emit(state: TestControlState = {}, topic: ControlTopic = 'auth'): void {
    for (const listener of this.listeners) listener(state, topic)
  }

  emitStale(state: TestControlState = {}, topic: ControlTopic = 'auth'): void {
    for (const listener of this.staleListeners) listener(state, topic)
  }

  async connect(): Promise<void> {
    this.connected += 1
  }

  close(): void {
    this.closed += 1
  }
}

interface HarnessOptions {
  origins?: string[]
  clients: FakeClient[]
}

function createHarness({ origins = [originOne], clients }: HarnessOptions) {
  let originIndex = 0
  let lifecycleListener: ((status: CoreStatus) => void) | null = null
  const onChange = vi.fn()
  const onLocalModelEvent = vi.fn()
  const onTrafficInvalidation = vi.fn()
  const stopLifecycle = vi.fn()
  const logError = vi.fn()
  let clientIndex = 0

  const session = createControlSession({
    awaitOrigin: async () => origins[originIndex] ?? origins.at(-1) ?? originOne,
    onLifecycle: (listener) => {
      lifecycleListener = listener
      return stopLifecycle
    },
    createClient: () => {
      const client = clients[clientIndex]
      clientIndex += 1
      if (!client) throw new Error('unexpected client construction')
      return client
    },
    onChange,
    onLocalModelEvent,
    onTrafficInvalidation,
    logError,
  })

  return {
    session,
    onChange,
    onLocalModelEvent,
    onTrafficInvalidation,
    stopLifecycle,
    logError,
    clientCount: () => clientIndex,
    ready(origin: string, proxyUrl = 'http://127.0.0.1:4141') {
      originIndex = origins.indexOf(origin)
      if (originIndex < 0) originIndex = origins.length - 1
      lifecycleListener?.({
        phase: 'ready',
        controlOrigin: origin,
        proxyUrl,
        pid: 42,
      })
    },
  }
}

function fullLiveClient(
  overrides: Record<string, unknown> = {},
): FakeClient {
  return new FakeClient({
    'auth/status': authStatus,
    'auth/start': authStatus,
    'auth/cancel': authStatus,
    'auth/signOut': { ok: true },
    'accounts/list': accounts,
    'accounts/switch': { ok: true, key: 'github.com:octocat' },
    'observability/overview': emptyOverview,
    'observability/requests': emptyRequestPage,
    'observability/request': null,
    'connections/list': connections,
    'connections/act': connectedClaudeCode,
    'connections/revealCredential': revealedCredential,
    'localModels/list': localModelCatalogue,
    'localModels/ensure': {
      modelKey: 'qwen',
      operationId: 'operation-1',
      started: true,
    },
    'localModels/cancel': { operationId: 'operation-1', cancelled: true },
    ...overrides,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('control discovery', () => {
  it.each([
    ['wrong protocol', discovery({ protocolVersion: '999' })],
    [
      'wrong identity',
      discovery({ identity: { name: 'other-process', version: '1.0.0' } }),
    ],
    [
      'missing required method',
      discovery({
        capabilities: {
          methods: ['auth/status', 'auth/start', 'auth/signOut'],
          feed: true,
        },
      }),
    ],
    [
      'missing feed',
      discovery({
        capabilities: {
          methods: [
            'auth/status',
            'auth/start',
            'auth/signOut',
            'subscriptions/listen',
          ],
          feed: false,
        },
      }),
    ],
  ])('rejects %s as unsupported', async (_label, response) => {
    const discover = new FakeClient({ 'server/discover': response })
    const harness = createHarness({ clients: [discover] })

    await expect(harness.session.authStatus()).resolves.toMatchObject({
      ok: false,
      error: { reason: 'unsupported_version', retryable: false },
    })
    expect(discover.closed).toBe(1)
  })
})

describe('named control operations', () => {
  it('dispatches only the named wire methods and validates results', async () => {
    const discover = new FakeClient({ 'server/discover': discovery() })
    const live = fullLiveClient()
    const harness = createHarness({ clients: [discover, live] })
    const overviewQuery = TrafficOverviewQuerySchema.parse({})
    const requestsQuery = TrafficRequestListQuerySchema.parse({})

    await expect(harness.session.authStatus()).resolves.toEqual({
      ok: true,
      value: authStatus,
    })
    await expect(harness.session.authStart()).resolves.toEqual({
      ok: true,
      value: authStatus,
    })
    await expect(harness.session.authCancel()).resolves.toEqual({
      ok: true,
      value: authStatus,
    })
    await expect(harness.session.authSignOut()).resolves.toEqual({
      ok: true,
      value: null,
    })
    await expect(harness.session.accountsList()).resolves.toEqual({
      ok: true,
      value: accounts,
    })
    await expect(
      harness.session.accountsSwitch('github.com:octocat'),
    ).resolves.toEqual({ ok: true, value: null })
    await expect(
      harness.session.observabilityOverview(overviewQuery),
    ).resolves.toEqual({ ok: true, value: emptyOverview })
    await expect(
      harness.session.observabilityRequests(requestsQuery),
    ).resolves.toEqual({ ok: true, value: emptyRequestPage })
    await expect(
      harness.session.observabilityRequest({ requestId: 'req-1' }),
    ).resolves.toEqual({ ok: true, value: null })
    await expect(harness.session.connectionsList()).resolves.toEqual({
      ok: true,
      value: connections,
    })
    await expect(
      harness.session.connectionsAct('claude-code', 'disconnect'),
    ).resolves.toEqual({ ok: true, value: connectedClaudeCode })
    await expect(
      harness.session.connectionsRevealCredential('managed:claude-code'),
    ).resolves.toEqual({ ok: true, value: revealedCredential })
    await expect(harness.session.localModelsList()).resolves.toEqual({
      ok: true,
      value: localModelCatalogue,
    })
    await expect(harness.session.localModelsEnsure('qwen')).resolves.toEqual({
      ok: true,
      value: {
        modelKey: 'qwen',
        operationId: 'operation-1',
        started: true,
      },
    })
    await expect(
      harness.session.localModelsCancel('operation-1'),
    ).resolves.toEqual({
      ok: true,
      value: { operationId: 'operation-1', cancelled: true },
    })

    expect(live.calls).toEqual([
      { method: 'auth/status' },
      { method: 'auth/start' },
      { method: 'auth/cancel' },
      { method: 'auth/signOut' },
      { method: 'accounts/list' },
      {
        method: 'accounts/switch',
        params: { key: 'github.com:octocat' },
      },
      { method: 'observability/overview', params: overviewQuery },
      { method: 'observability/requests', params: requestsQuery },
      { method: 'observability/request', params: { requestId: 'req-1' } },
      { method: 'connections/list' },
      {
        method: 'connections/act',
        params: { id: 'claude-code', action: 'disconnect' },
      },
      {
        method: 'connections/revealCredential',
        params: { id: 'managed:claude-code' },
      },
      { method: 'localModels/list' },
      { method: 'localModels/ensure', params: { modelKey: 'qwen' } },
      {
        method: 'localModels/cancel',
        params: { operationId: 'operation-1' },
      },
    ])
    expect(live.connected).toBe(1)
  })

  it('returns unsupported for an absent optional method without a wire call', async () => {
    const discover = new FakeClient({
      'server/discover': discovery({
        capabilities: {
          methods: [
            'auth/status',
            'auth/start',
            'auth/signOut',
            'subscriptions/listen',
          ],
          feed: true,
        },
      }),
    })
    const live = fullLiveClient()
    const harness = createHarness({ clients: [discover, live] })

    await expect(harness.session.authCancel()).resolves.toEqual({
      ok: false,
      error: {
        reason: 'unsupported',
        message: 'maximal-core does not advertise auth/cancel',
        retryable: false,
      },
    })
    await expect(
      harness.session.observabilityOverview(
        TrafficOverviewQuerySchema.parse({}),
      ),
    ).resolves.toEqual({
      ok: false,
      error: {
        reason: 'unsupported',
        message: 'maximal-core does not advertise observability/overview',
        retryable: false,
      },
    })
    await expect(harness.session.connectionsList()).resolves.toEqual({
      ok: false,
      error: {
        reason: 'unsupported',
        message: 'maximal-core does not advertise connections/list',
        retryable: false,
      },
    })
    expect(live.calls).toEqual([])
  })

  it('validates search settings responses and forwards updates', async () => {
    const discover = new FakeClient({
      'server/discover': discovery({
        capabilities: {
          methods: [
            'auth/status',
            'auth/start',
            'auth/signOut',
            'subscriptions/listen',
            'searchSettings/get',
            'searchSettings/update',
          ],
          feed: true,
        },
      }),
    })
    const live = fullLiveClient({
      'searchSettings/get': searchSettings,
      'searchSettings/update': searchSettings,
    })
    const harness = createHarness({ clients: [discover, live] })
    const update = { settings: { fallback: false } }

    await expect(harness.session.searchSettingsGet()).resolves.toEqual({
      ok: true,
      value: searchSettings,
    })
    await expect(
      harness.session.searchSettingsUpdate(update),
    ).resolves.toEqual({ ok: true, value: searchSettings })
    expect(live.calls).toEqual([
      { method: 'searchSettings/get' },
      { method: 'searchSettings/update', params: update },
    ])
  })

  it('rejects invalid observability queries before a wire call', async () => {
    const harness = createHarness({ clients: [] })

    await expect(
      harness.session.observabilityOverview({
        filters: {
          minimumDurationMs: 20,
          maximumDurationMs: 10,
        },
      } as never),
    ).resolves.toMatchObject({
      ok: false,
      error: { reason: 'internal', retryable: false },
    })
    expect(harness.clientCount()).toBe(0)
  })

  it('maps invalid operation results to a non-retryable internal failure', async () => {
    const discover = new FakeClient({ 'server/discover': discovery() })
    const live = fullLiveClient({
      'accounts/list': { accounts: 'invalid' },
      'observability/overview': { contractVersion: 1 },
      'connections/list': { clients: 'invalid' },
      'connections/act': { id: 'Claude Code' },
      'connections/revealCredential': { id: 'key-1' },
    })
    const harness = createHarness({ clients: [discover, live] })

    await expect(harness.session.accountsList()).resolves.toMatchObject({
      ok: false,
      error: { reason: 'internal', retryable: false },
    })
    await expect(
      harness.session.observabilityOverview(
        TrafficOverviewQuerySchema.parse({}),
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: { reason: 'internal', retryable: false },
    })
    await expect(harness.session.connectionsList()).resolves.toMatchObject({
      ok: false,
      error: { reason: 'internal', retryable: false },
    })
    await expect(
      harness.session.connectionsAct('claude-code', 'connect'),
    ).resolves.toMatchObject({
      ok: false,
      error: { reason: 'internal', retryable: false },
    })
    await expect(
      harness.session.connectionsRevealCredential('key-1'),
    ).resolves.toMatchObject({
      ok: false,
      error: { reason: 'internal', retryable: false },
    })
  })
})

describe('control failures', () => {
  it('preserves every published ControlRpcError field', async () => {
    const discover = new FakeClient({ 'server/discover': discovery() })
    const live = fullLiveClient({
      'auth/status': new ControlRpcError(1002, 'Accept updated terms', {
        reason: 'auth_fatal',
        retryable: false,
        requestId: 'req-123',
        remediationUrl: 'https://example.test/remediate',
      }),
    })
    const harness = createHarness({ clients: [discover, live] })

    await expect(harness.session.authStatus()).resolves.toEqual({
      ok: false,
      error: {
        reason: 'auth_fatal',
        message: 'Accept updated terms',
        retryable: false,
        code: 1002,
        requestId: 'req-123',
        remediationUrl: 'https://example.test/remediate',
      },
    })
  })

  it('preserves a transport error message verbatim', async () => {
    const discover = new FakeClient({ 'server/discover': discovery() })
    const live = fullLiveClient({
      'auth/status': new TypeError('fetch failed: ECONNREFUSED'),
    })
    const harness = createHarness({ clients: [discover, live] })

    await expect(harness.session.authStatus()).resolves.toEqual({
      ok: false,
      error: {
        reason: 'transport',
        message: 'fetch failed: ECONNREFUSED',
        retryable: true,
      },
    })
  })
})

describe('local model events', () => {
  it('validates events and stops forwarding them on dispose', async () => {
    const discover = new FakeClient({ 'server/discover': discovery() })
    const live = fullLiveClient()
    const harness = createHarness({ clients: [discover, live] })
    const event = {
      type: 'progress',
      operationId: 'operation-1',
      progress: {
        modelKey: 'qwen',
        phase: 'downloading',
        completedBytes: 1024,
        totalBytes: 4096,
      },
    }

    await harness.session.authStatus()
    live.emit({ localModels: event }, 'localModels')
    live.emit({ localModels: { type: 'progress' } }, 'localModels')

    expect(harness.onLocalModelEvent).toHaveBeenCalledOnce()
    expect(harness.onLocalModelEvent).toHaveBeenCalledWith(event)
    expect(harness.logError).toHaveBeenCalledOnce()

    harness.session.dispose()
    live.emitStale(
      { localModels: { type: 'catalog', snapshot: localModelCatalogue } },
      'localModels',
    )
    expect(harness.onLocalModelEvent).toHaveBeenCalledOnce()
  })
})

describe('traffic invalidations', () => {
  it('validates, de-duplicates, and stops forwarding invalidations on dispose', async () => {
    const discover = new FakeClient({ 'server/discover': discovery() })
    const live = fullLiveClient()
    const harness = createHarness({ clients: [discover, live] })
    const invalidation = {
      contractVersion: 1,
      revision: 4,
      emittedAt: '2026-09-07T20:01:00.000Z',
      activeCount: 0,
      overflow: false,
      scopes: ['overview'],
      requestIds: [],
    }

    await harness.session.authStatus()
    live.emit({ traffic: invalidation })
    live.emit({ traffic: invalidation })
    live.emit({ traffic: { invalid: true } })

    expect(harness.onTrafficInvalidation).toHaveBeenCalledTimes(1)
    expect(harness.onTrafficInvalidation).toHaveBeenCalledWith(invalidation)
    expect(harness.logError).toHaveBeenCalledTimes(1)

    harness.session.dispose()
    live.emitStale({
      traffic: { ...invalidation, revision: invalidation.revision + 1 },
    })
    expect(harness.onTrafficInvalidation).toHaveBeenCalledTimes(1)
  })

  it('invalidates all traffic reads when a reconnect snapshot arrives', async () => {
    const discover = new FakeClient({ 'server/discover': discovery() })
    const live = fullLiveClient()
    const harness = createHarness({ clients: [discover, live] })

    await harness.session.authStatus()
    live.emit({
      traffic: {
        contractVersion: 1,
        revision: 0,
        emittedAt: '2026-09-07T20:00:00.000Z',
        activeCount: 0,
        overflow: false,
        scopes: ['overview'],
        requestIds: [],
      },
    })
    live.emit(
      {
        auth: {},
        accounts: {},
        apps: {},
        models: {},
        usage: {},
        clients: {},
      },
      'snapshot',
    )

    expect(harness.onTrafficInvalidation).toHaveBeenCalledWith(
      expect.objectContaining({
        overflow: true,
        scopes: ['requests', 'request-detail', 'overview'],
        requestIds: [],
      }),
    )

    const restartedRevision = {
      contractVersion: 1,
      revision: 0,
      emittedAt: '2026-09-07T20:02:00.000Z',
      activeCount: 1,
      overflow: false,
      scopes: ['overview'],
      requestIds: [],
    }
    live.emit({ traffic: restartedRevision })
    expect(harness.onTrafficInvalidation).toHaveBeenLastCalledWith(
      restartedRevision,
    )
  })
})

describe('sidecar generations', () => {
  it('reuses one client for the same origin and replaces it once for a new origin', async () => {
    const discoverOne = new FakeClient({ 'server/discover': discovery() })
    const liveOne = fullLiveClient()
    const discoverTwo = new FakeClient({ 'server/discover': discovery() })
    const liveTwo = fullLiveClient()
    const harness = createHarness({
      origins: [originOne, originTwo],
      clients: [discoverOne, liveOne, discoverTwo, liveTwo],
    })

    await harness.session.authStatus()
    expect(harness.clientCount()).toBe(2)
    expect(harness.onChange).toHaveBeenCalledTimes(1)

    harness.ready(originOne)
    await harness.session.authStatus()
    expect(harness.clientCount()).toBe(2)

    harness.ready(originTwo)
    await harness.session.authStatus()
    expect(harness.clientCount()).toBe(4)
    expect(liveOne.closed).toBe(1)
    expect(liveTwo.connected).toBe(1)
    expect(harness.onChange).toHaveBeenCalledTimes(2)

    liveOne.emitStale()
    expect(harness.onChange).toHaveBeenCalledTimes(2)
    liveTwo.emit()
    expect(harness.onChange).toHaveBeenCalledTimes(3)
  })

  it('disposes the lifecycle listener and live client once', async () => {
    const discover = new FakeClient({ 'server/discover': discovery() })
    const live = fullLiveClient()
    const harness = createHarness({ clients: [discover, live] })

    await harness.session.authStatus()
    harness.session.dispose()
    harness.session.dispose()

    expect(harness.stopLifecycle).toHaveBeenCalledTimes(1)
    expect(live.closed).toBe(1)
    live.emitStale()
    expect(harness.onChange).toHaveBeenCalledTimes(1)
  })
})
