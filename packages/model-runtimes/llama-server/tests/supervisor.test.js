import assert from "node:assert/strict"
import test from "node:test"

import { LlamaServerSupervisor, resolveConfig } from "../src/index.ts"

const { AbortController, Headers, Response } = globalThis

class FakeChild {
  stdout = null
  stderr = null
  signals = []
  exitOnKill = true
  listeners = new Map()

  once(event, listener) {
    this.listeners.set(event, listener)
    return this
  }

  kill(signal) {
    this.signals.push(signal)
    if (this.exitOnKill) this.listeners.get("exit")?.(0, signal)
    return true
  }
}

function lease(filePath = "/private/model.gguf") {
  return {
    filePath,
    manifest: {},
    runner: {},
    released: false,
    dispose() {},
    [Symbol.dispose]() {},
  }
}

function supervisorConfig(overrides = {}) {
  return {
    executablePath: "/private/llama-server",
    serverArguments: ["--threads", "2"],
    maxRestarts: 1,
    startupTimeoutMs: 100,
    shutdownTimeoutMs: 2,
    ...overrides,
  }
}

test("rejects every runner-owned server argument spelling", () => {
  const forbidden = [
    "--host",
    "--host=0.0.0.0",
    "--port",
    "--port=8080",
    "--api-key",
    "--api-key=public",
    "--api-key-file",
    "--api-key-file=keys",
    "--model",
    "--model=file.gguf",
    "-m",
    "-mfile.gguf",
  ]
  for (const argument of forbidden) {
    assert.throws(
      () =>
        resolveConfig({
          executablePath: "llama-server",
          assignments: { local: "model" },
          serverArguments: [argument],
        }),
      /runner-owned/,
      argument,
    )
  }
  assert.deepEqual(
    resolveConfig({
      executablePath: "llama-server",
      assignments: { local: "model" },
      serverArguments: ["--threads=4"],
    }).serverArguments,
    ["--threads=4"],
  )
})

test("uses loopback, an ephemeral port, and authenticated probes and requests", async () => {
  const calls = []
  const spawns = []
  const child = new FakeChild()
  const server = new LlamaServerSupervisor(lease(), supervisorConfig(), {
    createApiKey: () => "process-secret",
    reservePort: async () => 43_210,
    spawn: (executable, arguments_) => {
      spawns.push({ executable, arguments_ })
      return child
    },
    fetch: async (url, init) => {
      calls.push({ url, init })
      return new Response(url.endsWith("/health") ? "healthy" : "result")
    },
  })

  const response = await server.request(
    "/v1/chat/completions",
    { headers: { authorization: "Bearer attacker", "x-test": "yes" } },
    new AbortController().signal,
  )
  assert.equal(await response.text(), "result")
  assert.deepEqual(spawns, [
    {
      executable: "/private/llama-server",
      arguments_: [
        "--threads",
        "2",
        "--model",
        "/private/model.gguf",
        "--host",
        "127.0.0.1",
        "--port",
        "43210",
        "--api-key",
        "process-secret",
      ],
    },
  ])
  assert.equal(calls.length, 2)
  assert.equal(calls[0].url, "http://127.0.0.1:43210/health")
  assert.equal(calls[1].url, "http://127.0.0.1:43210/v1/chat/completions")
  for (const { init } of calls) {
    assert.equal(
      new Headers(init.headers).get("authorization"),
      "Bearer process-secret",
    )
  }
  assert.equal(new Headers(calls[1].init.headers).get("x-test"), "yes")
  await server.dispose()
  assert.deepEqual(child.signals, ["SIGTERM"])
})

test("uses a new key on restart and bounds request retries", async () => {
  const spawnArguments = []
  const children = []
  const keys = ["first-secret", "second-secret"]
  let launches = 0
  const server = new LlamaServerSupervisor(lease(), supervisorConfig(), {
    createApiKey: () => keys[launches],
    reservePort: async () => 40_000 + launches,
    spawn: (_executable, arguments_) => {
      spawnArguments.push(arguments_)
      const child = new FakeChild()
      children.push(child)
      launches += 1
      return child
    },
    fetch: async (url, init) => {
      if (url.endsWith("/health")) {
        const expected = `Bearer ${keys[launches - 1]}`
        assert.equal(new Headers(init.headers).get("authorization"), expected)
        return new Response("ok")
      }
      throw new Error(`private failure ${url}`)
    },
  })

  await assert.rejects(
    server.request("/v1/chat/completions", {}, new AbortController().signal),
    (error) => {
      assert.match(error.message, /bounded restart attempt/)
      assert.doesNotMatch(
        error.message,
        /first-secret|second-secret|4000|health|127\.0\.0\.1/,
      )
      return true
    },
  )
  assert.equal(children.length, 2)
  assert.equal(spawnArguments[0].at(-1), "first-secret")
  assert.equal(spawnArguments[1].at(-1), "second-secret")
  assert.deepEqual(
    children.map((child) => child.signals),
    [["SIGTERM"], ["SIGTERM"]],
  )
})

test("redacts startup details and escalates bounded disposal", async () => {
  const child = new FakeChild()
  child.exitOnKill = false
  const server = new LlamaServerSupervisor(
    lease(),
    supervisorConfig({ startupTimeoutMs: 1, shutdownTimeoutMs: 1 }),
    {
      createApiKey: () => "never-report-this",
      reservePort: async () => 54_321,
      spawn: () => child,
      fetch: async () => new Response("not ready", { status: 503 }),
    },
  )

  await assert.rejects(
    server.request("/v1/chat/completions", {}, new AbortController().signal),
    (error) => {
      assert.doesNotMatch(
        error.message,
        /never-report-this|54321|health|127\.0\.0\.1|\/v1\/chat/,
      )
      return true
    },
  )
  assert.deepEqual(child.signals, ["SIGTERM", "SIGKILL"])
  await server.dispose()
})
