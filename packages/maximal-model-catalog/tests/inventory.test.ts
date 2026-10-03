import assert from "node:assert/strict"
import test from "node:test"

import {
  createModelCatalogIndex,
  MAXIMAL_GLINER25_PROVIDER_ID,
  MAXIMAL_MODEL_CATALOG,
  normalizeProviderId,
  providerDisplayName,
  reconcileModelInventory,
  type RuntimeModelObservation,
} from "../src/index.ts"

void test("preserves runtime tokenizer and operations", () => {
  const index = createModelCatalogIndex(catalogFixture())
  const inventory = reconcileModelInventory(index, [
    {
      id: "claude-sonnet",
      name: "Runtime Claude",
      kind: "chat",
      location: "cloud",
      provider: { id: "anthropic", name: "Anthropic Runtime" },
      tokenizer: { id: "o200k_base" },
      operations: ["messages", "responses"],
      limits: { contextTokens: 200_000 },
      features: { toolCalls: false, vision: true },
      evidence: {
        lifecycle: {
          deprecationDate: "2026-10-02",
          info: [
            {
              code: "model_pending_deprecation",
              message: "Planned deprecation date: 2026-10-02.",
            },
          ],
          state: "pending-deprecation",
          warnings: [],
        },
        pricing: {
          default: { inputAmount: 500, outputAmount: 2500 },
          longContext: {
            inputAmount: 500,
            maxInputTokens: 936_000,
            outputAmount: 2500,
          },
          unit: { currency: null, tokensPerBatch: 1_000_000 },
        },
        selection: { default: true, selectable: true },
      },
    },
  ])

  const model = inventory.models[0]
  assert.ok(model)
  assert.deepEqual(model.tokenizer, { id: "o200k_base" })
  assert.deepEqual(model.operations, ["messages", "responses"])
  assert.equal(model.lifecycle.source, "runtime")
  assert.equal(model.lifecycle.value?.deprecationDate, "2026-10-02")
  assert.deepEqual(model.pricing, {
    source: "runtime",
    value: {
      default: { inputAmount: 500, outputAmount: 2500 },
      longContext: {
        inputAmount: 500,
        maxInputTokens: 936_000,
        outputAmount: 2500,
      },
      unit: { currency: null, tokensPerBatch: 1_000_000 },
    },
  })

  void test("reconciles the GLiNER runner offering with its canonical model", () => {
    const inventory = reconcileModelInventory(MAXIMAL_MODEL_CATALOG, [
      {
        id: "gliner25:340m",
        name: "Runtime GLiNER",
        kind: "classification",
        location: "local",
        provider: {
          id: MAXIMAL_GLINER25_PROVIDER_ID,
          name: "Local GLiNER2.5",
        },
        operations: ["systemone"],
        features: { structuredOutput: true },
      },
    ])

    const model = inventory.models[0]
    assert.ok(model)
    assert.equal(model.canonicalModelId, "fastino/GLiNER2.5-Decide")
    assert.equal(model.catalog.canonical?.license, "Apache-2.0")
    assert.equal(model.catalog.offering?.status, "active")
    assert.deepEqual(model.operations, ["systemone"])
  })

  assert.deepEqual(model.selection, {
    source: "runtime",
    value: { default: true, selectable: true },
  })
})

void test("retains malformed runtime evidence while resolving usable catalog limits", () => {
  const inventory = reconcileModelInventory(
    createModelCatalogIndex(catalogFixture()),
    [
      {
        id: "claude-sonnet",
        name: "Runtime Claude",
        kind: "chat",
        location: "cloud",
        provider: { id: "anthropic", name: "Anthropic" },
        evidence: {
          capabilities: {
            maxThinkingBudget: null,
            minThinkingBudget: null,
          },
          limits: {
            contextTokens: null,
            inputTokens: null,
            outputTokens: null,
          },
          pricing: {
            default: { maxInputTokens: null },
            unit: { currency: null, tokensPerBatch: null },
          },
        },
      },
    ],
  )
  const model = inventory.models[0]

  assert.ok(model)
  assert.deepEqual(model.evidence?.limits, {
    contextTokens: null,
    inputTokens: null,
    outputTokens: null,
  })
  assert.deepEqual(model.limits.contextTokens, {
    source: "provider-catalog",
    value: 500_000,
  })
  assert.deepEqual(model.limits.outputTokens, {
    source: "provider-catalog",
    value: 64_000,
  })
  assert.deepEqual(model.pricing, {
    source: "runtime",
    value: {
      default: { maxInputTokens: null },
      unit: { currency: null, tokensPerBatch: null },
    },
  })
})
import { catalogFixture } from "./fixtures.ts"

void test("normalizes routing provider identities", () => {
  assert.equal(normalizeProviderId(" Ollama-Cloud "), "ollama")
  assert.equal(normalizeProviderId("GitHub Models"), "github-copilot")
  assert.equal(providerDisplayName("ollama", "ignored"), "Ollama")
  assert.equal(providerDisplayName("anthropic", "Anthropic"), "Anthropic")
})

void test("keeps runtime authority separate while enriching descriptive data", () => {
  const index = createModelCatalogIndex(catalogFixture())
  const inventory = reconcileModelInventory(index, [
    {
      id: "claude-sonnet",
      name: "Runtime Claude",
      kind: "chat",
      location: "cloud",
      provider: { id: "anthropic", name: "Anthropic Runtime" },
      limits: { contextTokens: 200_000 },
      features: { toolCalls: false, vision: true },
    },
  ])
  const model = inventory.models[0]

  assert.ok(model)
  assert.equal(model.name, "Runtime Claude")
  assert.deepEqual(model.family, {
    source: "canonical-catalog",
    value: "claude",
  })
  assert.deepEqual(model.limits.contextTokens, {
    source: "runtime",
    value: 200_000,
  })
  assert.deepEqual(model.limits.outputTokens, {
    source: "provider-catalog",
    value: 64_000,
  })
  assert.deepEqual(model.features.toolCalls, {
    runtime: false,
    catalog: "supported",
  })
  assert.deepEqual(model.features.vision, {
    runtime: true,
    catalog: "supported",
  })
  assert.deepEqual(model.lifecycle, {
    source: "provider-catalog",
    value: { info: [], state: "active", warnings: [] },
  })
  assert.deepEqual(model.pricing, {
    source: "provider-catalog",
    value: {
      default: {
        cacheReadAmount: 0.3,
        cacheWriteAmount: 3.75,
        inputAmount: 3,
        outputAmount: 15,
      },
      unit: { currency: "USD", tokensPerBatch: 1_000_000 },
    },
  })
  assert.equal(model.canonicalModelId, "anthropic/claude-sonnet")
})

void test("rationalizes local and cloud models into provider inventory", () => {
  const observations: Array<RuntimeModelObservation> = [
    {
      id: "cloud-model",
      name: "Cloud model",
      kind: "chat",
      location: "cloud",
      provider: { id: "ollama-cloud", name: "Ollama Cloud" },
    },
    {
      id: "local-model",
      instanceId: "local-model-q8",
      name: "Local model",
      kind: "chat",
      location: "local",
      provider: { id: "ollama", name: "Local Ollama" },
    },
    {
      id: "bundled-model",
      name: "Bundled model",
      kind: "chat",
      location: "local",
      provider: { id: "maximal-local", name: "Maximal" },
    },
  ]
  const inventory = reconcileModelInventory(null, observations)

  assert.deepEqual(inventory.providers, [
    {
      id: "maximal-local",
      name: "Maximal",
      locations: ["local"],
      modelCount: 1,
    },
    {
      id: "ollama",
      name: "Ollama",
      locations: ["cloud", "local"],
      modelCount: 2,
    },
  ])
})

void test("rejects duplicate runtime identities", () => {
  const observation: RuntimeModelObservation = {
    id: "duplicate",
    name: "Duplicate",
    kind: "chat",
    location: "cloud",
    provider: { id: "anthropic", name: "Anthropic" },
  }
  assert.throws(
    () => reconcileModelInventory(null, [observation, observation]),
    /Duplicate observed model key/u,
  )
})
