import type { SseEvent } from "@maximal/anthropic-provider"

import assert from "node:assert/strict"
import test from "node:test"

import { normalizeVllmEvents } from "../src/messages-events.ts"

function event(type: string, fields: Record<string, unknown> = {}): SseEvent {
  return { event: type, data: JSON.stringify({ type, ...fields }) }
}

async function* events(
  values: ReadonlyArray<SseEvent>,
): AsyncGenerator<SseEvent> {
  await Promise.resolve()
  yield* values
}

async function normalize(
  values: ReadonlyArray<SseEvent>,
): Promise<Array<SseEvent>> {
  const result: Array<SseEvent> = []
  for await (const entry of normalizeVllmEvents(events(values)))
    result.push(entry)
  return result
}

void test("closes only observed open blocks at an explicit terminal delta", async () => {
  assert.deepEqual(
    await normalize([
      event("content_block_start", { index: 0 }),
      event("message_delta", {
        delta: { stop_reason: "end_turn" },
        usage: { output_tokens: 2 },
      }),
      event("message_stop"),
    ]),
    [
      event("content_block_start", { index: 0 }),
      event("content_block_stop", { index: 0 }),
      event("message_delta", {
        delta: { stop_reason: "end_turn", stop_sequence: null },
        usage: { output_tokens: 2 },
      }),
      event("message_stop"),
    ],
  )
})

void test("already closed blocks and explicit stop sequences remain unchanged", async () => {
  const input = [
    event("content_block_start", { index: 0 }),
    event("content_block_stop", { index: 0 }),
    event("message_delta", {
      delta: { stop_reason: "stop_sequence", stop_sequence: "END" },
    }),
  ]
  assert.deepEqual(await normalize(input), input)
})

void test("EOF does not invent block stops, finish data, usage, or success", async () => {
  const input = [event("content_block_start", { index: 0 })]
  assert.deepEqual(await normalize(input), input)
})

void test("mismatched event discriminants and invalid deltas remain invalid for shared validation", async () => {
  const input = [
    event("content_block_start", { index: 0 }),
    {
      event: "other",
      data: JSON.stringify({ type: "message_delta", delta: {} }),
    },
    event("message_delta", { delta: null }),
  ]
  assert.deepEqual(await normalize(input), input)
})
