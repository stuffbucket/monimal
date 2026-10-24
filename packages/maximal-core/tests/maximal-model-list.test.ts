import type {
  ModelExecutionTarget,
  ProviderModelDescriptor,
} from "@maximal/maximal-model-contract"

import { MaximalModelList } from "@maximal/maximal-core-contract/control"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { Hono } from "hono"

import { state } from "~/lib/runtime-state/state"
import { createModelRoutes } from "~/routes/models/route"
import { maximalModelList } from "~/routes/models/selector-catalog"

import { copilotModelMetadataFixture } from "./fixtures/copilot-model-metadata"

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

function offering(provider: string): ProviderModelDescriptor {
  return {
    id: "served-alias",
    name: "Served model",
    provider,
    providerName: provider,
    operations: ["messages"],
  }
}

const target: ModelExecutionTarget = {
  id: "perun-deployment",
  modelId: "served-alias",
  providerAccount: { provider: "perun" },
  runner: { id: "vllm-worker", kind: "remote-managed" },
  endpoint: { id: "private-tunnel", url: "https://private.example.test" },
  location: "lan",
  adapters: [{ id: "vllm-messages", operation: "messages" }],
  availability: { state: "unknown" },
  lifecycle: { state: "unknown" },
  evidence: {
    provenance: {
      source: "configuration",
      method: "declared",
      sourceId: "perun-deployment",
    },
    limits: { effective: { contextTokens: 32768 } },
  },
}

function project(
  providers: ReadonlyArray<ProviderModelDescriptor>,
  targets: ReadonlyArray<ModelExecutionTarget> = [],
) {
  return maximalModelList({ copilot: [], local: [], providers, targets })
}

describe("external-selector model list", () => {
  test("keeps provider-qualified offerings with duplicate served aliases", async () => {
    const app = new Hono()
    app.route(
      "/v1/models",
      createModelRoutes({
        providerInventory: () =>
          Promise.resolve([offering("perun"), offering("domovyk")]),
        // A plain aggregate still has its existing conflict behavior.
        providerModels: () =>
          Promise.resolve([offering("perun"), offering("domovyk")]),
        executionTargets: () => [target],
      }),
    )
    const response = await app.request("/v1/models?format=maximal", {
      headers: { "anthropic-version": "2023-06-01" },
    })
    expect(response.status).toBe(200)
    const body = MaximalModelList.parse(await response.json())
    expect(
      body.data.map(({ id, provider, basePath, operations }) => ({
        id,
        provider,
        basePath,
        operations,
      })),
    ).toEqual([
      {
        id: "served-alias",
        provider: "perun",
        basePath: "/perun/v1",
        operations: ["messages"],
      },
      {
        id: "served-alias",
        provider: "domovyk",
        basePath: "/domovyk/v1",
        operations: ["messages"],
      },
    ])
    expect(body.data[0].targets).toEqual([
      {
        id: "perun-deployment",
        location: "lan",
        availability: "unknown",
        lifecycle: "unknown",
        contextWindowTokens: 32768,
        maxOutputTokens: null,
      },
    ])
    expect(body.data[1].targets).toEqual([])
    expect((await app.request("/v1/models")).status).toBe(409)
  })

  test("does not apply local/cloud routing preference to qualified inventory", async () => {
    const local = offering("ollama")
    const cloud = offering("ollama-cloud")
    const app = new Hono()
    app.route(
      "/models",
      createModelRoutes({
        providerModels: () => Promise.resolve([local]),
        providerInventory: () => Promise.resolve([local, cloud]),
      }),
    )
    const body = MaximalModelList.parse(
      await (await app.request("/models?format=maximal")).json(),
    )
    expect(body.data.map(({ provider }) => provider)).toEqual([
      "ollama",
      "ollama-cloud",
    ])
  })

  test("keeps missing evidence unknown and never supplies invented output limits", () => {
    const body = MaximalModelList.parse(project([offering("perun")], [target]))
    expect(body.data[0]).toMatchObject({
      contextWindowTokens: null,
      maxOutputTokens: null,
      capabilities: { vision: null, tools: null, reasoning: null },
    })
    expect(body.data[0].operations).not.toContain("chat-completions")
    const unknown = { ...offering("legacy"), operations: undefined }
    expect(project([unknown]).data[0].operations).toBeNull()
  })

  test("retains explicit operation and capability evidence and sanitizes bad limits", () => {
    const body = project([
      {
        ...offering("classifier"),
        operations: ["systemone"],
        contextWindowTokens: 8192,
        maxOutputTokens: Number.NaN,
        evidence: {
          capabilities: {
            vision: false,
            toolCalls: true,
            adaptiveThinking: false,
            reasoningEffort: [],
          },
        },
      },
    ])
    expect(MaximalModelList.parse(body).data[0]).toMatchObject({
      operations: ["systemone"],
      contextWindowTokens: 8192,
      maxOutputTokens: null,
      capabilities: { vision: false, tools: true, reasoning: false },
    })
    for (const contextWindowTokens of [-1, 0, 1.5, Infinity]) {
      expect(
        project([{ ...offering("invalid"), contextWindowTokens }]).data[0]
          .contextWindowTokens,
      ).toBeNull()
    }
  })

  test("does not confuse disabled adaptive thinking with no reasoning support", () => {
    const evidence = { capabilities: { adaptiveThinking: false } }
    expect(
      project([{ ...offering("unknown"), evidence }]).data[0].capabilities
        .reasoning,
    ).toBeNull()
    expect(
      project([
        {
          ...offering("reasoner"),
          evidence: {
            capabilities: {
              adaptiveThinking: false,
              reasoningEffort: ["high"],
            },
          },
        },
      ]).data[0].capabilities.reasoning,
    ).toBe(true)
  })

  test("omits disabled providers and never publishes upstream or incidental fields", () => {
    const unsafe = {
      ...offering("perun"),
      apiKey: "private-secret",
      baseURL: "https://private.example.test",
    }
    const body = project(
      [unsafe, { ...offering("disabled"), enabled: false }],
      [target],
    )
    expect(MaximalModelList.parse(body).data).toHaveLength(1)
    expect(JSON.stringify(body)).not.toContain("private")
    expect(JSON.stringify(body)).not.toContain("endpoint")
  })

  test("encodes provider path segments instead of accepting URL structure", () => {
    expect(project([offering("other/host?key=value")]).data[0].basePath).toBe(
      "/other%2Fhost%3Fkey%3Dvalue/v1",
    )
    expect(project([offering("..")]).data[0].basePath).toBeNull()
  })

  test("marks ambiguous aggregate-only entries unroutable without hiding provider routes", () => {
    const model = copilotModelMetadataFixture[0]
    const body = maximalModelList({
      copilot: [model],
      local: [],
      providers: [{ ...offering("other"), id: model.id }],
      targets: [],
    })
    expect(MaximalModelList.parse(body).data[0].basePath).toBeNull()
    expect(body.data[1].basePath).toBe("/other/v1")
  })

  test("rejects unknown schema versions and extra public fields", () => {
    const body = project([offering("perun")])
    expect(
      MaximalModelList.safeParse({ ...body, schemaVersion: 2 }).success,
    ).toBe(false)
    expect(
      MaximalModelList.safeParse({
        ...body,
        data: [{ ...body.data[0], apiKey: "secret" }],
      }).success,
    ).toBe(false)
  })
})
