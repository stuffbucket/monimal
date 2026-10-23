import assert from "node:assert/strict"
import test from "node:test"

import {
  ModelDiscoveryActionSchema,
  ModelDiscoverySnapshotSchema,
} from "../src/control.ts"

function snapshot(url = "http://127.0.0.1") {
  return {
    schemaVersion: 1,
    id: "scan/1",
    revision: 1,
    state: "completed",
    includeLocalNetwork: false,
    networkScopes: [],
    endpoints: [
      {
        id: "endpoint/1",
        url,
        address: "127.0.0.1",
        scope: "device",
        protocol: "openai-compatible",
        runtime: null,
        observedAt: "2026-10-16T10:00:00.000Z",
        authenticationRequired: false,
        reachability: "responded",
        isolation: "unverified",
        models: [
          { id: "served-id", name: "served-id", executionLocation: "unknown" },
        ],
      },
    ],
    completedProbes: 1,
    totalProbes: 1,
    truncated: false,
    message: null,
  }
}

void test("discovery actions bind LAN scope consent without credentials or arbitrary destinations", () => {
  assert.ok(
    ModelDiscoveryActionSchema.safeParse({
      action: "start",
      includeLocalNetwork: false,
      networkScopeIds: [],
    }).success,
  )
  for (const request of [
    { action: "start", includeLocalNetwork: false, networkScopeIds: ["lan"] },
    {
      action: "start",
      includeLocalNetwork: true,
      networkScopeIds: ["lan", "lan"],
    },
    {
      action: "start",
      includeLocalNetwork: false,
      networkScopeIds: [],
      endpoint: "http://unapproved.invalid",
    },
    { action: "describe", apiKey: "secret" },
    { action: "read" },
  ])
    assert.equal(ModelDiscoveryActionSchema.safeParse(request).success, false)
})

void test("discovery output forbids endpoint credentials, routes, and invented isolation", () => {
  assert.ok(ModelDiscoverySnapshotSchema.safeParse(snapshot()).success)
  for (const endpoint of [
    "http://user:secret@localhost",
    "http://localhost?api_key=secret",
    "http://localhost/v1/models",
    "file:///etc/passwd",
  ])
    assert.equal(
      ModelDiscoverySnapshotSchema.safeParse(snapshot(endpoint)).success,
      false,
    )
  const unsafe = snapshot()
  unsafe.endpoints[0].isolation = "safe"
  assert.equal(ModelDiscoverySnapshotSchema.safeParse(unsafe).success, false)
})

void test("progress and result limits fail closed", () => {
  assert.equal(
    ModelDiscoverySnapshotSchema.safeParse({
      ...snapshot(),
      completedProbes: 2,
    }).success,
    false,
  )
  assert.equal(
    ModelDiscoverySnapshotSchema.safeParse({ ...snapshot(), totalProbes: 2049 })
      .success,
    false,
  )
  assert.equal(
    ModelDiscoverySnapshotSchema.safeParse({ ...snapshot(), schemaVersion: 2 })
      .success,
    false,
  )
})
