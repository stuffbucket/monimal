import type { ProviderOperation } from "@stuffbucket/maximal-model-contract"

import { Hono, type Context } from "hono"

import type { ProviderModelRouter } from "~/services/providers/model-router"
import type { ProviderDispatcher } from "~/services/providers/provider-dispatcher"

import { forwardError } from "~/lib/errors/error"
import { handleLegacyOpenAiProvider } from "~/routes/provider/openai-proxy"
import { readRequestedModel } from "~/services/providers/model-request"

type OpenAiProviderOperation = Extract<
  ProviderOperation,
  "chat-completions" | "responses" | "embeddings"
>

export function createModelRoutedRoute(options: {
  dispatcher: ProviderDispatcher
  modelRouter: ProviderModelRouter
  operation: OpenAiProviderOperation
  copilot: (c: Context) => Promise<Response>
}): Hono {
  const routes = new Hono()
  routes.post("/", async (c) => {
    try {
      const model = await readRequestedModel(c.req.raw)
      if (model === undefined) return await options.copilot(c)
      const route = await options.modelRouter.resolve(model)
      if (route.kind === "copilot") return await options.copilot(c)
      return await options.dispatcher.dispatch({
        legacy: async () =>
          await handleLegacyOpenAiProvider(
            c,
            route.provider,
            options.operation,
          ),
        operation: options.operation,
        provider: route.provider,
        request: c.req.raw,
        signal: c.req.raw.signal,
      })
    } catch (error) {
      return await forwardError(c, error)
    }
  })
  return routes
}
