import { Context } from "@deepseek-ai/cordis"
import LlmRuntime, {
  LlmAdapter,
  type GenerateOptions,
  type StreamChunk,
} from "@deepseek-ai/dsh-llm"
import assert from "node:assert/strict"
import test from "node:test"

import * as plugin from "../src/index.ts"
import {
  baseConfig,
  closesWithin,
  collect,
  createHarness,
  requestOptions,
  sseEvent,
  startServer,
  terminalFailure,
} from "./helpers.ts"

test("activates and disposes genuine Cordis adapter aliases", async () => {
  const harness = await createHarness({
    instances: [
      {
        aliases: ["anthropic", "claude"],
        apiKey: "secret-one",
        baseURL: "https://api.anthropic.com",
        displayName: "Claude service",
      },
    ],
  })
  try {
    assert.deepEqual(harness.ctx.llm.listProviders(), [
      { id: "anthropic", name: "Claude service" },
      { id: "claude", name: "Claude service" },
    ])
    await harness.providerFiber.dispose()
    assert.deepEqual(harness.ctx.llm.listProviders(), [])
  } finally {
    await harness.dispose()
  }
})

test("alias conflicts are atomic and preserve the existing adapter", async () => {
  class ExistingAdapter extends LlmAdapter {
    async *stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
      yield { reason: { kind: "stop" }, type: "finish" }
    }
  }
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin({
    apply(child: Context) {
      child.llm.registerAdapter(["occupied"], new ExistingAdapter())
    },
    inject: ["llm"],
  })
  const attempted = ctx.plugin(plugin, {
    instances: [
      {
        aliases: ["free", "occupied"],
        apiKey: "secret-two",
        baseURL: "https://api.anthropic.com",
      },
    ],
  })
  await assert.rejects(attempted.await(), (error: unknown) => {
    assert.equal((error as { code?: unknown }).code, "DUPLICATE_ADAPTER")
    return true
  })
  assert.deepEqual(ctx.llm.listProviders(), [
    { id: "occupied", name: "occupied" },
  ])
  await ctx.fiber.dispose()
})

test("configuration rejects non-root URLs, duplicate aliases, and redacts keys", async () => {
  const secret = "never-print-this-secret"
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  const invalidURL = ctx.plugin(plugin, {
    instances: [
      {
        aliases: ["anthropic"],
        apiKey: secret,
        baseURL: "https://example.test/path?credential=visible",
      },
    ],
  })
  await assert.rejects(invalidURL.await(), (error: unknown) => {
    assert.match(String(error), /root HTTP\(S\) URL/)
    assert.doesNotMatch(String(error), new RegExp(secret))
    return true
  })

  const duplicate = ctx.plugin(plugin, {
    instances: [
      {
        aliases: ["same"],
        apiKey: secret,
        baseURL: "https://example.test",
      },
      {
        aliases: ["same"],
        apiKey: secret,
        baseURL: "http://localhost:8123",
      },
    ],
  })
  await assert.rejects(duplicate.await(), (error: unknown) => {
    assert.match(String(error), /alias.*duplicated/)
    assert.doesNotMatch(String(error), new RegExp(secret))
    return true
  })
  assert.equal(JSON.stringify(plugin.Config.toJSON()).includes(secret), false)
  await ctx.fiber.dispose()
})

test("caller abort produces an aborted finish and closes HTTP work", async () => {
  let closed!: () => void
  const closedPromise = new Promise<void>((resolve) => {
    closed = resolve
  })
  const server = await startServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/event-stream" })
    response.on("close", closed)
    response.write(
      sseEvent("message_start", {
        message: {
          content: [],
          id: "msg_abort",
          model: "claude-opus-5",
          role: "assistant",
          stop_reason: null,
          stop_sequence: null,
          type: "message",
          usage: { input_tokens: 1, output_tokens: 0 },
        },
        type: "message_start",
      }),
    )
    response.write(
      sseEvent("content_block_start", {
        content_block: { text: "", type: "text" },
        index: 0,
        type: "content_block_start",
      }),
    )
  })
  const harness = await createHarness(baseConfig(server.origin))
  try {
    const controller = new AbortController()
    const stream = harness.ctx.llm.stream(
      requestOptions({ signal: controller.signal }),
    )
    const iterator = stream[Symbol.asyncIterator]()
    assert.equal((await iterator.next()).value?.type, "block-start")
    controller.abort()
    const rest: Array<StreamChunk> = []
    while (true) {
      const item = await iterator.next()
      if (item.done) break
      rest.push(item.value)
    }
    assert.equal(terminalFailure(rest).kind, "aborted")
    await closesWithin(closedPromise)
  } finally {
    await harness.dispose()
    await server.close()
  }
})

test("iterator return and plugin disposal both cancel in-flight responses", async () => {
  let closeCount = 0
  let requestCount = 0
  let closeObserved!: () => void
  let secondStarted!: () => void
  const closeObservedPromise = new Promise<void>((resolve) => {
    closeObserved = resolve
  })
  const secondStartedPromise = new Promise<void>((resolve) => {
    secondStarted = resolve
  })
  const server = await startServer((_request, response) => {
    requestCount += 1
    if (requestCount === 2) secondStarted()
    response.writeHead(200, { "content-type": "text/event-stream" })
    response.on("close", () => {
      closeCount += 1
      if (closeCount === 2) closeObserved()
    })
    response.write(
      sseEvent("message_start", {
        message: {
          content: [],
          id: "msg_open",
          model: "claude-opus-5",
          role: "assistant",
          stop_reason: null,
          stop_sequence: null,
          type: "message",
          usage: { input_tokens: 1, output_tokens: 0 },
        },
        type: "message_start",
      })
        + sseEvent("content_block_start", {
          content_block: { text: "", type: "text" },
          index: 0,
          type: "content_block_start",
        }),
    )
  })
  const harness = await createHarness(baseConfig(server.origin))
  try {
    const first = harness.ctx.llm
      .stream(requestOptions())
      [Symbol.asyncIterator]()
    assert.equal((await first.next()).value?.type, "block-start")
    await first.return?.()

    const secondPromise = collect(harness.ctx.llm.stream(requestOptions()))
    await secondStartedPromise
    await harness.providerFiber.dispose()
    const second = await secondPromise
    assert.equal(terminalFailure(second).kind, "aborted")
    assert.deepEqual(harness.ctx.llm.listProviders(), [])
    await closesWithin(closeObservedPromise)
  } finally {
    await harness.dispose()
    await server.close()
  }
})
