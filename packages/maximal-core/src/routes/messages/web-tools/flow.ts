/**
 * Hono entry point that routes a web-tools-bearing /v1/messages
 * request through the agent loop (streaming or non-streaming).
 */

import type { Context } from "hono"

import { streamSSE } from "hono/streaming"

import type { AnthropicMessagesPayload } from "~/lib/models/anthropic-types"
import type { Model } from "~/services/copilot/get-models"

import { shouldUseResponsesApi } from "~/lib/models/endpoint-selection"
import { getResponsesRequestOptions } from "~/routes/responses/utils"
import { isAsyncIterable, isNonStreaming } from "~/routes/streaming-predicates"
import { createChatCompletions } from "~/services/copilot/create-chat-completions"
import { createResponses } from "~/services/copilot/create-responses"

import { type FlowBaseOptions } from "../api-flows"
import {
  translateToAnthropic,
  translateToOpenAI,
} from "../non-stream-translation"
import {
  translateAnthropicMessagesToResponsesPayload,
  translateResponsesResultToAnthropic,
} from "../responses-translation"
import { emitStreamError } from "../stream-error"
import { runAgentLoop, type AgentLoopArgs } from "./agent"
import { selectExecutor } from "./executor"
import { attachClientShims, type WebToolPolicy } from "./rewriter"
import { runStreamingAgent, type UpstreamCall } from "./stream"

const NON_STREAMING_EXPECTED =
  "web-tools agent: expected non-streaming response from Copilot"

/** One agent turn, as a transport-agnostic call. Derived from the loop's own
 *  contract so the two cannot drift. */
type CallOnce = AgentLoopArgs["callOnce"]
/** Injectable upstream seam. Same reasoning as `HandleCompletionDeps` in
 *  `../handler`: `mock.module`-ing these shared service modules leaks into
 *  every test file evaluated afterwards, so the test passes stubs instead. */
export interface WebToolsUpstreamDeps {
  createChatCompletions: typeof createChatCompletions
  createResponses: typeof createResponses
}

const defaultUpstreamDeps: WebToolsUpstreamDeps = {
  createChatCompletions,
  createResponses,
}

/**
 * Pick the upstream transport for each turn of the agent loop.
 *
 * By this point the turn is an ordinary tool-using completion: `splitWebTools`
 * has stripped the Anthropic server-side web tool declarations and
 * `attachClientShims` has replaced them with plain function tools. Nothing in
 * the payload is endpoint-specific, so either transport can carry it and the
 * only question is which one the model actually serves.
 *
 * Non-streaming only. `runStreamingAgent` still calls `/chat/completions`
 * unconditionally, so a `/responses`-only model remains broken for streaming
 * requests — which is what real clients send.
 */
export function buildCallOnce(
  selectedModel: Model | undefined,
  options: FlowBaseOptions,
  deps: WebToolsUpstreamDeps = defaultUpstreamDeps,
): CallOnce {
  const callOptions = {
    requestId: options.requestId,
    sessionId: options.sessionId,
    compactType: options.compactType,
    subagentMarker: options.subagentMarker,
  }

  if (shouldUseResponsesApi(selectedModel)) {
    return async (turnPayload) => {
      const responsesPayload =
        translateAnthropicMessagesToResponsesPayload(turnPayload)
      responsesPayload.stream = false
      const { vision, initiator } = getResponsesRequestOptions(responsesPayload)
      const response = await deps.createResponses(responsesPayload, {
        vision,
        initiator,
        ...callOptions,
      })
      if (isAsyncIterable(response)) {
        throw new Error(NON_STREAMING_EXPECTED)
      }
      return translateResponsesResultToAnthropic(response)
    }
  }

  return async (turnPayload) => {
    const openAIPayload = translateToOpenAI(turnPayload)
    openAIPayload.stream = false
    const response = await deps.createChatCompletions(
      openAIPayload,
      callOptions,
    )
    if (!isNonStreaming(response)) {
      throw new Error(NON_STREAMING_EXPECTED)
    }
    return translateToAnthropic(response)
  }
}

export interface WebToolsFlowArgs {
  c: Context
  payload: AnthropicMessagesPayload
  options: FlowBaseOptions
  policy: WebToolPolicy
  /** Catalog entry for the resolved model, used to pick the upstream endpoint
   *  for each agent turn. `undefined` (model absent from the catalog) keeps
   *  the historical `/chat/completions` transport. */
  selectedModel?: Model
  /** Upstream-call seam, forwarded to {@link runStreamingAgent}. Production
   *  callers omit it and get the real `createChatCompletions`; the flow test
   *  injects a stub so the mid-stream failure path is drivable without
   *  `mock.module` on a shared module. */
  upstreamCall?: UpstreamCall
}

export async function handleWithWebToolsAgent(args: WebToolsFlowArgs) {
  const { c, payload, options, policy, selectedModel } = args
  attachClientShims(payload, policy)
  const wantsStream = payload.stream === true

  const executor = selectExecutor()

  if (!wantsStream) {
    const finalResponse = await runAgentLoop({
      initialPayload: payload,
      policy,
      executor,
      callOnce: buildCallOnce(selectedModel, options),
      logger: options.logger,
    })
    return c.json(finalResponse)
  }

  // Streaming path — true streaming during agent execution. Each
  // Copilot inner call streams; client sees text + server_tool_use +
  // result blocks as they happen, not buffered to the end.
  //
  // The `try` is load-bearing, and this flow needs it more than its three
  // siblings in `api-flows.ts` do. Those call upstream BEFORE `streamSSE`, so a
  // non-2xx becomes a real HTTP status via the route's `forwardError`. Here the
  // agent loop runs one upstream call PER TURN, all of them inside the stream
  // callback, after the client has already been committed to a 200
  // `text/event-stream`. `streamSSE` takes no `onError` here, so an escaping
  // throw is only `console.error`d and the response closes silently — the
  // client waits for a `message_stop` that never comes. Report in-band instead.
  return streamSSE(c, async (stream) => {
    try {
      await runStreamingAgent({
        initialPayload: payload,
        policy,
        stream,
        options,
        executor,
        upstreamCall: args.upstreamCall,
      })
    } catch (error) {
      await emitStreamError(stream, options.logger, {
        error,
        flow: "chat_completions",
      })
    }
  })
}
