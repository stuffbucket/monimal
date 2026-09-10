import type { Context } from "hono"
import type { ZodType } from "zod"

/**
 * JSON-RPC method registry for the control plane (ADR-0023, maximal-core#4/#8).
 *
 * Every method projects an operation the REST control routes already expose —
 * the underlying calls are shared, not reimplemented, so the two surfaces cannot
 * drift while the REST paths remain during the deprecation cycle.
 *
 * Naming follows the vocabulary fixed in maximal-core#4 (`server/discover`,
 * `auth/status`, `config/get`, `health`, …) rather than anything invented here,
 * so the Electron client codes against one agreed method set.
 */
import {
  TrafficOverviewQuerySchema,
  TrafficOverviewSchema,
  TrafficRequestDetailQuerySchema,
  TrafficRequestDetailSchema,
  TrafficRequestListQuerySchema,
  TrafficRequestListSchema,
} from "@stuffbucket/maximal-observability-contract"

import type { ClientRosterReader } from "~/lib/http/active-clients"
import type { RpcRegistry } from "~/lib/jsonrpc/dispatch"
import type { ControlHub } from "~/lib/live/hub"
import type { AsyncMutex } from "~/lib/live/mutex"
import type { ControlSnapshot } from "~/lib/live/resources"
import type { TrafficQueryStore } from "~/lib/observability/store"
import type { LocalModelOperations } from "~/routes/control/local-models"

import {
  cancelDeviceFlow,
  getAuthStatus,
  rearmCopilotAuth,
  signOut,
  startDeviceFlow,
} from "~/lib/auth/auth-controller"
import { activateAccountLive } from "~/lib/auth/auth-recovery"
import {
  readDefaultRegistry,
  removeAccount,
  writeDefaultRegistry,
} from "~/lib/auth/github-token-store"
import { getConfig } from "~/lib/config/config"
import {
  buildDiagnostics,
  createApiKey,
  listApiKeys,
  removeApiKey,
  setApiKeyEnforcement,
  setAppEnabled,
  SettingsOperationError,
  updateApiKey,
} from "~/lib/config/settings-operations"
import {
  ApiKeyCreateRequest,
  ApiKeyEnforcementRequest,
  ApiKeyIdRequest,
  ApiKeyUpdateRpcRequest,
  AppSetEnabledRequest,
  TokenUsageRequest,
} from "~/lib/config/settings-types"
import { listActiveClients } from "~/lib/http/active-clients"
import { RpcParamsError } from "~/lib/jsonrpc/errors"
import {
  PROTOCOL_VERSION_HEADER,
  SUPPORTED_PROTOCOL_VERSION,
} from "~/lib/live/contract"
import {
  buildAccountsList,
  buildAppsList,
  buildModelsList,
} from "~/lib/live/resources"
import { streamSubscription } from "~/lib/live/stream-subscription"
import { getDefaultTrafficObserver } from "~/lib/observability/store"
import { cacheModels } from "~/lib/platform/utils"
import { state } from "~/lib/runtime-state/state"
import { emitQuitRequest, emitUpdateRequest } from "~/lib/start/boot-status"
import { getTokenUsageSummary } from "~/lib/token-usage"
import { BUILD_VERSION } from "~/lib/update/build-info"
import { getUpdateStatus } from "~/lib/update/update-check"

export interface ControlRpcOperationOverrides {
  createApiKey?: typeof createApiKey
  refreshModels?: typeof cacheModels
  setAppEnabled?: typeof setAppEnabled
}

export interface ControlRpcDeps {
  hub: () => ControlHub<ControlSnapshot>
  mutex: AsyncMutex
  /** Injectable active-client roster; defaults to the process-global tracker.
   *  Mirrors `ControlRoutesOptions.listClients` so `GET /clients` and
   *  `clients/list` cannot answer from different state. */
  listClients?: ClientRosterReader
  localModels?: LocalModelOperations
  trafficQueries?: TrafficQueryStore
  /** Narrow operation seams for dispatcher-level tests. Production uses the real
   *  shared settings operations when an override is absent. */
  operations?: ControlRpcOperationOverrides
}

/** Both account methods take `{ key }`; validated once so the two call sites
 *  cannot disagree about the shape. */
function parseObservabilityParams<T>(
  schema: {
    safeParse(value: unknown): { success: true; data: T } | { success: false }
  },
  params: unknown,
): T {
  const parsed = schema.safeParse(params ?? {})
  if (!parsed.success)
    throw new RpcParamsError("Invalid observability query parameters.")
  return parsed.data
}

function stringParam(params: unknown, key: string, expected: string): string {
  const value =
    params !== null && typeof params === "object" ?
      (params as Record<string, unknown>)[key]
    : undefined
  if (typeof value !== "string" || value.length === 0 || value.length > 200) {
    throw new RpcParamsError(expected)
  }
  return value
}

function keyFromParams(params: unknown): string {
  return stringParam(params, "key", "Expected { key } string.")
}

function parseParams<T>(
  schema: ZodType<T>,
  params: unknown,
  expected: string,
): T {
  const parsed = schema.safeParse(params ?? {})
  if (!parsed.success) throw new RpcParamsError(expected)
  return parsed.data
}

function asRpcOperation<T>(operation: () => T): T {
  try {
    return operation()
  } catch (error) {
    if (error instanceof SettingsOperationError) {
      throw new RpcParamsError(error.message)
    }
    throw error
  }
}

async function asAsyncRpcOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof SettingsOperationError) {
      throw new RpcParamsError(error.message)
    }
    throw error
  }
}

function createSettingsRpcMethods({
  hub,
  operations = {},
}: ControlRpcDeps): RpcRegistry {
  const createApiKeyOperation = operations.createApiKey ?? createApiKey
  const refreshModels = operations.refreshModels ?? cacheModels
  const setAppEnabledOperation = operations.setAppEnabled ?? setAppEnabled

  return {
    "apps/list": () => buildAppsList(),
    "apiKeys/list": () => listApiKeys(),
    "models/list": () => buildModelsList(),
    "usage/get": (params: unknown) => {
      const { period } = parseParams(
        TokenUsageRequest,
        params,
        "Expected optional { period: day | week | month }.",
      )
      return getTokenUsageSummary(period)
    },
    "diagnostics/get": () => buildDiagnostics(),
    "models/refresh": async () => {
      await refreshModels()
      return buildModelsList()
    },
    "apps/setEnabled": async (params: unknown) => {
      const { appId, enabled } = parseParams(
        AppSetEnabledRequest,
        params,
        "Expected { appId, enabled } for a configurable app.",
      )
      const app = await asAsyncRpcOperation(() =>
        setAppEnabledOperation(appId, enabled),
      )
      hub().emit("apps", await buildAppsList())
      return app
    },
    "apiKeys/create": (params: unknown) =>
      asRpcOperation(() =>
        createApiKeyOperation(
          parseParams(
            ApiKeyCreateRequest,
            params,
            "Expected { label, key?, enabled? }.",
          ),
        ),
      ),
    "apiKeys/update": (params: unknown) =>
      asRpcOperation(() => {
        const { id, update } = parseParams(
          ApiKeyUpdateRpcRequest,
          params,
          "Expected { id, update }.",
        )
        return updateApiKey(id, update)
      }),
    "apiKeys/remove": (params: unknown) =>
      asRpcOperation(() => {
        const { id } = parseParams(
          ApiKeyIdRequest,
          params,
          "Expected { id } string.",
        )
        removeApiKey(id)
        return { ok: true, id }
      }),
    "apiKeys/setEnforcement": (params: unknown) => {
      const { enforcing } = parseParams(
        ApiKeyEnforcementRequest,
        params,
        "Expected { enforcing: boolean }.",
      )
      return setApiKeyEnforcement(enforcing)
    },
  }
}

/**
 * Shell-relay signals. The REST routes answer 202/409; over RPC the same
 * distinction is carried in the result rather than a status, because clients
 * discriminate on the payload and never on HTTP (ADR-0023).
 */
function createLocalModelRpcMethods(
  operations: LocalModelOperations | undefined,
): RpcRegistry {
  if (operations === undefined) return {}
  return {
    "localModels/list": () => operations.list(),
    "localModels/ensure": (params: unknown) =>
      operations.ensure(
        stringParam(params, "modelKey", "Expected { modelKey } string."),
      ),
    "localModels/cancel": (params: unknown) =>
      operations.cancel(
        stringParam(params, "operationId", "Expected { operationId } string."),
      ),
  }
}

function relayToShell(emit: () => boolean, verb: "quitting" | "upgrading") {
  return () =>
    emit() ?
      { ok: true, [verb]: true }
    : { ok: false, reason: "no_supervising_shell" as const }
}

/**
 * Build the full method registry.
 *
 * This is a factory rather than a module constant because `server/discover` must
 * advertise the *effective* method set — including the hub- and mutex-dependent
 * account methods. A static constant under-reported them, which silently broke
 * feature detection: a client that trusts `capabilities.methods` would never
 * call `accounts/switch` even though it dispatches fine.
 */
export function createControlRpcMethods(deps: ControlRpcDeps): RpcRegistry {
  const { hub, mutex } = deps
  const listClients = deps.listClients ?? listActiveClients
  const trafficQueries = deps.trafficQueries ?? getDefaultTrafficObserver()

  const registry: RpcRegistry = {
    health: () => ({ ok: true, version: BUILD_VERSION }),
    ...createSettingsRpcMethods(deps),
    ...createLocalModelRpcMethods(deps.localModels),

    // Reads. Each mirrors a live feed topic and shares its builder, so a
    // snapshot read and a pushed update can never describe different shapes.
    "auth/status": () => getAuthStatus(),
    "accounts/list": () => buildAccountsList(),
    "observability/overview": async (params: unknown) => {
      const query = parseObservabilityParams(TrafficOverviewQuerySchema, params)
      return TrafficOverviewSchema.parse(
        await trafficQueries.getOverview(query),
      )
    },
    "observability/requests": async (params: unknown) => {
      const query = parseObservabilityParams(
        TrafficRequestListQuerySchema,
        params,
      )
      return TrafficRequestListSchema.parse(
        await trafficQueries.listRequests(query),
      )
    },
    "observability/request": async (params: unknown) => {
      const query = parseObservabilityParams(
        TrafficRequestDetailQuerySchema,
        params,
      )
      const result = await trafficQueries.getRequest(query.requestId)
      return result === null ? null : TrafficRequestDetailSchema.parse(result)
    },
    "config/get": () => getConfig(),
    "clients/list": () => {
      const clients = listClients()
      return { clients, total: clients.length }
    },
    "update/status": () => getUpdateStatus(),

    // Auth actions. `auth/status` returns ADR-0006's discriminated union, so
    // these deliberately return the same union rather than a parallel vocabulary.
    "auth/start": () => startDeviceFlow(),
    "auth/cancel": () => cancelDeviceFlow(),
    "auth/rearm": async () => ({
      outcome: await rearmCopilotAuth(),
      status: getAuthStatus(),
    }),
    "auth/signOut": async () => {
      await signOut()
      return { ok: true }
    },

    // Account mutations, serialized through the same mutex the REST routes use
    // so an RPC switch and a REST switch can never interleave.
    "accounts/switch": (params: unknown) =>
      mutex.runExclusive(async () => {
        const key = keyFromParams(params)
        const result = await activateAccountLive(key)
        if (!result.ok) throw new RpcParamsError(result.message)
        hub().emit("accounts", await buildAccountsList())
        return { ok: true, key }
      }),

    "accounts/remove": (params: unknown) =>
      mutex.runExclusive(async () => {
        const key = keyFromParams(params)
        const reg = await readDefaultRegistry()
        if (!(key in reg.accounts)) {
          throw new RpcParamsError(`No account ${key}.`)
        }
        const wasActive = reg.activeKey === key
        await writeDefaultRegistry(removeAccount(reg, key))
        hub().emit("accounts", await buildAccountsList())
        return { ok: true, key, was_active: wasActive }
      }),

    /**
     * Long-lived push stream. The response IS the subscription: a snapshot
     * notification first, then per-topic change notifications until either side
     * closes. Closing the stream is the unsubscribe — there is no cancel method,
     * because a transport-level disconnect is unambiguous and a separate cancel
     * would race it.
     */
    "subscriptions/listen": (_params: unknown, c: Context) =>
      streamSubscription(c, hub),

    "app/quit": relayToShell(emitQuitRequest, "quitting"),
    "app/upgrade": relayToShell(emitUpdateRequest, "upgrading"),
  }

  // Stateless capability discovery: callable at any time, no prior handshake and
  // no session. MCP removed `initialize` in 2026-07-28 and ADR-0023 follows that
  // shape deliberately. Closes over `registry` so it can never under-report.
  return {
    ...registry,
    "server/discover": () => ({
      protocolVersion: SUPPORTED_PROTOCOL_VERSION,
      capabilities: {
        methods: [...Object.keys(registry), "server/discover"].sort(),
        feed: true,
      },
      identity: { name: "maximal-core", version: BUILD_VERSION },
      // Both bound ports (maximal-core#10). A host reaches the control plane on
      // an ephemeral port but must advertise `/v1` on the public one, and the
      // public one is not necessarily the requested 4141 — it falls back when
      // held. Reported here so a client that missed the ready-line, or
      // reconnected later, can still learn both without guessing.
      ports: { control: state.controlPort, proxy: state.proxyPort },
    }),
  }
}

/**
 * Reject a request that pins an unsupported protocol version.
 *
 * A missing header is allowed: `server/discover` is how a client learns the
 * version, and requiring the header on the very call that discovers it would be
 * circular. Present-but-wrong is the case worth failing loudly on (#8).
 */
export function unsupportedVersion(c: Context): string | null {
  const pinned = c.req.header(PROTOCOL_VERSION_HEADER)
  if (pinned === undefined || pinned === SUPPORTED_PROTOCOL_VERSION) return null
  return pinned
}
