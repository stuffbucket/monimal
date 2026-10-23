import type {
  ModelDiscoveryService,
  ModelDiscoverySnapshot,
} from "@maximal/maximal-model-contract"

import { describe, expect, test } from "bun:test"
import assert from "node:assert/strict"

import { ModelDiscoveryControl } from "~/routes/control/model-discovery"
import { createControlRoutesComposition } from "~/routes/control/route"

function result(): ModelDiscoverySnapshot {
  return {
    schemaVersion: 1,
    id: "session/1",
    revision: 1,
    state: "completed",
    includeLocalNetwork: false,
    networkScopes: [],
    endpoints: [],
    completedProbes: 0,
    totalProbes: 0,
    truncated: false,
    message: null,
  }
}

describe("host-owned discovery control", () => {
  test("headless Core advertises the optional seam but reports unsupported, not empty success", async () => {
    const registry = createControlRoutesComposition().methods
    expect(registry["modelDiscovery/act"]).toBeDefined()
    const control = new ModelDiscoveryControl(undefined)
    expect((await control.act({ action: "describe" })).state).toBe(
      "unsupported",
    )
  })

  test("invalid scope and extra credentials are rejected before reaching the host", async () => {
    let calls = 0
    const host: ModelDiscoveryService = {
      act: () => {
        calls++
        return Promise.resolve(result())
      },
      dispose: () => {},
    }
    const control = new ModelDiscoveryControl(host)
    await assert.rejects(
      control.act({
        action: "start",
        includeLocalNetwork: false,
        networkScopeIds: ["lan"],
      }),
    )
    await assert.rejects(
      control.act({
        action: "start",
        includeLocalNetwork: false,
        networkScopeIds: [],
        apiKey: "do-not-forward",
      }),
    )
    expect(calls).toBe(0)
  })

  test("host output is independently validated", async () => {
    const host: ModelDiscoveryService = {
      act: () => Promise.resolve({ ...result(), completedProbes: 10 }),
      dispose: () => {},
    }
    await assert.rejects(
      new ModelDiscoveryControl(host).act({ action: "describe" }),
    )
  })
})
