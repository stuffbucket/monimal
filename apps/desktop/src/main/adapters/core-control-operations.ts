import {
  type LocalModelCancelResult,
  type LocalModelCatalogEntry,
  type LocalModelCatalogSnapshot,
  type LocalModelEnsureResult,
  type LocalModelOperationEvent,
} from '@maximal/maximal-core-contract/control'
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
  type AuthStatus,
  type ConnectionAction,
  ConnectionCredentialReveal as ConnectionCredentialRevealSchema,
  type ConnectionCredentialReveal,
  ConnectionEntry as ConnectionEntrySchema,
  type ConnectionEntry,
  ConnectionsListResponse as ConnectionsListResponseSchema,
  type ConnectionsListResponse,
  DiagnosticsResponse as DiagnosticsResponseSchema,
  type DiagnosticsResponse,
  ModelsListResponse as ModelsListResponseSchema,
  type ModelsListResponse,
  OllamaAccountsListResponse as OllamaAccountsListResponseSchema,
  type OllamaAccountsListResponse,
  OllamaSettingsResponse as OllamaSettingsResponseSchema,
  type OllamaSettingsResponse,
  OllamaSettingsUpdateRequest as OllamaSettingsUpdateRequestSchema,
  type OllamaSettingsUpdateRequest,
  type SearchProviderValidationRequest,
  SearchProviderValidationResponse as SearchProviderValidationResponseSchema,
  type SearchProviderValidationResponse,
  SearchSettingsResponse as SearchSettingsResponseSchema,
  type SearchSettingsResponse,
  type SearchSettingsUpdateRequest,
  TokenUsageSummary as TokenUsageSummarySchema,
  type TokenUsagePeriod,
  type TokenUsageSummary,
} from '@maximal/maximal-core-contract/settings'
import {
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
} from '@maximal/maximal-observability-contract'
import type { ControlResult } from '@maximal/maximal-client/shared/host'
import { z } from 'zod'

export interface CoreControlOperations {
  authStatus(): Promise<ControlResult<AuthStatus>>
  authStart(): Promise<ControlResult<AuthStatus>>
  authCancel(): Promise<ControlResult<AuthStatus>>
  authSignOut(): Promise<ControlResult<null>>
  accountsList(): Promise<ControlResult<AccountsListResponse>>
  accountsSwitch(key: string): Promise<ControlResult<null>>
  accountsSetEnabled(key: string, enabled: boolean): Promise<ControlResult<null>>
  accountsReorder(priority: string[]): Promise<ControlResult<null>>
  ollamaAccountsList(): Promise<ControlResult<OllamaAccountsListResponse>>
  ollamaSettingsGet(): Promise<ControlResult<OllamaSettingsResponse>>
  ollamaSettingsUpdate(input: OllamaSettingsUpdateRequest): Promise<ControlResult<OllamaSettingsResponse>>
  observabilityOverview(query: TrafficOverviewQuery): Promise<ControlResult<TrafficOverview>>
  observabilityRequests(query: TrafficRequestListQuery): Promise<ControlResult<TrafficRequestList>>
  observabilityRequest(query: TrafficRequestDetailQuery): Promise<ControlResult<TrafficRequestDetail | null>>
  connectionsList(): Promise<ControlResult<ConnectionsListResponse>>
  connectionsAct(id: string, action: ConnectionAction): Promise<ControlResult<ConnectionEntry>>
  connectionsRevealCredential(id: string): Promise<ControlResult<ConnectionCredentialReveal>>
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
  searchSettingsUpdate(input: SearchSettingsUpdateRequest): Promise<ControlResult<SearchSettingsResponse>>
  searchProviderValidate(input: SearchProviderValidationRequest): Promise<ControlResult<SearchProviderValidationResponse>>
}

export const requiredMethods = [
  'auth/status',
  'auth/start',
  'auth/signOut',
  'subscriptions/listen',
] as const

export const optionalMethods = [
  'auth/cancel',
  'accounts/list',
  'accounts/switch',
  'accounts/setEnabled',
  'accounts/reorder',
  'ollamaAccounts/list',
  'ollamaSettings/get',
  'ollamaSettings/update',
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
  'searchSettings/validateProvider',
] as const

export type ControlMethod =
  | Exclude<(typeof requiredMethods)[number], 'subscriptions/listen'>
  | (typeof optionalMethods)[number]

const accountsSwitchResultSchema = z.object({
  ok: z.literal(true),
  key: z.string(),
})

const accountSetEnabledResultSchema = accountsSwitchResultSchema.extend({
  enabled: z.boolean(),
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

export const localModelOperationEventSchema: z.ZodType<LocalModelOperationEvent> = z.discriminatedUnion('type', [
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

export type ControlCall = <T>(
  method: ControlMethod,
  parse: (input: unknown) => T,
  params?: unknown,
  parseParams?: (input: unknown) => unknown,
) => Promise<ControlResult<T>>

export function createCoreControlOperations(call: ControlCall): CoreControlOperations {
  return {
    authStatus: () => call('auth/status', parseWith(AuthStatusSchema)),
    authStart: () => call('auth/start', parseWith(AuthStatusSchema)),
    authCancel: () => call('auth/cancel', parseWith(AuthStatusSchema)),
    authSignOut: () => call('auth/signOut', () => null),
    accountsList: () => call('accounts/list', parseWith(AccountsListResponseSchema)),
    accountsSwitch: (key) =>
      call('accounts/switch', (input) => {
        accountsSwitchResultSchema.parse(input)
        return null
      }, { key }),
    accountsSetEnabled: (key, enabled) =>
      call('accounts/setEnabled', (input) => {
        accountSetEnabledResultSchema.parse(input)
        return null
      }, { key, enabled }),
    accountsReorder: (priority) =>
      call('accounts/reorder', (input) => {
        accountsSwitchResultSchema.parse(input)
        return null
      }, { priority }),
    ollamaAccountsList: () =>
      call('ollamaAccounts/list', parseWith(OllamaAccountsListResponseSchema)),
    ollamaSettingsGet: () =>
      call('ollamaSettings/get', parseWith(OllamaSettingsResponseSchema)),
    ollamaSettingsUpdate: (input) =>
      call('ollamaSettings/update', parseWith(OllamaSettingsResponseSchema),
        input, parseWith(OllamaSettingsUpdateRequestSchema)),
    observabilityOverview: (query) =>
      call('observability/overview', parseWith(TrafficOverviewSchema),
        query, parseWith(TrafficOverviewQuerySchema)),
    observabilityRequests: (query) =>
      call('observability/requests', parseWith(TrafficRequestListSchema),
        query, parseWith(TrafficRequestListQuerySchema)),
    observabilityRequest: (query) =>
      call('observability/request',
        (input) => input === null ? null : TrafficRequestDetailSchema.parse(input),
        query, parseWith(TrafficRequestDetailQuerySchema)),
    connectionsList: () =>
      call('connections/list', parseWith(ConnectionsListResponseSchema)),
    connectionsAct: (id, action) =>
      call('connections/act', parseWith(ConnectionEntrySchema), { id, action }),
    connectionsRevealCredential: (id) =>
      call('connections/revealCredential', parseWith(ConnectionCredentialRevealSchema), { id }),
    appsList: () => call('apps/list', parseWith(AppsListResponseSchema)),
    appsSetEnabled: (appId, enabled) =>
      call('apps/setEnabled', parseWith(AppEntrySchema), { appId, enabled }),
    apiKeysList: () => call('apiKeys/list', parseWith(ApiKeysListResponseSchema)),
    apiKeysCreate: (input) => call('apiKeys/create', parseWith(ApiKeyEntrySchema), input),
    apiKeysUpdate: (id, update) =>
      call('apiKeys/update', parseWith(ApiKeyEntrySchema), { id, update }),
    apiKeysRemove: (id) =>
      call('apiKeys/remove', (input) => {
        apiKeyRemoveResultSchema.parse(input)
        return null
      }, { id }),
    apiKeysSetEnforcement: (enforcing) =>
      call('apiKeys/setEnforcement', parseWith(ApiKeysListResponseSchema), { enforcing }),
    modelsList: () => call('models/list', parseWith(ModelsListResponseSchema)),
    modelsRefresh: () => call('models/refresh', parseWith(ModelsListResponseSchema)),
    localModelsList: () =>
      call('localModels/list', parseWith(localModelCatalogSnapshotSchema)),
    localModelsEnsure: (modelKey) =>
      call('localModels/ensure', parseWith(localModelEnsureResultSchema), { modelKey }),
    localModelsCancel: (operationId) =>
      call('localModels/cancel', parseWith(localModelCancelResultSchema), { operationId }),
    usageGet: (period) =>
      call('usage/get', parseWith(TokenUsageSummarySchema), { period }),
    diagnosticsGet: () =>
      call('diagnostics/get', parseWith(DiagnosticsResponseSchema)),
    searchSettingsGet: () =>
      call('searchSettings/get', parseWith(SearchSettingsResponseSchema)),
    searchSettingsUpdate: (input) =>
      call('searchSettings/update', parseWith(SearchSettingsResponseSchema), input),
    searchProviderValidate: (input) =>
      call('searchSettings/validateProvider',
        parseWith(SearchProviderValidationResponseSchema), input),
  }
}
