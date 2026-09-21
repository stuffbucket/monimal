import { describe, expect, test } from "bun:test"

import type {
  AnthropicMessagesPayload,
  AnthropicTool,
} from "~/lib/models/anthropic-types"

import { splitWebTools } from "~/routes/messages/web-tools/rewriter"

describe("splitWebTools", () => {
  test("preserves the type discriminator on non-web provider tools", () => {
    const webSearch = {
      type: "web_search_20250305",
      name: "web_search",
    } as unknown as AnthropicTool
    const advisor = {
      type: "advisor_20260301",
      name: "advisor",
    } as unknown as AnthropicTool
    const payload: AnthropicMessagesPayload = {
      model: "claude-opus-5",
      max_tokens: 128,
      messages: [{ role: "user", content: "hello" }],
      tools: [webSearch, advisor],
    }

    splitWebTools(payload)

    expect(payload.tools).toEqual([advisor])
  })
})
