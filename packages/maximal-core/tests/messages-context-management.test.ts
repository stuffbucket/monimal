import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import consola from "consola"

import type { AnthropicMessagesPayload } from "~/lib/models/anthropic-types"
import type { Model } from "~/services/copilot/get-models"

import { state } from "~/lib/runtime-state/state"
import { clearContextManagementRejections } from "~/services/copilot/context-management-capabilities"
import { createMessages } from "~/services/copilot/create-messages"

const originalFetch = globalThis.fetch
const originalState = {
  accountType: state.accountType,
  copilotApiUrl: state.copilotApiUrl,
  copilotToken: state.copilotToken,
  copilotTokenExpiresAtMs: state.copilotTokenExpiresAtMs,
  userName: state.userName,
  vsCodeVersion: state.vsCodeVersion,
  models: state.models,
}

const contextManagement = {
  edits: [
    {
      type: "clear_tool_uses_20250919",
      trigger: { type: "input_tokens", value: 1000 },
    },
  ],
}

function payload(model: string): AnthropicMessagesPayload {
  return {
    model,
    max_tokens: 16,
    messages: [{ role: "user", content: "hi" }],
    context_management: contextManagement,
  }
}

const okBody = {
  id: "msg_test",
  type: "message",
  role: "assistant",
  content: [{ type: "text", text: "ok" }],
  model: "claude-test",
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: { input_tokens: 1, output_tokens: 1 },
}

const silentLog = Object.assign(
  (_message: unknown, ..._args: Array<unknown>) => undefined,
  { raw: (..._args: Array<unknown>) => undefined },
)

function requestBody(init?: RequestInit): Record<string, unknown> {
  if (typeof init?.body !== "string") throw new TypeError("Expected body")
  return JSON.parse(init.body) as Record<string, unknown>
}

function requestUrl(input: string | URL | Request): string {
  if (typeof input === "string") return input
  return input instanceof URL ? input.href : input.url
}

function model(id: string, contextEditing?: boolean): Model {
  return {
    id,
    name: id,
    object: "model",
    vendor: "Anthropic",
    version: "1",
    preview: false,
    model_picker_enabled: true,
    supported_endpoints: ["/v1/messages"],
    capabilities: {
      family: "claude",
      type: "chat",
      tokenizer: "o200k_base",
      object: "model_capabilities",
      limits: {},
      supports:
        contextEditing === undefined ? {} : { context_editing: contextEditing },
    },
  }
}

beforeEach(() => {
  clearContextManagementRejections()
  state.accountType = "individual"
  state.copilotApiUrl = undefined
  state.copilotToken = "copilot_test"
  state.copilotTokenExpiresAtMs = undefined
  state.userName = "context-test-user"
  state.vsCodeVersion = "1.0.0"
  state.models = undefined
})

afterEach(() => {
  clearContextManagementRejections()
  state.accountType = originalState.accountType
  state.copilotApiUrl = originalState.copilotApiUrl
  state.copilotToken = originalState.copilotToken
  state.copilotTokenExpiresAtMs = originalState.copilotTokenExpiresAtMs
  state.userName = originalState.userName
  state.vsCodeVersion = originalState.vsCodeVersion
  state.models = originalState.models
  ;(globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch
})

describe("Messages context-management compatibility", () => {
  test("optimistically forwards unknown support", async () => {
    const bodies: Array<Record<string, unknown>> = []
    const methods: Array<string | undefined> = []
    const urls: Array<string> = []
    state.models = {
      object: "list",
      data: [model("other-model", false), model("claude-unknown")],
    }
    ;(globalThis as unknown as { fetch: typeof fetch }).fetch = ((
      url: string | URL | Request,
      init?: RequestInit,
    ) => {
      urls.push(requestUrl(url))
      methods.push(init?.method)
      bodies.push(requestBody(init))
      return Promise.resolve(Response.json(okBody))
    }) as unknown as typeof fetch

    await createMessages(payload("claude-unknown"), undefined, {
      requestId: "unknown",
    })

    expect(bodies[0].context_management).toEqual(contextManagement)
    expect(methods).toEqual(["POST"])
    expect(urls).toEqual(["https://api.githubcopilot.com/v1/messages"])
  })

  test("optimistically forwards when the model is absent from cached metadata", async () => {
    const bodies: Array<Record<string, unknown>> = []
    state.models = { object: "list", data: [model("other-model", false)] }
    ;(globalThis as unknown as { fetch: typeof fetch }).fetch = ((
      _url: string | URL | Request,
      init?: RequestInit,
    ) => {
      bodies.push(requestBody(init))
      return Promise.resolve(Response.json(okBody))
    }) as unknown as typeof fetch

    await createMessages(payload("missing-model"), undefined, {
      requestId: "missing-model",
    })

    expect(bodies[0].context_management).toEqual(contextManagement)
  })

  test("omits explicitly unsupported context editing and only its beta", async () => {
    const bodies: Array<Record<string, unknown>> = []
    const betas: Array<string | null> = []
    state.models = { object: "list", data: [model("claude-false", false)] }
    ;(globalThis as unknown as { fetch: typeof fetch }).fetch = ((
      _url: string | URL | Request,
      init?: RequestInit,
    ) => {
      bodies.push(requestBody(init))
      betas.push(new Headers(init?.headers).get("anthropic-beta"))
      return Promise.resolve(Response.json(okBody))
    }) as unknown as typeof fetch

    await createMessages(
      payload("claude-false"),
      " , context-management-2025-06-27, interleaved-thinking-2025-05-14,,advanced-tool-use-2025-11-20 ",
      { requestId: "false" },
    )

    expect("context_management" in bodies[0]).toBe(false)
    expect(betas).toEqual([
      "interleaved-thinking-2025-05-14,advanced-tool-use-2025-11-20",
    ])
  })

  test("omits unsupported context editing when no beta header is present", async () => {
    const bodies: Array<Record<string, unknown>> = []
    state.models = { object: "list", data: [model("claude-false", false)] }
    ;(globalThis as unknown as { fetch: typeof fetch }).fetch = ((
      _url: string | URL | Request,
      init?: RequestInit,
    ) => {
      bodies.push(requestBody(init))
      return Promise.resolve(Response.json(okBody))
    }) as unknown as typeof fetch

    await createMessages(payload("claude-false"), undefined, {
      requestId: "false-no-beta",
    })

    expect("context_management" in bodies[0]).toBe(false)
  })

  test("retries one explicit context rejection and remembers it", async () => {
    const bodies: Array<Record<string, unknown>> = []
    const betas: Array<string | null> = []
    let call = 0
    ;(globalThis as unknown as { fetch: typeof fetch }).fetch = ((
      _url: string | URL | Request,
      init?: RequestInit,
    ) => {
      call += 1
      bodies.push(requestBody(init))
      betas.push(new Headers(init?.headers).get("anthropic-beta"))
      if (call === 1) {
        return Promise.resolve(
          Response.json(
            { error: { message: "context_management is not supported" } },
            { status: 400 },
          ),
        )
      }
      return Promise.resolve(Response.json(okBody))
    }) as unknown as typeof fetch

    const request = payload("claude-rejected")
    const beta = "context-management-2025-06-27,advanced-tool-use-2025-11-20"
    await createMessages(request, beta, { requestId: "first" })
    await createMessages(request, beta, { requestId: "cached" })

    state.userName = "other-account"
    await createMessages(request, beta, { requestId: "other-account" })
    await createMessages(payload("claude-other-model"), beta, {
      requestId: "other-model",
    })
    await createMessages(
      {
        ...request,
        context_management: {
          ...contextManagement,
          edits: [],
        },
      },
      beta,
      { requestId: "other-strategy" },
    )

    expect(bodies).toHaveLength(6)
    expect(bodies[0].context_management).toBeDefined()
    expect("context_management" in bodies[1]).toBe(false)
    expect("context_management" in bodies[2]).toBe(false)
    expect(bodies[3].context_management).toEqual(contextManagement)
    expect(bodies[4].context_management).toEqual(contextManagement)
    expect(bodies[5].context_management).toEqual({
      ...contextManagement,
      edits: [],
    })
    expect(betas).toEqual([
      beta,
      "advanced-tool-use-2025-11-20",
      "advanced-tool-use-2025-11-20",
      beta,
      beta,
      beta,
    ])
  })
})

describe("Messages context-management fallback", () => {
  test("retries without caching when account identity is unavailable", async () => {
    const bodies: Array<Record<string, unknown>> = []
    state.userName = undefined
    let call = 0
    ;(globalThis as unknown as { fetch: typeof fetch }).fetch = ((
      _url: string | URL | Request,
      init?: RequestInit,
    ) => {
      call += 1
      bodies.push(requestBody(init))
      return Promise.resolve(
        call === 1 || call === 3 ?
          Response.json(
            { error: { message: "context_management is not supported" } },
            { status: 400 },
          )
        : Response.json(okBody),
      )
    }) as unknown as typeof fetch

    await createMessages(payload("claude-no-account"), undefined, {
      requestId: "first",
    })
    await createMessages(payload("claude-no-account"), undefined, {
      requestId: "second",
    })

    expect(bodies).toHaveLength(4)
    expect(bodies[0].context_management).toEqual(contextManagement)
    expect("context_management" in bodies[1]).toBe(false)
    expect(bodies[2].context_management).toEqual(contextManagement)
    expect("context_management" in bodies[3]).toBe(false)
  })

  test("retries a streaming rejection and returns the retry SSE", async () => {
    const bodies: Array<Record<string, unknown>> = []
    let call = 0
    ;(globalThis as unknown as { fetch: typeof fetch }).fetch = ((
      _url: string | URL | Request,
      init?: RequestInit,
    ) => {
      call += 1
      bodies.push(requestBody(init))
      if (call === 1) {
        return Promise.resolve(
          Response.json(
            { error: { message: "context_management is not supported" } },
            { status: 400 },
          ),
        )
      }
      return Promise.resolve(
        new Response(
          'event: message_start\ndata: {"type":"message_start"}\n\n',
          { headers: { "content-type": "text/event-stream" } },
        ),
      )
    }) as unknown as typeof fetch
    const request = { ...payload("claude-stream"), stream: true }

    const result = await createMessages(request, undefined, {
      requestId: "stream",
    })
    if (!(Symbol.asyncIterator in result)) {
      throw new TypeError("Expected an SSE event stream")
    }
    const events = []
    for await (const event of result) events.push(event)

    expect(bodies).toHaveLength(2)
    expect(bodies[0].context_management).toEqual(contextManagement)
    expect("context_management" in bodies[1]).toBe(false)
    expect(events).toEqual([
      { event: "message_start", data: '{"type":"message_start"}' },
    ])
  })

  test("removes a lone context beta when retrying", async () => {
    const betas: Array<string | null> = []
    let call = 0
    ;(globalThis as unknown as { fetch: typeof fetch }).fetch = ((
      _url: string | URL | Request,
      init?: RequestInit,
    ) => {
      call += 1
      betas.push(new Headers(init?.headers).get("anthropic-beta"))
      return Promise.resolve(
        call === 1 ?
          Response.json(
            { error: { message: "context_management is not supported" } },
            { status: 400 },
          )
        : Response.json(okBody),
      )
    }) as unknown as typeof fetch

    await createMessages(
      payload("claude-rejected"),
      " , context-management-2025-06-27, ",
      { requestId: "lone-beta" },
    )

    expect(betas).toEqual(["context-management-2025-06-27", null])
  })

  test("does not retry a rejection after explicit capability suppression", async () => {
    let calls = 0
    state.models = { object: "list", data: [model("claude-false", false)] }
    ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (() => {
      calls += 1
      return Promise.resolve(
        Response.json(
          { error: { message: "context_management is not supported" } },
          { status: 400 },
        ),
      )
    }) as unknown as typeof fetch

    let caught: unknown = null
    try {
      await createMessages(payload("claude-false"), undefined, {
        requestId: "suppressed-rejection",
      })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toContain("Failed to create messages")
    expect(calls).toBe(1)
  })
})

describe("Messages context-management rejection boundaries", () => {
  test("does not retry an unrelated 400", async () => {
    let calls = 0
    ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (() => {
      calls += 1
      return Promise.resolve(
        Response.json(
          { error: { message: "max_tokens must be greater than zero" } },
          { status: 400 },
        ),
      )
    }) as unknown as typeof fetch

    let caught: unknown = null
    try {
      await createMessages(payload("claude-unrelated"), undefined, {
        requestId: "unrelated",
      })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toContain("Failed to create messages")
    expect(calls).toBe(1)
  })

  test("does not retry a non-400 response that mentions context management", async () => {
    let calls = 0
    ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (() => {
      calls += 1
      return Promise.resolve(
        Response.json(
          { error: { message: "context_management is not supported" } },
          { status: 422 },
        ),
      )
    }) as unknown as typeof fetch

    let caught: unknown = null
    try {
      await createMessages(payload("claude-unrelated"), undefined, {
        requestId: "non-400",
      })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toContain("Failed to create messages")
    expect(calls).toBe(1)
  })

  test("does not create a rejection scope without context management", async () => {
    let calls = 0
    const betas: Array<string | null> = []
    ;(globalThis as unknown as { fetch: typeof fetch }).fetch = ((
      _url: string | URL | Request,
      init?: RequestInit,
    ) => {
      calls += 1
      betas.push(new Headers(init?.headers).get("anthropic-beta"))
      return Promise.resolve(
        Response.json(
          { error: { message: "context_management is not supported" } },
          { status: 400 },
        ),
      )
    }) as unknown as typeof fetch
    const request = payload("claude-no-context")
    delete request.context_management

    let caught: unknown = null
    try {
      await createMessages(request, "context-management-2025-06-27", {
        requestId: "no-context",
      })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(Error)
    expect(calls).toBe(1)
    expect(betas).toEqual(["context-management-2025-06-27"])
  })

  test("keeps message-proxy headers off every 4.8-prefixed model", async () => {
    let headers = new Headers()
    ;(globalThis as unknown as { fetch: typeof fetch }).fetch = ((
      _url: string | URL | Request,
      init?: RequestInit,
    ) => {
      headers = new Headers(init?.headers)
      return Promise.resolve(Response.json(okBody))
    }) as unknown as typeof fetch
    const request = payload("claude-opus-4.8-preview")
    request.metadata = {
      user_id: JSON.stringify({ device_id: "device", session_id: "session" }),
    }

    await createMessages(request, undefined, { requestId: "opus-4.8" })

    expect(headers.get("user-agent")).not.toContain("vscode_claude_code")
    expect(headers.get("x-interaction-type")).toBe("conversation-agent")
  })

  test("applies message-proxy headers to metadata-bearing non-4.8 models", async () => {
    let headers = new Headers()
    ;(globalThis as unknown as { fetch: typeof fetch }).fetch = ((
      _url: string | URL | Request,
      init?: RequestInit,
    ) => {
      headers = new Headers(init?.headers)
      return Promise.resolve(Response.json(okBody))
    }) as unknown as typeof fetch
    const request = payload("claude-opus-4.7")
    request.metadata = {
      user_id: JSON.stringify({ device_id: "device", session_id: "session" }),
    }

    await createMessages(request, undefined, { requestId: "opus-4.7" })

    expect(headers.get("user-agent")).toContain("vscode_claude_code")
    expect(headers.get("x-interaction-type")).toBe("messages-proxy")
  })

  test("logs the rejected context retry and selected model", async () => {
    const warn = spyOn(consola, "warn").mockImplementation(silentLog)
    const log = spyOn(consola, "log").mockImplementation(silentLog)
    let call = 0
    ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (() => {
      call += 1
      return Promise.resolve(
        call === 1 ?
          Response.json(
            { error: { message: "context_management is not supported" } },
            { status: 400 },
          )
        : Response.json(okBody),
      )
    }) as unknown as typeof fetch

    try {
      await createMessages(payload("claude-logged"), undefined, {
        requestId: "logged",
      })

      expect(warn).toHaveBeenCalledWith(
        "Copilot rejected context_management; retrying once without it",
      )
      expect(log).toHaveBeenCalledWith("<-- model: claude-logged")
    } finally {
      warn.mockRestore()
      log.mockRestore()
    }
  })
})
