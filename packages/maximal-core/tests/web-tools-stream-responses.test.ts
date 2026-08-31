import type { SSEStreamingApi } from "hono/streaming"

import { describe, expect, it } from "bun:test"
import consola from "consola"

import type { AnthropicMessagesPayload } from "~/lib/models/anthropic-types"
import type { WebToolPolicy } from "~/routes/messages/web-tools/rewriter"
import type {
  ResponsesCall,
  UpstreamCall,
} from "~/routes/messages/web-tools/stream"
import type { Model } from "~/services/copilot/get-models"

import { runStreamingAgent } from "~/routes/messages/web-tools/stream"

import { FakeExecutor } from "./helpers/fake-executor"

// Step 4 of maximal-core#21. The agent loop drove every streaming turn over
// /chat/completions, so a /responses-only model (gpt-5.6-sol) 400'd with
// unsupported_api_for_model — and Claude Code always streams, so this was the
// path that actually mattered.
//
// The downstream contract is unchanged either way: the client asked for an
// Anthropic Messages SSE stream and is owed one. Only the upstream wire format
// being emulated from differs. These tests assert exactly that — a Responses
// upstream still yields a well-formed Anthropic stream, and the chat transport
// is never touched for such a model.

interface CapturedEvent {
  event: string
  data: unknown
}

function captureStream(): {
  stream: SSEStreamingApi
  events: Array<CapturedEvent>
} {
  const events: Array<CapturedEvent> = []
  const stream = {
    writeSSE: (msg: { event?: string; data: string }) => {
      events.push({
        event: msg.event ?? "",
        data: JSON.parse(msg.data) as unknown,
      })
      return Promise.resolve()
    },
  } as unknown as SSEStreamingApi
  return { stream, events }
}

const responsesOnlyModel = {
  capabilities: {} as Model["capabilities"],
  id: "gpt-5.6-sol",
  model_picker_enabled: true,
  name: "Sol",
  object: "model",
  preview: false,
  vendor: "OpenAI",
  version: "1",
  supported_endpoints: ["/responses"],
} satisfies Model

const basePayload: AnthropicMessagesPayload = {
  model: "gpt-5.6-sol",
  max_tokens: 1024,
  messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
}

const searchPolicy: WebToolPolicy = {
  declarations: [{ type: "web_search_20250305", name: "web_search" }],
  hasSearch: true,
  hasFetch: false,
}

const fetchPolicy: WebToolPolicy = {
  declarations: [{ type: "web_fetch_20250910", name: "web_fetch" }],
  hasSearch: false,
  hasFetch: true,
}

/** One Responses SSE frame, as `create-responses` yields them: an SSE event
 *  name plus a JSON body. */
function frame(
  event: string,
  payload: unknown,
): { event: string; data: string } {
  return { event, data: JSON.stringify(payload) }
}

/** A turn whose only output is a text message. */
function textTurn(text: string): Array<{ event: string; data: string }> {
  return [
    frame("response.created", {
      type: "response.created",
      sequence_number: 0,
      response: { id: "resp-1", usage: null },
    }),
    frame("response.output_item.added", {
      type: "response.output_item.added",
      sequence_number: 1,
      output_index: 0,
      item: { id: "msg-1", type: "message", status: "in_progress" },
    }),
    frame("response.output_text.delta", {
      type: "response.output_text.delta",
      sequence_number: 2,
      item_id: "msg-1",
      output_index: 0,
      delta: text,
    }),
    frame("response.completed", {
      type: "response.completed",
      sequence_number: 3,
      response: {
        id: "resp-1",
        output: [],
        output_text: "",
        usage: { input_tokens: 11, output_tokens: 7 },
      },
    }),
  ]
}

/** A turn that calls one web tool with `input`. */
function toolTurn(
  name: string,
  input: unknown,
): Array<{ event: string; data: string }> {
  const args = JSON.stringify(input)
  return [
    frame("response.created", {
      type: "response.created",
      sequence_number: 0,
      response: { id: "resp-0", usage: null },
    }),
    frame("response.output_item.added", {
      type: "response.output_item.added",
      sequence_number: 1,
      output_index: 0,
      item: {
        id: "item-1",
        type: "function_call",
        call_id: "call-1",
        name,
        arguments: "",
        status: "in_progress",
      },
    }),
    frame("response.function_call_arguments.delta", {
      type: "response.function_call_arguments.delta",
      sequence_number: 2,
      item_id: "item-1",
      output_index: 0,
      delta: args,
    }),
    frame("response.function_call_arguments.done", {
      type: "response.function_call_arguments.done",
      sequence_number: 3,
      item_id: "item-1",
      name,
      output_index: 0,
      arguments: args,
    }),
    frame("response.completed", {
      type: "response.completed",
      sequence_number: 4,
      response: {
        id: "resp-0",
        output: [],
        output_text: "",
        usage: { input_tokens: 5, output_tokens: 3 },
      },
    }),
  ]
}

/** A `responsesCall` stub that plays the given turns in order. */
function stubResponses(turns: Array<Array<{ event: string; data: string }>>): {
  call: ResponsesCall
  turnCount: () => number
} {
  let idx = 0
  const call = (() => {
    const turn = turns[idx] ?? []
    idx += 1
    return Promise.resolve(
      (async function* () {
        // Yield across a microtask so the consumer sees a genuinely async
        // stream rather than a synchronously-drained one.
        for (const f of turn) yield await Promise.resolve(f)
      })(),
    )
  }) as unknown as ResponsesCall
  return { call, turnCount: () => idx }
}

/** Chat transport stub that fails the test if the loop ever reaches it. */
const forbiddenChatCall = (() => {
  throw new Error("chat/completions must not be used for a /responses model")
}) as unknown as UpstreamCall

const baseOptions = {
  requestId: "req_test",
  logger: consola.create({ level: 0 }),
}

describe("runStreamingAgent over /responses", () => {
  it("emulates an Anthropic Messages stream from Responses frames", async () => {
    const { call } = stubResponses([textTurn("Colima 0.10.3 is current.")])
    const { stream, events } = captureStream()

    await runStreamingAgent({
      initialPayload: basePayload,
      policy: searchPolicy,
      stream,
      executor: new FakeExecutor(),
      options: baseOptions,
      selectedModel: responsesOnlyModel,
      responsesCall: call,
      upstreamCall: forbiddenChatCall,
    })

    const types = events.map((e) => e.event)
    expect(types[0]).toBe("message_start")
    expect(types).toContain("content_block_delta")
    expect(types).toContain("message_delta")
    expect(types.at(-1)).toBe("message_stop")
  })

  it("runs a web_search round trip and synthesizes the result block", async () => {
    const { call } = stubResponses([
      toolTurn("web_search", { query: "shannon" }),
      textTurn("Claude Shannon was born in 1916."),
    ])
    const exec = new FakeExecutor()
    const { stream, events } = captureStream()

    await runStreamingAgent({
      initialPayload: basePayload,
      policy: searchPolicy,
      stream,
      executor: exec,
      options: baseOptions,
      selectedModel: responsesOnlyModel,
      responsesCall: call,
      upstreamCall: forbiddenChatCall,
    })

    expect(exec.searchCalls).toEqual(["shannon"])

    const blockTypes = events
      .filter((e) => e.event === "content_block_start")
      .map(
        (e) =>
          (e.data as { content_block?: { type?: string } }).content_block?.type,
      )
    expect(blockTypes).toContain("server_tool_use")
    expect(blockTypes).toContain("web_search_tool_result")
  })

  it("runs a web_fetch round trip over the same transport", async () => {
    const { call } = stubResponses([
      toolTurn("web_fetch", { url: "https://example.com/a" }),
      textTurn("Fetched."),
    ])
    const exec = new FakeExecutor()
    const { stream, events } = captureStream()

    await runStreamingAgent({
      initialPayload: basePayload,
      policy: fetchPolicy,
      stream,
      executor: exec,
      options: baseOptions,
      selectedModel: responsesOnlyModel,
      responsesCall: call,
      upstreamCall: forbiddenChatCall,
    })

    const blockTypes = events
      .filter((e) => e.event === "content_block_start")
      .map(
        (e) =>
          (e.data as { content_block?: { type?: string } }).content_block?.type,
      )
    expect(blockTypes).toContain("server_tool_use")
    expect(blockTypes).toContain("web_fetch_tool_result")
  })
})
