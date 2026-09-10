import {
  ControlClient,
  ControlRpcError,
  type ControlState,
} from '@stuffbucket/maximal-core/client'
import {
  CONTROL_ERROR_REASONS,
  type LocalModelCancelResult,
  type LocalModelCatalogEntry,
  type LocalModelCatalogSnapshot,
  type LocalModelEnsureResult,
  type LocalModelOperationEvent,
} from '@stuffbucket/maximal-core/control-contract'
import {
  SUPPORTED_PROTOCOL_VERSION,
  type ControlTopic,
} from '@stuffbucket/maximal-core/contract'
import {
  AccountsListResponse as AccountsListResponseSchema,
  type AccountsListResponse,
  ApiKeyEntry as ApiKeyEntrySchema,
  type ApiKeyEntry,
  type ApiKeyCreateRequest,
  type ApiKeyUpdateRequest,
  ApiKeysListResponse as ApiKeysListResponseSchema,
  type ApiKeysListResponse,
  AppEntry as AppEntrySchema,
  type AppEntry,
  AppsListResponse as AppsListResponseSchema,
  type AppsListResponse,
  AuthStatus as AuthStatusSchema,
  type ConnectionAction,
  ConnectionCredentialReveal as ConnectionCredentialRevealSchema,
  type ConnectionCredentialReveal,
  ConnectionEntry as ConnectionEntrySchema,
  type ConnectionEntry,
  ConnectionsListResponse as ConnectionsListResponseSchema,
  type ConnectionsListResponse,
  type AuthStatus,
  DiagnosticsResponse as DiagnosticsResponseSchema,
  type DiagnosticsResponse,
  ModelsListResponse as ModelsListResponseSchema,
  type ModelsListResponse,
  SearchSettingsResponse as SearchSettingsResponseSchema,
  type SearchSettingsResponse,
  type SearchSettingsUpdateRequest,
  TokenUsageSummary as TokenUsageSummarySchema,
  type TokenUsagePeriod,
  type TokenUsageSummary,
} from '@stuffbucket/maximal-core/settings-types'
import {
  TRAFFIC_OBSERVABILITY_CONTRACT_VERSION,
  TrafficInvalidationSchema,
  type TrafficInvalidation,
  TrafficOverviewQuerySchema,
  TrafficOverviewSchema,
  type TrafficOverview,
  type TrafficOverviewQuery,
  TrafficRequestDetailQuerySchema,
  TrafficRequestDetailSchema,
  type TrafficRequestDetail,
  type TrafficRequestDetailQuery,
  type TrafficRequestList,
  TrafficRequestListQuerySchema,
  TrafficRequestListSchema,
  type TrafficRequestListQuery,
} from '@stuffbucket/maximal-observability-contract'
import { z } from 'zod'

import { awaitControlOrigin, onCoreStatus, type CoreStatus } from './core'
import type {
  ControlFailure,
  ControlResult,
} from '../shared/bridge-types'

type ControlMethod =
  | 'auth/status'
  | 'auth/start'
  | 'auth/cancel'
  | 'auth/signOut'
  | 'accounts/list'
  | 'accounts/switch'
  | 'observability/overview'
  | 'observability/requests'
  | 'observability/request'
  | 'connections/list'
  | 'connections/act'
  | 'connections/revealCredential'
  | 'apps/list'
  | 'apps/setEnabled'
  | 'apiKeys/list'
  | 'apiKeys/create'
  | 'apiKeys/update'
  | 'apiKeys/remove'
  | 'apiKeys/setEnforcement'
  | 'models/list'
  | 'models/refresh'
  | 'localModels/list'
  | 'localModels/ensure'
  | 'localModels/cancel'
  | 'usage/get'
  | 'diagnostics/get'
  | 'searchSettings/get'
  | 'searchSettings/update'

interface ControlClientLike {
  call<T = unknown>(method: string, params?: unknown): Promise<T>
  onState(
    listener: (state: ControlState, topic: ControlTopic | null) => void,
  ): () => void
  connect(): Promise<void>
  close(): void
}

interface LiveControlClient {
  origin: string
  client: ControlClientLike
  methods: ReadonlySet<string>
  stopState: () => void
  generation: number
}

interface ControlSessionDependencies {
  awaitOrigin(): Promise<string>
  onLifecycle(listener: (status: CoreStatus) => void): () => void
  createClient(origin: string): ControlClientLike
  onChange(): void
  onLocalModelEvent(event: LocalModelOperationEvent): void
  onTrafficInvalidation(invalidation: TrafficInvalidation): void
  logError(message: string, error: unknown): void
}

export interface ControlSession {
  authStatus(): Promise<ControlResult<AuthStatus>>
  authStart(): Promise<ControlResult<AuthStatus>>
  authCancel(): Promise<ControlResult<AuthStatus>>
  authSignOut(): Promise<ControlResult<null>>
  accountsList(): Promise<ControlResult<AccountsListResponse>>
  accountsSwitch(key: string): Promise<ControlResult<null>>
  observabilityOverview(
    query: TrafficOverviewQuery,
  ): Promise<ControlResult<TrafficOverview>>
  observabilityRequests(
    query: TrafficRequestListQuery,
  ): Promise<ControlResult<TrafficRequestList>>
  observabilityRequest(
    query: TrafficRequestDetailQuery,
  ): Promise<ControlResult<TrafficRequestDetail | null>>
  connectionsList(): Promise<ControlResult<ConnectionsListResponse>>
  connectionsAct(
    id: string,
    action: ConnectionAction,
  ): Promise<ControlResult<ConnectionEntry>>
  connectionsRevealCredential(
    id: string,
  ): Promise<ControlResult<ConnectionCredentialReveal>>
  appsList(): Promise<ControlResult<AppsListResponse>>
  appsSetEnabled(appId: AppEntry['id'], enabled: boolean): Promise<ControlResult<AppEntry>>
  apiKeysList(): Promise<ControlResult<ApiKeysListResponse>>
  apiKeysCreate(input: ApiKeyCreateRequest): Promise<ControlResult<ApiKeyEntry>>
  apiKeysUpdate(id: string, update: ApiKeyUpdateRequest): Promise<ControlResult<ApiKeyEntry>>
  apiKeysRemove(id: string): Promise<ControlResult<null>>
  apiKeysSetEnforcement(enforcing: boolean): Promise<ControlResult<ApiKeysListResponse>>
  modelsList(): Promise<ControlResult<ModelsListResponse>>
  modelsRefresh(): Promise<ControlResult<ModelsListResponse>>
  localModelsList(): Promise<ControlResult<LocalModelCatalogSnapshot>>
  localModelsEnsure(modelKey: string): Promise<ControlResult<LocalModelEnsureResult>>
  localModelsCancel(operationId: string): Promise<ControlResult<LocalModelCancelResult>>
  usageGet(period: TokenUsagePeriod): Promise<ControlResult<TokenUsageSummary>>
  diagnosticsGet(): Promise<ControlResult<DiagnosticsResponse>>
  searchSettingsGet(): Promise<ControlResult<SearchSettingsResponse>>
  searchSettingsUpdate(
    input: SearchSettingsUpdateRequest,
  ): Promise<ControlResult<SearchSettingsResponse>>
  dispose(): void
}

const requiredMethods = [
  'auth/status',
  'auth/start',
  'auth/signOut',
  'subscriptions/listen',
] as const

const optionalMethods = [
  'auth/cancel',
  'accounts/list',
  'accounts/switch',
  'observability/overview',
  'observability/requests',
  'observability/request',
  'connections/list',
  'connections/act',
  'connections/revealCredential',
  'apps/list',
  'apps/setEnabled',
  'apiKeys/list',
  'apiKeys/create',
  'apiKeys/update',
  'apiKeys/remove',
  'apiKeys/setEnforcement',
  'models/list',
  'models/refresh',
  'localModels/list',
  'localModels/ensure',
  'localModels/cancel',
  'usage/get',
  'diagnostics/get',
  'searchSettings/get',
  'searchSettings/update',
] as const

const discoverySchema = z.object({
  protocolVersion: z.string(),
  capabilities: z.object({
    methods: z.array(z.string()),
    feed: z.literal(true),
  }),
  identity: z.object({
    name: z.literal('maximal-core'),
    version: z.string(),
  }),
})

const controlErrorDataSchema = z.object({
  reason: z.enum(CONTROL_ERROR_REASONS),
  retryable: z.boolean(),
  requestId: z.string().optional(),
  remediationUrl: z.string().optional(),
})

const accountsSwitchResultSchema = z.object({
  ok: z.literal(true),
  key: z.string(),
})

const apiKeyRemoveResultSchema = z.object({
  ok: z.literal(true),
  id: z.string(),
})

const localModelCatalogEntrySchema: z.ZodType<LocalModelCatalogEntry> = z.object({
  capabilities: z.object({
    input: z.array(z.string()),
    output: z.array(z.string()),
  }),
  context: z.object({
    contextWindow: z.number().int().nonnegative(),
    maxOutputTokens: z.number().int().nonnegative().optional(),
  }),
  displayName: z.string(),
  expectedBytes: z.number().int().nonnegative(),
  format: z.string(),
  key: z.string(),
  modelId: z.string(),
  publication: z.enum(['none', 'provider', 'aggregate']),
  state: z.enum(['registered', 'provisioning', 'ready', 'failed']),
})

const localModelCatalogSnapshotSchema: z.ZodType<LocalModelCatalogSnapshot> = z.object({
  models: z.array(localModelCatalogEntrySchema),
  revision: z.number().int().nonnegative(),
})

const localModelEnsureResultSchema: z.ZodType<LocalModelEnsureResult> = z.object({
  modelKey: z.string(),
  operationId: z.string(),
  started: z.boolean(),
})

const localModelCancelResultSchema: z.ZodType<LocalModelCancelResult> = z.object({
  cancelled: z.boolean(),
  operationId: z.string(),
})

const localModelOperationEventSchema: z.ZodType<LocalModelOperationEvent> = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('catalog'),
    snapshot: localModelCatalogSnapshotSchema,
  }),
  z.object({
    type: z.literal('progress'),
    operationId: z.string(),
    progress: z.object({
      completedBytes: z.number().int().nonnegative(),
      modelKey: z.string(),
      phase: z.enum(['checking', 'downloading', 'verifying', 'committing']),
      totalBytes: z.number().int().nonnegative(),
    }),
  }),
  z.object({
    type: z.literal('completed'),
    operationId: z.string(),
    model: localModelCatalogEntrySchema,
  }),
  z.object({
    type: z.enum(['cancelled', 'failed']),
    operationId: z.string(),
    error: z.object({
      message: z.string(),
      retryable: z.boolean(),
    }),
  }),
])

function parseWith<T>(schema: z.ZodType<T>): (input: unknown) => T {
  return (input) => schema.parse(input)
}

class SessionFailure extends Error {
  constructor(
    readonly reason: ControlFailure['reason'],
    message: string,
    readonly retryable = false,
  ) {
    super(message)
    this.name = 'SessionFailure'
  }
}

function failureResult<T>(error: ControlFailure): ControlResult<T> {
  return { ok: false, error }
}

function mapFailure(error: unknown): ControlFailure {
  if (error instanceof SessionFailure) {
    return {
      reason: error.reason,
      message: error.message,
      retryable: error.retryable,
    }
  }

  if (error instanceof ControlRpcError) {
    const data = controlErrorDataSchema.safeParse(error.data)
    if (data.success) {
      return {
        reason: data.data.reason,
        message: error.message,
        retryable: data.data.retryable,
        code: error.code,
        ...(data.data.requestId === undefined
          ? {}
          : { requestId: data.data.requestId }),
        ...(data.data.remediationUrl === undefined
          ? {}
          : { remediationUrl: data.data.remediationUrl }),
      }
    }

    return {
      reason: 'internal',
      message: error.message,
      retryable: false,
      code: error.code,
    }
  }

  if (error instanceof z.ZodError) {
    return {
      reason: 'internal',
      message: error.message,
      retryable: false,
    }
  }

  return {
    reason: 'transport',
    message: error instanceof Error ? error.message : String(error),
    retryable: true,
  }
}

function unsupported(method: ControlMethod): ControlResult<never> {
  return failureResult({
    reason: 'unsupported',
    message: `maximal-core does not advertise ${method}`,
    retryable: false,
  })
}

export function createControlSession(
  options: Partial<ControlSessionDependencies> &
    Pick<
      ControlSessionDependencies,
      'onChange' | 'onTrafficInvalidation'
    >,
): ControlSession {
  const dependencies: ControlSessionDependencies = {
    awaitOrigin: awaitControlOrigin,
    onLifecycle: onCoreStatus,
    createClient: (origin) => new ControlClient({ baseUrl: origin }),
    logError: (message, error) => console.error(message, error),
    onLocalModelEvent: () => {},
    ...options,
  }

  let live: LiveControlClient | null = null
  let generation = 0
  let disposed = false
  let replacementQueue: Promise<void> = Promise.resolve()

  async function buildClient(origin: string): Promise<LiveControlClient> {
    const discoveryClient = dependencies.createClient(origin)
    let discovery: z.infer<typeof discoverySchema>
    try {
      discovery = discoverySchema.parse(
        await discoveryClient.call('server/discover'),
      )
    } catch (error) {
      if (error instanceof ControlRpcError) throw error
      if (error instanceof z.ZodError) {
        throw new SessionFailure(
          'unsupported_version',
          `Incompatible maximal-core discovery response: ${error.message}`,
        )
      }
      throw error
    } finally {
      discoveryClient.close()
    }

    if (discovery.protocolVersion !== SUPPORTED_PROTOCOL_VERSION) {
      throw new SessionFailure(
        'unsupported_version',
        `Unsupported maximal-core control protocol ${discovery.protocolVersion}; expected ${SUPPORTED_PROTOCOL_VERSION}`,
      )
    }

    const methods = new Set(discovery.capabilities.methods)
    const missing = requiredMethods.filter((method) => !methods.has(method))
    if (missing.length > 0) {
      throw new SessionFailure(
        'unsupported_version',
        `maximal-core is missing required control capabilities: ${missing.join(', ')}`,
      )
    }

    const client = dependencies.createClient(origin)
    const nextGeneration = generation + 1
    let trafficRevision: number | null = null
    const stopState = client.onState((state, topic) => {
      if (topic === null || disposed || generation !== nextGeneration) return

      dependencies.onChange()
      if (topic === 'localModels') {
        const event = localModelOperationEventSchema.safeParse(
          Reflect.get(state, 'localModels'),
        )
        if (event.success) dependencies.onLocalModelEvent(event.data)
        else {
          dependencies.logError(
            '[maximal-client] invalid local model event:',
            event.error,
          )
        }
        return
      }
      if (topic === 'snapshot') trafficRevision = null
      const traffic: unknown = Reflect.get(state, 'traffic')
      if (traffic === undefined) {
        if (topic === 'snapshot') {
          dependencies.onTrafficInvalidation({
            contractVersion: TRAFFIC_OBSERVABILITY_CONTRACT_VERSION,
            revision: trafficRevision ?? 0,
            emittedAt: new Date().toISOString(),
            activeCount: 0,
            overflow: true,
            scopes: ['requests', 'request-detail', 'overview'],
            requestIds: [],
          })
        }
        return
      }

      const invalidation = TrafficInvalidationSchema.safeParse(traffic)
      if (!invalidation.success) {
        dependencies.logError(
          '[maximal-client] invalid traffic invalidation:',
          invalidation.error,
        )
        return
      }
      if (invalidation.data.revision === trafficRevision) return
      trafficRevision = invalidation.data.revision
      dependencies.onTrafficInvalidation(invalidation.data)
    })

    return {
      origin,
      client,
      methods,
      stopState,
      generation: nextGeneration,
    }
  }

  function replace(origin: string): Promise<void> {
    const queued = replacementQueue.then(async () => {
      if (disposed || live?.origin === origin) return

      const next = await buildClient(origin)
      if (disposed) {
        next.stopState()
        next.client.close()
        return
      }

      const stale = live
      generation = next.generation
      live = next
      stale?.stopState()
      stale?.client.close()

      void next.client.connect().catch((error: unknown) => {
        if (!disposed && generation === next.generation) {
          dependencies.logError(
            '[maximal-client] control stream stopped:',
            error,
          )
        }
      })
      dependencies.onChange()
    })

    replacementQueue = queued.catch(() => {})
    return queued
  }

  async function current(): Promise<LiveControlClient> {
    const origin = await dependencies.awaitOrigin()
    await replace(origin)
    if (!live || live.origin !== origin) {
      throw new SessionFailure(
        'transport',
        'maximal-core control connection is not available',
        true,
      )
    }
    return live
  }

  async function call<T>(
    method: ControlMethod,
    parse: (input: unknown) => T,
    params?: unknown,
    parseParams?: (input: unknown) => unknown,
  ): Promise<ControlResult<T>> {
    try {
      const validatedParams =
        parseParams === undefined ? params : parseParams(params)
      const active = await current()
      if (
        optionalMethods.includes(
          method as (typeof optionalMethods)[number],
        ) &&
        !active.methods.has(method)
      ) {
        return unsupported(method)
      }
      return {
        ok: true,
        value: parse(await active.client.call(method, validatedParams)),
      }
    } catch (error) {
      return failureResult(mapFailure(error))
    }
  }

  const stopLifecycle = dependencies.onLifecycle((status) => {
    if (status.phase !== 'ready') return
    void replace(status.controlOrigin).catch((error: unknown) => {
      if (!disposed) {
        dependencies.logError(
          '[maximal-client] control discovery failed:',
          error,
        )
      }
    })
  })

  return {
    authStatus: () => call('auth/status', parseWith(AuthStatusSchema)),
    authStart: () => call('auth/start', parseWith(AuthStatusSchema)),
    authCancel: () => call('auth/cancel', parseWith(AuthStatusSchema)),
    authSignOut: () =>
      call('auth/signOut', () => null),
    accountsList: () =>
      call('accounts/list', parseWith(AccountsListResponseSchema)),
    accountsSwitch: (key) =>
      call('accounts/switch', (input) => {
        accountsSwitchResultSchema.parse(input)
        return null
      }, { key }),
    observabilityOverview: (query) =>
      call(
        'observability/overview',
        parseWith(TrafficOverviewSchema),
        query,
        parseWith(TrafficOverviewQuerySchema),
      ),
    observabilityRequests: (query) =>
      call(
        'observability/requests',
        parseWith(TrafficRequestListSchema),
        query,
        parseWith(TrafficRequestListQuerySchema),
      ),
    observabilityRequest: (query) =>
      call(
        'observability/request',
        (input) =>
          input === null ? null : TrafficRequestDetailSchema.parse(input),
        query,
        parseWith(TrafficRequestDetailQuerySchema),
      ),
    connectionsList: () =>
      call('connections/list', parseWith(ConnectionsListResponseSchema)),
    connectionsAct: (id, action) =>
      call('connections/act', parseWith(ConnectionEntrySchema), { id, action }),
    connectionsRevealCredential: (id) =>
      call(
        'connections/revealCredential',
        parseWith(ConnectionCredentialRevealSchema),
        { id },
      ),
    appsList: () => call('apps/list', parseWith(AppsListResponseSchema)),
    appsSetEnabled: (appId, enabled) =>
      call('apps/setEnabled', parseWith(AppEntrySchema), { appId, enabled }),
    apiKeysList: () =>
      call('apiKeys/list', parseWith(ApiKeysListResponseSchema)),
    apiKeysCreate: (input) =>
      call('apiKeys/create', parseWith(ApiKeyEntrySchema), input),
    apiKeysUpdate: (id, update) =>
      call('apiKeys/update', parseWith(ApiKeyEntrySchema), { id, update }),
    apiKeysRemove: (id) =>
      call('apiKeys/remove', (input) => {
        apiKeyRemoveResultSchema.parse(input)
        return null
      }, { id }),
    apiKeysSetEnforcement: (enforcing) =>
      call('apiKeys/setEnforcement', parseWith(ApiKeysListResponseSchema), {
        enforcing,
      }),
    modelsList: () => call('models/list', parseWith(ModelsListResponseSchema)),
    modelsRefresh: () =>
      call('models/refresh', parseWith(ModelsListResponseSchema)),
    localModelsList: () =>
      call('localModels/list', parseWith(localModelCatalogSnapshotSchema)),
    localModelsEnsure: (modelKey) =>
      call(
        'localModels/ensure',
        parseWith(localModelEnsureResultSchema),
        { modelKey },
      ),
    localModelsCancel: (operationId) =>
      call(
        'localModels/cancel',
        parseWith(localModelCancelResultSchema),
        { operationId },
      ),
    usageGet: (period) =>
      call('usage/get', parseWith(TokenUsageSummarySchema), { period }),
    diagnosticsGet: () =>
      call('diagnostics/get', parseWith(DiagnosticsResponseSchema)),
    searchSettingsGet: () =>
      call('searchSettings/get', parseWith(SearchSettingsResponseSchema)),
    searchSettingsUpdate: (input) =>
      call(
        'searchSettings/update',
        parseWith(SearchSettingsResponseSchema),
        input,
      ),
    dispose() {
      if (disposed) return
      disposed = true
      generation += 1
      stopLifecycle()
      live?.stopState()
      live?.client.close()
      live = null
    },
  }
}

export type { AuthStatus, AccountsListResponse }
