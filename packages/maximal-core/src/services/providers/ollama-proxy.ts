import type { ResolvedOllamaProviderConfig } from "~/lib/config/config"
import type { ChatCompletionsPayload } from "~/services/copilot/create-chat-completions"

import { sendProviderRequest } from "~/lib/http/send-request"

export async function forwardOllamaMessages(options: {
  providerConfig: ResolvedOllamaProviderConfig
  payload: ChatCompletionsPayload
  requestHeaders: Headers
  signal: AbortSignal
}): Promise<Response> {
  const { providerConfig, payload, requestHeaders, signal } = options
  const accept = payload.stream ? "text/event-stream" : "application/json"
  return await sendProviderRequest(
    providerConfig,
    `${providerConfig.baseUrl}/v1/chat/completions`,
    {
      method: "POST",
      headers: {
        accept,
        "content-type": "application/json",
        ...(requestHeaders.get("user-agent") ?
          { "user-agent": requestHeaders.get("user-agent") as string }
        : {}),
      },
      body: JSON.stringify(payload),
      signal,
    },
  )
}
