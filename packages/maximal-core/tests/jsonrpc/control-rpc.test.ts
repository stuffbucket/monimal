import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { Hono } from "hono"

import type { AppEntry } from "~/lib/config/settings-types"
import type { ControlSnapshot } from "~/lib/live/resources"
import type { ControlRpcOperationOverrides } from "~/routes/control/rpc"

import { writeConfig } from "~/lib/config/config"
import { SettingsOperationError } from "~/lib/config/settings-operations"
import { AppsListResponse } from "~/lib/config/settings-types"
import {
  CONTROL_UPSTREAM_ERROR,
  JSON_RPC_INVALID_PARAMS,
} from "~/lib/jsonrpc/codes"
import { createRpcHandler } from "~/lib/jsonrpc/dispatch"
import {
  PROTOCOL_VERSION_HEADER,
  SUPPORTED_PROTOCOL_VERSION,
} from "~/lib/live/contract"
import { ControlHub } from "~/lib/live/hub"
import { AsyncMutex } from "~/lib/live/mutex"
import { stopControlHub } from "~/lib/live/service"
import { createControlRoutes } from "~/routes/control/route"
import { createControlRpcMethods } from "~/routes/control/rpc"

beforeEach(() => {
  writeConfig({})
})

afterEach(() => {
  stopControlHub()
  writeConfig({})
})

interface RpcBody {
  id?: string | number
  result?: Record<string, unknown>
  error?: { code: number; message: string; data?: { reason?: string } }
}

function app(ip = "127.0.0.1"): ReturnType<typeof createControlRoutes> {
  return createControlRoutes({ getRequestIp: () => ip })
}

async function rpc(
  method: string,
  opts: { id?: string | number; params?: unknown; version?: string } = {},
): Promise<{ status: number; body: RpcBody }> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  }
  if (opts.version !== undefined) {
    headers[PROTOCOL_VERSION_HEADER] = opts.version
  }
  const res = await app().request("/rpc", {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      ...(opts.id === undefined ? {} : { id: opts.id }),
      method,
      ...(opts.params === undefined ? {} : { params: opts.params }),
    }),
  })
  const text = await res.text()
  return { status: res.status, body: text ? (JSON.parse(text) as RpcBody) : {} }
}

function appWithOperations(operations: ControlRpcOperationOverrides): {
  app: Hono
  hub: ControlHub<ControlSnapshot>
} {
  const hub = new ControlHub<ControlSnapshot>({
    buildSnapshot: () => Promise.reject(new Error("snapshot is not used")),
  })
  const rpcApp = new Hono()
  rpcApp.post(
    "/rpc",
    createRpcHandler(
      createControlRpcMethods({
        hub: () => hub,
        mutex: new AsyncMutex(),
        listClients: () => [],
        operations,
      }),
    ),
  )
  return { app: rpcApp, hub }
}

async function rpcThrough(
  target: Hono,
  method: string,
  params?: unknown,
): Promise<RpcBody> {
  const res = await target.request("/rpc", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      ...(params === undefined ? {} : { params }),
    }),
  })
  return (await res.json()) as RpcBody
}

describe("control /rpc — discovery", () => {
  test("server/discover works with no prior handshake", async () => {
    const { status, body } = await rpc("server/discover", { id: 1 })
    expect(status).toBe(200)
    expect(body.result?.protocolVersion).toBe(SUPPORTED_PROTOCOL_VERSION)
    expect(body.result?.identity).toMatchObject({ name: "maximal-core" })
  })

  test("discovered capabilities list the callable methods", async () => {
    const { body } = await rpc("server/discover", { id: 1 })
    const caps = body.result?.capabilities as { methods: Array<string> }
    // The account methods are composed in at route level, not in the static
    // registry — discovery must still advertise them or a client can't find them.
    expect(caps.methods).toContain("auth/status")
    expect(caps.methods).toContain("accounts/switch")
    expect(caps.methods).toContain("health")
    const settingsMethods = [
      "apps/list",
      "apps/setEnabled",
      "apiKeys/list",
      "apiKeys/create",
      "apiKeys/update",
      "apiKeys/remove",
      "apiKeys/setEnforcement",
      "models/list",
      "models/refresh",
      "usage/get",
      "diagnostics/get",
    ]
    for (const method of settingsMethods) expect(caps.methods).toContain(method)
  })
})

describe("control /rpc — protocol version", () => {
  test("a matching pinned version is accepted", async () => {
    const { status } = await rpc("health", {
      id: 1,
      version: SUPPORTED_PROTOCOL_VERSION,
    })
    expect(status).toBe(200)
  })

  test("an unsupported pinned version fails legibly, naming both versions", async () => {
    const { status, body } = await rpc("health", { id: 1, version: "999" })
    expect(status).toBe(400)
    expect(body.error?.data?.reason).toBe("unsupported_version")
    expect(body.error?.message).toContain("999")
    expect(body.error?.message).toContain(SUPPORTED_PROTOCOL_VERSION)
  })

  test("an absent version header is allowed — discovery would be circular otherwise", async () => {
    const { status } = await rpc("health", { id: 1 })
    expect(status).toBe(200)
  })
})

describe("control /rpc — transport rules", () => {
  test("GET is 405: the session-era verbs were never part of this transport", async () => {
    expect((await app().request("/rpc")).status).toBe(405)
  })

  test("a non-loopback caller gets 404 before any JSON-RPC parsing", async () => {
    const res = await app("203.0.113.7").request("/rpc", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "health" }),
    })
    expect(res.status).toBe(404)
    // A remote caller must not learn the endpoint exists, so the body is not a
    // well-formed JSON-RPC error.
    expect(await res.text()).not.toContain("jsonrpc")
  })
})

describe("control /rpc — params validation", () => {
  test("accounts/switch without a key is -32602, not an upstream error", async () => {
    const { body } = await rpc("accounts/switch", { id: 1, params: {} })
    expect(body.error?.code).toBe(-32602)
    expect(body.error?.message).toContain("key")
  })

  test("settings methods reject malformed parameters with their contracts", async () => {
    const cases = [
      [
        "apps/setEnabled",
        { appId: "unknown", enabled: true },
        "Expected { appId, enabled } for a configurable app.",
      ],
      ["apiKeys/create", {}, "Expected { label, key?, enabled? }."],
      [
        "apiKeys/update",
        { id: "key-1", update: { enabled: "yes" } },
        "Expected { id, update }.",
      ],
      ["apiKeys/remove", {}, "Expected { id } string."],
      [
        "apiKeys/setEnforcement",
        { enforcing: "yes" },
        "Expected { enforcing: boolean }.",
      ],
      [
        "usage/get",
        { period: "year" },
        "Expected optional { period: day | week | month }.",
      ],
    ] as const

    for (const [method, params, message] of cases) {
      const { body } = await rpc(method, { id: 1, params })
      expect(body.error).toMatchObject({
        code: JSON_RPC_INVALID_PARAMS,
        message,
      })
    }
  })

  test("settings operation failures stay legible JSON-RPC parameter errors", async () => {
    const { body } = await rpc("apiKeys/remove", {
      id: 1,
      params: { id: "not-a-real-key" },
    })

    expect(body.error?.code).toBe(-32602)
    expect(body.error?.message).toContain("not found")
  })
})

describe("control /rpc — settings", () => {
  test("list methods return concrete settings snapshots", async () => {
    const apps = (await rpc("apps/list", { id: 1 })).body.result
    expect(AppsListResponse.safeParse(apps).success).toBe(true)

    const apiKeys = (await rpc("apiKeys/list", { id: 1 })).body.result
    expect(apiKeys).toEqual({ entries: [], enforcing: false })

    const models = (await rpc("models/list", { id: 1 })).body.result
    const modelList = models?.models
    expect(Array.isArray(modelList)).toBe(true)
    expect(models?.count).toBe(Array.isArray(modelList) ? modelList.length : -1)
  })

  test("API-key methods expose their results and persist each mutation", async () => {
    const created = (
      await rpc("apiKeys/create", {
        id: 1,
        params: { label: "RPC test", key: "rpc-test-key", enabled: true },
      })
    ).body.result
    expect(created).toMatchObject({
      label: "RPC test",
      key: "rpc-test-key",
      enabled: true,
    })
    expect(typeof created?.id).toBe("string")
    const id = created?.id as string

    expect((await rpc("apiKeys/list", { id: 1 })).body.result).toMatchObject({
      entries: [{ id, key: "rpc-test-key" }],
      enforcing: false,
    })

    expect(
      (
        await rpc("apiKeys/update", {
          id: 1,
          params: { id, update: { label: "Updated", enabled: false } },
        })
      ).body.result,
    ).toMatchObject({ id, label: "Updated", enabled: false })

    expect(
      (
        await rpc("apiKeys/setEnforcement", {
          id: 1,
          params: { enforcing: true },
        })
      ).body.result,
    ).toMatchObject({ enforcing: true })

    expect(
      (
        await rpc("apiKeys/remove", {
          id: 1,
          params: { id },
        })
      ).body.result,
    ).toEqual({ ok: true, id })
    expect((await rpc("apiKeys/list", { id: 1 })).body.result).toEqual({
      entries: [],
      enforcing: true,
    })
  })

  test("models/refresh invokes the refresh operation before returning models", async () => {
    let refreshes = 0
    const custom = appWithOperations({
      refreshModels: () => {
        refreshes += 1
        return Promise.resolve()
      },
    })
    try {
      const body = await rpcThrough(custom.app, "models/refresh")
      const models = body.result?.models
      expect(refreshes).toBe(1)
      expect(Array.isArray(models)).toBe(true)
      expect(body.result?.count).toBe(
        Array.isArray(models) ? models.length : -1,
      )
    } finally {
      custom.hub.dispose()
    }
  })

  test("apps/setEnabled returns the app and publishes the refreshed list", async () => {
    const configuredApp: AppEntry = {
      id: "claude-code",
      name: "Claude Code",
      kind: "config",
      enabled: false,
      status: "ready",
      installs: [],
      install: null,
      conflict: null,
    }
    let received: [AppEntry["id"], boolean] | undefined
    const custom = appWithOperations({
      setAppEnabled: (appId, enabled) => {
        received = [appId, enabled]
        return Promise.resolve(configuredApp)
      },
    })
    const emit = spyOn(custom.hub, "emit")
    try {
      const body = await rpcThrough(custom.app, "apps/setEnabled", {
        appId: "claude-code",
        enabled: false,
      })
      expect(received).toEqual(["claude-code", false])
      expect(body.result).toEqual(configuredApp)
      expect(emit).toHaveBeenCalledTimes(1)
      expect(emit.mock.calls[0]?.[0]).toBe("apps")
      expect(AppsListResponse.safeParse(emit.mock.calls[0]?.[1]).success).toBe(
        true,
      )
    } finally {
      emit.mockRestore()
      custom.hub.dispose()
    }
  })

  test("domain operation errors become invalid params", async () => {
    const custom = appWithOperations({
      setAppEnabled: () =>
        Promise.reject(
          new SettingsOperationError("configuration conflict", "conflict"),
        ),
    })
    try {
      const body = await rpcThrough(custom.app, "apps/setEnabled", {
        appId: "claude-code",
        enabled: true,
      })
      expect(body.error).toMatchObject({
        code: JSON_RPC_INVALID_PARAMS,
        message: "configuration conflict",
      })
    } finally {
      custom.hub.dispose()
    }
  })

  test("non-domain operation errors rethrow to the dispatcher", async () => {
    const sync = appWithOperations({
      createApiKey: () => {
        throw new Error("sync operation failed")
      },
    })
    try {
      const body = await rpcThrough(sync.app, "apiKeys/create", {
        label: "RPC test",
      })
      expect(body.error).toMatchObject({
        code: CONTROL_UPSTREAM_ERROR,
        message: "sync operation failed",
      })
    } finally {
      sync.hub.dispose()
    }

    const asyncOperation = appWithOperations({
      setAppEnabled: () => Promise.reject(new Error("async operation failed")),
    })
    try {
      const body = await rpcThrough(asyncOperation.app, "apps/setEnabled", {
        appId: "claude-code",
        enabled: true,
      })
      expect(body.error).toMatchObject({
        code: CONTROL_UPSTREAM_ERROR,
        message: "async operation failed",
      })
    } finally {
      asyncOperation.hub.dispose()
    }
  })

  test("usage/get defaults to a day and accepts each advertised period", async () => {
    for (const period of [undefined, "day", "week", "month"] as const) {
      const { body } = await rpc("usage/get", {
        id: 1,
        params: period === undefined ? {} : { period },
      })
      const result = body.result as
        | { period?: string; totals?: { request_count?: number } }
        | undefined
      expect(result?.period).toBe(period ?? "day")
      expect(typeof result?.totals?.request_count).toBe("number")
    }
  })

  test("diagnostics/get returns the safe token-presence contract", async () => {
    const { body } = await rpc("diagnostics/get", { id: 1 })
    const result = body.result as
      | {
          tokens?: {
            github_token_present?: boolean
            copilot_token_present?: boolean
          }
        }
      | undefined

    expect(typeof result?.tokens?.github_token_present).toBe("boolean")
    expect(typeof result?.tokens?.copilot_token_present).toBe("boolean")
  })
})

/** Open `subscriptions/listen` and read its first SSE block. */
async function listen(): Promise<{
  status: number
  ctype: string
  block: string
}> {
  const res = await app().request("/rpc", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "subscriptions/listen",
    }),
  })
  if (!res.body) throw new Error("expected a streaming body")
  const reader = (res.body as ReadableStream<Uint8Array>).getReader()
  const { value } = await reader.read()
  await reader.cancel()
  return {
    status: res.status,
    ctype: res.headers.get("content-type") ?? "",
    block: new TextDecoder().decode(value).trim(),
  }
}

describe("control /rpc — subscriptions/listen", () => {
  // The canonical push surface, and until now the only one with no unit
  // coverage: the sole SSE test in the suite pointed at `GET /events`, the
  // deprecated shim. That is exactly backwards — the surface every client is
  // told to use was the untested one.
  test("the response IS the subscription: an open stream, not a JSON result", async () => {
    const { status, ctype } = await listen()
    expect(status).toBe(200)
    expect(ctype).toContain("text/event-stream")
  })

  test("opens with a snapshot notification so a client paints real state first", async () => {
    const { block } = await listen()
    const dataLine =
      block.split("\n").find((line) => line.startsWith("data:")) ?? ""
    const frame = JSON.parse(dataLine.slice("data:".length).trim()) as {
      jsonrpc: string
      method: string
      id?: unknown
      params?: { protocolVersion?: number }
    }
    expect(frame.jsonrpc).toBe("2.0")
    expect(frame.method).toBe("control/snapshot")
    expect(frame.params?.protocolVersion).toBe(2)
    // A notification, not a response: an `id` would invite a client to
    // correlate a reply that is never coming.
    expect(frame.id).toBeUndefined()
  })

  test("carries no SSE id line — the transport advertises no resumability", async () => {
    const { block } = await listen()
    expect(block.split("\n").some((line) => line.startsWith("id:"))).toBe(false)
  })
})
