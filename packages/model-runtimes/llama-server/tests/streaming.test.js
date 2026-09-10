import assert from "node:assert/strict"
import test from "node:test"

import {
  LlamaServerAdapter,
  parseOpenAiSse,
  resolveConfig,
  translateOpenAiSse,
} from "../src/index.ts"

const { AbortController, ReadableStream, Response, TextEncoder } = globalThis

function byteStream(parts, close = true) {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part))
      if (close) controller.close()
    },
  })
}

async function collect(iterable) {
  const values = []
  for await (const value of iterable) values.push(value)
  return values
}

test("parses chunked SSE and translates reasoning, text, tools, usage, and finish", async () => {
  const stream = byteStream([
    ": keepalive\n",
    'data: {"choices":[{"index":0,"delta":{"reasoning_content":"think "}}]}\n\n',
    'data: {"choices":[{"index":0,"delta":{"content":"answer"}}]}\n\n',
    'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call-1","function":{"name":"lookup","arguments":"{\\"q\\":"}}]}}]}\n\n',
    'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"1}"}}]},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":3,"completion_tokens":4}}\n\n',
    "data: [DONE]\n\n",
  ])

  assert.deepEqual(await collect(translateOpenAiSse(parseOpenAiSse(stream))), [
    { type: "block-start", index: 0, blockType: "reasoning" },
    { type: "reasoning-delta", index: 0, text: "think " },
    { type: "block-start", index: 1, blockType: "text" },
    { type: "text-delta", index: 1, text: "answer" },
    { type: "block-start", index: 2, blockType: "tool-call" },
    {
      type: "tool-call-delta",
      index: 2,
      id: "call-1",
      name: "lookup",
      argumentsDelta: '{"q":',
    },
    {
      type: "tool-call-delta",
      index: 2,
      id: "call-1",
      argumentsDelta: "1}",
    },
    {
      type: "block-end",
      index: 0,
      block: { type: "reasoning", text: "think " },
    },
    {
      type: "block-end",
      index: 1,
      block: { type: "text", text: "answer" },
    },
    {
      type: "block-end",
      index: 2,
      block: {
        type: "tool-call",
        id: "call-1",
        name: "lookup",
        arguments: '{"q":1}',
      },
    },
    { type: "usage", usage: { inputTokens: 3, outputTokens: 4 } },
    { type: "finish", reason: { kind: "tool-calls" } },
  ])
})

test("rejects a stream that ends without the authenticated protocol terminator", async () => {
  const stream = byteStream([
    'data: {"choices":[{"index":0,"delta":{"content":"partial"},"finish_reason":"stop"}]}\n\n',
  ])
  await assert.rejects(
    collect(translateOpenAiSse(parseOpenAiSse(stream))),
    /stream ended before \[DONE\]/,
  )
})

test("cancels the private request when a stream consumer stops early", async () => {
  let requestSignal
  let disposed = false
  const transport = {
    async request(_path, _init, signal) {
      requestSignal = signal
      return new Response(
        byteStream(
          ['data: {"choices":[{"index":0,"delta":{"content":"first"}}]}\n\n'],
          false,
        ),
        {
          headers: { "content-type": "text/event-stream" },
        },
      )
    },
    async dispose() {
      disposed = true
    },
  }
  const claimed = {
    provider: "local",
    lease: {
      filePath: "/private/model.gguf",
      manifest: {
        displayName: "Fixture",
        modelId: "fixture",
        context: { contextWindow: 4096 },
      },
      released: false,
    },
  }
  const adapter = new LlamaServerAdapter(
    resolveConfig({
      executablePath: "llama-server",
      assignments: { local: "model" },
    }),
    [claimed],
    { createTransport: () => transport },
  )

  for await (const chunk of adapter.stream({
    provider: "local",
    model: "fixture",
    messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
  })) {
    assert.equal(chunk.type, "block-start")
    break
  }
  assert.equal(requestSignal.aborted, true)
  await adapter.dispose()
  assert.equal(disposed, true)
})

test("does not surface private response identifiers through DSH errors", async () => {
  const adapter = new LlamaServerAdapter(
    resolveConfig({
      executablePath: "llama-server",
      assignments: { local: "model" },
    }),
    [
      {
        provider: "local",
        lease: {
          filePath: "/private/model.gguf",
          manifest: {
            displayName: "Fixture",
            modelId: "fixture",
            context: { contextWindow: 4096 },
          },
          released: false,
        },
      },
    ],
    {
      createTransport: () => ({
        async request() {
          return new Response("failure", {
            status: 500,
            headers: { "x-request-id": "private-process-secret" },
          })
        },
        async dispose() {},
      }),
    },
  )

  await assert.rejects(
    collect(
      adapter.stream({
        provider: "local",
        model: "fixture",
        messages: [],
      }),
    ),
    (error) => {
      assert.equal(error.failure.status, 500)
      assert.equal(error.failure.requestId, undefined)
      assert.doesNotMatch(error.message, /private-process-secret|model\.gguf/)
      return true
    },
  )
  await adapter.dispose()
})

test("maps caller cancellation to a redacted DSH aborted error", async () => {
  const controller = new AbortController()
  const transport = {
    async request(_path, _init, signal) {
      controller.abort("caller-private-reason")
      throw signal.reason
    },
    async dispose() {},
  }
  const adapter = new LlamaServerAdapter(
    resolveConfig({
      executablePath: "llama-server",
      assignments: { local: "model" },
    }),
    [
      {
        provider: "local",
        lease: {
          filePath: "/private/model.gguf",
          manifest: {
            displayName: "Fixture",
            modelId: "fixture",
            context: { contextWindow: 4096 },
          },
          released: false,
        },
      },
    ],
    { createTransport: () => transport },
  )

  await assert.rejects(
    collect(
      adapter.stream({
        provider: "local",
        model: "fixture",
        messages: [],
        signal: controller.signal,
      }),
    ),
    (error) => {
      assert.equal(error.code, "ABORTED")
      assert.doesNotMatch(error.message, /caller-private-reason|model\.gguf/)
      return true
    },
  )
  await adapter.dispose()
})
