import type { ModelConnectionSnapshot } from "@maximal/maximal-core-contract/control"
import type { ProviderGateway } from "@maximal/maximal-model-contract"

import {
  MaximalModelList,
  ModelConnectionSnapshotSchema,
} from "@maximal/maximal-core-contract/control"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import assert from "node:assert/strict"

import type { ProviderCatalogueModel } from "~/lib/live/resources"
import type { ProviderDispatcher } from "~/services/providers/provider-dispatcher"

import { ModelConnectionControl } from "~/lib/model-connections/control"
import { state } from "~/lib/runtime-state/state"
import { createServerApps } from "~/server"
import { ProviderModelRouter } from "~/services/providers/model-router"

import { ConnectionAuthorityFixture } from "./helpers/model-connection"

const noop = (): void => undefined
const originalModels = state.models
const originalToken = state.githubToken
beforeEach(() => {
  state.models = undefined
  state.githubToken = ""
})
afterEach(() => {
  state.models = originalModels
  state.githubToken = originalToken
})

function dispatcher(
  listModels: ProviderDispatcher["listModels"],
): ProviderDispatcher {
  return {
    listModels,
    dispatch: () => Promise.reject(new Error("No inference expected")),
    dispose: () => Promise.resolve(),
    localModels: () => undefined,
    ready: () => Promise.resolve(),
    requiresGithubAuth: () => false,
  }
}

const model = (id: string): ProviderCatalogueModel => ({
  id,
  name: id,
  provider: "perun",
  providerName: "Perun",
})

describe("connection inventory invalidation", () => {
  test.each([true, false])(
    "an old inventory request cannot repopulate or clear a newer generation (old finishes first: %s)",
    async (oldFirst) => {
      const old = Promise.withResolvers<ReadonlyArray<ProviderCatalogueModel>>()
      const fresh =
        Promise.withResolvers<ReadonlyArray<ProviderCatalogueModel>>()
      let loads = 0
      const router = new ProviderModelRouter(
        dispatcher(() => (++loads === 1 ? old.promise : fresh.promise)),
        { now: () => 1 },
      )
      const oldRead = router.listProviderModels()
      router.invalidate()
      const newRead = router.listProviderModels()
      if (oldFirst) {
        old.resolve([model("old")])
        await oldRead
        const coalesced = router.listProviderModels()
        expect(loads).toBe(2)
        fresh.resolve([model("new")])
        expect(await coalesced).toEqual([model("new")])
      } else {
        fresh.resolve([model("new")])
        await newRead
        old.resolve([model("old")])
      }
      await oldRead
      await newRead
      expect(await router.listProviderModels()).toEqual([model("new")])
      expect(loads).toBe(2)
    },
  )

  test("a successful reviewed commit immediately appears in the public selector catalog", async () => {
    const host = new ConnectionAuthorityFixture()
    const now = Date.now()
    host.binding = {
      ...host.binding,
      observedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 60_000).toISOString(),
    }
    let loads = 0
    const gateway: ProviderGateway = {
      dispatch: ({ operation }) => {
        assert.equal(operation, "models")
        loads++
        return Promise.resolve(
          Response.json({
            data: host.persisted.length === 0 ? [] : [{ id: "served-alias" }],
          }),
        )
      },
      dispose: () => Promise.resolve(),
      getStatus: () => undefined,
      listStatuses: () => [
        {
          provider: "perun",
          state: "available",
          operations: ["models", "messages"],
          diagnostics: [],
        },
      ],
      subscribe: () => noop,
    }
    const apps = createServerApps({
      modelConnectionAuthority: host,
      providerGateway: gateway,
      readConfig: () => ({ providerHost: { mode: "plugins" } }),
    })
    try {
      const before = MaximalModelList.parse(
        await (
          await apps.publicApp.request("/v1/models?format=maximal")
        ).json(),
      )
      expect(before.data).toEqual([])
      const act = apps.controlRpcMethods["modelConnections/act"]
      assert(act)
      const reviewed = ModelConnectionSnapshotSchema.parse(
        await act({ action: "review", selection: host.binding.selection }),
      )
      assert(reviewed.review)
      const connected = ModelConnectionSnapshotSchema.parse(
        await act({
          action: "connect",
          id: reviewed.id,
          digest: reviewed.review.digest,
        }),
      )
      expect(connected.state).toBe("connected")
      const after = MaximalModelList.parse(
        await (
          await apps.publicApp.request("/v1/models?format=maximal")
        ).json(),
      )
      expect(after.data).toHaveLength(1)
      expect(after.data[0]).toMatchObject({
        provider: "perun",
        id: "served-alias",
        basePath: "/perun/v1",
        operations: ["messages"],
      })
      expect(loads).toBe(2)
    } finally {
      await apps.providerDispatcher.dispose()
    }
  })

  test("an uncertain commit also invalidates inventory, without claiming connection success", async () => {
    const host = new ConnectionAuthorityFixture()
    host.failAfterPersist = true
    let invalidations = 0
    const control = new ModelConnectionControl(
      host,
      () => host.now,
      () => {
        invalidations++
      },
    )
    const result = await control.act({
      action: "review",
      selection: host.binding.selection,
    })
    assert(result.review)
    const failed = await control.act({
      action: "connect",
      id: result.id,
      digest: result.review.digest,
    })
    expect(failed.state).toBe("failed")
    expect(invalidations).toBe(1)
  })

  test("two approved reviews of one deployment cannot both commit an old revision", async () => {
    const host = new ConnectionAuthorityFixture()
    const control = new ModelConnectionControl(host, () => host.now)
    const reviews: Array<ModelConnectionSnapshot> = await Promise.all(
      Array.from({ length: 2 }, () =>
        control.act({ action: "review", selection: host.binding.selection }),
      ),
    )
    const results: Array<ModelConnectionSnapshot> = await Promise.all(
      reviews.map((snapshot) => {
        assert(snapshot.review)
        return control.act({
          action: "connect",
          id: snapshot.id,
          digest: snapshot.review.digest,
        })
      }),
    )
    expect(results.map(({ state }) => state).toSorted()).toEqual([
      "connected",
      "invalidated",
    ])
    expect(host.commitCalls).toBe(1)
  })
})
