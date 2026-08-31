import { describe, expect, it } from "bun:test"

import type { ResponsesPayload } from "~/services/copilot/create-responses"

import { mapAnthropicWebTools } from "~/routes/responses/handler"

// The /responses route has no web-tools agent loop -- splitWebTools and
// handleWithWebToolsAgent are mounted only on /v1/messages -- so an Anthropic
// server-side web tool left in place reaches Copilot raw and 400s the whole
// request. It is translated to the native web_search rather than dropped,
// because the caller's domain policy must survive: Copilot's /responses honors
// filters.allowed_domains / blocked_domains (verified live; see
// buildResponsesFilters in web-tools/executor.ts).

function makePayload(tools: ResponsesPayload["tools"]): ResponsesPayload {
  return { model: "gpt-5.6-sol", input: [], tools }
}

function typesOf(payload: ResponsesPayload): Array<string | undefined> {
  return (payload.tools as Array<{ type?: string }>).map((t) => t.type)
}

describe("mapAnthropicWebTools", () => {
  it("carries allowed_domains and blocked_domains onto the native tool", () => {
    const payload = makePayload([
      {
        type: "web_search_20250305",
        name: "web_search",
        allowed_domains: ["www.who.int"],
        blocked_domains: ["reddit.com"],
      },
    ] as ResponsesPayload["tools"])

    mapAnthropicWebTools(payload)

    expect(payload.tools).toEqual([
      {
        type: "web_search",
        filters: {
          allowed_domains: ["www.who.int"],
          blocked_domains: ["reddit.com"],
        },
      },
    ] as ResponsesPayload["tools"])
  })

  it("carries user_location through unchanged", () => {
    const payload = makePayload([
      {
        type: "web_search_20250305",
        name: "web_search",
        user_location: { type: "approximate", country: "GB", city: "London" },
      },
    ] as ResponsesPayload["tools"])

    mapAnthropicWebTools(payload)

    expect(payload.tools).toEqual([
      {
        type: "web_search",
        user_location: { type: "approximate", country: "GB", city: "London" },
      },
    ] as ResponsesPayload["tools"])
  })

  it("emits no filters key when the caller set no domain policy", () => {
    const payload = makePayload([
      { type: "web_search_20250305", name: "web_search" },
    ] as ResponsesPayload["tools"])

    mapAnthropicWebTools(payload)

    expect(payload.tools).toEqual([
      { type: "web_search" },
    ] as ResponsesPayload["tools"])
  })

  // A fetch allow-list is not a search allow-list, so its domain policy is not
  // merged into web_search -- widening one with the other would be worse than
  // dropping it.
  it("drops web_fetch, which has no native counterpart", () => {
    const payload = makePayload([
      {
        type: "web_fetch_20250910",
        name: "web_fetch",
        allowed_domains: ["example.com"],
      },
      { type: "function", name: "foo" },
    ] as ResponsesPayload["tools"])

    mapAnthropicWebTools(payload)

    expect(typesOf(payload)).toEqual(["function"])
  })

  it("does not duplicate an already-declared native web_search", () => {
    const payload = makePayload([
      { type: "web_search_20250305", name: "web_search" },
      { type: "web_search" },
    ] as ResponsesPayload["tools"])

    mapAnthropicWebTools(payload)

    expect(typesOf(payload)).toEqual(["web_search"])
  })

  it("leaves a payload with no Anthropic web tools untouched", () => {
    const tools = [
      { type: "function", name: "foo" },
      { type: "web_search" },
    ] as ResponsesPayload["tools"]
    const payload = makePayload(tools)

    mapAnthropicWebTools(payload)

    expect(payload.tools).toBe(tools)
  })
})
