import { describe, expect, test } from "bun:test"

// Golden cover from LIVE traces (tests/fixtures/traces/, see its README).
// tests/web-tools-stream-responses.test.ts drives the transport with synthetic
// frames; this asserts the downstream contract against what Copilot actually
// emitted for a /responses-only model (gpt-5.6-sol) on 2026-08-31 -- the shape
// the loop hardcoding /chat/completions could never produce, because that
// request 400'd before any search ran.
//
// Descriptive, not aspirational: a real upstream change SHOULD fail these.
// Re-capture deliberately rather than editing a fixture to match.

interface TraceEvent {
  event: string
  data: {
    type?: string
    index?: number
    content_block?: { type?: string }
    delta?: { stop_reason?: string | null }
    usage?: { input_tokens?: number; output_tokens?: number }
  }
}

async function loadTrace(name: string): Promise<Array<TraceEvent>> {
  const file = Bun.file(
    new URL(`./fixtures/traces/${name}.json`, import.meta.url).pathname,
  )
  const parsed = (await file.json()) as { events: Array<TraceEvent> }
  return parsed.events
}

const CASES: Array<{ name: string; result: string }> = [
  { name: "web-search-streaming", result: "web_search_tool_result" },
  { name: "web-fetch-streaming", result: "web_fetch_tool_result" },
]

describe.each(CASES)("captured trace: $name", ({ name, result }) => {
  test("is a well-formed Anthropic Messages stream", async () => {
    const events = await loadTrace(name)

    expect(events.length).toBeGreaterThan(0)
    expect(events[0].event).toBe("message_start")
    expect(events.at(-1)?.event).toBe("message_stop")

    // Exactly one terminal message_delta, carrying the stop reason.
    const deltas = events.filter((e) => e.event === "message_delta")
    expect(deltas).toHaveLength(1)
    expect(deltas[0].data.delta?.stop_reason).toBe("end_turn")
  })

  test("opens and closes every content block", async () => {
    const events = await loadTrace(name)
    const starts = events.filter((e) => e.event === "content_block_start")
    const stops = events.filter((e) => e.event === "content_block_stop")

    expect(starts.length).toBe(stops.length)
    expect(starts.length).toBeGreaterThan(0)

    // Client-facing indices are a monotonic cursor across agent turns: the
    // per-turn upstream index resets to 0, the client's must keep climbing.
    const indices = starts.map((e) => e.data.index ?? -1)
    expect(indices).toEqual([...indices].sort((a, b) => a - b))
    expect(new Set(indices).size).toBe(indices.length)
  })

  test("synthesizes the server-side web tool blocks", async () => {
    const events = await loadTrace(name)
    const blocks = events
      .filter((e) => e.event === "content_block_start")
      .map((e) => e.data.content_block?.type)

    expect(blocks).toContain("server_tool_use")
    expect(blocks).toContain(result)
    // The result block must follow its server_tool_use, never precede it.
    expect(blocks.indexOf(result)).toBeGreaterThan(
      blocks.indexOf("server_tool_use"),
    )
  })

  test("reports summed usage on the terminal message_delta", async () => {
    const events = await loadTrace(name)
    const usage = events.find((e) => e.event === "message_delta")?.data.usage

    // Every agent turn is a separately-billed upstream call, so the terminal
    // delta carries the sum -- not just the last turn's.
    expect(usage?.output_tokens).toBeGreaterThan(0)
    expect(usage?.input_tokens).toBeGreaterThan(0)
  })

  test("carries no unredacted content", async () => {
    const raw = await Bun.file(
      new URL(`./fixtures/traces/${name}.json`, import.meta.url).pathname,
    ).text()

    // The fixtures are committed; this fails loudly if a re-capture is landed
    // without going through the scrub described in the fixtures README.
    expect(raw).not.toMatch(/\bgh[oprsu]_[A-Za-z0-9]{20,}/)
    expect(raw).not.toMatch(/https?:\/\//)
    expect(raw).not.toMatch(/"text":\s*"(?!\[redacted)[^"]{3,}"/)
    expect(raw).not.toMatch(/"thinking":\s*"(?!\[redacted)[^"]{3,}"/)
  })
})
