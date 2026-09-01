import type { Context } from "hono"

import { streamSSE } from "hono/streaming"

import type { WebSearchToolDecl } from "~/routes/messages/web-tools/types"

import {
  getConfig,
  getPromptCacheRetention,
  isResponsesApiWebSearchEnabled,
} from "~/lib/config/config"
import { awaitApproval } from "~/lib/http/approval"
import { checkRateLimit } from "~/lib/http/rate-limit"
import { readNestedUsage } from "~/lib/http/untrusted-frame"
import { reverseId } from "~/lib/models/anthropic-id-rewrite"
import { shouldUseResponsesApi } from "~/lib/models/endpoint-selection"
import { resolveModelProfile } from "~/lib/models/model-profile"
import {
  createHandlerLogger,
  debugJson,
  debugJsonTail,
} from "~/lib/platform/logger"
import { generateRequestIdFromPayload, getUUID } from "~/lib/platform/utils"
import { modelsCached, state } from "~/lib/runtime-state/state"
import {
  createCopilotTokenUsageRecorder,
  normalizeResponsesUsage,
  type UsageTokens,
  withCopilotCost,
} from "~/lib/token-usage"
import { buildResponsesFilters } from "~/routes/messages/web-tools/executor"
import { TOOL_TYPE } from "~/routes/messages/web-tools/vocab"
import { isAsyncIterable } from "~/routes/streaming-predicates"
import {
  createResponses as defaultCreateResponses,
  type ResponsesPayload,
  type ResponsesResult,
  type ResponseStreamEvent,
} from "~/services/copilot/create-responses"

// Test-only DI shim. Lets tests/responses-handler.test.ts inject a stub
// for createResponses without using process-wide mock.module on
// "~/services/copilot/create-responses" — which would leak the stub
// to every test file that statically imports createResponses later in
// the same `bun test` process (Bun captures ESM bindings at module
// load time; later restoration via mock.module doesn't repoint already-
// resolved bindings). Production callers see defaultCreateResponses.
let createResponses: typeof defaultCreateResponses = defaultCreateResponses

/** @internal test seam */
export function __setCreateResponsesForTests(
  impl: typeof defaultCreateResponses,
): void {
  createResponses = impl
}

/** @internal test seam */
export function __resetCreateResponsesForTests(): void {
  createResponses = defaultCreateResponses
}

import { createStreamIdTracker, fixStreamIds } from "./stream-id-sync"
import {
  applyResponsesApiContextManagement,
  compactInputByLatestCompaction,
  getResponsesRequestOptions,
} from "./utils"

const logger = createHandlerLogger("responses-handler")

/** Response for a model that can't use the /responses endpoint. Distinguishes
 *  a genuinely-unsupported model (400) from an empty/never-loaded catalog we
 *  simply can't answer for yet (503 transient — the stale-refresh middleware
 *  already kicked a background prime for this request), so we don't mislead the
 *  client into thinking the model is unsupported during a boot/mint blip. */
function responsesUnavailableForModel(c: Context) {
  if (modelsCached() === 0) {
    return c.json(
      {
        error: {
          message:
            "The model catalog is still loading; retry this request shortly.",
          type: "server_error",
        },
      },
      503,
    )
  }
  return c.json(
    {
      error: {
        message:
          "This model does not support the responses endpoint. Please choose a different model.",
        type: "invalid_request_error",
      },
    },
    400,
  )
}

export const handleResponses = async (c: Context) => {
  await checkRateLimit(state)

  const payload = await c.req.json<ResponsesPayload>()
  payload.model = reverseId(payload.model)
  debugJson(logger, "Responses request payload:", payload)

  // not support subagent marker for now , set sessionId = getUUID(requestId)
  const requestId = generateRequestIdFromPayload({ messages: payload.input })
  logger.debug("Generated request ID:", requestId)

  const sessionId = getUUID(requestId)
  logger.debug("Extracted session ID:", sessionId)
  const recordUsage = createCopilotTokenUsageRecorder({
    endpoint: "responses",
    fallbackSessionId: sessionId,
    model: payload.model,
  })

  useFunctionApplyPatch(payload)

  removeUnsupportedTools(payload)

  mapAnthropicWebTools(payload)

  if (!isResponsesApiWebSearchEnabled()) {
    removeWebSearchTool(payload)
  }

  compactInputByLatestCompaction(payload)

  const selectedModel = state.models?.data.find(
    (model) => model.id === payload.model,
  )
  if (!shouldUseResponsesApi(selectedModel)) {
    return responsesUnavailableForModel(c)
  }

  applyResponsesApiContextManagement(
    payload,
    selectedModel ?
      resolveModelProfile(selectedModel).maxPromptTokens
    : undefined,
  )

  // Copilot/OpenAI-Responses-specific prefix-cache retention. On this native
  // passthrough path we only fill it in when the client didn't set one — never
  // override an explicit client value. Opt-in via config; omitted otherwise.
  const promptCacheRetention = getPromptCacheRetention()
  if (promptCacheRetention && !payload.prompt_cache_retention) {
    payload.prompt_cache_retention = promptCacheRetention
  }

  debugJson(logger, "Translated Responses payload:", payload)

  const { vision, initiator } = getResponsesRequestOptions(payload)

  if (state.manualApprove) {
    await awaitApproval()
  }

  const response = await createResponses(payload, {
    vision,
    initiator,
    requestId,
    sessionId: sessionId,
  })

  if (isStreamingRequested(payload) && isAsyncIterable(response)) {
    logger.debug("Forwarding native Responses stream")
    return streamSSE(c, async (stream) => {
      const idTracker = createStreamIdTracker()
      let usage: UsageTokens = {}

      for await (const chunk of response) {
        debugJson(logger, "Responses stream chunk:", chunk)
        const parsedEvent = parseResponsesStreamEvent(chunk)
        if (
          parsedEvent?.type === "response.completed"
          || parsedEvent?.type === "response.failed"
          || parsedEvent?.type === "response.incomplete"
        ) {
          // `readNestedUsage`, not `parsedEvent.response.usage`: this loop has
          // no `try` around it, so a terminal frame without a `response` body
          // would dead-end the stream with no error event at all.
          usage = normalizeResponsesUsage(
            readNestedUsage(parsedEvent, "response"),
          )
        }

        const processedData = fixStreamIds(
          (chunk as { data?: string }).data ?? "",
          (chunk as { event?: string }).event,
          idTracker,
        )

        await stream.writeSSE({
          id: (chunk as { id?: string }).id,
          event: (chunk as { event?: string }).event,
          data: processedData,
        })
      }

      recordUsage(usage)
    })
  }

  debugJsonTail(logger, "Forwarding native Responses result:", {
    value: response,
    tailLength: 400,
  })
  recordUsage(
    withCopilotCost(
      normalizeResponsesUsage((response as ResponsesResult).usage),
      (response as ResponsesResult).copilot_usage,
    ),
  )
  return c.json(response as ResponsesResult)
}

const isStreamingRequested = (payload: ResponsesPayload): boolean =>
  Boolean(payload.stream)

const parseResponsesStreamEvent = (
  chunk: unknown,
): ResponseStreamEvent | null => {
  const data = (chunk as { data?: string }).data
  if (!data || data === "[DONE]") {
    return null
  }

  try {
    // Only `.type` is read off this value (through `?.`); every other field it
    // reaches goes through `readNestedUsage`, which is total.
    // casts-keep: only `.type` read via `?.`, body via readNestedUsage (total); tolerance proven in tests/stream-boundary-tolerance.test.ts
    return JSON.parse(data) as ResponseStreamEvent
  } catch {
    return null
  }
}

const useFunctionApplyPatch = (payload: ResponsesPayload): void => {
  const config = getConfig()
  const useFunctionApplyPatch = config.useFunctionApplyPatch ?? true
  if (useFunctionApplyPatch) {
    logger.debug("Using function tool apply_patch for responses")
    if (Array.isArray(payload.tools)) {
      const toolsArr = payload.tools
      for (let i = 0; i < toolsArr.length; i++) {
        const t = toolsArr[i]
        if (t.type === "custom" && t.name === "apply_patch") {
          toolsArr[i] = {
            type: "function",
            name: t.name,
            description: "Use the `apply_patch` tool to edit files",
            parameters: {
              type: "object",
              properties: {
                input: {
                  type: "string",
                  description: "The entire contents of the apply_patch command",
                },
              },
              required: ["input"],
            },
            strict: false,
          }
        }
      }
    }
  }
}

const removeWebSearchTool = (payload: ResponsesPayload): void => {
  if (!Array.isArray(payload.tools) || payload.tools.length === 0) return

  payload.tools = payload.tools.filter((t) => {
    return t.type !== "web_search"
  })
}

const COPILOT_UNSUPPORTED_TOOL_TYPES = new Set<string>(["image_generation"])

/**
 * Translate Anthropic's server-side web tools into the native `/responses`
 * `web_search`.
 *
 * This route has no web-tools agent loop -- `splitWebTools` and
 * `handleWithWebToolsAgent` are mounted only on `/v1/messages` -- so a
 * declaration left in place reaches Copilot raw and 400s the whole request.
 *
 * Translating rather than dropping is what keeps the caller's **domain policy**,
 * which must not be silently lost: Copilot's `/responses` honors
 * `filters.allowed_domains` / `blocked_domains`, verified live and shared with
 * the broker via {@link buildResponsesFilters}. `user_location` carries over
 * as-is; both APIs use the same `approximate` shape.
 *
 * Two things do not survive, both stated rather than hidden:
 *   - `max_uses` has no native counterpart. Counting invocations is the agent
 *     loop's job and there is no loop here, so a cap declared on this route is
 *     not enforced.
 *   - `web_fetch` has no native counterpart at all and is dropped. Its domain
 *     policy is not merged into `web_search`: a fetch allow-list is not a
 *     search allow-list, and widening one with the other would be worse than
 *     dropping it.
 */
export const mapAnthropicWebTools = (payload: ResponsesPayload): void => {
  if (!Array.isArray(payload.tools) || payload.tools.length === 0) return

  const tools = payload.tools as Array<{ type?: string }>
  if (
    !tools.some(
      (t) => t.type === TOOL_TYPE.webSearch || t.type === TOOL_TYPE.webFetch,
    )
  ) {
    return
  }

  const alreadyNative = tools.some((t) => t.type === "web_search")
  const out: Array<{ type?: string }> = []

  for (const tool of tools) {
    if (tool.type === TOOL_TYPE.webFetch) {
      logger.debug("Dropped web_fetch: no native /responses counterpart")
      continue
    }
    if (tool.type !== TOOL_TYPE.webSearch) {
      out.push(tool)
      continue
    }
    if (alreadyNative) {
      logger.debug("Dropped Anthropic web_search: native web_search declared")
      continue
    }
    const decl = tool as WebSearchToolDecl
    out.push({
      type: "web_search",
      ...buildResponsesFilters({
        allowedDomains: decl.allowed_domains,
        blockedDomains: decl.blocked_domains,
      }),
      ...(decl.user_location ? { user_location: decl.user_location } : {}),
    })
  }

  payload.tools = out
}

export const removeUnsupportedTools = (payload: ResponsesPayload): void => {
  if (!Array.isArray(payload.tools) || payload.tools.length === 0) return

  const dropped: Array<string> = []
  payload.tools = payload.tools.filter((t) => {
    const type = t.type as string
    if (COPILOT_UNSUPPORTED_TOOL_TYPES.has(type)) {
      dropped.push(type)
      return false
    }
    return true
  })
  if (dropped.length > 0) {
    logger.debug("Removed unsupported tools:", dropped)
  }
}
