import { Context } from "@deepseek-ai/cordis"
import LlmRuntime, {
  CallId,
  LlmError,
  ReasoningEffortId,
  createAssistantMessage,
  createMessage,
} from "@deepseek-ai/dsh-llm"
import assert from "node:assert/strict"
import { Buffer } from "node:buffer"
import { once } from "node:events"
import http from "node:http"
import test from "node:test"

import * as plugin from "../src/index.ts"

const API_KEY = "regression-test-key"

function config(baseUrl) {
  return {
    instances: {
      local: {
        baseUrl,
        apiKey: API_KEY,
        modelDefaults: { maxTokens: 64, contextWindow: 8192 },
      },
    },
  }
}

function message(role, content, replayState) {
  return createMessage({
    role,
    content,
    source:
      role === "assistant" ?
        {
          kind: "model",
          provider: "local",
          model: "mlx-model",
          ...(replayState === undefined ? {} : { replayState }),
        }
      : { kind: "user" },
  })
}

function hostAssistant(content, replayState) {
  return createAssistantMessage({
    content,
    source: {
      provider: "local",
      model: "mlx-model",
      replayState,
    },
  })
}

function options(overrides = {}) {
  return {
    provider: "local",
    model: "mlx-model",
    messages: [message("user", [{ type: "text", text: "hello" }])],
    maxTokens: 64,
    ...overrides,
  }
}

function event(type, value) {
  return `event: ${type}\ndata: ${JSON.stringify(value)}\n\n`
}

function messageStart() {
  return event("message_start", {
    type: "message_start",
    message: {
      id: "msg_regression",
      type: "message",
      role: "assistant",
      model: "mlx-model",
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 3, output_tokens: 0 },
    },
  })
}

function textStream(text = "ok") {
  return (
    messageStart()
    + event("content_block_start", {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    })
    + event("content_block_delta", {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text },
    })
    + event("content_block_stop", { type: "content_block_stop", index: 0 })
    + event("message_delta", {
      type: "message_delta",
      delta: { stop_reason: "end_turn", stop_sequence: null },
      usage: { input_tokens: 3, output_tokens: 1 },
    })
    + event("message_stop", { type: "message_stop" })
  )
}

function signedReasoningStream() {
  return (
    messageStart()
    + event("content_block_start", {
      type: "content_block_start",
      index: 0,
      content_block: { type: "thinking", thinking: "", signature: "" },
    })
    + event("content_block_delta", {
      type: "content_block_delta",
      index: 0,
      delta: { type: "thinking_delta", thinking: "signed plan" },
    })
    + event("content_block_delta", {
      type: "content_block_delta",
      index: 0,
      delta: { type: "signature_delta", signature: "sig-" },
    })
    + event("content_block_delta", {
      type: "content_block_delta",
      index: 0,
      delta: { type: "signature_delta", signature: "roundtrip" },
    })
    + event("content_block_stop", { type: "content_block_stop", index: 0 })
    + event("message_delta", {
      type: "message_delta",
      delta: { stop_reason: "end_turn", stop_sequence: null },
      usage: { input_tokens: 3, output_tokens: 4 },
    })
    + event("message_stop", { type: "message_stop" })
  )
}

function sendSse(response, payload) {
  response.writeHead(200, { "content-type": "text/event-stream" })
  response.end(payload)
}

async function collect(iterable) {
  const chunks = []
  for await (const chunk of iterable) chunks.push(chunk)
  return chunks
}

async function listen(handler) {
  const server = http.createServer(handler)
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const address = server.address()
  assert.notEqual(address, null)
  assert.equal(typeof address, "object")
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      server.close()
      await once(server, "close")
    },
  }
}

async function withTimeout(promise, messageText) {
  let timeout
  const deadline = new Promise((_, reject) => {
    timeout = globalThis.setTimeout(() => reject(new Error(messageText)), 1_000)
  })
  try {
    return await Promise.race([promise, deadline])
  } finally {
    globalThis.clearTimeout(timeout)
  }
}

test("sends explicit thinking semantics for default and configured reasoning", async () => {
  const bodies = []
  const endpoint = await listen(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    bodies.push(JSON.parse(Buffer.concat(chunks).toString("utf8")))
    sendSse(response, textStream())
  })

  try {
    const adapter = new plugin.OmlxAdapter(config(endpoint.baseUrl))
    await collect(adapter.stream(options()))
    await collect(
      adapter.stream(options({ reasoningEffort: ReasoningEffortId("off") })),
    )
    await collect(
      adapter.stream(options({ reasoningEffort: ReasoningEffortId("high") })),
    )

    assert.deepEqual(bodies[0].thinking, { type: "disabled" })
    assert.equal(bodies[0].chat_template_kwargs, undefined)
    assert.deepEqual(bodies[1].thinking, { type: "disabled" })
    assert.equal(bodies[1].chat_template_kwargs, undefined)
    assert.deepEqual(bodies[2].thinking, { type: "adaptive" })
    assert.deepEqual(bodies[2].chat_template_kwargs, {
      reasoning_effort: "high",
    })
  } finally {
    await endpoint.close()
  }
})

test("accepts host-shaped Anthropic replay and round-trips signed reasoning", async () => {
  const bodies = []
  const endpoint = await listen(async (_request, response) => {
    const chunks = []
    for await (const chunk of _request) chunks.push(chunk)
    bodies.push(JSON.parse(Buffer.concat(chunks).toString("utf8")))
    sendSse(
      response,
      bodies.length === 1 ? signedReasoningStream() : textStream(),
    )
  })

  try {
    const adapter = new plugin.OmlxAdapter(config(endpoint.baseUrl))
    const first = await collect(adapter.stream(options()))
    const finish = first.at(-1)
    assert.equal(finish.type, "finish")
    assert.deepEqual(finish.replayState, {
      type: "anthropic-message-v1",
      content: [
        {
          type: "thinking",
          thinking: "signed plan",
          signature: "sig-roundtrip",
        },
      ],
    })

    await collect(
      adapter.stream(
        options({
          messages: [
            message("user", [{ type: "text", text: "first" }]),
            hostAssistant(
              [{ type: "reasoning", text: "signed plan" }],
              finish.replayState,
            ),
            message("user", [{ type: "text", text: "continue" }]),
          ],
        }),
      ),
    )
    assert.deepEqual(bodies[1].messages[1].content, [
      {
        type: "thinking",
        thinking: "signed plan",
        signature: "sig-roundtrip",
      },
    ])
  } finally {
    await endpoint.close()
  }
})

test("rejects malformed and mismatched Anthropic replay before fetch", async () => {
  const adapter = new plugin.OmlxAdapter(config("http://127.0.0.1:1"))
  const malformedStates = [
    { type: "other-adapter", content: [] },
    {
      type: "anthropic-message-v1",
      content: [{ type: "thinking", thinking: "different", signature: "sig" }],
    },
    {
      type: "anthropic-message-v1",
      content: [
        {
          type: "thinking",
          thinking: "plan",
          signature: "sig",
          unexpected: true,
        },
      ],
    },
  ]
  for (const replayState of malformedStates) {
    await assert.rejects(
      collect(
        adapter.stream(
          options({
            messages: [
              message(
                "assistant",
                [{ type: "reasoning", text: "plan" }],
                replayState,
              ),
            ],
          }),
        ),
      ),
      (error) => error instanceof LlmError && error.code === "INVALID_REQUEST",
    )
  }
  await assert.rejects(
    collect(
      adapter.stream(
        options({
          messages: [
            message("assistant", [{ type: "reasoning", text: "unsigned" }]),
          ],
        }),
      ),
    ),
    (error) => error instanceof LlmError && error.code === "UNSUPPORTED",
  )
})

test("normalizes a provider error before message_start through stock DSH", async () => {
  const endpoint = await listen((request, response) => {
    if (request.url === "/v1/models") {
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify({ data: [{ id: "mlx-model" }] }))
      return
    }
    sendSse(
      response,
      event("error", {
        type: "error",
        error: { type: "overloaded_error", message: "private detail" },
      }),
    )
  })
  const ctx = new Context()
  const runtime = ctx.plugin(LlmRuntime)
  await runtime
  const fiber = ctx.plugin(plugin, config(endpoint.baseUrl))
  await fiber

  try {
    const chunks = await collect(ctx.llm.stream(options()))
    assert.equal(chunks.length, 1)
    assert.deepEqual(chunks[0], {
      type: "finish",
      reason: {
        kind: "error",
        failure: {
          code: "SERVER",
          message: "omlx: provider reported an error before message usage",
        },
      },
    })
  } finally {
    await fiber.dispose()
    await runtime.dispose()
    await endpoint.close()
  }
})

test("cancels non-success model and message response bodies", async () => {
  let modelClosedResolve
  let messageClosedResolve
  const modelClosed = new Promise((resolve) => {
    modelClosedResolve = resolve
  })
  const messageClosed = new Promise((resolve) => {
    messageClosedResolve = resolve
  })
  const endpoint = await listen((request, response) => {
    response.writeHead(500, { "content-type": "application/json" })
    response.write('{"private":"body stays open"}')
    response.on(
      "close",
      request.url === "/v1/models" ? modelClosedResolve : messageClosedResolve,
    )
  })

  try {
    const adapter = new plugin.OmlxAdapter(config(endpoint.baseUrl))
    await assert.rejects(adapter.listModels("local"), { code: "SERVER" })
    await withTimeout(modelClosed, "model error response stayed open")
    await assert.rejects(collect(adapter.stream(options())), { code: "SERVER" })
    await withTimeout(messageClosed, "message error response stayed open")
  } finally {
    await endpoint.close()
  }
})

test("plugin disposal aborts active requests and removes the alias", async () => {
  const endpoint = await listen((request, response) => {
    if (request.url === "/v1/models") {
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify({ data: [{ id: "mlx-model" }] }))
      return
    }
    response.writeHead(200, { "content-type": "text/event-stream" })
    response.write(messageStart())
    response.write(
      event("content_block_start", {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      }),
    )
  })
  const ctx = new Context()
  const runtime = ctx.plugin(LlmRuntime)
  await runtime
  const fiber = ctx.plugin(plugin, config(endpoint.baseUrl))
  await fiber

  try {
    const iterator = ctx.llm.stream(options())[Symbol.asyncIterator]()
    assert.deepEqual(await iterator.next(), {
      done: false,
      value: { type: "block-start", index: 0, blockType: "text" },
    })
    await fiber.dispose()
    const terminal = await iterator.next()
    assert.equal(terminal.value.type, "finish")
    assert.equal(terminal.value.reason.kind, "aborted")
    assert.deepEqual(ctx.llm.listProviders(), [])
  } finally {
    await runtime.dispose()
    await endpoint.close()
  }
})

test("rejects unsupported values and malformed tool arguments before fetch", async () => {
  const adapter = new plugin.OmlxAdapter(config("http://127.0.0.1:1"))
  const unsupported = [
    options({
      messages: [
        message("user", [{ type: "image", attachment: { id: "attachment" } }]),
      ],
    }),
    options({ sessionId: "session" }),
    options({ purpose: "compaction" }),
    options({
      messages: [
        message("user", [{ type: "reasoning", text: "not assistant" }]),
      ],
    }),
  ]
  for (const request of unsupported) {
    await assert.rejects(
      collect(adapter.stream(request)),
      (error) => error instanceof LlmError && error.code === "UNSUPPORTED",
    )
  }

  await assert.rejects(
    collect(
      adapter.stream(
        options({
          messages: [
            message("assistant", [
              {
                type: "tool-call",
                id: CallId("call"),
                name: "tool",
                arguments: "not-json",
              },
            ]),
          ],
        }),
      ),
    ),
    (error) => error instanceof LlmError && error.code === "INVALID_REQUEST",
  )
})
