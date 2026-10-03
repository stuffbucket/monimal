import type { ProviderOperation } from "@maximal/maximal-model-contract"

import assert from "node:assert/strict"
import { writeFile } from "node:fs/promises"
import test from "node:test"

import {
  startProviderPluginHost,
  SystemOneRegistry,
  type ProviderPluginHost,
} from "../src/index.ts"
import { createFixtureProfile, fixtureState } from "./fixture.ts"

const systemOnePluginSource = `
export const name = "fixture-system-one"
export const inject = ["systemOne"]
export const Config = {
  "~standard": {
    version: 1,
    vendor: "maximal-fixture",
    validate(value) { return { value: value ?? {} } },
  },
}
export const state = {
  aborted: 0,
  active: 0,
  calls: 0,
  finalized: 0,
  streamYields: 0,
}
export function apply(ctx, config) {
  state.active += 1
  const registration = ctx.systemOne.registerProvider({
    id: config.provider,
    name: "Fixture System One",
    models: [
      {
        family: "gliner25",
        id: "fastino/GLiNER2.5-Decide",
        name: "GLiNER2.5 Decide",
      },
      {
        family: "gliner25",
        id: "fastino/GLiNER2.5-Decide-1B",
        name: "GLiNER2.5 Decide 1B",
      },
    ],
    async handle(request) {
      state.calls += 1
      if (config.wait === true) {
        await new Promise((resolve) => {
          request.signal.addEventListener("abort", () => {
            state.aborted += 1
            resolve()
          }, { once: true })
        })
      }
      return Response.json({
        path: new URL(request.url).pathname,
        payload: await request.json(),
      })
    },
  })
  ctx.effect(() => () => {
    registration.dispose()
    state.active -= 1
  }, "dispose fixture System One provider")
}
`

async function systemOneHost(
  options: {
    readonly wait?: boolean
  } = {},
): Promise<{
  readonly host: ProviderPluginHost
  readonly pluginEntry: string
}> {
  const fixture = await createFixtureProfile()
  await writeFile(fixture.pluginEntry, systemOnePluginSource)
  await fixture.writeProviders({
    schemaVersion: 1,
    runtime: {
      cordis: "@deepseek-ai/cordis",
      llm: "@deepseek-ai/dsh-llm",
    },
    services: [],
    plugins: [
      {
        id: "fixture",
        package: "fixture-provider",
        providers: ["fixture-system-one"],
      },
    ],
  })
  return {
    host: await startProviderPluginHost({
      profileDirectory: fixture.directory,
      activation: {
        fixture: {
          enabled: true,
          config: {
            provider: "fixture-system-one",
            ...(options.wait === true ? { wait: true } : {}),
          },
        },
      },
      abortGraceMs: 500,
      drainTimeoutMs: 5,
    }),
    pluginEntry: fixture.pluginEntry,
  }
}

function dispatch(
  host: ProviderPluginHost,
  operation: ProviderOperation,
  body: unknown = { value: "fixture" },
): Promise<Response> {
  const signal = new AbortController().signal
  return host.dispatch({
    operation,
    provider: "fixture-system-one",
    request: new Request("https://host.test/v1/systemone", {
      method: operation === "models" ? "GET" : "POST",
      ...(operation === "models" ?
        {}
      : {
          body: JSON.stringify(body),
          headers: { "content-type": "application/json" },
        }),
      signal,
    }),
    signal,
  })
}

function modelIds(value: unknown): Array<string> {
  if (value === null || typeof value !== "object") {
    throw new TypeError("Expected a model catalog object.")
  }
  const data: unknown = Reflect.get(value, "data")
  if (!Array.isArray(data)) throw new TypeError("Expected model catalog data.")
  return data.map((entry: unknown) => {
    if (entry === null || typeof entry !== "object") {
      throw new TypeError("Expected a model catalog entry.")
    }
    const id: unknown = Reflect.get(entry, "id")
    if (typeof id !== "string") throw new TypeError("Expected a model id.")
    return id
  })
}

function modelFamilies(value: unknown): Array<string> {
  if (value === null || typeof value !== "object") {
    throw new TypeError("Expected a model catalog object.")
  }
  const data: unknown = Reflect.get(value, "data")
  if (!Array.isArray(data)) throw new TypeError("Expected model catalog data.")
  return data.map((entry: unknown) => {
    if (entry === null || typeof entry !== "object") {
      throw new TypeError("Expected a model catalog entry.")
    }
    const family: unknown = Reflect.get(entry, "family")
    if (typeof family !== "string") {
      throw new TypeError("Expected a model family.")
    }
    return family
  })
}

void test("System One registry enforces registration lifetimes", () => {
  const registry = new SystemOneRegistry()
  const lifetime = new AbortController()
  registry.registerProvider(
    {
      id: "gliner",
      name: "GLiNER",
      models: [{ id: "model", name: "Model" }],
      handle: () => Promise.resolve(Response.json({})),
    },
    lifetime.signal,
  )
  assert.deepEqual(registry.listProviders(), [{ id: "gliner", name: "GLiNER" }])
  assert.throws(
    () =>
      registry.registerProvider({
        id: "gliner",
        name: "Duplicate",
        models: [],
        handle: () => Promise.resolve(Response.json({})),
      }),
    /already registered/u,
  )
  lifetime.abort()
  assert.deepEqual(registry.listProviders(), [])
})

void test("host routes System One models and dispatch without LLM fallback", async () => {
  const { host, pluginEntry } = await systemOneHost()
  assert.deepEqual(host.getStatus("fixture-system-one"), {
    provider: "fixture-system-one",
    displayName: "Fixture System One",
    state: "available",
    operations: ["models", "systemone"],
    diagnostics: [],
  })

  const models = await dispatch(host, "models")
  assert.equal(models.status, 200)
  const modelCatalog: unknown = await models.json()
  assert.deepEqual(modelIds(modelCatalog), [
    "fastino/GLiNER2.5-Decide",
    "fastino/GLiNER2.5-Decide-1B",
  ])
  assert.deepEqual(modelFamilies(modelCatalog), ["gliner25", "gliner25"])

  const response = await dispatch(host, "systemone", { ticket: "payroll" })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    path: "/v1/systemone",
    payload: { ticket: "payroll" },
  })
  const unsupported = await dispatch(host, "messages")
  assert.equal(unsupported.status, 501)
  assert.equal((await fixtureState(pluginEntry)).calls, 1)

  await host.dispose()
  assert.equal((await fixtureState(pluginEntry)).active, 0)
})

void test("System One requests drain, abort, and dispose with generations", async () => {
  const { host, pluginEntry } = await systemOneHost({ wait: true })
  const request = dispatch(host, "systemone")
  while ((await fixtureState(pluginEntry)).calls === 0) {
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  await host.dispose()
  const response = await request
  assert.equal(response.status, 200)
  assert.equal((await fixtureState(pluginEntry)).aborted, 1)
  assert.equal((await fixtureState(pluginEntry)).active, 0)
})
