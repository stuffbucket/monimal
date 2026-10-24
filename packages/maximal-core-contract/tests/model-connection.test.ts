import assert from "node:assert/strict"
import test from "node:test"

import {
  ModelConnectionActionSchema,
  ModelConnectionEndpointSchema,
  ModelConnectionSnapshotSchema,
} from "../src/control.ts"

const selection = {
  discoveryId: "discovery-1",
  endpointId: "endpoint-1",
  runtimeId: "vllm",
  modelIds: ["served-alias"],
  location: "lan",
  credentialId: "credential-reference",
}

const action = {
  action: "connect",
  id: "review-1",
  digest: `sha256:${"a".repeat(64)}`,
}

await test("review selection and subsequent actions cannot smuggle approval, code, bindings, or secrets", () => {
  assert(
    ModelConnectionActionSchema.safeParse({ action: "review", selection })
      .success,
  )
  assert(ModelConnectionActionSchema.safeParse(action).success)
  for (const field of [
    "approved",
    "apiKey",
    "command",
    "binding",
    "settingsPatch",
  ]) {
    assert(
      !ModelConnectionActionSchema.safeParse({
        ...action,
        [field]: "untrusted",
      }).success,
    )
  }
  for (const modelIds of [
    [],
    ["same", "same"],
    Array.from({ length: 129 }, (_, i) => `id-${i}`),
  ]) {
    assert(
      !ModelConnectionActionSchema.safeParse({
        action: "review",
        selection: { ...selection, modelIds },
      }).success,
    )
  }
  assert(
    !ModelConnectionActionSchema.safeParse({
      action: "review",
      selection: { ...selection, location: "unknown" },
    }).success,
  )
  assert(
    !ModelConnectionActionSchema.safeParse({ ...action, digest: "old-review" })
      .success,
  )
})

const endpoint = (url: string) =>
  ModelConnectionEndpointSchema.safeParse({ id: "endpoint-1", url })

await test("connection destinations are root HTTP(S) URLs, never credential-bearing or executable values", () => {
  assert(endpoint("https://deployment.example.test").success)
  for (const url of [
    "https://user:secret@deployment.example.test",
    "https://deployment.example.test?api_key=secret",
    "https://deployment.example.test#secret",
    "https://deployment.example.test/not-a-root",
    "file:///private/config",
    "javascript:alert(1)",
    "not a URL",
  ])
    assert(!endpoint(url).success)
})

await test("unsupported is distinct from a successful empty connection result", () => {
  const unsupported = {
    schemaVersion: 1,
    id: null,
    revision: 0,
    state: "unsupported",
    review: null,
    connections: [],
    message: "No trusted host authority.",
  }
  assert(ModelConnectionSnapshotSchema.safeParse(unsupported).success)
  for (const state of [
    "reviewed",
    "awaiting-consent",
    "connecting",
    "connected",
    "declined",
    "invalidated",
    "failed",
    "cancelled",
  ]) {
    assert(
      !ModelConnectionSnapshotSchema.safeParse({ ...unsupported, state })
        .success,
    )
  }
  assert(
    !ModelConnectionSnapshotSchema.safeParse({
      ...unsupported,
      schemaVersion: 2,
    }).success,
  )
  assert(
    !ModelConnectionSnapshotSchema.safeParse({
      ...unsupported,
      apiKey: "secret",
    }).success,
  )
})
