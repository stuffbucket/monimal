import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import type { MaximalPiHost, PiCommandContext } from "../src/pi/extension.ts"

import { installMaximalPi } from "../src/pi/extension.ts"

class FakePi implements MaximalPiHost {
  readonly providers = new Map<
    string,
    Parameters<MaximalPiHost["registerProvider"]>[1]
  >()
  readonly commands = new Map<
    string,
    Parameters<MaximalPiHost["registerCommand"]>[1]
  >()
  shutdown: (() => void) | undefined
  registerProvider(
    id: string,
    config: Parameters<MaximalPiHost["registerProvider"]>[1],
  ): void {
    this.providers.set(id, config)
  }
  unregisterProvider(id: string): void {
    this.providers.delete(id)
  }
  registerCommand(
    name: string,
    command: Parameters<MaximalPiHost["registerCommand"]>[1],
  ): void {
    this.commands.set(name, command)
  }
  on(_event: "session_shutdown", handler: () => void): void {
    this.shutdown = handler
  }
}
const entry = (provider: string) => ({
  source: "provider",
  provider,
  providerName: provider,
  id: "same-id",
  name: "Model",
  basePath: `/${provider}/v1`,
  operations: ["messages"],
  contextWindowTokens: 32768,
  maxOutputTokens: 4096,
  capabilities: { vision: null, tools: null, reasoning: null },
  targets: [],
})
const reviewedConfig = () => ({
  schemaVersion: 1,
  origin: "https://proxy.example.test",
  apiKeyEnv: "MAXIMAL_TEST_KEY",
  overrides: ["a", "b", "c"].map((provider) => ({
    source: "provider",
    provider,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  })),
})
const context: PiCommandContext = {
  hasUI: false,
  ui: { notify: () => undefined },
}
async function withFixture(
  action: (file: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "maximal-pi-extension-test-"))
  const file = join(directory, "config.json")
  await writeFile(file, JSON.stringify(reviewedConfig()), { mode: 0o600 })
  try {
    await action(file)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

await test("native refresh callbacks and explicit refresh reconcile provider identities without inference", () =>
  withFixture(async (file) => {
    const host = new FakePi()
    let providers = ["a", "b"]
    const calls: Array<string> = []
    const fetchImplementation: typeof fetch = (input, init) => {
      calls.push(input instanceof Request ? input.url : input.toString())
      assert.equal(init?.method, "GET")
      return Promise.resolve(
        Response.json({
          schemaVersion: 1,
          data: providers.map((provider) => entry(provider)),
        }),
      )
    }
    await installMaximalPi(host, file, {
      environment: { MAXIMAL_TEST_KEY: "test-key" },
      fetchImplementation,
    })
    assert.deepEqual(
      [...host.providers.keys()],
      ["maximal-provider-a", "maximal-provider-b"],
    )
    const previous = host.providers.get("maximal-provider-a")
    assert(previous)
    assert.equal(previous.apiKey, "$MAXIMAL_TEST_KEY")
    providers = ["b", "c"]
    assert.deepEqual(
      await previous.refreshModels({ signal: new AbortController().signal }),
      [],
    )
    assert.equal(host.providers.has("maximal-provider-c"), false)
    await host.commands.get("maximal-refresh")?.handler("", context)
    assert.deepEqual(
      [...host.providers.keys()],
      ["maximal-provider-b", "maximal-provider-c"],
    )
    assert.deepEqual(
      await previous.refreshModels({ signal: new AbortController().signal }),
      [],
    )
    assert.equal(calls.length, 4)
    assert(
      calls.every(
        (url) => url === "https://proxy.example.test/v1/models?format=maximal",
      ),
    )
    host.shutdown?.()
  }))

await test("failed refresh withdraws only this extension's providers and clears stale inspection results", () =>
  withFixture(async (file) => {
    const host = new FakePi()
    let fail = false
    const fetchImplementation: typeof fetch = () =>
      Promise.resolve(
        fail ?
          new Response("secret-upstream-error", { status: 503 })
        : Response.json({ schemaVersion: 1, data: [entry("a")] }),
      )
    await installMaximalPi(host, file, {
      environment: { MAXIMAL_TEST_KEY: "test-key" },
      fetchImplementation,
    })
    const managed = host.providers.get("maximal-provider-a")
    assert(managed)
    host.registerProvider("unrelated", managed)
    fail = true
    await assert.rejects(
      managed.refreshModels({ signal: new AbortController().signal }),
      /withdrawn/u,
    )
    assert.deepEqual([...host.providers.keys()], ["unrelated"])
    const notifications: Array<string> = []
    await host.commands.get("maximal-models")?.handler("", {
      hasUI: true,
      ui: {
        notify: (message) => {
          notifications.push(message)
        },
      },
    })
    assert.match(notifications[0] ?? "", /0 chat models across 0 providers/u)
    assert(
      !notifications.some((message) =>
        message.includes("secret-upstream-error"),
      ),
    )
    host.shutdown?.()
  }))

await test("origin or credential-reference edits require restart and never forward a key to the new destination", () =>
  withFixture(async (file) => {
    for (const update of [
      { origin: "https://different.example.test" },
      { apiKeyEnv: "ANOTHER_KEY" },
    ]) {
      await writeFile(file, JSON.stringify(reviewedConfig()))
      const host = new FakePi()
      let calls = 0
      const fetchImplementation: typeof fetch = () => {
        calls++
        return Promise.resolve(
          Response.json({ schemaVersion: 1, data: [entry("a")] }),
        )
      }
      await installMaximalPi(host, file, {
        environment: {
          MAXIMAL_TEST_KEY: "test-key",
          ANOTHER_KEY: "another-key",
        },
        fetchImplementation,
      })
      await writeFile(file, JSON.stringify({ ...reviewedConfig(), ...update }))
      await host.commands.get("maximal-refresh")?.handler("", context)
      assert.equal(calls, 1)
      assert.equal(host.providers.size, 0)
      host.shutdown?.()
    }
  }))

await test("a late native callback cannot resurrect inventory withdrawn by a newer failure", () =>
  withFixture(async (file) => {
    const host = new FakePi()
    const pending = Promise.withResolvers<Response>()
    const started = Promise.withResolvers<undefined>()
    const response = () =>
      Response.json({ schemaVersion: 1, data: [entry("a")] })
    let calls = 0
    const fetchImplementation: typeof fetch = () => {
      calls++
      if (calls === 2) {
        started.resolve(undefined)
        return pending.promise
      }
      return Promise.resolve(
        calls === 3 ? new Response(null, { status: 503 }) : response(),
      )
    }
    await installMaximalPi(host, file, {
      environment: { MAXIMAL_TEST_KEY: "test-key" },
      fetchImplementation,
    })
    const provider = host.providers.get("maximal-provider-a")
    assert(provider)
    const stale = provider.refreshModels({
      signal: new AbortController().signal,
    })
    await started.promise
    await assert.rejects(
      provider.refreshModels({ signal: new AbortController().signal }),
      /withdrawn/u,
    )
    pending.resolve(response())
    assert.deepEqual(await stale, [])
    assert.equal(host.providers.size, 0)
    host.shutdown?.()
  }))

await test("native refresh accepts an omitted signal and cancellation does not withdraw a healthy provider", () =>
  withFixture(async (file) => {
    const host = new FakePi()
    let calls = 0
    const fetchImplementation: typeof fetch = () => {
      calls++
      return Promise.resolve(
        Response.json({ schemaVersion: 1, data: [entry("a")] }),
      )
    }
    await installMaximalPi(host, file, {
      environment: { MAXIMAL_TEST_KEY: "test-key" },
      fetchImplementation,
    })
    const provider = host.providers.get("maximal-provider-a")
    assert(provider)
    assert.equal((await provider.refreshModels({})).length, 1)
    const controller = new AbortController()
    controller.abort()
    assert.deepEqual(
      await provider.refreshModels({ signal: controller.signal }),
      [],
    )
    assert.equal(calls, 2)
    assert.equal(host.providers.size, 1)
    host.shutdown?.()
  }))
