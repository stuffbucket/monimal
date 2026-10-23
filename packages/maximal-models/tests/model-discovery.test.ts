import type { ModelDiscoveryService } from "@maximal/maximal-model-contract"

import { projectProviderModelExecutionTarget } from "@maximal/maximal-model-contract"
import assert from "node:assert/strict"
import { test } from "node:test"

import { boundedNetworkScope } from "../src/discovery/network.ts"
import { createModelDiscoveryService } from "../src/index.ts"

function fixtureScope() {
  const scope = boundedNetworkScope("eth-test", "192.168.0.1/30")
  if (!scope) throw new Error("Invalid fixture scope")
  return scope
}
function simulatedFetch(
  handler: (
    url: URL,
    options: RequestInit | undefined,
  ) => Response | Promise<Response>,
): typeof fetch {
  return (input, options) =>
    Promise.resolve(
      handler(new URL(input instanceof Request ? input.url : input), options),
    )
}
async function complete(service: ModelDiscoveryService, id: string | null) {
  if (!id) throw new Error("Missing discovery session")
  for (let index = 0; index < 100; index++) {
    const result = await service.act({ action: "read", id })
    if (result.state !== "running") return result
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error("Discovery did not finish within the fixture budget")
}

void test("configured tunnels retain remote execution identity and never forward credential-bearing or cloud URLs", async () => {
  const target = projectProviderModelExecutionTarget(
    {
      id: "served-id",
      name: "Served model",
      provider: "fixture",
      providerName: "Fixture",
      capabilities: [],
      operations: ["messages"],
    },
    {
      id: "perun-deployment",
      endpoint: { id: "perun-relay", url: "http://127.0.0.1:9024" },
      location: "lan",
      adapters: [{ id: "messages", operation: "messages" }],
      runner: { id: "vllm", name: "vLLM", kind: "external-local" },
      provenance: {
        method: "declared",
        source: "provider",
        sourceId: "fixture",
      },
    },
  )
  const targets = [
    target,
    {
      ...target,
      id: "credential-bearing",
      endpoint: { id: "bad", url: "http://user:secret@127.0.0.1:9000" },
    },
    {
      ...target,
      id: "cloud",
      location: "cloud" as const,
      endpoint: { id: "cloud", url: "http://unapproved.invalid" },
    },
  ]
  const requested: Array<string> = []
  const service = createModelDiscoveryService(
    { configuredTargets: () => targets },
    {
      networkScopes: () => Promise.resolve([]),
      defaultPorts: [],
      fetchImplementation: simulatedFetch((url) => {
        requested.push(url.origin)
        return Response.json({ models: [{ model: "served-id" }] })
      }),
    },
  )
  try {
    const result = await complete(
      service,
      (
        await service.act({
          action: "start",
          includeLocalNetwork: false,
          networkScopeIds: [],
        })
      ).id,
    )
    assert.deepEqual(requested, ["http://127.0.0.1:9024"])
    assert.equal(result.endpoints[0]?.scope, "device")
    assert.equal(result.endpoints[0]?.models[0]?.executionLocation, "lan")
    assert.equal(
      result.endpoints[0]?.models[0]?.configuredTargetId,
      "perun-deployment",
    )
  } finally {
    service.dispose()
  }
})

// Simulated HTTP evidence; no real network discovery or inference is performed.

void test("device probes have no credentials and leave execution/isolation unknown", async () => {
  const requests: Array<URL> = []
  const service = createModelDiscoveryService(
    { configuredTargets: () => [] },
    {
      networkScopes: () => Promise.resolve([fixtureScope()]),
      defaultPorts: [8000],
      fetchImplementation: simulatedFetch((url, options) => {
        requests.push(url)
        assert.equal(options?.method, "GET")
        assert.equal(options.redirect, "error")
        assert.equal(new Headers(options.headers).has("authorization"), false)
        return Response.json(
          url.pathname === "/v1/models" ?
            {
              data: [
                { id: "qwen-alias", owned_by: "vllm", secrets: "ignored" },
              ],
            }
          : {},
          { status: url.pathname === "/v1/models" ? 200 : 404 },
        )
      }),
    },
  )
  try {
    const result = await complete(
      service,
      (
        await service.act({
          action: "start",
          includeLocalNetwork: false,
          networkScopeIds: [],
        })
      ).id,
    )
    assert.ok(requests.every((url) => url.hostname === "127.0.0.1"))
    assert.equal(result.state, "completed")
    assert.deepEqual(result.endpoints[0]?.models[0], {
      id: "qwen-alias",
      name: "qwen-alias",
      executionLocation: "unknown",
    })
    assert.equal(result.endpoints[0]?.isolation, "unverified")
    assert.ok(Object.isFrozen(result.endpoints[0]?.models))
    assert.ok(!JSON.stringify(result).includes("secrets"))
  } finally {
    service.dispose()
  }
})

void test("LAN consent binds exact scopes and identical served IDs stay separate", async () => {
  const scope = fixtureScope()
  const requested = new Set<string>()
  const service = createModelDiscoveryService(
    { configuredTargets: () => [] },
    {
      networkScopes: () => Promise.resolve([scope]),
      defaultPorts: [8000],
      fetchImplementation: simulatedFetch((url) => {
        requested.add(url.hostname)
        return Response.json({ models: [{ model: "same-id" }] })
      }),
    },
  )
  try {
    await assert.rejects(
      service.act({
        action: "start",
        includeLocalNetwork: true,
        networkScopeIds: ["unselected-network"],
      }),
      /scope changed/,
    )
    await assert.rejects(
      service.act({
        action: "start",
        includeLocalNetwork: false,
        networkScopeIds: [scope.id],
      }),
      /explicit consent/,
    )
    assert.equal(requested.size, 0)
    const result = await complete(
      service,
      (
        await service.act({
          action: "start",
          includeLocalNetwork: true,
          networkScopeIds: [scope.id],
        })
      ).id,
    )
    assert.deepEqual([...requested].sort(), [
      "127.0.0.1",
      "192.168.0.1",
      "192.168.0.2",
    ])
    assert.equal(result.endpoints.length, 3)
    assert.equal(new Set(result.endpoints.map(({ id }) => id)).size, 3)
  } finally {
    service.dispose()
  }
})

void test("broad, public and loopback LAN scopes are rejected", () => {
  for (const cidr of ["192.168.0.1/16", "8.8.8.8/24", "127.0.0.1/24"])
    assert.equal(boundedNetworkScope("eth-test", cidr), undefined)
})

void test("cancellation aborts stalled reads and cannot be undone by late results", async () => {
  const signals: Array<AbortSignal> = []
  const service = createModelDiscoveryService(
    { configuredTargets: () => [] },
    {
      networkScopes: () => Promise.resolve([]),
      defaultPorts: [8000],
      fetchImplementation: simulatedFetch((_url, options) => {
        if (options?.signal) signals.push(options.signal)
        return new Response(new ReadableStream())
      }),
    },
  )
  try {
    const started = await service.act({
      action: "start",
      includeLocalNetwork: false,
      networkScopeIds: [],
    })
    assert.ok(started.id)
    const cancelled = await service.act({ action: "cancel", id: started.id })
    assert.equal(cancelled.state, "cancelled")
    assert.ok(signals.every((signal) => signal.aborted))
    await new Promise((resolve) => setTimeout(resolve, 10))
    assert.deepEqual(
      await service.act({ action: "read", id: started.id }),
      cancelled,
    )
  } finally {
    service.dispose()
  }
})

void test("global deadline returns partial results, not fabricated readiness", async () => {
  const service = createModelDiscoveryService(
    { configuredTargets: () => [] },
    {
      networkScopes: () => Promise.resolve([]),
      defaultPorts: [8000],
      scanTimeoutMs: 10,
      fetchImplementation: simulatedFetch(
        () => new Response(new ReadableStream()),
      ),
    },
  )
  try {
    const result = await complete(
      service,
      (
        await service.act({
          action: "start",
          includeLocalNetwork: false,
          networkScopeIds: [],
        })
      ).id,
    )
    assert.equal(result.state, "completed")
    assert.equal(result.truncated, true)
    assert.deepEqual(result.endpoints, [])
  } finally {
    service.dispose()
  }
})

void test("concurrent starts share the two-session cap", async () => {
  const service = createModelDiscoveryService(
    { configuredTargets: () => [] },
    {
      networkScopes: () => Promise.resolve([]),
      defaultPorts: [8000],
      fetchImplementation: simulatedFetch(
        () => new Response(new ReadableStream()),
      ),
    },
  )
  try {
    const results = await Promise.allSettled(
      Array.from({ length: 3 }, () =>
        service.act({
          action: "start",
          includeLocalNetwork: false,
          networkScopeIds: [],
        }),
      ),
    )
    assert.equal(
      results.filter(({ status }) => status === "fulfilled").length,
      2,
    )
    assert.equal(
      results.filter(({ status }) => status === "rejected").length,
      1,
    )
  } finally {
    service.dispose()
  }
})

void test("hostile and oversized metadata are ignored; auth is not service verification", async () => {
  for (const payload of [
    { data: [{ id: "\u202Efake" }] },
    { data: Array(140).fill({ id: "served" }) },
    { data: [{ id: "huge", extra: "x".repeat(1024 * 1024) }] },
  ]) {
    const service = createModelDiscoveryService(
      { configuredTargets: () => [] },
      {
        networkScopes: () => Promise.resolve([]),
        defaultPorts: [8000],
        fetchImplementation: simulatedFetch(() => Response.json(payload)),
      },
    )
    try {
      const result = await complete(
        service,
        (
          await service.act({
            action: "start",
            includeLocalNetwork: false,
            networkScopeIds: [],
          })
        ).id,
      )
      assert.ok(
        result.endpoints.every((endpoint) => endpoint.models.length <= 128),
      )
      assert.ok(!JSON.stringify(result).includes("fake"))
      assert.ok(!JSON.stringify(result).includes("huge"))
    } finally {
      service.dispose()
    }
  }
  const service = createModelDiscoveryService(
    { configuredTargets: () => [] },
    {
      networkScopes: () => Promise.resolve([]),
      defaultPorts: [8000],
      fetchImplementation: simulatedFetch(
        () => new Response(null, { status: 401 }),
      ),
    },
  )
  try {
    const result = await complete(
      service,
      (
        await service.act({
          action: "start",
          includeLocalNetwork: false,
          networkScopeIds: [],
        })
      ).id,
    )
    assert.equal(result.endpoints[0]?.protocol, "unverified")
    assert.equal(result.endpoints[0]?.authenticationRequired, true)
  } finally {
    service.dispose()
  }
})
