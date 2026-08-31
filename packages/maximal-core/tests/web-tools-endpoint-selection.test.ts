import { describe, expect, test } from "bun:test"
import consola from "consola"

import type { AnthropicMessagesPayload } from "~/lib/models/anthropic-types"
import type { WebToolsUpstreamDeps } from "~/routes/messages/web-tools/flow"
import type { Model } from "~/services/copilot/get-models"

import {
  shouldUseMessagesApi,
  shouldUseResponsesApi,
} from "~/lib/models/endpoint-selection"
import { buildCallOnce } from "~/routes/messages/web-tools/flow"

// Regression cover for maximal-core#21: a request declaring an Anthropic
// server-side web tool short-circuits into the web-tools agent loop ABOVE the
// endpoint-capability checks in routes/messages/handler.ts. The loop then
// hardcoded /chat/completions, so a /responses-only model (gpt-5.6-sol) failed
// with `unsupported_api_for_model` before any search ran.
//
// Scope: non-streaming only, and these tests exercise only `buildCallOnce`.
// `runStreamingAgent` still calls /chat/completions unconditionally, and
// NOTHING here pins that — Claude Code always streams, so the user-visible bug
// is still open.

/** Minimal catalog entry. Only `supported_endpoints` drives the decision; the
 *  rest exists to satisfy the interface. */
function model(supportedEndpoints?: Array<string>): Model {
  return {
    capabilities: {} as Model["capabilities"],
    id: "test-model",
    model_picker_enabled: true,
    name: "Test Model",
    object: "model",
    preview: false,
    vendor: "test",
    version: "1",
    supported_endpoints: supportedEndpoints,
  }
}

describe("endpoint capability predicates", () => {
  const cases: Array<{
    name: string
    endpoints?: Array<string>
    responses: boolean
    messages: boolean
  }> = [
    {
      name: "/responses-only (the gpt-5.6-sol shape)",
      endpoints: ["/responses"],
      responses: true,
      messages: false,
    },
    {
      name: "chat-completions-only",
      endpoints: ["/chat/completions"],
      responses: false,
      messages: false,
    },
    {
      name: "messages + responses (Claude-family shape)",
      endpoints: ["/v1/messages", "/responses"],
      responses: true,
      messages: true,
    },
    {
      name: "endpoints field absent",
      endpoints: undefined,
      responses: false,
      messages: false,
    },
  ]

  for (const c of cases) {
    test(c.name, () => {
      expect(shouldUseResponsesApi(model(c.endpoints))).toBe(c.responses)
      expect(shouldUseMessagesApi(model(c.endpoints))).toBe(c.messages)
    })
  }

  // The catalog-miss case. findEndpointModel returns undefined for a model id
  // Copilot does not list, and both predicates must answer false so the caller
  // keeps its existing fallback rather than throwing.
  test("model absent from the catalog answers false for both", () => {
    expect(shouldUseResponsesApi(undefined)).toBe(false)
    expect(shouldUseMessagesApi(undefined)).toBe(false)
  })
})

/** Upstream stubs that record which transport the seam reached and abort
 *  there. Injected rather than `mock.module`-ed — ADR-0011. */
function spyDeps(): { calls: Array<string>; deps: WebToolsUpstreamDeps } {
  const calls: Array<string> = []
  const deps: WebToolsUpstreamDeps = {
    createChatCompletions: () => {
      calls.push("chat")
      throw new Error("stub")
    },
    createResponses: () => {
      calls.push("responses")
      throw new Error("stub")
    },
  }
  return { calls, deps }
}

const OPTIONS = { logger: consola.create({ level: 0 }), requestId: "req-1" }

function turn(): AnthropicMessagesPayload {
  return {
    model: "test-model",
    max_tokens: 64,
    messages: [{ role: "user", content: "hello" }],
  }
}

/** Drive one turn to the point where the stub aborts it. */
async function runTurn(
  selectedModel: Model | undefined,
  deps: WebToolsUpstreamDeps,
): Promise<void> {
  await buildCallOnce(selectedModel, OPTIONS, deps)(turn()).catch(() => {})
}

describe("web-tools agent turn transport", () => {
  // The bug, stated as the behaviour that must never come back: before the fix
  // this reached createChatCompletions and Copilot answered 400
  // unsupported_api_for_model.
  test("a /responses-only model is driven over /responses", async () => {
    const { calls, deps } = spyDeps()
    await runTurn(model(["/responses"]), deps)
    expect(calls).toEqual(["responses"])
  })

  test("a chat-completions-only model keeps /chat/completions", async () => {
    const { calls, deps } = spyDeps()
    await runTurn(model(["/chat/completions"]), deps)
    expect(calls).toEqual(["chat"])
  })

  test("a model missing from the catalog falls back to /chat/completions", async () => {
    const { calls, deps } = spyDeps()
    await runTurn(undefined, deps)
    expect(calls).toEqual(["chat"])
  })

  // INTENDED, not a gap. With Copilot as the provider, Anthropic models are
  // served over /chat/completions in the agent loop — this is the long-standing
  // shipped behaviour, not a shortfall of #21. The agent loop deliberately does
  // not mirror the ordinary handler's /v1/messages-first precedence.
  test("an Anthropic model is driven over /chat/completions", async () => {
    const { calls, deps } = spyDeps()
    await runTurn(model(["/v1/messages"]), deps)
    expect(calls).toEqual(["chat"])
  })
})
