import assert from "node:assert/strict"
import test from "node:test"

import {
  projectProviderModelExecutionTarget,
  type ModelEvidenceProvenance,
  type ModelOperationAdapterReference,
  type ProviderModelDescriptor,
  type ProviderModelTargetBinding,
} from "../src/index.ts"

const provenance: ModelEvidenceProvenance = {
  method: "discovered",
  observedAt: "2026-09-30T12:00:00.000Z",
  source: "provider",
  sourceId: "ollama-local",
}

const intrinsicProvenance: ModelEvidenceProvenance = {
  method: "declared",
  revision: "catalog-2026-09-30",
  source: "catalog",
  sourceId: "models.dev",
}

const adapters: ReadonlyArray<ModelOperationAdapterReference> = [
  { id: "ollama-systemone", operation: "systemone" },
  { id: "ollama-embeddings", operation: "embeddings" },
]

function binding(
  overrides: Partial<ProviderModelTargetBinding> = {},
): ProviderModelTargetBinding {
  return {
    adapters,
    endpoint: {
      id: "ollama-loopback",
      url: "http://ollama.test",
    },
    id: "ollama-loopback/nimble",
    intrinsicLimits: { contextTokens: 262_144 },
    intrinsicLimitsProvenance: intrinsicProvenance,
    location: "device",
    provenance,
    runner: {
      id: "ollama",
      kind: "external-local",
      name: "Ollama",
    },
    ...overrides,
  }
}

void test("provider models project to explicit immutable execution targets", () => {
  const descriptor: ProviderModelDescriptor = {
    capabilities: ["decision"],
    enabled: true,
    evidence: {
      capabilities: { streaming: false },
      endpoints: ["/v1/systemone", "/v1/embeddings"],
      limits: {
        contextTokens: 2_050,
        outputTokens: 64,
      },
    },
    id: "nimble:latest",
    name: "Nimble",
    operations: ["systemone", "embeddings"],
    provider: "ollama",
    providerName: "Ollama",
    tokenizer: { id: "llama" },
  }

  const target = projectProviderModelExecutionTarget(
    descriptor,
    binding({
      accountId: "local-user",
      lifecycle: { state: "running" },
    }),
  )

  assert.equal(target.modelId, "nimble:latest")
  assert.equal(target.providerAccount.accountId, "local-user")
  assert.equal(target.runner.id, "ollama")
  assert.deepEqual(target.evidence.limits, {
    effective: { contextTokens: 2_050, outputTokens: 64 },
    effectiveProvenance: provenance,
    intrinsic: { contextTokens: 262_144 },
    intrinsicProvenance,
  })
  assert.equal(target.evidence.tokenizer?.tokenizer.id, "llama")
  assert.ok(Object.isFrozen(target))
  assert.ok(Object.isFrozen(target.adapters))
  assert.ok(Object.isFrozen(target.evidence.limits))
  assert.ok(Object.isFrozen(target.evidence.tokenizer))
})

void test("provider limits remain effective and preserve null evidence", () => {
  const target = projectProviderModelExecutionTarget(
    {
      contextWindowTokens: 262_144,
      evidence: {
        limits: {
          contextTokens: null,
          outputTokens: 0,
        },
      },
      id: "observed",
      maxOutputTokens: 8_192,
      name: "Observed",
      operations: ["systemone"],
      provider: "provider",
      providerName: "Provider",
    },
    binding({
      adapters: [{ id: "systemone", operation: "systemone" }],
      intrinsicLimits: undefined,
    }),
  )

  assert.deepEqual(target.evidence.limits, {
    effective: {
      contextTokens: null,
      outputTokens: 0,
    },
    effectiveProvenance: provenance,
    intrinsic: undefined,
    intrinsicProvenance: undefined,
  })
})

void test("legacy provider limits never become intrinsic limits", () => {
  const target = projectProviderModelExecutionTarget(
    {
      contextWindowTokens: 4_096,
      id: "legacy",
      maxOutputTokens: 1_024,
      name: "Legacy",
      provider: "provider",
      providerName: "Provider",
    },
    binding({ adapters: [] }),
  )

  assert.deepEqual(target.evidence.limits, {
    effective: {
      contextTokens: 4_096,
      outputTokens: 1_024,
    },
    effectiveProvenance: provenance,
    intrinsic: { contextTokens: 262_144 },
    intrinsicProvenance,
  })
})

void test("missing enabled state remains unknown availability", () => {
  const target = projectProviderModelExecutionTarget(
    {
      id: "unknown-health",
      name: "Unknown Health",
      provider: "provider",
      providerName: "Provider",
    },
    binding({ adapters: [], intrinsicLimits: undefined }),
  )

  assert.equal(target.availability.state, "unknown")
})

void test("projection requires intrinsic provenance and credential-free endpoints", () => {
  const descriptor: ProviderModelDescriptor = {
    id: "nimble",
    name: "Nimble",
    provider: "ollama",
    providerName: "Ollama",
  }

  assert.throws(
    () =>
      projectProviderModelExecutionTarget(
        descriptor,
        binding({ intrinsicLimitsProvenance: undefined }),
      ),
    /intrinsic limits require their own provenance/u,
  )
  assert.throws(
    () =>
      projectProviderModelExecutionTarget(
        descriptor,
        binding({
          endpoint: {
            id: "credentialed",
            url: "http://user:secret@ollama.test",
          },
        }),
      ),
    /must not contain credentials/u,
  )
})

void test("compatibility projection rejects incomplete adapter bindings", () => {
  const descriptor: ProviderModelDescriptor = {
    id: "nimble",
    name: "Nimble",
    operations: ["systemone", "embeddings"],
    provider: "ollama",
    providerName: "Ollama",
  }

  assert.throws(
    () =>
      projectProviderModelExecutionTarget(
        descriptor,
        binding({
          adapters: [{ id: "ollama-systemone", operation: "systemone" }],
        }),
      ),
    /must bind every advertised operation exactly once/u,
  )
  assert.throws(
    () =>
      projectProviderModelExecutionTarget(
        descriptor,
        binding({
          adapters: [
            { id: "first", operation: "systemone" },
            { id: "second", operation: "systemone" },
          ],
        }),
      ),
    /duplicate operation adapters/u,
  )
})
