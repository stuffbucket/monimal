import type {
  ModelConnectionBinding,
  ModelConnectionReview,
} from "@maximal/maximal-core-contract/control"

import { ModelConnectionSnapshotSchema } from "@maximal/maximal-core-contract/control"
import { describe, expect, test } from "bun:test"
import assert from "node:assert/strict"

import { DEFAULT_OLLAMA_BASE_URL } from "~/lib/config/config"
import { ModelConnectionControl } from "~/lib/model-connections/control"
import {
  assertConnectionReviewCurrent,
  createConnectionReview,
} from "~/lib/model-connections/review"
import { createControlRoutesComposition } from "~/routes/control/route"

import {
  ConnectionAuthorityFixture,
  connectionBinding,
  connectionNow,
} from "./helpers/model-connection"

async function reviewed(host: ConnectionAuthorityFixture) {
  const control = new ModelConnectionControl(host, () => host.now)
  const result = await control.act({
    action: "review",
    selection: host.binding.selection,
  })
  assert(result.review && result.id)
  return {
    control,
    review: result.review,
    request: { id: result.id, digest: result.review.digest },
  }
}

describe("reviewed connection trust boundary", () => {
  test("negotiates unsupported without an authority; never accepts an approval boolean", async () => {
    const registry = createControlRoutesComposition().methods
    assert(registry["modelConnections/act"])
    const result = ModelConnectionSnapshotSchema.parse(
      await registry["modelConnections/act"]({ action: "describe" }),
    )
    expect(result.state).toBe("unsupported")
    expect(result.message).toContain("outside-agent consent")
    const host = new ConnectionAuthorityFixture()
    const { control, request } = await reviewed(host)
    await assert.rejects(
      control.act({ ...request, action: "connect", approved: true }),
    )
    await assert.rejects(
      control.act({
        action: "review",
        selection: host.binding.selection,
        binding: host.binding,
      }),
    )
    await assert.rejects(
      control.act({ ...request, action: "connect", apiKey: "not-authority" }),
    )
    expect(host.consentReviews).toHaveLength(0)
    expect(host.commitCalls).toBe(0)
  })

  test("review is deeply immutable, credential-free, and side-effect free", async () => {
    const host = new ConnectionAuthorityFixture()
    const { control, review, request } = await reviewed(host)
    expect(review.digest).toMatch(/^sha256:[a-f0-9]{64}$/u)
    expect(Object.isFrozen(review.binding.runtime)).toBe(true)
    expect(Object.isFrozen(review.binding.selection.modelIds)).toBe(true)
    expect(Object.isFrozen(review.binding.models[0])).toBe(true)
    expect(Reflect.set(review.binding.models[0], "id", "other")).toBe(false)
    expect((await control.act({ ...request, action: "read" })).review).toEqual(
      review,
    )
    expect(host.consentReviews).toHaveLength(0)
    expect(host.persisted).toHaveLength(0)
    expect(host.binding.providerMode).toBe("plugins")
  })

  test("obtains host consent outside the lock then commits once under the same authoritative lock", async () => {
    const host = new ConnectionAuthorityFixture()
    const { control, request, review } = await reviewed(host)
    const connected = await control.act({ ...request, action: "connect" })
    expect(connected.state).toBe("connected")
    expect(connected.connections[0]).toMatchObject({
      targetId: "perun-target",
      operations: ["messages"],
      auth: { credentialId: "maximal-client-key" },
    })
    expect(host.consentReviews).toEqual([review])
    expect(host.persisted).toEqual([review])
    expect(host.selections).toHaveLength(2)
    expect(await control.act({ ...request, action: "connect" })).toEqual(
      connected,
    )
    expect(host.commitCalls).toBe(1)
    connected.connections[0].manualSteps.push("mutated outside")
    expect(
      (await control.act({ ...request, action: "read" })).connections[0]
        .manualSteps,
    ).not.toContain("mutated outside")
  })

  test("declining consent has no persistence or credential release", async () => {
    const host = new ConnectionAuthorityFixture()
    host.consent = () => Promise.resolve("declined")
    const { control, request } = await reviewed(host)
    expect((await control.act({ ...request, action: "connect" })).state).toBe(
      "declined",
    )
    expect(host.commitCalls).toBe(0)
  })

  test("expiry, wrong digests, and cancelling during consent cannot commit", async () => {
    const host = new ConnectionAuthorityFixture()
    const decision = Promise.withResolvers<"approved" | "declined">()
    host.consent = (_review, signal) => {
      expect(signal.aborted).toBe(false)
      return decision.promise
    }
    const { control, request } = await reviewed(host)
    await assert.rejects(
      control.act({
        ...request,
        digest: `sha256:${"0".repeat(64)}`,
        action: "connect",
      }),
    )
    const pending = control.act({ ...request, action: "connect" })
    const waiting = await control.act({ ...request, action: "read" })
    expect(waiting.state).toBe("awaiting-consent")
    expect((await control.act({ ...request, action: "connect" })).state).toBe(
      "awaiting-consent",
    )
    const cancelled = await control.act({ ...request, action: "cancel" })
    expect(cancelled.state).toBe("cancelled")
    expect(cancelled.revision).toBeGreaterThan(waiting.revision)
    decision.resolve("approved")
    expect((await pending).state).toBe("cancelled")
    expect(host.consentReviews).toHaveLength(1)
    expect(host.commitCalls).toBe(0)
    const fresh = await reviewed(host)
    host.now += 60_000
    expect(
      (await fresh.control.act({ ...fresh.request, action: "connect" })).state,
    ).toBe("invalidated")
    expect(host.consentReviews).toHaveLength(1)
  })

  test.each([
    { deploymentRevision: "changed" },
    {
      runtime: {
        ...connectionBinding().runtime,
        digest: `sha256:${"b".repeat(64)}`,
      },
    },
    { operations: ["chat-completions"] },
    { models: [{ id: "served-alias", targetId: "different-target" }] },
    { policy: { revision: "policy-2", state: "allowed" } },
    { policy: { revision: "policy-1", state: "blocked" } },
    { providerMode: "legacy" },
    { credentialDestination: "https://different.example.test" },
    { runnerId: "different-runner" },
    { transport: "authenticated-tunnel" },
  ] satisfies Array<Partial<ModelConnectionBinding>>)(
    "invalidates changed authoritative state %j immediately before persistence",
    async (change) => {
      const host = new ConnectionAuthorityFixture()
      const { control, request } = await reviewed(host)
      host.consent = () => {
        host.binding = { ...host.binding, ...change }
        return Promise.resolve("approved")
      }
      expect((await control.act({ ...request, action: "connect" })).state).toBe(
        "invalidated",
      )
      expect(host.commitCalls).toBe(0)
    },
  )

  test("an uncertain commit is terminal and never retries automatically or leaks host exceptions", async () => {
    const host = new ConnectionAuthorityFixture()
    host.failAfterPersist = true
    const { control, request } = await reviewed(host)
    const failed = await control.act({ ...request, action: "connect" })
    expect(failed.state).toBe("failed")
    expect(JSON.stringify(failed)).not.toContain("untrusted-secret")
    expect(host.persisted).toHaveLength(1)
    expect(await control.act({ ...request, action: "connect" })).toEqual(failed)
    expect(host.commitCalls).toBe(1)
  })
})

describe("reviewed connection lifecycle", () => {
  test("disposal cancels pending consent but cannot claim to undo an atomic commit", async () => {
    const host = new ConnectionAuthorityFixture()
    const consent = Promise.withResolvers<"approved" | "declined">()
    host.consent = () => consent.promise
    const first = await reviewed(host)
    const waiting = first.control.act({ ...first.request, action: "connect" })
    first.control.dispose()
    consent.resolve("approved")
    expect((await waiting).state).toBe("cancelled")
    expect(host.commitCalls).toBe(0)
    host.consent = () => Promise.resolve("approved")
    const started = Promise.withResolvers<undefined>()
    const finish = Promise.withResolvers<undefined>()
    host.beforeCommit = async () => {
      started.resolve(undefined)
      await finish.promise
    }
    const second = await reviewed(host)
    const committing = second.control.act({
      ...second.request,
      action: "connect",
    })
    await started.promise
    expect(
      (await second.control.act({ ...second.request, action: "cancel" })).state,
    ).toBe("connecting")
    second.control.dispose()
    finish.resolve(undefined)
    expect((await committing).state).toBe("connected")
    expect(host.commitCalls).toBe(1)
  })

  test("concurrent reviews share a bounded reservation budget", async () => {
    const host = new ConnectionAuthorityFixture()
    const control = new ModelConnectionControl(host, () => host.now)
    const results = await Promise.allSettled(
      Array.from({ length: 33 }, () =>
        control.act({ action: "review", selection: host.binding.selection }),
      ),
    )
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      32,
    )
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(
      1,
    )
    expect(host.commitCalls).toBe(0)
    const first = results[0]
    assert(first.status === "fulfilled" && first.value.review)
    await control.act({
      action: "cancel",
      id: first.value.id,
      digest: first.value.review.digest,
    })
    expect(
      (
        await control.act({
          action: "review",
          selection: host.binding.selection,
        })
      ).state,
    ).toBe("reviewed")
    control.dispose()
  })
})

describe("connection binding preconditions", () => {
  test("requires an installed runtime, current explicit policy, and unchanged provider mode", () => {
    const binding = connectionBinding()
    for (const change of [
      { runtimeState: "unknown" },
      { runtimeState: "unavailable" },
      { policy: { revision: "policy-1", state: "unknown" } },
      { providerMode: "legacy" },
      { observedAt: new Date(connectionNow + 1).toISOString() },
      { observedAt: new Date(connectionNow - 60_000).toISOString() },
    ] satisfies Array<Partial<ModelConnectionBinding>>) {
      expect(() =>
        createConnectionReview(
          { ...binding, ...change },
          binding.selection,
          connectionNow,
        ),
      ).toThrow()
    }
  })

  test("HTTP LAN and unauthenticated TLS cannot become a usable connection", () => {
    const binding = connectionBinding()
    for (const invalid of [
      {
        ...binding,
        endpoint: {
          ...binding.endpoint,
          url: "http://deployment.example.test",
        },
      },
      {
        ...binding,
        selection: { ...binding.selection, credentialId: null },
        auth: { kind: "none" },
        credentialDestination: null,
      },
    ] satisfies Array<ModelConnectionBinding>) {
      expect(() =>
        createConnectionReview(invalid, invalid.selection, connectionNow),
      ).toThrow()
    }
  })

  test("an authenticated loopback tunnel retains its remote execution identity", () => {
    const binding = connectionBinding()
    const tunnel = {
      ...binding,
      endpoint: { ...binding.endpoint, url: DEFAULT_OLLAMA_BASE_URL },
      credentialDestination: DEFAULT_OLLAMA_BASE_URL,
      transport: "authenticated-tunnel",
    } satisfies ModelConnectionBinding
    const review = createConnectionReview(
      tunnel,
      tunnel.selection,
      connectionNow,
    )
    expect(review.binding.selection.location).toBe("lan")
    expect(() =>
      createConnectionReview(
        { ...tunnel, transport: "loopback" },
        tunnel.selection,
        connectionNow,
      ),
    ).toThrow()
  })

  test("an altered review cannot use its old digest; key order alone does not invalidate it", () => {
    const binding = connectionBinding()
    const review = createConnectionReview(
      binding,
      binding.selection,
      connectionNow,
    )
    expect(() =>
      assertConnectionReviewCurrent(
        { ...review, binding: { ...review.binding, provider: "other" } },
        binding,
        connectionNow,
      ),
    ).toThrow()
    const reordered: ModelConnectionReview = {
      ...review,
      binding: {
        ...review.binding,
        endpoint: { url: binding.endpoint.url, id: binding.endpoint.id },
      },
    }
    expect(() =>
      assertConnectionReviewCurrent(reordered, binding, connectionNow),
    ).not.toThrow()
  })
})
