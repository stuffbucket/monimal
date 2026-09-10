import assert from "node:assert/strict"
import { test } from "vitest"

import {
  createSearchConnector,
  type SearchProvider,
  type SearchResult,
} from "../src/search.js"
import {
  copilotSearchProvider,
  DEFAULT_COPILOT_SEARCH_MODEL,
} from "../src/search/providers/copilot.js"

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
