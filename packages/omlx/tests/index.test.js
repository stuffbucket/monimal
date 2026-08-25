import { Context } from "@deepseek-ai/cordis"
import LlmRuntime, {
  CallId,
  LlmError,
  ReasoningEffortId,
  createMessage,
} from "@deepseek-ai/dsh-llm"
import assert from "node:assert/strict"
import { Buffer } from "node:buffer"
import { once } from "node:events"
import http from "node:http"
import { ReadableStream } from "node:stream/web"
import test from "node:test"
import { TextEncoder } from "node:util"

import * as plugin from "../src/index.ts"
import { parseSse, translateSse } from "../src/sse.ts"

const API_KEY = "stock-test-key"

function config(baseUrl, overrides = {}) {
  return {
    instances: {
      local: {
        baseUrl,
        apiKey: API_KEY,
        modelDefaults: { maxTokens: 64, contextWindow: 8192 },
        ...overrides,
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

function options(overrides = {}) {
  return {
    provider: "local",
    model: "mlx-model",
    messages: [message("user", [{ type: "text", text: "hello" }])],
    maxTokens: 64,
    ...overrides,
  }
}

function event(type, value, newline = "\n") {
  return `event: ${type}${newline}data: ${JSON.stringify(value)}${newline}${newline}`
}

function messageStart(inputTokens = 3) {
  return event("message_start", {
    type: "message_start",
    message: {
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: "mlx-model",
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: inputTokens, output_tokens: 0 },
    },
  })
}

function textStream(text = "hello") {
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
      usage: { input_tokens: 4, output_tokens: 2 },
    })
    + event("message_stop", { type: "message_stop" })
  )
}

function byteStream(bytes, split = bytes.length) {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes.subarray(0, split))
      if (split < bytes.length) controller.enqueue(bytes.subarray(split))
      controller.close()
    },
  })
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
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    },
  }
}

function sendSse(response, payload) {
  response.writeHead(200, { "content-type": "text/event-stream" })
  response.end(payload)
}

test("exports the stock Cordis plugin surface and compatibility descriptor", () => {
  assert.equal(plugin.name, "omlx")
  assert.deepEqual(plugin.inject, ["llm"])
  assert.equal(typeof plugin.Config, "function")
  assert.equal(typeof plugin.apply, "function")
  assert.deepEqual(plugin.omlxBackendDescriptor, {
    id: "omlx",
    modelFormat: "mlx",
    transport: "http",
  })
  assert.equal(Object.isFrozen(plugin.omlxBackendDescriptor), true)
})

test("activates and disposes aliases under stock Cordis without residual routes", async () => {
  const ctx = new Context()
  const runtime = ctx.plugin(LlmRuntime)
  await runtime
  const fiber = ctx.plugin(plugin, {
    instances: {
      alpha: { baseUrl: "http://127.0.0.1:1", apiKey: API_KEY },
      beta: { baseUrl: "https://localhost/", apiKey: API_KEY },
    },
  })
  await fiber

  assert.deepEqual(ctx.llm.listProviders(), [
    { id: "alpha", name: "oMLX (alpha)" },
    { id: "beta", name: "oMLX (beta)" },
  ])

  await fiber.dispose()
  assert.deepEqual(ctx.llm.listProviders(), [])
  await runtime.dispose()
})

test("alias conflicts are atomic and preserve the first registration", async () => {
  const ctx = new Context()
  const runtime = ctx.plugin(LlmRuntime)
  await runtime
  const first = ctx.plugin(plugin, {
    instances: { shared: { baseUrl: "http://127.0.0.1:1", apiKey: API_KEY } },
  })
  await first
  const conflicting = ctx.plugin(plugin, {
    instances: { shared: { baseUrl: "http://127.0.0.1:2", apiKey: API_KEY } },
  })
  await assert.rejects(
    async () => await conflicting,
    (error) => error.code === "DUPLICATE_ADAPTER",
  )
  assert.deepEqual(ctx.llm.listProviders(), [
    { id: "shared", name: "oMLX (shared)" },
  ])

  await conflicting.dispose()
  await first.dispose()
  await runtime.dispose()
})

test("normalizes only credential-free root HTTP(S) URLs", () => {
  assert.equal(
    plugin.normalizeBaseUrl("a", "http://localhost:8000/"),
    "http://localhost:8000",
  )
  assert.equal(
    plugin.normalizeBaseUrl("a", "https://EXAMPLE.com"),
    "https://example.com",
  )

  for (const value of [
    "ftp://localhost",
    "http://user:pass@localhost",
    "http://localhost/v1",
    "http://localhost/?query=1",
    "http://localhost/#fragment",
    " http://localhost",
  ]) {
    assert.throws(() => plugin.normalizeBaseUrl("a", value))
  }
})

test("validates instance config and never echoes secrets", () => {
  assert.throws(
    () => plugin.resolveConfig({ instances: {} }),
    /at least one instance/,
  )
  assert.throws(
    () =>
      plugin.resolveConfig({
        instances: {
          " bad ": { baseUrl: "http://localhost", apiKey: API_KEY },
        },
      }),
    /aliases/,
  )
  assert.throws(
    () =>
      plugin.resolveConfig({
        instances: {
          local: {
            baseUrl: "http://url-secret@example.com",
            apiKey: "api-secret\n",
          },
        },
      }),
    (error) =>
      !error.message.includes("url-secret")
      && !error.message.includes("api-secret"),
  )
  assert.throws(
    () =>
      plugin.resolveConfig({
        instances: {
          local: {
            baseUrl: "http://localhost",
            apiKey: API_KEY,
            modelDefaults: { maxTokens: 0 },
          },
        },
      }),
    /positive safe integer/,
  )
})

test("sends exact oMLX headers and Anthropic Messages request body", async () => {
  let captured
  const endpoint = await listen(async (request, response) => {
    const body = []
    for await (const chunk of request) body.push(chunk)
    captured = {
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: JSON.parse(Buffer.concat(body).toString("utf8")),
    }
    sendSse(response, textStream("ok"))
  })

  try {
    const adapter = new plugin.OmlxAdapter(config(endpoint.baseUrl))
    const toolId = CallId("call_1")
    const chunks = await collect(
      adapter.stream(
        options({
          system: "top-level system",
          reasoningEffort: ReasoningEffortId("high"),
          temperature: 0.25,
          stop: ["STOP"],
          messages: [
            message("system", [{ type: "text", text: "history system" }]),
            message("user", [{ type: "text", text: "question" }]),
            message(
              "assistant",
              [
                { type: "reasoning", text: "thought" },
                { type: "text", text: "calling" },
                {
                  type: "tool-call",
                  id: toolId,
                  name: "lookup",
                  arguments: '{"q":"x"}',
                },
              ],
              {
                type: "anthropic-message-v1",
                content: [
                  {
                    type: "thinking",
                    thinking: "thought",
                    signature: "sig-history",
                  },
                  { type: "text", text: "calling" },
                  {
                    type: "tool_use",
                    id: "call_1",
                    name: "lookup",
                    input: { q: "x" },
                  },
                ],
              },
            ),
            message("user", [
              {
                type: "tool-result",
                toolCallId: toolId,
                content: [{ type: "text", text: "result" }],
                isError: false,
              },
            ]),
          ],
          tools: [
            {
              name: "lookup",
              description: "Look up a value",
              parameters: {
                type: "object",
                properties: { q: { type: "string" } },
                required: ["q"],
                additionalProperties: false,
              },
            },
          ],
        }),
      ),
    )

    assert.equal(chunks.at(-1).type, "finish")
    assert.equal(captured.method, "POST")
    assert.equal(captured.url, "/v1/messages")
    assert.equal(captured.headers.authorization, `Bearer ${API_KEY}`)
    assert.equal(captured.headers.accept, "text/event-stream")
    assert.equal(captured.headers["content-type"], "application/json")
    assert.match(captured.headers["user-agent"], /^deepseek-harness\//)
    assert.equal(captured.headers["x-api-key"], undefined)
    assert.deepEqual(captured.body, {
      model: "mlx-model",
      max_tokens: 64,
      messages: [
        { role: "system", content: [{ type: "text", text: "history system" }] },
        { role: "user", content: [{ type: "text", text: "question" }] },
        {
          role: "assistant",
          content: [
            {
              type: "thinking",
              thinking: "thought",
              signature: "sig-history",
            },
            { type: "text", text: "calling" },
            {
              type: "tool_use",
              id: "call_1",
              name: "lookup",
              input: { q: "x" },
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "call_1",
              content: [{ type: "text", text: "result" }],
              is_error: false,
            },
          ],
        },
      ],
      stream: true,
      system: "top-level system",
      tools: [
        {
          name: "lookup",
          description: "Look up a value",
          input_schema: {
            type: "object",
            properties: { q: { type: "string" } },
            required: ["q"],
            additionalProperties: false,
          },
        },
      ],
      temperature: 0.25,
      stop_sequences: ["STOP"],
      thinking: { type: "adaptive" },
      chat_template_kwargs: { reasoning_effort: "high" },
    })
  } finally {
    await endpoint.close()
  }
})

test("discovers and resolves models through advisory GET /v1/models", async () => {
  const requests = []
  const endpoint = await listen((request, response) => {
    requests.push({
      method: request.method,
      url: request.url,
      auth: request.headers.authorization,
    })
    response.writeHead(200, { "content-type": "application/json" })
    response.end(
      JSON.stringify({
        data: [
          {
            id: "known",
            display_name: "Known Model",
            context_window: 32768,
            max_tokens: 1024,
          },
          { id: "minimal" },
        ],
      }),
    )
  })

  try {
    const adapter = new plugin.OmlxAdapter(config(endpoint.baseUrl))
    assert.deepEqual(await adapter.listModels("local"), [
      {
        provider: "local",
        id: "known",
        name: "Known Model",
        inputModalities: ["text"],
      },
      {
        provider: "local",
        id: "minimal",
        name: "minimal",
        inputModalities: ["text"],
      },
    ])
    assert.deepEqual(await adapter.resolveModel("local", "known"), {
      provider: "local",
      id: "known",
      name: "Known Model",
      inputModalities: ["text"],
      context: { contextWindow: 32768 },
      defaultMaxTokens: 1024,
    })
    assert.deepEqual(await adapter.resolveModel("local", "unlisted"), {
      provider: "local",
      id: "unlisted",
      name: "unlisted",
      inputModalities: ["text"],
      context: { contextWindow: 8192 },
      defaultMaxTokens: 64,
    })
    assert.equal(requests.length, 3)
    for (const request of requests) {
      assert.deepEqual(request, {
        method: "GET",
        url: "/v1/models",
        auth: `Bearer ${API_KEY}`,
      })
    }
  } finally {
    await endpoint.close()
  }
})

test("translates text, reasoning, and tool streams with usage immediately before finish", async () => {
  const payload =
    ": keepalive\r\n\r\n"
    + event("ping", { type: "ping" }, "\r\n")
    + messageStart(5)
    + event("content_block_start", {
      type: "content_block_start",
      index: 0,
      content_block: {
        type: "thinking",
        thinking: "",
        signature: "",
      },
    })
    + event("content_block_delta", {
      type: "content_block_delta",
      index: 0,
      delta: { type: "thinking_delta", thinking: "plan" },
    })
    + event("content_block_delta", {
      type: "content_block_delta",
      index: 0,
      delta: { type: "signature_delta", signature: "omlx-" },
    })
    + event("content_block_delta", {
      type: "content_block_delta",
      index: 0,
      delta: { type: "signature_delta", signature: "reasoning" },
    })
    + event("content_block_stop", { type: "content_block_stop", index: 0 })
    + event("content_block_start", {
      type: "content_block_start",
      index: 1,
      content_block: { type: "text", text: "" },
    })
    + event("content_block_delta", {
      type: "content_block_delta",
      index: 1,
      delta: { type: "text_delta", text: "answer" },
    })
    + event("content_block_stop", { type: "content_block_stop", index: 1 })
    + event("content_block_start", {
      type: "content_block_start",
      index: 2,
      content_block: {
        type: "tool_use",
        id: "call_9",
        name: "lookup",
        input: {},
      },
    })
    + event("content_block_delta", {
      type: "content_block_delta",
      index: 2,
      delta: { type: "input_json_delta", partial_json: '{"x":' },
    })
    + event("content_block_delta", {
      type: "content_block_delta",
      index: 2,
      delta: { type: "input_json_delta", partial_json: "1}" },
    })
    + event("content_block_stop", { type: "content_block_stop", index: 2 })
    + event("message_delta", {
      type: "message_delta",
      delta: { stop_reason: "tool_use", stop_sequence: null },
      usage: {
        input_tokens: 6,
        output_tokens: 7,
        cache_read_input_tokens: 2,
        cache_creation_input_tokens: 1,
      },
    })
    + event("message_stop", { type: "message_stop" })

  const chunks = await collect(
    translateSse(parseSse(byteStream(new TextEncoder().encode(payload)))),
  )
  assert.deepEqual(chunks, [
    { type: "block-start", index: 0, blockType: "reasoning" },
    { type: "reasoning-delta", index: 0, text: "plan" },
    { type: "block-end", index: 0, block: { type: "reasoning", text: "plan" } },
    { type: "block-start", index: 1, blockType: "text" },
    { type: "text-delta", index: 1, text: "answer" },
    { type: "block-end", index: 1, block: { type: "text", text: "answer" } },
    { type: "block-start", index: 2, blockType: "tool-call" },
    {
      type: "tool-call-delta",
      index: 2,
      id: "call_9",
      name: "lookup",
      argumentsDelta: "",
    },
    {
      type: "tool-call-delta",
      index: 2,
      id: "call_9",
      argumentsDelta: '{"x":',
    },
    { type: "tool-call-delta", index: 2, id: "call_9", argumentsDelta: "1}" },
    {
      type: "block-end",
      index: 2,
      block: {
        type: "tool-call",
        id: "call_9",
        name: "lookup",
        arguments: '{"x":1}',
      },
    },
    {
      type: "usage",
      usage: {
        inputTokens: 6,
        outputTokens: 7,
        cacheReadTokens: 2,
        cacheWriteTokens: 1,
      },
    },
    {
      type: "finish",
      reason: { kind: "tool-calls" },
      replayState: {
        type: "anthropic-message-v1",
        content: [
          {
            type: "thinking",
            thinking: "plan",
            signature: "omlx-reasoning",
          },
          { type: "text", text: "answer" },
          {
            type: "tool_use",
            id: "call_9",
            name: "lookup",
            input: { x: 1 },
          },
        ],
      },
    },
  ])
})

test("parses every byte split including CRLF and multibyte UTF-8 boundaries", async () => {
  const payload = textStream("hé🙂").replaceAll("\n", "\r\n")
  const bytes = new TextEncoder().encode(payload)
  const expected = await collect(translateSse(parseSse(byteStream(bytes))))
  for (let split = 0; split <= bytes.length; split += 1) {
    const actual = await collect(
      translateSse(parseSse(byteStream(bytes, split))),
    )
    assert.deepEqual(actual, expected, `split ${split}`)
  }
})

test("rejects malformed, mismatched, truncated, and invalid-tool streams", async () => {
  const cases = [
    {
      code: "MALFORMED_RESPONSE",
      payload: "event: message_start\ndata: {nope}\n\n",
    },
    {
      code: "MALFORMED_RESPONSE",
      payload: event("message_start", { type: "ping" }),
    },
    {
      code: "MALFORMED_RESPONSE",
      payload: event("ping", { type: "message_start" }),
    },
    {
      code: "MALFORMED_RESPONSE",
      payload: "event: ping\ndata: {malformed}\n\n",
    },
    {
      code: "STREAM_CLOSED",
      payload: messageStart(),
    },
    {
      code: "MALFORMED_RESPONSE",
      payload:
        messageStart()
        + event("content_block_start", {
          type: "content_block_start",
          index: 0,
          content_block: {
            type: "tool_use",
            id: "call",
            name: "tool",
            input: {},
          },
        })
        + event("content_block_delta", {
          type: "content_block_delta",
          index: 0,
          delta: { type: "input_json_delta", partial_json: "{" },
        })
        + event("content_block_stop", { type: "content_block_stop", index: 0 }),
    },
    {
      code: "MALFORMED_RESPONSE",
      payload:
        messageStart()
        + event("content_block_start", {
          type: "content_block_start",
          index: 2,
          content_block: { type: "text", text: "" },
        }),
    },
    {
      code: "MALFORMED_RESPONSE",
      payload:
        messageStart()
        + event("content_block_start", {
          type: "content_block_start",
          index: 0,
          content_block: { type: "thinking", thinking: "", signature: "" },
        })
        + event("content_block_delta", {
          type: "content_block_delta",
          index: 0,
          delta: { type: "thinking_delta", thinking: "unsigned" },
        })
        + event("content_block_stop", {
          type: "content_block_stop",
          index: 0,
        }),
    },
  ]

  for (const item of cases) {
    await assert.rejects(
      collect(
        translateSse(
          parseSse(byteStream(new TextEncoder().encode(item.payload))),
        ),
      ),
      (error) => error instanceof LlmError && error.code === item.code,
    )
  }
})

test("keeps provider error events in-band and throws HTTP failures without response secrets", async () => {
  const inBand =
    messageStart()
    + event("error", {
      type: "error",
      error: { type: "overloaded_error", message: "provider detail" },
    })
    + event("message_stop", { type: "message_stop" })
  const chunks = await collect(
    translateSse(parseSse(byteStream(new TextEncoder().encode(inBand)))),
  )
  assert.deepEqual(chunks, [
    { type: "usage", usage: { inputTokens: 3, outputTokens: 0 } },
    {
      type: "finish",
      reason: {
        kind: "error",
        failure: {
          message: "omlx: provider reported an in-band stream error",
          code: "OVERLOADED_ERROR",
        },
      },
    },
  ])

  const endpoint = await listen((_request, response) => {
    response.writeHead(500, { "content-type": "application/json" })
    response.end(JSON.stringify({ error: { message: `echo ${API_KEY}` } }))
  })
  try {
    const adapter = new plugin.OmlxAdapter(config(endpoint.baseUrl))
    await assert.rejects(
      collect(adapter.stream(options())),
      (error) =>
        error instanceof LlmError
        && error.code === "SERVER"
        && !error.message.includes(API_KEY),
    )
  } finally {
    await endpoint.close()
  }
})

test("caller abort becomes an aborted DSH finish", async () => {
  const endpoint = await listen(() => {})
  const ctx = new Context()
  const runtime = ctx.plugin(LlmRuntime)
  await runtime
  const fiber = ctx.plugin(plugin, config(endpoint.baseUrl))
  await fiber
  const controller = new globalThis.AbortController()

  try {
    const stream = ctx.llm.stream(options({ signal: controller.signal }))
    const pending = collect(stream)
    controller.abort("test abort")
    const chunks = await pending
    assert.equal(chunks.length, 1)
    assert.equal(chunks[0].type, "finish")
    assert.equal(chunks[0].reason.kind, "aborted")
    assert.equal(chunks[0].reason.failure.code, "ABORTED")
  } finally {
    await fiber.dispose()
    await runtime.dispose()
    await endpoint.close()
  }
})

test("early iterator return aborts the fetch and closes the response reader", async () => {
  let closedResolve
  const closed = new Promise((resolve) => {
    closedResolve = resolve
  })
  const endpoint = await listen((_request, response) => {
    response.writeHead(200, { "content-type": "text/event-stream" })
    response.write(messageStart())
    response.write(
      event("content_block_start", {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      }),
    )
    response.on("close", closedResolve)
  })

  try {
    const adapter = new plugin.OmlxAdapter(config(endpoint.baseUrl))
    const iterator = adapter.stream(options())[Symbol.asyncIterator]()
    assert.deepEqual(await iterator.next(), {
      done: false,
      value: { type: "block-start", index: 0, blockType: "text" },
    })
    await iterator.return()
    await Promise.race([
      closed,
      new Promise((_, reject) =>
        globalThis.setTimeout(
          () => reject(new Error("response stayed open")),
          1_000,
        ),
      ),
    ])
  } finally {
    await endpoint.close()
  }
})
