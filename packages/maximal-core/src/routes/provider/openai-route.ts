import type { ProviderOperation } from "@stuffbucket/maximal-model-contract"

import { Hono } from "hono"

import type { ProviderDispatcher } from "~/services/providers/provider-dispatcher"

import { forwardError } from "~/lib/errors/error"

import { handleLegacyOpenAiProvider } from "./openai-proxy"

type OpenAiProviderOperation = Extract<
  ProviderOperation,
  "chat-completions" | "responses" | "embeddings"
>

export function createProviderOpenAiRoute(
  dispatcher: ProviderDispatcher,
  operation: OpenAiProviderOperation,
): Hono {
  const routes = new Hono()
  routes.post("/", async (c) => {
    const provider = c.req.param("provider") ?? ""
    try {
      return await dispatcher.dispatch({
        legacy: async () =>
          await handleLegacyOpenAiProvider(c, provider, operation),
        operation,
        provider,
        request: c.req.raw,
        signal: c.req.raw.signal,
      })
    } catch (error) {
      return await forwardError(c, error)
    }
  })
  return routes
}
