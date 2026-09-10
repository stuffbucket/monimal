// The replay envelope's alignment contract, exercised against dsh-llm's own
// assembler rather than against our expectations of it.
//
// `ReplayEnvelope` splits replay state in two: `response` for what is true of
// the whole reply, `blocks` for one entry per emitted content block, in stream
// order. The split is not cosmetic. The assembler drops blocks the caller must
// not act on -- a max-token truncation drops tool calls that were never
// completed -- and it prunes `blocks` at the same positions, so the envelope
// keeps describing the content that survived.
//
// The failure mode this file exists for: when the two DO fall out of step, the
// assembler discards the envelope whole and says nothing. A reasoning block
// then arrives with no signature, and the first sign of trouble is a provider
// rejecting the replayed history much later. Putting per-block state anywhere
// but `blocks` reintroduces exactly that, silently, so these tests pin the
// alignment itself.

import { BlockAssembler, type StreamChunk } from "@deepseek-ai/dsh-llm"
import assert from "node:assert/strict"
import test from "node:test"

import {
  collect,
  createHarness,
  requestOptions,
  sendSse,
  sseEvent,
  startServer,
} from "./helpers.ts"

/** message_start through the three content blocks: thinking, text, tool_use. */
function threeBlockPrefix(): Array<string> {
  return [
    sseEvent("message_start", {
      message: {
        content: [],
        id: "msg_replay",
        model: "claude-opus-5",
        role: "assistant",
        stop_reason: null,
        stop_sequence: null,
        type: "message",
        usage: {
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          input_tokens: 12,
          output_tokens: 1,
        },
      },
      type: "message_start",
    }),
    sseEvent("content_block_start", {
      content_block: { signature: "", thinking: "", type: "thinking" },
      index: 0,
      type: "content_block_start",
    }),
    sseEvent("content_block_delta", {
      delta: { thinking: "weighing it", type: "thinking_delta" },
      index: 0,
      type: "content_block_delta",
    }),
    sseEvent("content_block_delta", {
      delta: { signature: "sig-truncated", type: "signature_delta" },
      index: 0,
      type: "content_block_delta",
    }),
    sseEvent("content_block_stop", { index: 0, type: "content_block_stop" }),
    sseEvent("content_block_start", {
      content_block: { text: "", type: "text" },
      index: 1,
      type: "content_block_start",
    }),
    sseEvent("content_block_delta", {
      delta: { text: "looking that up", type: "text_delta" },
      index: 1,
      type: "content_block_delta",
    }),
    sseEvent("content_block_stop", { index: 1, type: "content_block_stop" }),
    sseEvent("content_block_start", {
      content_block: {
        id: "tool_cut",
        input: {},
        name: "lookup",
        type: "tool_use",
      },
      index: 2,
      type: "content_block_start",
    }),
    sseEvent("content_block_delta", {
      delta: { partial_json: '{"q":"x"}', type: "input_json_delta" },
      index: 2,
      type: "content_block_delta",
    }),
    sseEvent("content_block_stop", { index: 2, type: "content_block_stop" }),
  ]
}

function streamEndingWith(stopReason: string): string {
  return [
    ...threeBlockPrefix(),
    sseEvent("message_delta", {
      delta: { stop_reason: stopReason, stop_sequence: null },
      type: "message_delta",
      usage: { output_tokens: 9 },
    }),
    sseEvent("message_stop", { type: "message_stop" }),
  ].join("")
}

async function streamChunks(body: string): Promise<Array<StreamChunk>> {
  const server = await startServer((_request, response) => {
    sendSse(response, body)
  })
  const harness = await createHarness({
    instances: [
      {
        aliases: ["anthropic"],
        apiKey: "replay-secret",
        baseURL: server.origin,
      },
    ],
  })
  try {
    return await collect(harness.ctx.llm.stream(requestOptions()))
  } finally {
    await harness.dispose()
    await server.close()
  }
}

function assemble(chunks: Array<StreamChunk>): BlockAssembler {
  const assembler = new BlockAssembler()
  for (const chunk of chunks) assembler.push(chunk)
  return assembler
}

test("the envelope carries one blocks entry per emitted block", async () => {
  const chunks = await streamChunks(streamEndingWith("end_turn"))
  const emitted = chunks.filter((chunk) => chunk.type === "block-end")
  const finish = chunks.at(-1)
  assert.equal(finish?.type, "finish")
  if (finish?.type !== "finish") return

  const envelope = finish.replayState
  assert.deepEqual(envelope?.response, { type: "anthropic-message-v1" })
  // The invariant, not a literal: an entry per block, positionally. A literal
  // would still pass if both sides drifted together.
  assert.equal(envelope?.blocks?.length, emitted.length)
  assert.deepEqual(
    envelope?.blocks?.map((entry) => (entry as { type: string }).type),
    ["thinking", "text", "tool_use"],
  )

  // Nothing was dropped, so the assembler passes the envelope through whole.
  const assembler = assemble(chunks)
  assert.equal(assembler.blocks().length, emitted.length)
  assert.deepEqual(assembler.replayState, envelope)
})

test("a max-tokens finish prunes the envelope in step with the dropped block", async () => {
  const chunks = await streamChunks(streamEndingWith("max_tokens"))
  const finish = chunks.at(-1)
  assert.equal(finish?.type, "finish")
  if (finish?.type !== "finish") return
  assert.deepEqual(finish.reason, { kind: "max-tokens" })
  // The adapter still reports all three: the drop is the assembler's decision,
  // and it needs the full envelope to make it.
  assert.equal(finish.replayState?.blocks?.length, 3)

  const assembler = assemble(chunks)
  const kept = assembler.blocks()
  // The tool call is unsafe to execute -- it was cut off mid-flight -- so the
  // assembler drops it.
  assert.deepEqual(
    kept.map((block) => block.type),
    ["reasoning", "text"],
  )

  const pruned = assembler.replayState
  assert.equal(
    pruned?.blocks?.length,
    kept.length,
    "the envelope must be pruned at the same positions, not discarded",
  )
  assert.deepEqual(
    pruned?.blocks?.map((entry) => (entry as { type: string }).type),
    ["thinking", "text"],
  )
  // The surviving reasoning block keeps the signature it needs to be replayed.
  assert.deepEqual(pruned?.blocks?.[0], {
    signature: "sig-truncated",
    thinking: "weighing it",
    type: "thinking",
  })
})

test("an envelope whose blocks do not align is discarded without an error", async () => {
  // Pinning dsh-llm's behaviour, not endorsing it. This is precisely why the
  // per-block half must live in `blocks`: state kept anywhere else cannot be
  // pruned, drifts on the first truncation, and then vanishes like this --
  // no throw, no warning, just replay that is suddenly absent.
  const assembler = new BlockAssembler()
  assembler.push({ blockType: "text", index: 0, type: "block-start" })
  assembler.push({
    block: { text: "one block", type: "text" },
    index: 0,
    type: "block-end",
  })
  assembler.push({
    reason: { kind: "stop" },
    replayState: {
      blocks: [
        { text: "one block", type: "text" },
        { text: "an entry with no block", type: "text" },
      ],
      response: { type: "anthropic-message-v1" },
    },
    type: "finish",
  })

  assert.equal(assembler.blocks().length, 1)
  assert.equal(assembler.replayState, undefined)
})
