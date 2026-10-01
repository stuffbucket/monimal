import type { ProviderOperation } from "@maximal/maximal-model-contract"
import type { Hono } from "hono"

import type { ProviderDispatcher } from "~/services/providers/provider-dispatcher"

import { createProviderDispatchRoute } from "./dispatch-route"
import { handleLegacyOpenAiProvider } from "./openai-proxy"

type OpenAiProviderOperation = Extract<
  ProviderOperation,
  "chat-completions" | "responses" | "embeddings"
>

export function createProviderOpenAiRoute(
  dispatcher: ProviderDispatcher,
  operation: OpenAiProviderOperation,
): Hono {
  return createProviderDispatchRoute(
    dispatcher,
    operation,
    async (c, provider) =>
      await handleLegacyOpenAiProvider(c, provider, operation),
  )
}
