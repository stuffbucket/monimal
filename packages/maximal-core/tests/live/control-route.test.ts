import { afterEach, beforeEach, describe, expect, test } from "bun:test"

import type { ActiveClient } from "~/lib/http/active-clients"
import type {
  ControlSnapshot,
  ProviderCatalogueModel,
} from "~/lib/live/resources"

import {
  addAndActivate,
  emptyRegistry,
  readDefaultRegistry,
  setAccountEnabled,
  writeDefaultRegistry,
} from "~/lib/auth/github-token-store"
import { frameEnvelopeSchema, type FrameEnvelope } from "~/lib/live/contract"
import { ControlHub } from "~/lib/live/hub"
import { stopControlHub } from "~/lib/live/service"
import { state } from "~/lib/runtime-state/state"
import {
  __resetUpdateCheckDepsForTests,
  __setUpdateCheckDepsForTests,
} from "~/lib/update/update-check"
import { createControlRoutes } from "~/routes/control/route"

import { copilotModelMetadataFixture } from "../fixtures/copilot-model-metadata"
import {
  makeTestAccount,
  resetDefaultTestRegistry,
  testAccountKey,
} from "../helpers/account-fixtures"

// `GET /update-status` calls getUpdateStatus(), whose default fetch hits the
// real release manifest on the public CDN. That made this file's assertion
// depend on the network — it timed out at the 5s default under load — and on
// whether a sibling had already warmed the module-level cache. Pin the seam the
// update-check suite already owns so the route test is offline and hermetic.
beforeEach(() => {
  state.models = undefined
  __resetUpdateCheckDepsForTests()
  __setUpdateCheckDepsForTests({
    fetch: () => Promise.reject(new Error("offline (control-route test)")),
  })
})

afterEach(() => {
  // Safety: tear down the wired singleton if any test reached the default hub.
  stopControlHub()
  state.models = undefined
  __resetUpdateCheckDepsForTests()
})

function makeApp(
  opts: {
    ip?: string
    hub?: ControlHub<ControlSnapshot>
    clients?: Array<ActiveClient>
    providerModels?: ReadonlyArray<ProviderCatalogueModel>
  } = {},
): ReturnType<typeof createControlRoutes> {
  return createControlRoutes({
    getRequestIp: () => opts.ip ?? "127.0.0.1",
    hub: opts.hub,
    // The real roster is a process-global tracker every authed request writes
    // to; injecting it keeps this file's assertions about what the route does,
    // not about what ran before it in the same worker.
    listClients: () => opts.clients ?? [],
    listProviderModels: () => Promise.resolve(opts.providerModels ?? []),
  })
}

describe("control route — loopback gate", () => {
  test("a non-loopback caller gets 404 on every path", async () => {
    const app = makeApp({ ip: "203.0.113.7" })
    expect((await app.request("/auth")).status).toBe(404)
    expect((await app.request("/events")).status).toBe(404)
    expect(
      (await app.request("/accounts/switch", { method: "POST" })).status,
    ).toBe(404)
  })
})

test("GET /models includes configured providers with discovered models", async () => {
  const res = await makeApp({
    providerModels: [
      {
        id: "mlx-community/Qwen3-8B",
        name: "Qwen 3 8B",
        provider: "local",
        providerName: "Local (oMLX)",
      },
    ],
  }).request("/models")

  expect(res.status).toBe(200)
  expect(await res.json()).toMatchObject({
    models: [
      {
        id: "mlx-community/Qwen3-8B",
        name: "Qwen 3 8B",
        vendor: "Local (oMLX)",
        type: "chat",
        context_window_tokens: null,
        max_output_tokens: null,
      },
    ],
  })
})

test("GET /models represents declared media generation capabilities", async () => {
  const res = await makeApp({
    providerModels: [
      {
        capabilities: ["image"],
        id: "x/z-image-turbo:latest",
        name: "x/z-image-turbo:latest",
        provider: "ollama",
        providerName: "Ollama",
      },
      {
        capabilities: ["video"],
        id: "example/video",
        name: "Example Video",
        provider: "ollama",
        providerName: "Ollama",
      },
    ],
  }).request("/models")

  expect(res.status).toBe(200)
  expect(await res.json()).toMatchObject({
    models: [
      {
        id: "x/z-image-turbo:latest",
        type: "image",
        context_window_tokens: null,
        max_output_tokens: null,
        capabilities: {
          image_generation: true,
          video_generation: false,
        },
      },
      {
        id: "example/video",
        type: "video",
        context_window_tokens: null,
        max_output_tokens: null,
        capabilities: {
          image_generation: false,
          video_generation: true,
        },
      },
    ],
  })
})

test("GET /models retains normalized Copilot evidence on the private control route", async () => {
  const model = copilotModelMetadataFixture[0]
  state.models = { data: [model], object: "list" }

  const response = await makeApp().request("/models")

  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({
    models: [
      {
        evidence: {
          access: {
            restricted_to: ["pro_plus", "business", "enterprise", "max"],
            state: "enabled",
            terms: "Enable access to Claude Opus 4.7.",
          },
          capabilities: {
            adaptive_thinking: true,
            max_thinking_budget: 32_000,
            min_thinking_budget: 1024,
            parallel_tool_calls: true,
            reasoning_effort: ["low", "medium", "high", "xhigh", "max"],
            streaming: true,
            structured_outputs: true,
            tool_calls: true,
            vision: true,
          },
          endpoints: ["/v1/messages", "/chat/completions"],
          lifecycle: {
            deprecation_date: "2026-10-02",
            info: model.info_messages,
            state: "pending-deprecation",
            warnings: model.warning_messages,
          },
          limits: {
            context_tokens: 1_000_000,
            input_tokens: 936_000,
            non_streaming_output_tokens: 16_000,
            output_tokens: 64_000,
            vision: {
              max_image_bytes: 3_145_728,
              max_images: 1,
              supported_media_types: [
                "image/jpeg",
                "image/png",
                "application/pdf",
              ],
            },
          },
          pricing: {
            default: {
              cache_read_amount: 50,
              cache_write_1h_amount: 1000,
              cache_write_amount: 625,
              input_amount: 500,
              max_input_tokens: 200_000,
              output_amount: 2500,
            },
            long_context: {
              max_input_tokens: 936_000,
            },
            unit: {
              currency: null,
              tokens_per_batch: 1_000_000,
            },
          },
          provider_details: {
            kind: "github-copilot",
            picker_category: "powerful",
            picker_price_category: "high",
            version: "claude-opus-4.7",
          },
          selection: {
            default: false,
            fallback: false,
            preview: false,
            selectable: true,
          },
        },
        id: "claude-opus-4.7",
        operations: ["messages", "chat-completions"],
        tokenizer: { id: "o200k_base" },
      },
    ],
  })
})

test("GET /models does not invent tokenizer evidence", async () => {
  const model = copilotModelMetadataFixture[0]
  state.models = {
    data: [
      {
        ...model,
        capabilities: {
          ...model.capabilities,
          tokenizer: undefined,
        },
      },
    ],
    object: "list",
  }

  const response = await makeApp().request("/models")

  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({
    models: [{ id: "claude-opus-4.7", tokenizer: null }],
  })
})

describe("control route — reads", () => {
  test("GET /auth returns the auth status", async () => {
    const res = await makeApp().request("/auth")
    expect(res.status).toBe(200)
    const body = (await res.json()) as { state: string }
    expect(typeof body.state).toBe("string")
  })

  test("GET /clients returns an empty roster with a total", async () => {
    const res = await makeApp().request("/clients")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ clients: [], total: 0 })
  })

  test("GET /clients totals the roster it is given", async () => {
    const roster: Array<ActiveClient> = [
      {
        key: "k1|Cline/0.5",
        label: "Cline",
        userAgent: "Cline/0.5",
        ageSeconds: 3,
      },
      {
        key: "k2|curl/8",
        label: "curl",
        userAgent: "curl/8",
        ageSeconds: 9,
      },
    ]
    const res = await makeApp({ clients: roster }).request("/clients")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ clients: roster, total: 2 })
  })

  test("GET /models returns a (possibly empty) catalog with a count", async () => {
    const res = await makeApp().request("/models")
    expect(res.status).toBe(200)
    const body = (await res.json()) as { count: number; models: Array<unknown> }
    expect(body.count).toBe(body.models.length)
  })

  test("GET /config and /usage are 200", async () => {
    const app = makeApp()
    expect((await app.request("/config")).status).toBe(200)
    expect((await app.request("/usage")).status).toBe(200)
  })
})

describe("control route — shell signals", () => {
  test("POST /quit is 409 with no supervising shell", async () => {
    const res = await makeApp().request("/quit", { method: "POST" })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      ok: false,
      reason: "no_supervising_shell",
    })
  })

  test("POST /upgrade is 409 with no supervising shell", async () => {
    const res = await makeApp().request("/upgrade", { method: "POST" })
    expect(res.status).toBe(409)
  })
})

describe("control route — actions", () => {
  test("POST /accounts/switch without a key is 400", async () => {
    const hub = new ControlHub<ControlSnapshot>({
      buildSnapshot: () =>
        Promise.resolve({ marker: "x" } as unknown as ControlSnapshot),
    })
    const res = await makeApp({ hub }).request("/accounts/switch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    })
    expect(res.status).toBe(400)
    hub.dispose()
  })

  test("POST /accounts/set-enabled validates and updates a saved account", async () => {
    await resetDefaultTestRegistry()
    let registry = addAndActivate(emptyRegistry(), makeTestAccount("alice"))
    registry = addAndActivate(registry, makeTestAccount("bob"))
    registry = setAccountEnabled(registry, testAccountKey("alice"), false)
    await writeDefaultRegistry(registry)
    const hub = new ControlHub<ControlSnapshot>({
      buildSnapshot: () =>
        Promise.resolve({ marker: "x" } as unknown as ControlSnapshot),
    })

    try {
      const invalid = await makeApp({ hub }).request("/accounts/set-enabled", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: testAccountKey("alice") }),
      })
      expect(invalid.status).toBe(400)

      const res = await makeApp({ hub }).request("/accounts/set-enabled", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key: testAccountKey("alice"),
          enabled: true,
        }),
      })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({
        ok: true,
        key: testAccountKey("alice"),
        enabled: true,
      })
      expect(
        (await readDefaultRegistry()).accounts[testAccountKey("alice")].enabled,
      ).toBe(true)
    } finally {
      hub.dispose()
      await resetDefaultTestRegistry()
    }
  })
})

describe("control route — SSE event stream", () => {
  test("GET /events opens an event-stream and sends the snapshot frame first", async () => {
    const hub = new ControlHub<ControlSnapshot>({
      buildSnapshot: () =>
        Promise.resolve({ marker: "snap-ok" } as unknown as ControlSnapshot),
    })
    const res = await makeApp({ hub }).request("/events")
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/event-stream")
    if (!res.body) throw new Error("expected a streaming body")

    const reader = (res.body as ReadableStream<Uint8Array>).getReader()
    const { value } = await reader.read()
    await reader.cancel()
    hub.dispose()
    const block = new TextDecoder().decode(value).trim()

    // v2: a JSON-RPC notification on the data line. No `id:` (nothing is
    // resumable) and no `event:` (the method names the topic).
    expect(block).not.toContain("id: 0")
    expect(block).toContain("snap-ok")

    const dataLine =
      block.split("\n").find((line) => line.startsWith("data:")) ?? ""
    const env: FrameEnvelope = frameEnvelopeSchema.parse(
      JSON.parse(dataLine.slice("data:".length).trim()),
    )
    expect(env.method).toBe("control/snapshot")
  })
})

describe("control route — auth flow", () => {
  test("POST /auth/cancel with no active flow returns the current status", async () => {
    const res = await makeApp().request("/auth/cancel", { method: "POST" })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { state: string }
    expect(typeof body.state).toBe("string")
  })

  test("POST /auth/sign-out is ok with no session", async () => {
    const res = await makeApp().request("/auth/sign-out", { method: "POST" })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  test("POST /auth/rearm returns an outcome + status with no credential", async () => {
    const res = await makeApp().request("/auth/rearm", { method: "POST" })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      outcome: unknown
      status: { state: string }
    }
    expect(body.outcome).toBeDefined()
    expect(typeof body.status.state).toBe("string")
  })

  test("GET /update-status is 200", async () => {
    expect((await makeApp().request("/update-status")).status).toBe(200)
  })
})

describe("control route — settings endpoints", () => {
  test("api-keys create → list → delete round-trips", async () => {
    const app = makeApp()
    const created = await app.request("/api-keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: "test-key", key: "testkey123" }),
    })
    expect(created.status).toBe(201)
    const entry = (await created.json()) as { id: string; key: string }
    expect(entry.key).toBe("testkey123")

    const list = (await (await app.request("/api-keys")).json()) as {
      entries: Array<{ id: string }>
    }
    expect(list.entries.some((e) => e.id === entry.id)).toBe(true)

    const del = await app.request(`/api-keys/${entry.id}`, { method: "DELETE" })
    expect(del.status).toBe(204)
  })

  test("GET /diagnostics returns version + token presence", async () => {
    const res = await makeApp().request("/diagnostics")
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      version: string
      tokens: { github_token_present: boolean }
    }
    expect(typeof body.version).toBe("string")
    expect(typeof body.tokens.github_token_present).toBe("boolean")
  })
})
