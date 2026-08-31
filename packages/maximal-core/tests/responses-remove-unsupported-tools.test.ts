import { describe, expect, it } from "bun:test"

import type { ResponsesPayload } from "~/services/copilot/create-responses"

import { removeUnsupportedTools } from "~/routes/responses/handler"

const makePayload = (tools: ResponsesPayload["tools"]): ResponsesPayload => ({
  model: "gpt-5",
  input: [],
  tools,
})

describe("removeUnsupportedTools", () => {
  it("removes image_generation tools", () => {
    const payload = makePayload([
      { type: "image_generation" },
      { type: "function", name: "foo" },
    ] as ResponsesPayload["tools"])

    removeUnsupportedTools(payload)

    expect(payload.tools).toHaveLength(1)
    expect((payload.tools as Array<{ type: string }>)[0].type).toBe("function")
  })

  it("leaves payload unchanged when no unsupported tools present", () => {
    const tools = [
      { type: "function", name: "foo" },
      { type: "web_search" },
    ] as ResponsesPayload["tools"]
    const payload = makePayload(tools)

    removeUnsupportedTools(payload)

    expect(payload.tools).toHaveLength(2)
  })

  it("is a no-op when tools is missing or empty", () => {
    const empty = makePayload([] as ResponsesPayload["tools"])
    removeUnsupportedTools(empty)
    expect(empty.tools).toEqual([] as ResponsesPayload["tools"])

    const missing = { model: "gpt-5", input: [] } as unknown as ResponsesPayload
    removeUnsupportedTools(missing)
    expect(missing.tools).toBeUndefined()
  })
  // The /responses route has no web-tools agent loop -- splitWebTools and
  // handleWithWebToolsAgent are mounted only on /v1/messages -- so nothing on
  // this path strips and shims Anthropic's server-side web tools. Left in, they
  // reach Copilot raw and are rejected, 400ing the whole request. Dropping them
  // degrades to "no server-side web tool" instead. A client wanting search here
  // declares the native `web_search`, which survives (see the test above).
  it("drops Anthropic server-side web tools, keeping the native web_search", () => {
    const tools = [
      { type: "web_search_20250305", name: "web_search" },
      { type: "web_fetch_20250910", name: "web_fetch" },
      { type: "web_search" },
      { type: "function", name: "foo" },
    ] as ResponsesPayload["tools"]
    const payload = makePayload(tools)

    removeUnsupportedTools(payload)

    expect(
      (payload.tools as Array<{ type: string }>).map((t) => t.type),
    ).toEqual(["web_search", "function"])
  })
})
