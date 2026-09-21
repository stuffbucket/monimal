import consola from "consola"
import { events } from "fetch-event-stream"

import type {
  AnthropicMessagesPayload,
  AnthropicResponse,
} from "~/lib/models/anthropic-types"

import {
  copilotBaseUrl,
  prepareMessageProxyHeaders,
} from "~/lib/config/api-config"
import { sendRequest } from "~/lib/http/send-request"
import { parseUserIdMetadata } from "~/lib/platform/utils"
import { state } from "~/lib/runtime-state/state"

import type { CopilotCallOptions } from "./upstream-request"

import { messagesInitiator } from "./agent-initiator"
import {
  contextManagementStrategy,
  hasContextManagementRejection,
  recordContextManagementRejection,
  type ContextManagementScope,
} from "./context-management-capabilities"
import {
  buildCopilotHeaders,
  finishUpstreamResponse,
  requireCopilotToken,
} from "./upstream-request"

export type MessagesStream = ReturnType<typeof events>
export type CreateMessagesReturn = AnthropicResponse | MessagesStream

const INTERLEAVED_THINKING_BETA = "interleaved-thinking-2025-05-14"
const ADVANCED_TOOL_USE_BETA = "advanced-tool-use-2025-11-20"
const CONTEXT_MANAGEMENT_BETA = "context-management-2025-06-27"
const allowedAnthropicBetas = new Set([
  INTERLEAVED_THINKING_BETA,
  CONTEXT_MANAGEMENT_BETA,
  ADVANCED_TOOL_USE_BETA,
])

const parseAllowedAnthropicBetas = (header: string): Array<string> =>
  header
    .split(",")
    .map((item) => item.trim())
    .filter((item) => allowedAnthropicBetas.has(item))

const serializeAnthropicBetas = (betas: Array<string>): string | undefined =>
  betas.length === 0 ? undefined : betas.join(",")

const withoutContextManagementBeta = (header: string): string | undefined =>
  serializeAnthropicBetas(
    parseAllowedAnthropicBetas(header).filter(
      (item) => item !== CONTEXT_MANAGEMENT_BETA,
    ),
  )

const withoutContextManagement = (
  payload: AnthropicMessagesPayload,
): AnthropicMessagesPayload => {
  const { context_management: _contextManagement, ...rest } = payload
  return rest
}

const isContextManagementRejection = async (
  response: Response,
): Promise<boolean> => {
  if (response.status !== 400) return false
  return /context[_-]management/iu.test(await response.clone().text())
}

interface ContextCompatibility {
  capabilityScope: ContextManagementScope | null
  allowContextFallback: boolean
  omitContextManagement: boolean
  requestPayload: AnthropicMessagesPayload
}

const buildContextManagementScope = (
  payload: AnthropicMessagesPayload,
  baseUrl: string,
  strategy: string,
): ContextManagementScope | null =>
  state.userName ?
    {
      account: state.userName,
      host: baseUrl,
      model: payload.model,
      strategy,
    }
  : null

const resolveContextCompatibility = (
  payload: AnthropicMessagesPayload,
  baseUrl: string,
): ContextCompatibility => {
  const strategy = contextManagementStrategy(payload.context_management)
  if (strategy === null) {
    return {
      capabilityScope: null,
      allowContextFallback: false,
      omitContextManagement: false,
      requestPayload: payload,
    }
  }
  const capabilityScope = buildContextManagementScope(
    payload,
    baseUrl,
    strategy,
  )
  const advertisedSupport = state.models?.data.find(
    (model) => model.id === payload.model,
  )?.capabilities.supports.context_editing
  const omitContextManagement =
    advertisedSupport === false
    || (capabilityScope !== null
      && hasContextManagementRejection(capabilityScope))
  return {
    capabilityScope,
    allowContextFallback: true,
    omitContextManagement,
    requestPayload:
      omitContextManagement ? withoutContextManagement(payload) : payload,
  }
}

interface ContextFallbackRequest {
  requestUrl: string
  headers: Record<string, string>
  payload: AnthropicMessagesPayload
  requestPayload: AnthropicMessagesPayload
  capabilityScope: ContextManagementScope | null
  allowContextFallback: boolean
  omitContextManagement: boolean
}

const sendWithContextFallback = async ({
  requestUrl,
  headers,
  payload,
  requestPayload,
  capabilityScope,
  allowContextFallback,
  omitContextManagement,
}: ContextFallbackRequest): Promise<Response> => {
  const response = await sendRequest(requestUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(requestPayload),
  })
  if (
    !allowContextFallback
    || omitContextManagement
    || !(await isContextManagementRejection(response))
  ) {
    return response
  }

  if (capabilityScope) recordContextManagementRejection(capabilityScope)
  consola.warn("Copilot rejected context_management; retrying once without it")
  const retryHeaders = { ...headers }
  const currentBeta = retryHeaders["anthropic-beta"]
  const retryBeta =
    currentBeta ? withoutContextManagementBeta(currentBeta) : undefined
  if (retryBeta) retryHeaders["anthropic-beta"] = retryBeta
  else delete retryHeaders["anthropic-beta"]
  return sendRequest(requestUrl, {
    method: "POST",
    headers: retryHeaders,
    body: JSON.stringify(withoutContextManagement(payload)),
  })
}

const buildAnthropicBetaHeader = (
  anthropicBetaHeader: string | undefined,
  thinking: AnthropicMessagesPayload["thinking"],
): string | undefined => {
  const isAdaptiveThinking = thinking?.type === "adaptive"

  if (anthropicBetaHeader) {
    return serializeAnthropicBetas(
      parseAllowedAnthropicBetas(anthropicBetaHeader),
    )
  }

  if (thinking?.budget_tokens && !isAdaptiveThinking) {
    return INTERLEAVED_THINKING_BETA
  }

  return undefined
}

export const createMessages = async (
  payload: AnthropicMessagesPayload,
  anthropicBetaHeader: string | undefined,
  options: CopilotCallOptions,
): Promise<CreateMessagesReturn> => {
  requireCopilotToken()

  const baseUrl = copilotBaseUrl(state)
  const {
    capabilityScope,
    allowContextFallback,
    omitContextManagement,
    requestPayload,
  } = resolveContextCompatibility(payload, baseUrl)

  const enableVision = requestPayload.messages.some((message) => {
    if (!Array.isArray(message.content)) return false
    return message.content.some(
      (block) =>
        block.type === "image"
        || (block.type === "tool_result"
          && Array.isArray(block.content)
          && block.content.some((inner) => inner.type === "image")),
    )
  })

  const headers = buildCopilotHeaders(state, {
    ...options,
    vision: enableVision,
    initiator: messagesInitiator(requestPayload),
  })

  const { safetyIdentifier, sessionId } = parseUserIdMetadata(
    requestPayload.metadata?.user_id,
  )
  // from claude code
  // claude-opus-4.8 WAF rejects the Claude-Code user-agent unless
  // copilot-integration-id is also present. prepareMessageProxyHeaders
  // sets the Claude-Code UA without that header, triggering a 403 on 4.8
  // but not on 4.7. Skip it for 4.8 until Copilot upstream is fixed.
  if (
    safetyIdentifier
    && sessionId
    && !requestPayload.model.startsWith("claude-opus-4.8")
  ) {
    prepareMessageProxyHeaders(headers)
  }

  // align with vscode copilot extension anthropic-beta
  const anthropicBeta = buildAnthropicBetaHeader(
    omitContextManagement && anthropicBetaHeader ?
      withoutContextManagementBeta(anthropicBetaHeader)
    : anthropicBetaHeader,
    requestPayload.thinking,
  )
  if (anthropicBeta) {
    headers["anthropic-beta"] = anthropicBeta
  }

  consola.log(`<-- model: ${requestPayload.model}`)

  const requestUrl = `${baseUrl}/v1/messages`
  const response = await sendWithContextFallback({
    requestUrl,
    headers,
    payload,
    requestPayload,
    capabilityScope,
    allowContextFallback,
    omitContextManagement,
  })

  return finishUpstreamResponse<AnthropicResponse>(response, {
    stream: Boolean(requestPayload.stream),
    errorMessage: "Failed to create messages",
  })
}
