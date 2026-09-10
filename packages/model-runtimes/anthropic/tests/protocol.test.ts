import { createAssistantMessage } from "@deepseek-ai/dsh-llm"
import assert from "node:assert/strict"
import test from "node:test"

import {
  baseConfig,
  collect,
  createHarness,
  requestOptions,
  sendSse,
  sseEvent,
  startServer,
  terminalFailure,
  textStream,
} from "./helpers.ts"

const messageStart = sseEvent("message_start", {
  message: {
    content: [],
    id: "msg_protocol",
    model: "claude-opus-5",
    role: "assistant",
    stop_reason: null,
    stop_sequence: null,
    type: "message",
    usage: { input_tokens: 3, output_tokens: 0 },
  },
  type: "message_start",
})

test("malformed JSON, event order, content index, and post-finish data fail", async (t) => {
  const cases = [
    {
      body: "event: message_start\ndata: {broken}\n\n",
      name: "malformed JSON",
    },
    {
      body: sseEvent("message_start", { type: 42 }),
      name: "non-string event type",
    },
    {
      body: sseEvent("message_start", {
        message: {
          content: [],
          id: "msg_protocol",
          model: "claude-opus-5",
          role: "assistant",
          stop_reason: null,
          stop_sequence: null,
          type: "message",
          usage: { input_tokens: "three", output_tokens: 0 },
        },
        type: "message_start",
      }),
      name: "non-numeric input token count",
    },
    {
      body:
        messageStart
        + sseEvent("content_block_start", {
          content_block: { text: "", type: "text" },
          index: "0",
          type: "content_block_start",
        }),
      name: "non-numeric content index",
    },
    {
      body:
        messageStart
        + sseEvent("content_block_delta", {
          delta: { text: "bad", type: "text_delta" },
          index: 0,
          type: "content_block_delta",
        }),
      name: "delta before block start",
    },
    {
      body:
        messageStart
        + sseEvent("content_block_start", {
          content_block: { text: "", type: "text" },
          index: 1,
          type: "content_block_start",
        }),
      name: "non-contiguous index",
    },
    {
      body: textStream() + sseEvent("ping", { type: "ping" }),
      name: "event after message_stop",
    },
  ]
  for (const fixture of cases) {
    await t.test(fixture.name, async () => {
      const server = await startServer((_request, response) => {
        sendSse(response, fixture.body)
      })
      const harness = await createHarness(baseConfig(server.origin))
      try {
        const chunks = await collect(harness.ctx.llm.stream(requestOptions()))
        const reason = terminalFailure(chunks)
        assert.equal(reason.kind, "error")
        if (reason.kind === "error")
          assert.equal(reason.failure.code, "MALFORMED_RESPONSE")
      } finally {
        await harness.dispose()
        await server.close()
      }
    })
  }
})

test("early EOF and unterminated SSE tails fail as closed streams", async (t) => {
  const bodies = [
    messageStart,
    `${messageStart}event: ping\ndata: {"type":"ping"}`,
  ]
  for (const [index, body] of bodies.entries()) {
    await t.test(`early EOF ${index + 1}`, async () => {
      const server = await startServer((_request, response) => {
        sendSse(response, body)
      })
      const harness = await createHarness(baseConfig(server.origin))
      try {
        const chunks = await collect(harness.ctx.llm.stream(requestOptions()))
        const reason = terminalFailure(chunks)
        assert.equal(reason.kind, "error")
        if (reason.kind === "error")
          assert.equal(reason.failure.code, "STREAM_CLOSED")
      } finally {
        await harness.dispose()
        await server.close()
      }
    })
  }
})

test("non-SSE success and in-stream provider errors are typed failures", async (t) => {
  await t.test("non-SSE", async () => {
    const server = await startServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify({ type: "message" }))
    })
    const harness = await createHarness(baseConfig(server.origin))
    try {
      const reason = terminalFailure(
        await collect(harness.ctx.llm.stream(requestOptions())),
      )
      assert.equal(reason.kind, "error")
      if (reason.kind === "error")
        assert.equal(reason.failure.code, "MALFORMED_RESPONSE")
    } finally {
      await harness.dispose()
      await server.close()
    }
  })

  await t.test("provider error event", async () => {
    const server = await startServer((_request, response) => {
      sendSse(
        response,
        sseEvent("error", {
          error: { type: "overloaded_error" },
          type: "error",
        }),
      )
    })
    const harness = await createHarness(baseConfig(server.origin))
    try {
      const reason = terminalFailure(
        await collect(harness.ctx.llm.stream(requestOptions())),
      )
      assert.equal(reason.kind, "error")
      if (reason.kind === "error") assert.equal(reason.failure.code, "SERVER")
    } finally {
      await harness.dispose()
      await server.close()
    }
  })
})

test("unsupported DSH content fails before transport without exposing it", async () => {
  let requests = 0
  const server = await startServer((_request, response) => {
    requests += 1
    sendSse(response, textStream())
  })
  const harness = await createHarness(baseConfig(server.origin))
  try {
    const messages = [
      createAssistantMessage({
        content: [{ text: "unsigned reasoning", type: "reasoning" }],
        source: { model: "claude-opus-5", provider: "anthropic" },
      }),
    ]
    const reason = terminalFailure(
      await collect(harness.ctx.llm.stream(requestOptions({ messages }))),
    )
    assert.equal(reason.kind, "error")
    if (reason.kind === "error")
      assert.equal(reason.failure.code, "UNSUPPORTED")
    assert.equal(requests, 0)
  } finally {
    await harness.dispose()
    await server.close()
  }
})

test("discovers models through /v1/models and keeps catalogs advisory", async () => {
  const requests: Array<{
    key: string | undefined
    method: string | undefined
    path: string | undefined
  }> = []
  const server = await startServer((request, response) => {
    requests.push({
      key: request.headers["x-api-key"] as string | undefined,
      method: request.method,
      path: request.url,
    })
    response.writeHead(200, { "content-type": "application/json" })
    response.end(
      JSON.stringify({
        data: [
          {
            display_name: "Remote Claude",
            id: "claude-remote",
            max_input_tokens: 200_000,
            max_tokens: 64_000,
            type: "model",
          },
          { id: "claude-remote", type: "model" },
        ],
        first_id: "claude-remote",
        has_more: false,
        last_id: "claude-remote",
      }),
    )
  })
  const harness = await createHarness({
    instances: [
      {
        aliases: ["anthropic"],
        apiKey: "models-secret",
        baseURL: server.origin,
        modelDefaults: { contextWindow: 123_000, maxTokens: 9_000 },
        models: {
          "claude-configured-only": {
            contextWindow: 456_000,
            description: "Configured metadata",
            maxTokens: 12_000,
            name: "Configured only",
          },
          "claude-remote": { description: "Enriched remote" },
        },
      },
    ],
  })
  try {
    assert.deepEqual(await harness.ctx.llm.listModels("anthropic"), [
      {
        description: "Enriched remote",
        id: "claude-remote",
        inputModalities: ["text"],
        name: "Remote Claude",
        provider: "anthropic",
      },
    ])
    assert.deepEqual(requests, [
      { key: "models-secret", method: "GET", path: "/v1/models" },
    ])
    const configured = await harness.ctx.llm.resolveModelInfo(
      "anthropic",
      "claude-configured-only",
    )
    assert.equal(configured.context?.contextWindow, 456_000)
    assert.equal(configured.defaultMaxTokens, 12_000)
    const passthrough = await harness.ctx.llm.resolveModelInfo(
      "anthropic",
      "unlisted-passthrough-model",
    )
    assert.equal(passthrough.context?.contextWindow, 123_000)
    assert.equal(passthrough.defaultMaxTokens, 9_000)
  } finally {
    await harness.dispose()
    await server.close()
  }
})
