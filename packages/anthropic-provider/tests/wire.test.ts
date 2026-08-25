import {
  CallId,
  createAssistantMessage,
  createToolResultMessage,
  createUserMessage,
  ReasoningEffortId,
} from "@deepseek-ai/dsh-llm"
import assert from "node:assert/strict"
import test from "node:test"

import {
  collect,
  createHarness,
  readJson,
  requestOptions,
  sendSse,
  sseEvent,
  startServer,
  textStream,
} from "./helpers.ts"

test("sends exact Messages requests and both supported auth forms", async () => {
  const requests: Array<{
    accept: string | undefined
    anthropicVersion: string | undefined
    authorization: string | undefined
    body: unknown
    contentType: string | undefined
    path: string
    purpose: string | undefined
    userAgent: string | undefined
    xApiKey: string | undefined
  }> = []
  const server = await startServer((request, response) => {
    void (async () => {
      requests.push({
        accept: request.headers.accept,
        anthropicVersion: request.headers["anthropic-version"] as
          | string
          | undefined,
        authorization: request.headers.authorization,
        body: await readJson(request),
        contentType: request.headers["content-type"],
        path: request.url ?? "",
        purpose: request.headers["x-dsh-purpose"] as string | undefined,
        userAgent: request.headers["user-agent"],
        xApiKey: request.headers["x-api-key"] as string | undefined,
      })
      sendSse(response, textStream())
    })()
  })
  const harness = await createHarness({
    instances: [
      {
        aliases: ["key-auth"],
        apiKey: "key-secret",
        authType: "x-api-key",
        baseURL: server.origin,
        modelDefaults: { topK: 17, topP: 0.8 },
      },
      {
        aliases: ["bearer-auth"],
        apiKey: "bearer-secret",
        authType: "authorization",
        baseURL: server.origin,
      },
    ],
  })
  try {
    const callId = CallId("call_history")
    const messages = [
      createUserMessage({
        content: [{ text: "Use the tool", type: "text" }],
        source: { kind: "user" },
      }),
      createAssistantMessage({
        content: [
          { text: "Plan", type: "reasoning" },
          { text: "Calling it.", type: "text" },
          {
            arguments: '{"city":"Paris"}',
            id: callId,
            name: "weather",
            type: "tool-call",
          },
        ],
        source: {
          model: "claude-opus-5",
          provider: "key-auth",
          replayState: {
            content: [
              { signature: "sig-history", thinking: "Plan", type: "thinking" },
              { text: "Calling it.", type: "text" },
              {
                id: "call_history",
                input: { city: "Paris" },
                name: "weather",
                type: "tool_use",
              },
            ],
            type: "anthropic-message-v1",
          },
        },
      }),
      createToolResultMessage({
        callId,
        content: [{ text: "Sunny", type: "text" }],
        isError: false,
      }),
    ]
    await collect(
      harness.ctx.llm.stream(
        requestOptions({
          maxTokens: 321,
          messages,
          model: "claude-opus-5",
          provider: "key-auth",
          purpose: "compaction",
          reasoningEffort: ReasoningEffortId("high"),
          sessionId: "session-123" as never,
          stop: ["END"],
          system: "Be concise.",
          temperature: 0.25,
          tools: [
            {
              description: "Get weather",
              name: "weather",
              parameters: {
                additionalProperties: false,
                properties: { city: { type: "string" } },
                required: ["city"],
                type: "object",
              },
            },
          ],
        }),
      ),
    )
    await collect(
      harness.ctx.llm.stream(requestOptions({ provider: "bearer-auth" })),
    )

    assert.equal(requests.length, 2)
    assert.equal(requests[0]?.path, "/v1/messages")
    assert.equal(requests[0]?.accept, "text/event-stream")
    assert.equal(requests[0]?.anthropicVersion, "2023-06-01")
    assert.equal(requests[0]?.contentType, "application/json")
    assert.equal(requests[0]?.purpose, "compaction")
    assert.equal(requests[0]?.xApiKey, "key-secret")
    assert.equal(requests[0]?.authorization, undefined)
    assert.match(requests[0]?.userAgent ?? "", /\//)
    assert.deepEqual(requests[0]?.body, {
      max_tokens: 321,
      messages: [
        { content: [{ text: "Use the tool", type: "text" }], role: "user" },
        {
          content: [
            { signature: "sig-history", thinking: "Plan", type: "thinking" },
            { text: "Calling it.", type: "text" },
            {
              id: "call_history",
              input: { city: "Paris" },
              name: "weather",
              type: "tool_use",
            },
          ],
          role: "assistant",
        },
        {
          content: [
            {
              content: [{ text: "Sunny", type: "text" }],
              is_error: false,
              tool_use_id: "call_history",
              type: "tool_result",
            },
          ],
          role: "user",
        },
      ],
      metadata: { user_id: "session-123" },
      model: "claude-opus-5",
      output_config: { effort: "high" },
      stop_sequences: ["END"],
      stream: true,
      system: "Be concise.",
      temperature: 0.25,
      thinking: { display: "summarized", type: "adaptive" },
      tools: [
        {
          description: "Get weather",
          input_schema: {
            additionalProperties: false,
            properties: { city: { type: "string" } },
            required: ["city"],
            type: "object",
          },
          name: "weather",
        },
      ],
      top_k: 17,
      top_p: 0.8,
    })
    assert.equal(requests[1]?.authorization, "Bearer bearer-secret")
    assert.equal(requests[1]?.xApiKey, undefined)
  } finally {
    await harness.dispose()
    await server.close()
  }
})

test("parses CRLF and UTF-8 boundaries for reasoning, text, tools, and usage", async () => {
  const body = [
    sseEvent(
      "message_start",
      {
        message: {
          content: [],
          id: "msg_tools",
          model: "claude-opus-5",
          role: "assistant",
          stop_reason: null,
          stop_sequence: null,
          type: "message",
          usage: {
            cache_creation_input_tokens: 5,
            cache_read_input_tokens: 10,
            input_tokens: 100,
            output_tokens: 1,
          },
        },
        type: "message_start",
      },
      "\r\n",
    ),
    ": ping across boundaries\r\n\r\n",
    sseEvent("ping", { type: "ping" }, "\r\n"),
    sseEvent(
      "content_block_start",
      {
        content_block: { signature: "", thinking: "", type: "thinking" },
        index: 0,
        type: "content_block_start",
      },
      "\r\n",
    ),
    sseEvent(
      "content_block_delta",
      {
        delta: { thinking: "Reason", type: "thinking_delta" },
        index: 0,
        type: "content_block_delta",
      },
      "\r\n",
    ),
    sseEvent(
      "content_block_delta",
      {
        delta: { signature: "sig-live", type: "signature_delta" },
        index: 0,
        type: "content_block_delta",
      },
      "\r\n",
    ),
    sseEvent(
      "content_block_stop",
      { index: 0, type: "content_block_stop" },
      "\r\n",
    ),
    sseEvent(
      "content_block_start",
      {
        content_block: { text: "", type: "text" },
        index: 1,
        type: "content_block_start",
      },
      "\r\n",
    ),
    sseEvent(
      "content_block_delta",
      {
        delta: { text: "Héllo 🐈", type: "text_delta" },
        index: 1,
        type: "content_block_delta",
      },
      "\r\n",
    ),
    sseEvent(
      "content_block_stop",
      { index: 1, type: "content_block_stop" },
      "\r\n",
    ),
    sseEvent(
      "content_block_start",
      {
        content_block: {
          id: "tool_live",
          input: {},
          name: "lookup",
          type: "tool_use",
        },
        index: 2,
        type: "content_block_start",
      },
      "\r\n",
    ),
    sseEvent(
      "content_block_delta",
      {
        delta: { partial_json: '{"q":', type: "input_json_delta" },
        index: 2,
        type: "content_block_delta",
      },
      "\r\n",
    ),
    sseEvent(
      "content_block_delta",
      {
        delta: { partial_json: '"café"}', type: "input_json_delta" },
        index: 2,
        type: "content_block_delta",
      },
      "\r\n",
    ),
    sseEvent(
      "content_block_stop",
      { index: 2, type: "content_block_stop" },
      "\r\n",
    ),
    sseEvent(
      "message_delta",
      {
        delta: { stop_reason: "tool_use", stop_sequence: null },
        type: "message_delta",
        usage: { output_tokens: 42 },
      },
      "\r\n",
    ),
    sseEvent("message_stop", { type: "message_stop" }, "\r\n"),
  ].join("")
  const server = await startServer((_request, response) => {
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
    })
    const bytes = Buffer.from(body)
    for (let index = 0; index < bytes.length; index += 1) {
      response.write(bytes.subarray(index, index + 1))
    }
    response.end()
  })
  const harness = await createHarness({
    instances: [
      {
        adjustInputTokens: true,
        aliases: ["anthropic"],
        apiKey: "boundary-secret",
        baseURL: server.origin,
      },
    ],
  })
  try {
    const chunks = await collect(harness.ctx.llm.stream(requestOptions()))
    assert.deepEqual(
      chunks
        .filter((chunk) => chunk.type === "block-end")
        .map((chunk) => chunk.block),
      [
        { text: "Reason", type: "reasoning" },
        { text: "Héllo 🐈", type: "text" },
        {
          arguments: '{"q":"café"}',
          id: "tool_live",
          name: "lookup",
          type: "tool-call",
        },
      ],
    )
    assert.deepEqual(chunks.at(-2), {
      type: "usage",
      usage: {
        cacheReadTokens: 10,
        cacheWriteTokens: 5,
        inputTokens: 85,
        outputTokens: 42,
      },
    })
    const finish = chunks.at(-1)
    assert.equal(finish?.type, "finish")
    if (finish?.type === "finish") {
      assert.deepEqual(finish.reason, { kind: "tool-calls" })
      assert.deepEqual(finish.replayState, {
        content: [
          { signature: "sig-live", thinking: "Reason", type: "thinking" },
          { text: "Héllo 🐈", type: "text" },
          {
            id: "tool_live",
            input: { q: "café" },
            name: "lookup",
            type: "tool_use",
          },
        ],
        type: "anthropic-message-v1",
      })
    }
  } finally {
    await harness.dispose()
    await server.close()
  }
})
