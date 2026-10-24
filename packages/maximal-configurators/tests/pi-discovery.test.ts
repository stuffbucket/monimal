import type { MaximalModelListEntry } from "@maximal/maximal-core-contract/control"

import { MaximalModelList } from "@maximal/maximal-core-contract/control"
import assert from "node:assert/strict"
import test from "node:test"

import { discoverPiModels } from "../src/pi/catalog.ts"
import { PiDiscoveryConfigSchema } from "../src/pi/config.ts"
import { piProviderId, projectPiModels } from "../src/pi/projection.ts"

const cost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
const config = () =>
  PiDiscoveryConfigSchema.parse({
    schemaVersion: 1,
    origin: "https://proxy.example.test",
    apiKeyEnv: "MAXIMAL_TEST_KEY",
    overrides: ["perun", "domovyk"].map((provider) => ({
      source: "provider",
      provider,
      cost,
    })),
  })
const entry = (provider = "perun"): MaximalModelListEntry => ({
  source: "provider",
  provider,
  providerName: provider,
  id: "served-alias",
  name: "Model",
  basePath: `/${provider}/v1`,
  operations: ["messages"],
  contextWindowTokens: 32768,
  maxOutputTokens: 4096,
  capabilities: { vision: null, tools: null, reasoning: null },
  targets: [],
})
const catalog = (data: Array<MaximalModelListEntry>) =>
  MaximalModelList.parse({ schemaVersion: 1, data })

await test("same served IDs retain source/provider identity and protocol-specific SDK base URLs", () => {
  const projection = projectPiModels(
    catalog([entry(), { ...entry("domovyk"), operations: ["responses"] }]),
    config(),
  )
  assert.deepEqual(
    projection.providers.map(({ id }) => id),
    ["maximal-provider-perun", "maximal-provider-domovyk"],
  )
  assert.equal(projection.providers[0]?.models[0]?.id, "served-alias")
  assert.equal(
    projection.providers[0]?.models[0]?.baseUrl,
    "https://proxy.example.test/perun",
  )
  assert.equal(
    projection.providers[1]?.models[0]?.baseUrl,
    "https://proxy.example.test/domovyk/v1",
  )
  assert.equal(projection.providers[1]?.models[0]?.api, "openai-responses")
  assert.notEqual(
    piProviderId(entry()),
    piProviderId({ ...entry(), source: "local" }),
  )
})

await test("unknown limits and pricing remain skipped instead of using Pi defaults", () => {
  const reviewed = config()
  assert.equal(
    projectPiModels(catalog([{ ...entry(), maxOutputTokens: null }]), reviewed)
      .providers.length,
    0,
  )
  assert.equal(
    projectPiModels(catalog([entry()]), { ...reviewed, overrides: [] })
      .providers.length,
    0,
  )
  reviewed.overrides.push({
    source: "provider",
    provider: "perun",
    id: "served-alias",
    maxOutputTokens: 2048,
  })
  const projected = projectPiModels(
    catalog([{ ...entry(), maxOutputTokens: null }]),
    reviewed,
  )
  assert.equal(projected.providers[0]?.models[0]?.maxTokens, 2048)
  assert.deepEqual(projected.providers[0]?.models[0]?.cost, cost)
})

await test("overrides cannot create models, change routes, or turn classifiers into chat", () => {
  const reviewed = config()
  reviewed.overrides.push({
    source: "provider",
    provider: "ghost",
    id: "invented",
    contextWindowTokens: 4096,
    maxOutputTokens: 1024,
    cost,
  })
  assert.deepEqual(projectPiModels(catalog([]), reviewed).providers, [])
  for (const model of [
    { ...entry(), id: "unsafe\u001b[31m" },
    { ...entry(), name: "unsafe\u0000name" },
    { ...entry(), basePath: null },
    { ...entry(), basePath: "/different/v1" },
    {
      ...entry(),
      operations: ["systemone"] satisfies MaximalModelListEntry["operations"],
    },
    { ...entry(), maxOutputTokens: 64000 },
  ])
    assert.equal(
      projectPiModels(catalog([model]), reviewed).providers.length,
      0,
    )
  assert.throws(
    () => projectPiModels(catalog([entry(), entry()]), reviewed),
    /duplicate offering/u,
  )
})

await test("unknown capabilities do not enable image input or reasoning", () => {
  const unknown = projectPiModels(catalog([entry()]), config()).providers[0]
    ?.models[0]
  assert.deepEqual(unknown.input, ["text"])
  assert.equal(unknown.reasoning, false)
  const known = projectPiModels(
    catalog([
      {
        ...entry(),
        capabilities: { vision: true, tools: true, reasoning: true },
      },
    ]),
    config(),
  ).providers[0]?.models[0]
  assert.deepEqual(known.input, ["text", "image"])
  assert.equal(known.reasoning, true)
})

await test("invalid destinations, inline credentials, duplicate overrides, and executable inputs fail validation", () => {
  for (const origin of [
    "http://remote.example.test",
    "https://user:secret@proxy.example.test",
    "https://proxy.example.test?key=secret",
    "file:///private/config",
    "not-a-url",
  ]) {
    assert.equal(
      PiDiscoveryConfigSchema.safeParse({ ...config(), origin }).success,
      false,
    )
  }
  assert.equal(
    PiDiscoveryConfigSchema.safeParse({ ...config(), apiKeyEnv: null }).success,
    false,
  )
  assert.equal(
    PiDiscoveryConfigSchema.safeParse({ ...config(), apiKeyEnv: "!get-a-key" })
      .success,
    false,
  )
  assert.equal(
    PiDiscoveryConfigSchema.safeParse({ ...config(), apiKey: "do-not-store" })
      .success,
    false,
  )
  assert.equal(
    PiDiscoveryConfigSchema.safeParse({
      ...config(),
      overrides: [config().overrides[0], config().overrides[0]],
    }).success,
    false,
  )
  assert.equal(
    PiDiscoveryConfigSchema.safeParse({
      ...config(),
      overrides: [
        {
          source: "provider",
          provider: "perun",
          cost: { ...cost, output: Infinity },
        },
      ],
    }).success,
    false,
  )
})

await test("metadata fetch sends only the explicit proxy credential and refuses redirects", async () => {
  let calls = 0
  const environment = {
    MAXIMAL_TEST_KEY: "test-proxy-key",
    ANTHROPIC_API_KEY: "never-forward",
  }
  const fetchImplementation: typeof fetch = (input, init) => {
    calls++
    assert.equal(
      input instanceof Request ? input.url : input.toString(),
      "https://proxy.example.test/v1/models?format=maximal",
    )
    assert.equal(init?.method, "GET")
    assert.equal(init.redirect, "error")
    assert.equal(init.body, undefined)
    const headers = new Headers(init.headers)
    assert.deepEqual(
      [...headers],
      [
        ["accept", "application/json"],
        ["authorization", "Bearer test-proxy-key"],
      ],
    )
    return Promise.resolve(Response.json(catalog([entry()])))
  }
  const result = await discoverPiModels(config(), {
    environment,
    fetchImplementation,
  })
  assert.equal(result.providers.length, 1)
  assert.equal(calls, 1)
})

await test("unavailable, malformed, oversized, and unsupported responses cannot leak response text or fall back", async () => {
  for (const response of [
    new Response("secret-response", { status: 401 }),
    new Response("secret-response", {
      status: 302,
      headers: { location: "https://other.example.test" },
    }),
    Response.json({ schemaVersion: 999, data: [], apiKey: "secret-response" }),
    new Response("secret-response-not-json"),
    new Response("secret-response".repeat(200_000)),
  ]) {
    await assert.rejects(
      discoverPiModels(config(), {
        environment: { MAXIMAL_TEST_KEY: "test-key" },
        fetchImplementation: () => Promise.resolve(response),
      }),
      (error: unknown) =>
        error instanceof Error
        && error.message.includes("model discovery failed")
        && !error.message.includes("secret-response"),
    )
  }
})

await test("missing credentials and cancellation stop before I/O", async () => {
  let calls = 0
  const fetchImplementation: typeof fetch = () => {
    calls++
    return Promise.resolve(Response.json(catalog([])))
  }
  await assert.rejects(
    discoverPiModels(config(), { environment: {}, fetchImplementation }),
    /missing or invalid/u,
  )
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    discoverPiModels(config(), {
      environment: { MAXIMAL_TEST_KEY: "test-key" },
      fetchImplementation,
      signal: controller.signal,
    }),
    /cancelled/u,
  )
  assert.equal(calls, 0)
})
