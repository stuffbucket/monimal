import type { SseEvent } from "@maximal/anthropic-provider"

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

/**
 * vLLM can omit final block stops and an absent stop sequence. Its explicit
 * message_delta ends the content: close only blocks already opened, then let
 * the shared translator validate indexes, types, usage, and message_stop.
 * EOF alone never closes blocks or fabricates successful completion.
 */
export async function* normalizeVllmEvents(
  events: AsyncIterable<SseEvent>,
): AsyncGenerator<SseEvent> {
  const open = new Set<number>()
  for await (const event of events) {
    const payload: unknown = JSON.parse(event.data)
    if (
      !record(payload)
      || (event.event !== "message" && event.event !== payload.type)
    ) {
      yield event
      continue
    }
    if (
      payload.type === "content_block_start"
      && Number.isSafeInteger(payload.index)
    ) {
      open.add(Number(payload.index))
    } else if (payload.type === "content_block_stop") {
      open.delete(Number(payload.index))
    } else if (payload.type === "message_delta" && record(payload.delta)) {
      for (const index of open) {
        yield {
          event: "content_block_stop",
          data: JSON.stringify({ type: "content_block_stop", index }),
        }
      }
      open.clear()
      if (payload.delta.stop_sequence === undefined) {
        yield {
          event: event.event,
          data: JSON.stringify({
            ...payload,
            delta: { ...payload.delta, stop_sequence: null },
          }),
        }
        continue
      }
    }
    yield event
  }
}
