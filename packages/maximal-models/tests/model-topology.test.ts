import type { ModelExecutionTarget } from "@maximal/maximal-model-contract"

import assert from "node:assert/strict"
import test from "node:test"

import { ModelTopologyRegistry } from "../src/model-topology.ts"

function target(id = "ollama-default:nimble"): ModelExecutionTarget {
  const provenance = {
    method: "discovered" as const,
    source: "provider" as const,
    sourceId: "ollama",
  }
  return {
    adapters: [{ id: "ollama-http", operation: "systemone" }],
    availability: { state: "available" },
    endpoint: {
      id: "ollama-default",
      url: "http://ollama.test",
    },
    evidence: {
      limits: {
        effective: { contextTokens: 8_194 },
        effectiveProvenance: provenance,
        intrinsic: { contextTokens: 262_144 },
        intrinsicProvenance: {
          method: "declared",
          source: "catalog",
          sourceId: "catalog",
        },
      },
      provenance,
      tokenizer: {
        provenance,
        tokenizer: { id: "llama" },
      },
    },
    id,
    lifecycle: { state: "running" },
    location: "device",
    modelId: "nimble",
    providerAccount: {
      provider: "ollama",
      providerName: "Ollama",
    },
    runner: {
      id: "ollama",
      kind: "external-local",
      name: "Ollama",
    },
  }
}

void test("topology registrations publish immutable revisioned snapshots", () => {
  const registry = new ModelTopologyRegistry()
  const revisions: Array<number> = []
  registry.subscribe(({ revision }) => revisions.push(revision))
  registry.registerTarget(target())

  const snapshot = registry.snapshot()
  assert.deepEqual(revisions, [0, 1])
  assert.equal(snapshot.targets[0]?.evidence.tokenizer?.tokenizer.id, "llama")
  assert.throws(() => (snapshot.targets as Array<unknown>).pop(), TypeError)
  assert.throws(
    () =>
      ((
        snapshot.targets[0]?.evidence.limits.effective as {
          contextTokens?: number
        }
      ).contextTokens = 1),
    TypeError,
  )
})

void test("topology rejects duplicate targets and operation adapters", () => {
  const registry = new ModelTopologyRegistry()
  registry.registerTarget(target())
  assert.throws(() => registry.registerTarget(target()), /already registered/u)

  assert.throws(
    () =>
      registry.registerTarget({
        ...target("duplicate-adapter"),
        adapters: [
          { id: "first", operation: "systemone" },
          { id: "second", operation: "systemone" },
        ],
      }),
    /duplicate operation adapters/u,
  )
})

void test("registration lifetimes withdraw execution targets", () => {
  const registry = new ModelTopologyRegistry()
  const lifetime = new AbortController()
  registry.registerTarget(target(), lifetime.signal)
  assert.equal(registry.snapshot().targets.length, 1)

  lifetime.abort()
  assert.deepEqual(registry.snapshot().targets, [])
})
