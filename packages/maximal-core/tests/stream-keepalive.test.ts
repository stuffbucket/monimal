import type { SSEMessage, SSEStreamingApi } from "hono/streaming"

import { describe, expect, test } from "bun:test"

import type {
  AnthropicMessagesPayload,
  AnthropicStreamState,
} from "~/lib/models/anthropic-types"
import type { ChatCompletionChunk } from "~/services/copilot/create-chat-completions"

import { prepareMessagesApiPayload } from "~/routes/messages/preprocess"
import { createStreamKeepAlive } from "~/routes/messages/stream-keepalive"
import { translateChunkToAnthropicEvents } from "~/routes/messages/stream-translation"

const waitMs = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

const createMockStream = () => {
  const written: Array<SSEMessage> = []
  const stream = {
    writeSSE: (msg: SSEMessage) => {
      written.push(msg)
      return Promise.resolve()
    },
  } as unknown as SSEStreamingApi
  return { stream, written }
}

describe("prepareMessagesApiPayload message-block cache_control.scope stripping", () => {
  test("strips cache_control.scope on message content blocks while preserving cache_control markers", () => {
    const payload: AnthropicMessagesPayload = {
      model: "claude-opus-4.6",
      max_tokens: 128,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "prompt prefix",
              cache_control: {
                type: "ephemeral",
                scope: "user",
              },
            },
            {
              type: "tool_result",
              tool_use_id: "toolu_1",
              cache_control: {
                type: "ephemeral",
                scope: "session",
              },
              content: [
                {
                  type: "text",
                  text: "result text",
                  cache_control: {
                    type: "ephemeral",
                  },
                },
              ],
            },
          ],
        },
      ],
    }

    prepareMessagesApiPayload(payload)

    expect(payload.messages[0]).toEqual({
      role: "user",
      content: [
        {
          type: "text",
          text: "prompt prefix",
          cache_control: {
            type: "ephemeral",
          },
        },
        {
          type: "tool_result",
          tool_use_id: "toolu_1",
          cache_control: {
            type: "ephemeral",
          },
          content: [
            {
              type: "text",
              text: "result text",
            },
          ],
        },
      ],
    })
  })
})

describe("createStreamKeepAlive SSE ping heartbeat", () => {
  test("suppresses pings before message_start and emits pings during idle gap after message_start", async () => {
    const { stream, written } = createMockStream()
    const keepAlive = createStreamKeepAlive(stream, 20)

    try {
      await keepAlive.writeSSE({
        event: "ping",
        data: '{"type":"ping"}',
      })
      await waitMs(35)
      expect(written).toEqual([])

      await keepAlive.writeSSE({
        event: "message_start",
        data: '{"type":"message_start"}',
      })
      await waitMs(55)
    } finally {
      keepAlive.stop()
    }

    expect(written[0]).toEqual({
      event: "message_start",
      data: '{"type":"message_start"}',
    })
    const pings = written.filter((msg) => msg.event === "ping")
    expect(pings.length).toBeGreaterThanOrEqual(1)
    expect(pings[0]).toEqual({
      event: "ping",
      data: '{"type":"ping"}',
    })

    const countAfterStop = written.length
    await waitMs(35)
    expect(written.length).toBe(countAfterStop)
  })

  test("stops scheduling pings automatically once message_stop is written", async () => {
    const { stream, written } = createMockStream()
    const keepAlive = createStreamKeepAlive(stream, 20)

    try {
      await keepAlive.writeSSE({
        event: "message_start",
        data: '{"type":"message_start"}',
      })
      await keepAlive.writeSSE({
        event: "message_stop",
        data: '{"type":"message_stop"}',
      })
      await waitMs(45)
    } finally {
      keepAlive.stop()
    }

    expect(written.map((msg) => msg.event)).toEqual([
      "message_start",
      "message_stop",
    ])
  })
})

describe("OpenAI to Anthropic Streaming reasoning_opaque Ordering", () => {
  test("does not emit a trailing thinking block after a completed text block when finish_reason chunk carries reasoning_opaque", () => {
    const geminiFinishStream: Array<ChatCompletionChunk> = [
      {
        id: "8XbgauPNJrGTl7oPloq_oQ0",
        object: "chat.completion.chunk",
        created: 1793095413,
        model: "gemini-4-argon",
        choices: [
          {
            index: 0,
            delta: {
              role: "assistant",
              content: '{"ok": true, "reason": "all PRs merged',
            },
            finish_reason: null,
            logprobs: null,
          },
        ],
        usage: {
          completion_tokens: 0,
          prompt_tokens: 0,
          prompt_tokens_details: { cached_tokens: 0 },
          total_tokens: 0,
        },
      },
      {
        id: "8XbgauPNJrGTl7oPloq_oQ0",
        object: "chat.completion.chunk",
        created: 1793095413,
        model: "gemini-4-argon",
        choices: [
          {
            index: 0,
            delta: {
              role: "assistant",
              content: '"}',
            },
            finish_reason: null,
            logprobs: null,
          },
        ],
        usage: {
          completion_tokens: 0,
          prompt_tokens: 0,
          prompt_tokens_details: { cached_tokens: 0 },
          total_tokens: 0,
        },
      },
      {
        id: "8XbgauPNJrGTl7oPloq_oQ0",
        object: "chat.completion.chunk",
        created: 1793095413,
        model: "gemini-4-argon",
        choices: [
          {
            index: 0,
            delta: {
              role: "assistant",
              content: null,
              reasoning_opaque: "u3WwruuJci0LZRk+c47N8QGKKlgZKDjS5FX2hr2b",
            },
            finish_reason: "stop",
            logprobs: null,
          },
        ],
        usage: {
          completion_tokens: 18,
          prompt_tokens: 55,
          prompt_tokens_details: { cached_tokens: 0 },
          total_tokens: 73,
        },
      },
    ]

    const streamState: AnthropicStreamState = {
      messageStartSent: false,
      contentBlockIndex: 0,
      contentBlockOpen: false,
      toolCalls: {},
      thinkingBlockOpen: false,
    }
    const translatedStream = geminiFinishStream.flatMap((chunk) =>
      translateChunkToAnthropicEvents(chunk, streamState),
    )

    expect(translatedStream.map((event) => event.type)).toEqual([
      "message_start",
      "content_block_start",
      "content_block_delta",
      "content_block_delta",
      "content_block_stop",
      "message_delta",
      "message_stop",
    ])
  })

  test("preserves reasoning_opaque thinking block before tool_use when tool_calls chunk carries reasoning_opaque", () => {
    const geminiToolStream: Array<ChatCompletionChunk> = [
      {
        id: "BnfgatjyEoGbotQPvp2AyQs",
        object: "chat.completion.chunk",
        created: 1793095433,
        model: "gemini-4-argon",
        choices: [
          {
            index: 0,
            delta: {
              role: "assistant",
              content: null,
              reasoning_opaque: "BHw8ZfySe+jKihuVjpIyTpGnhjdT8SJ",
              tool_calls: [
                {
                  index: 0,
                  id: "call_MHx1RzVGenRWRmpmaHJXeUhEaXg",
                  type: "function",
                  function: {
                    name: "get_weather",
                    arguments: '{"city":"Seattle"}',
                  },
                },
              ],
            },
            finish_reason: null,
            logprobs: null,
          },
        ],
      },
      {
        id: "BnfgatjyEoGbotQPvp2AyQs",
        object: "chat.completion.chunk",
        created: 1793095433,
        model: "gemini-4-argon",
        choices: [
          {
            index: 0,
            delta: {
              role: "assistant",
              content: null,
            },
            finish_reason: "tool_calls",
            logprobs: null,
          },
        ],
      },
    ]

    const streamState: AnthropicStreamState = {
      messageStartSent: false,
      contentBlockIndex: 0,
      contentBlockOpen: false,
      toolCalls: {},
      thinkingBlockOpen: false,
    }
    const translatedStream = geminiToolStream.flatMap((chunk) =>
      translateChunkToAnthropicEvents(chunk, streamState),
    )

    const blockStarts = translatedStream.filter(
      (event) => event.type === "content_block_start",
    )
    expect(blockStarts).toEqual([
      {
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "thinking",
          thinking: "",
        },
      },
      {
        type: "content_block_start",
        index: 1,
        content_block: {
          type: "tool_use",
          id: "call_MHx1RzVGenRWRmpmaHJXeUhEaXg",
          name: "get_weather",
          input: {},
        },
      },
    ])
  })
})
