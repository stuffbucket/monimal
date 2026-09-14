import type { Context } from "hono"

import { events } from "fetch-event-stream"
import { streamSSE } from "hono/streaming"

import type { ResolvedProviderConfig } from "~/lib/config/config"
import type {
  AnthropicMessagesPayload,
  AnthropicResponse,
  AnthropicStreamState,
  AnthropicStreamEventData,
} from "~/lib/models/anthropic-types"
import type {
  ChatCompletionResponse,
  ChatCompletionsPayload,
} from "~/services/copilot/create-chat-completions"

import { HTTPError } from "~/lib/errors/error"
import {
  asRecord,
  readNestedUsage,
  readUsage,
} from "~/lib/http/untrusted-frame"
import { createHandlerLogger, debugJson } from "~/lib/platform/logger"
import { parseUserIdMetadata } from "~/lib/platform/utils"
import {
  createProviderTokenUsageRecorder,
  mergeAnthropicUsage,
  normalizeAnthropicUsage,
  normalizeOpenAIUsage,
  type UsageTokens,
} from "~/lib/token-usage"
import { readChatCompletionFrame } from "~/routes/messages/api-flows"
import {
  translateToAnthropic,
  translateToOpenAI,
} from "~/routes/messages/non-stream-translation"
import { stripUnsupportedTopLevelAnthropicFields } from "~/routes/messages/preprocess"
import { emitStreamError } from "~/routes/messages/stream-error"
import { translateChunkToAnthropicEvents } from "~/routes/messages/stream-translation"
import { forwardProviderMessages } from "~/services/providers/anthropic-proxy"
import { forwardOllamaMessages } from "~/services/providers/ollama-proxy"

import { providerConfigOrError } from "../provider-config"

const logger = createHandlerLogger("provider-messages-handler")

export async function handleProviderMessages(
  c: Context,
  provider: string,
): Promise<Response> {
  const providerConfig = providerConfigOrError(c, provider)
  if (providerConfig instanceof Response) return providerConfig

  try {
    const payload = await c.req.json<AnthropicMessagesPayload>()
    stripUnsupportedTopLevelAnthropicFields(payload)

    const modelConfig = providerConfig.models?.[payload.model]
    payload.temperature ??= modelConfig?.temperature
    payload.top_p ??= modelConfig?.topP
    payload.top_k ??= modelConfig?.topK

    debugJson(logger, "provider.messages.request", { payload, provider })

    if (providerConfig.type === "ollama") {
      return await handleOllamaMessages(c, {
        payload,
        provider,
        providerConfig,
      })
    }

    const upstreamResponse = await forwardProviderMessages(
      providerConfig,
      payload,
      c.req.raw.headers,
    )

    if (!upstreamResponse.ok) {
      logger.error("Failed to create responses", upstreamResponse)
      throw new HTTPError("Failed to create responses", upstreamResponse)
    }

    const contentType = upstreamResponse.headers.get("content-type") ?? ""
    const isStreamingResponse =
      Boolean(payload.stream) && contentType.includes("text/event-stream")

    if (isStreamingResponse) {
      return streamProviderMessages({
        c,
        payload,
        provider,
        providerConfig,
        upstreamResponse,
      })
    }

    const jsonBody = (await upstreamResponse.json()) as AnthropicResponse
    return respondProviderMessagesJson(c, {
      body: jsonBody,
      payload,
      provider,
      providerConfig,
    })
  } catch (error) {
    logger.error("provider.messages.error", {
      provider,
      error,
    })
    throw error
  }
}

export async function handleOllamaMessages(
  c: Context,
  options: {
    payload: AnthropicMessagesPayload
    provider: string
    providerConfig: Extract<ResolvedProviderConfig, { type: "ollama" }>
  },
): Promise<Response> {
  const { payload, provider, providerConfig } = options
  const upstreamResponse = await forwardOllamaMessages({
    providerConfig,
    payload: createOllamaChatPayload(payload),
    requestHeaders: c.req.raw.headers,
    signal: c.req.raw.signal,
  })
  if (!upstreamResponse.ok) {
    throw new HTTPError("Ollama failed to create responses", upstreamResponse)
  }

  if (payload.stream) {
    return streamOllamaMessages(c, {
      payload,
      provider,
      upstreamResponse,
    })
  }

  const response = (await upstreamResponse.json()) as ChatCompletionResponse
  const recordUsage = createProviderMessagesUsageRecorder(payload, provider)
  recordUsage(normalizeOpenAIUsage(response.usage))
  return c.json(translateToAnthropic(response))
}

export function createOllamaChatPayload(
  payload: AnthropicMessagesPayload,
): ChatCompletionsPayload {
  const translated = translateToOpenAI(payload, null)
  delete translated.thinking_budget
  if (translated.stream) {
    translated.stream_options = { include_usage: true }
  }
  return translated
}

function streamOllamaMessages(
  c: Context,
  options: {
    payload: AnthropicMessagesPayload
    provider: string
    upstreamResponse: Response
  },
): Response {
  const { payload, provider, upstreamResponse } = options
  const recordUsage = createProviderMessagesUsageRecorder(payload, provider)
  return streamSSE(c, async (stream) => {
    let usage: UsageTokens = {}
    const state: AnthropicStreamState = {
      messageStartSent: false,
      contentBlockIndex: 0,
      contentBlockOpen: false,
      toolCalls: {},
      thinkingBlockOpen: false,
    }
    try {
      for await (const frame of events(upstreamResponse)) {
        if (!frame.data || frame.data === "[DONE]") continue
        const chunk = readChatCompletionFrame(frame.data)
        if (chunk === null) continue
        if (asRecord(chunk)?.usage) {
          usage = normalizeOpenAIUsage(readUsage(chunk))
        }
        for (const event of translateChunkToAnthropicEvents(chunk, state)) {
          await stream.writeSSE({
            event: event.type,
            data: JSON.stringify(event),
          })
        }
      }
    } catch (error) {
      await emitStreamError(stream, logger, {
        error,
        flow: "chat_completions",
      })
    }
    recordUsage(usage)
  })
}

const streamProviderMessages = ({
  c,
  payload,
  provider,
  providerConfig,
  upstreamResponse,
}: {
  c: Context
  payload: AnthropicMessagesPayload
  provider: string
  providerConfig: ResolvedProviderConfig
  upstreamResponse: Response
}): Response => {
  logger.debug("provider.messages.streaming")
  const recordUsage = createProviderMessagesUsageRecorder(payload, provider)
  return streamSSE(c, async (stream) => {
    let usage: UsageTokens = {}

    for await (const chunk of events(upstreamResponse)) {
      logger.debug("provider.messages.raw_stream_event:", chunk.data)
      const eventName = chunk.event
      if (eventName === "ping") {
        await stream.writeSSE({ event: "ping", data: '{"type":"ping"}' })
        continue
      }

      let data = chunk.data
      if (!data) {
        continue
      }

      if (chunk.data === "[DONE]") {
        break
      }

      const parsed = parseProviderStreamEvent(data, providerConfig)
      if (parsed) {
        usage = mergeAnthropicUsage(usage, parsed.usage)
        data = parsed.data
      }

      await stream.writeSSE({
        event: eventName,
        data,
      })
    }

    recordUsage(usage)
  })
}

const parseProviderStreamEvent = (
  data: string,
  providerConfig: ResolvedProviderConfig,
): { data: string; model?: string; usage: UsageTokens } | null => {
  try {
    // Only `.type` is read off this value; usage is read through
    // `readNestedUsage`/`readUsage`, both total. This whole body also sits
    // inside the catch below, which logs and forwards the frame unchanged.
    // casts-keep: only `.type` read, usage via total readers, whole body inside the catch below; tolerance proven in tests/stream-boundary-tolerance.test.ts
    const parsed = JSON.parse(data) as AnthropicStreamEventData
    if (parsed.type === "message_start") {
      const messageUsage = readNestedUsage(parsed, "message")
      adjustInputTokens(providerConfig, messageUsage)
      return {
        data: JSON.stringify(parsed),
        model: asRecord(parsed.message)?.model as string | undefined,
        usage: normalizeAnthropicUsage(messageUsage),
      }
    }
    if (parsed.type === "message_delta") {
      const deltaUsage = readUsage(parsed)
      adjustInputTokens(providerConfig, deltaUsage)
      return {
        data: JSON.stringify(parsed),
        usage: normalizeAnthropicUsage(deltaUsage),
      }
    }
    return { data: JSON.stringify(parsed), usage: {} }
  } catch (error) {
    logger.error("provider.messages.streaming.adjust_tokens_error", {
      error,
      originalData: data,
    })
    return null
  }
}

const respondProviderMessagesJson = (
  c: Context,
  options: {
    body: AnthropicResponse
    payload: AnthropicMessagesPayload
    provider: string
    providerConfig: ResolvedProviderConfig
  },
): Response => {
  const { body, payload, provider, providerConfig } = options
  const recordUsage = createProviderMessagesUsageRecorder(payload, provider)
  adjustInputTokens(providerConfig, body.usage)
  recordUsage(normalizeAnthropicUsage(body.usage))

  debugJson(logger, "provider.messages.no_stream result:", body)
  return c.json(body)
}

const createProviderMessagesUsageRecorder = (
  payload: AnthropicMessagesPayload,
  provider: string,
) =>
  createProviderTokenUsageRecorder({
    endpoint: "provider_messages",
    model: payload.model,
    providerName: provider,
    sessionId: parseUserIdMetadata(payload.metadata?.user_id).sessionId,
  })

const adjustInputTokens = (
  providerConfig: ResolvedProviderConfig,
  usage?: {
    input_tokens?: number
    cache_read_input_tokens?: number
    cache_creation_input_tokens?: number
  },
): void => {
  if (!providerConfig.adjustInputTokens || !usage) {
    return
  }
  const adjustedInput = Math.max(
    0,
    (usage.input_tokens ?? 0)
      - (usage.cache_read_input_tokens ?? 0)
      - (usage.cache_creation_input_tokens ?? 0),
  )
  usage.input_tokens = adjustedInput
  debugJson(logger, "provider.messages.adjusted_usage:", usage)
}
