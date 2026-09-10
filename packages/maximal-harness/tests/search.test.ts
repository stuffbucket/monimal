import assert from "node:assert/strict"
import { test } from "vitest"

import {
  createSearchConnector,
  isTransientProviderFailure,
  type SearchProvider,
  type SearchResult,
} from "../src/search.js"
import {
  copilotSearchProvider,
  DEFAULT_COPILOT_SEARCH_MODEL,
} from "../src/search/providers/copilot.js"
import { duckDuckGoSearchProvider } from "../src/search/providers/duckduckgo.js"
import { ollamaSearchProvider } from "../src/search/providers/ollama.js"

function provider(
  id: string,
  calls: Array<string>,
  result: SearchResult,
): SearchProvider {
  return {
    id,
    label: id,
    capabilities: ["search"],
    create: () => ({
      search: () => {
        calls.push(id)
        return Promise.resolve(result)
      },
    }),
  }
}

void test("uses configured priority and falls back after transient errors", async () => {
  const calls: Array<string> = []
  const connector = createSearchConnector(
    [
      provider("first", calls, { ok: false, code: "unavailable" }),
      provider("second", calls, {
        ok: true,
        items: [{ url: "https://example.com/result", title: "Result" }],
      }),
    ],
    { priority: ["first", "second"] },
  )

  assert.deepEqual(await connector.search("query"), {
    ok: true,
    items: [{ url: "https://example.com/result", title: "Result" }],
  })
  assert.deepEqual(calls, ["first", "second"])
})

void test("does not fall back after a request error", async () => {
  const calls: Array<string> = []
  const connector = createSearchConnector(
    [
      provider("first", calls, { ok: false, code: "invalid_input" }),
      provider("second", calls, { ok: true, items: [] }),
    ],
    { priority: ["first", "second"] },
  )

  assert.deepEqual(await connector.search("query"), {
    ok: false,
    code: "invalid_input",
  })
  assert.deepEqual(calls, ["first"])
})

void test("defines unavailable and rate limiting as transient failures", () => {
  assert.equal(isTransientProviderFailure("unavailable"), true)
  assert.equal(isTransientProviderFailure("too_many_requests"), true)
  assert.equal(isTransientProviderFailure("invalid_input"), false)
  assert.equal(isTransientProviderFailure("query_too_long"), false)
})

void test("cools down transient failures and then restores provider priority", async () => {
  const calls: Array<string> = []
  let now = 1_000
  let primaryResult: SearchResult = { ok: false, code: "unavailable" }
  const connector = createSearchConnector(
    [
      {
        id: "primary",
        label: "Primary",
        capabilities: ["search"],
        create: () => ({
          search: () => {
            calls.push("primary")
            return Promise.resolve(primaryResult)
          },
        }),
      },
      provider("fallback", calls, { ok: true, items: [] }),
    ],
    { priority: ["primary", "fallback"] },
    { now: () => now },
  )

  await connector.search("first")
  await connector.search("during cooldown")
  assert.deepEqual(calls, ["primary", "fallback", "fallback"])

  now += 30_000
  primaryResult = { ok: true, items: [] }
  await connector.search("after cooldown")
  assert.deepEqual(calls, ["primary", "fallback", "fallback", "primary"])
})

void test("applies configured domain and result limits", async () => {
  const calls: Array<string> = []
  const connector = createSearchConnector(
    [
      provider("search", calls, {
        ok: true,
        items: [
          { url: "https://docs.example.com/one", title: "One" },
          { url: "https://example.com/two", title: "Two" },
          { url: "https://elsewhere.test/three", title: "Three" },
        ],
      }),
    ],
    {
      defaults: { allowedDomains: ["example.com"], maxResults: 1 },
    },
  )

  assert.deepEqual(await connector.search("query"), {
    ok: true,
    items: [{ url: "https://docs.example.com/one", title: "One" }],
  })
})

void test("intersects configured and request domain allow-lists", async () => {
  const calls: Array<string> = []
  const connector = createSearchConnector(
    [
      provider("search", calls, {
        ok: true,
        items: [
          { url: "https://docs.example.com/one", title: "One" },
          { url: "https://blog.example.com/two", title: "Two" },
        ],
      }),
    ],
    { defaults: { allowedDomains: ["example.com"] } },
  )

  assert.deepEqual(
    await connector.search("query", {
      allowedDomains: ["docs.example.com"],
    }),
    {
      ok: true,
      items: [{ url: "https://docs.example.com/one", title: "One" }],
    },
  )
})

void test("keeps all results when no maximum is configured", async () => {
  const calls: Array<string> = []
  const items = [
    { url: "https://example.com/one", title: "One" },
    { url: "https://example.com/two", title: "Two" },
  ]
  const connector = createSearchConnector([
    provider("search", calls, { ok: true, items }),
  ])

  assert.deepEqual(await connector.search("query"), { ok: true, items })
})

void test("rejects duplicate provider ids", () => {
  const calls: Array<string> = []
  assert.throws(
    () =>
      createSearchConnector([
        provider("same", calls, { ok: true, items: [] }),
        provider("same", calls, { ok: true, items: [] }),
      ]),
    /duplicate search provider/u,
  )
})

void test("keeps one provider instance across search and fetch", async () => {
  let creations = 0
  const connector = createSearchConnector([
    {
      id: "stateful",
      label: "Stateful",
      capabilities: ["search", "fetch"],
      create: () => {
        creations += 1
        return {
          search: () => Promise.resolve({ ok: true, items: [] }),
          fetch: () => Promise.resolve({ ok: true, markdown: "cached" }),
        }
      },
    },
  ])

  await connector.search("query")
  await connector.fetch("https://example.com")

  assert.equal(creations, 1)
})

void test("binds provider descriptor defaults with configured overrides", async () => {
  let settings: Readonly<Record<string, unknown>> | undefined
  const connector = createSearchConnector(
    [
      {
        id: "configured",
        label: "Configured",
        capabilities: ["search"],
        settings: [
          {
            key: "timeoutMs",
            type: "integer",
            label: "Timeout (s)",
            default: 300_000,
          },
          {
            key: "maxResults",
            type: "integer",
            label: "Provider result limit",
            default: 5,
          },
        ],
        create: (boundSettings) => {
          settings = boundSettings
          return { search: () => Promise.resolve({ ok: true, items: [] }) }
        },
      },
    ],
    {
      providers: {
        configured: { settings: { maxResults: 8 } },
      },
    },
  )

  await connector.search("query")

  assert.deepEqual(settings, { timeoutMs: 300_000, maxResults: 8 })
})

void test("describes the Copilot broker model as a model-backed select", () => {
  const provider = copilotSearchProvider(
    () => ({}),
    [
      { label: "GPT-5 mini", value: "gpt-5-mini" },
      { label: "GPT-5.6 Sol", value: "gpt-5.6-sol" },
    ],
  )
  const model = provider.settings?.find((field) => field.key === "model")

  assert.deepEqual(model, {
    key: "model",
    type: "select",
    label: "Broker model",
    description: "Model used to broker search through Copilot Responses.",
    default: DEFAULT_COPILOT_SEARCH_MODEL,
    options: [
      { label: "GPT-5 mini", value: "gpt-5-mini" },
      { label: "GPT-5.6 Sol", value: "gpt-5.6-sol" },
    ],
  })
})

void test("describes provider URL and timeout controls for the settings UI", () => {
  const ollama = ollamaSearchProvider(() => ({}))
  const duckDuckGo = duckDuckGoSearchProvider(() => ({}))
  assert.ok(ollama.settings)
  assert.ok(duckDuckGo.settings)

  assert.deepEqual(
    ollama.settings.map((field) => field.key),
    ["apiKey", "baseUrl", "timeoutMs", "maxResults"],
  )
  assert.deepEqual(
    ollama.settings.find(({ key }) => key === "apiKey"),
    {
      key: "apiKey",
      type: "secret",
      label: "API key",
      description: "Overrides OLLAMA_API_KEY when set.",
      required: true,
      layout: "full",
      emptyDescription: "Enter an Ollama API key or set OLLAMA_API_KEY.",
    },
  )
  for (const settings of [ollama.settings, duckDuckGo.settings]) {
    const timeout = settings.find(({ key }) => key === "timeoutMs")
    assert.ok(timeout)
    assert.equal(timeout.label, "Timeout (s)")
    assert.equal(timeout.default, 300_000)
    assert.equal(timeout.unit, "seconds")
    assert.equal(timeout.emptyDescription, "Uses 300 seconds when empty.")
  }
  assert.equal(
    duckDuckGo.settings.find(({ key }) => key === "searchUrl")?.layout,
    "full",
  )
})
