import assert from "node:assert/strict"
import test from "node:test"
import { setImmediate } from "node:timers"

import {
  LlamaServerActivation,
  claimAssignedModels,
  resolveConfig,
} from "../src/index.ts"

function entry(key, state) {
  return Object.freeze({
    capabilities: { input: ["text"], output: ["text"] },
    context: { contextWindow: 4096 },
    displayName: key,
    expectedBytes: 1,
    format: "gguf",
    key,
    modelId: key,
    publication: "provider",
    state,
  })
}

class FakeRegistry {
  revision = 0
  models = new Map()
  listeners = new Set()
  claims = new Map()
  events = []

  list() {
    return Object.freeze({
      revision: this.revision,
      models: Object.freeze([...this.models.values()]),
    })
  }

  subscribe(listener) {
    this.listeners.add(listener)
    listener(this.list())
    return () => this.listeners.delete(listener)
  }

  register(key) {
    this.models.set(key, entry(key, "registered"))
    this.#publish()
  }

  unregister(key) {
    this.claims.get(key)?.dispose()
    this.models.delete(key)
    this.#publish()
  }

  async ensure(key, signal) {
    this.events.push(`ensure:${key}`)
    if (signal.aborted) throw signal.reason
    if (!this.models.has(key)) throw new Error("missing model")
    this.models.set(key, entry(key, "ready"))
    this.#publish()
    await Promise.resolve()
    return this.models.get(key)
  }

  claim(key, runner) {
    this.events.push(`claim:${key}`)
    assert.equal(this.models.get(key)?.state, "ready")
    const current = this.claims.get(key)
    if (current !== undefined && !current.released) {
      throw new Error(`Local model "${key}" already has a live runner claim.`)
    }
    let released = false
    const lease = {
      filePath: `/private/${key}.gguf`,
      manifest: {
        ...entry(key, "ready"),
        context: { contextWindow: 4096 },
      },
      runner,
      get released() {
        return released
      },
      dispose: () => {
        if (released) return
        released = true
        this.events.push(`release:${key}`)
        if (this.claims.get(key) === lease) this.claims.delete(key)
      },
      [Symbol.dispose]() {
        this.dispose()
      },
    }
    this.claims.set(key, lease)
    return lease
  }

  #publish() {
    this.revision += 1
    const snapshot = this.list()
    for (const listener of this.listeners) listener(snapshot)
  }
}

function config(assignments = { local: "model" }) {
  return resolveConfig({ executablePath: "llama-server", assignments })
}

function fixture(registry) {
  const events = registry.events
  let routes = []
  const activation = new LlamaServerActivation({
    config: config(),
    registry,
    registrar: {
      registerAdapter(providers) {
        assert.equal(registry.claims.get("model")?.released, false)
        routes = [...providers]
        events.push("register-adapter")
        const unregister = () => {
          routes = []
          events.push("unregister-adapter")
        }
        unregister.replace = (providersValue) => {
          routes = [...providersValue]
        }
        return unregister
      },
    },
    dependencies: {
      createAdapter: () => ({
        async dispose() {
          events.push("dispose-adapter")
        },
      }),
    },
  })
  return { activation, routes: () => routes }
}

async function settle() {
  for (let index = 0; index < 4; index += 1) await new Promise(setImmediate)
}

for (const order of ["model-before-runner", "runner-before-model"]) {
  test(`activates after provisioning with ${order}`, async () => {
    const registry = new FakeRegistry()
    if (order === "model-before-runner") registry.register("model")
    const value = fixture(registry)
    value.activation.start()
    assert.deepEqual(value.routes(), [])
    if (order === "runner-before-model") registry.register("model")
    await settle()

    assert.deepEqual(value.routes(), ["local"])
    assert.deepEqual(registry.events.slice(-3), [
      "ensure:model",
      "claim:model",
      "register-adapter",
    ])
    await value.activation.dispose()
    assert.deepEqual(value.routes(), [])
    assert.deepEqual(registry.events.slice(-3), [
      "unregister-adapter",
      "dispose-adapter",
      "release:model",
    ])
  })
}

test("withdraws DSH routes synchronously when a registry claim dies", async () => {
  const registry = new FakeRegistry()
  registry.register("model")
  const value = fixture(registry)
  value.activation.start()
  await settle()
  assert.deepEqual(value.routes(), ["local"])

  registry.unregister("model")
  assert.deepEqual(value.routes(), [])
  assert.ok(
    registry.events.indexOf("unregister-adapter")
      < registry.events.indexOf("dispose-adapter"),
  )
  await value.activation.dispose()
})

test("an exclusive live lease prevents a second activation", async () => {
  const registry = new FakeRegistry()
  registry.register("model")
  const first = fixture(registry)
  const second = fixture(registry)
  first.activation.start()
  await settle()
  second.activation.start()
  await settle()

  assert.equal(
    registry.events.filter((value) => value === "register-adapter").length,
    1,
  )
  assert.equal(registry.claims.get("model")?.released, false)
  await second.activation.dispose()
  await first.activation.dispose()
})

test("shares one exclusive lease across provider aliases for the same model", () => {
  let claims = 0
  const lease = { released: false, dispose() {} }
  const result = claimAssignedModels(
    {
      claim() {
        claims += 1
        return lease
      },
    },
    new Map([
      ["one", "model"],
      ["two", "model"],
    ]),
  )
  assert.equal(claims, 1)
  assert.equal(result[0].lease, result[1].lease)
})

test("rolls back an earlier claim when a complete assignment cannot be leased", () => {
  const released = []
  assert.throws(
    () =>
      claimAssignedModels(
        {
          claim(key) {
            if (key === "second") throw new Error("occupied")
            return {
              released: false,
              dispose() {
                released.push(key)
              },
            }
          },
        },
        new Map([
          ["one", "first"],
          ["two", "second"],
        ]),
      ),
    /occupied/,
  )
  assert.deepEqual(released, ["first"])
})
