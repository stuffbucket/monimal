import { Hono } from "hono"

import type { ProviderDispatcher } from "~/services/providers/provider-dispatcher"

import { forwardError } from "~/lib/errors/error"
import { handleProviderMessages } from "~/routes/provider/messages/handler"
import { readRequestedModel } from "~/services/providers/model-request"
import { ProviderModelRouter } from "~/services/providers/model-router"
import { createProviderDispatcher } from "~/services/providers/provider-dispatcher"

import { handleCountTokens } from "./count-tokens-handler"
import { handleCompletion } from "./handler"

export interface MessageRoutesOptions {
  dispatcher: ProviderDispatcher
  modelRouter: ProviderModelRouter
}

export function createMessageRoutes(options: MessageRoutesOptions): Hono {
  const routes = new Hono()

  routes.post("/", async (c) => {
    try {
      const model = await readRequestedModel(c.req.raw)
      if (model === undefined) return await handleCompletion(c)
      const route = await options.modelRouter.resolve(model)
      if (route.kind === "provider") {
        return await options.dispatcher.dispatch({
          legacy: async () => await handleProviderMessages(c, route.provider),
          operation: "messages",
          provider: route.provider,
          request: c.req.raw,
          signal: c.req.raw.signal,
        })
      }
      return await handleCompletion(c)
    } catch (error) {
      return await forwardError(c, error)
    }
  })

  routes.post("/count_tokens", async (c) => {
    try {
      return await handleCountTokens(c)
    } catch (error) {
      return await forwardError(c, error)
    }
  })

  return routes
}

const defaultDispatcher = createProviderDispatcher()
/** @internal Legacy standalone route instance. */
export const messageRoutes = createMessageRoutes({
  dispatcher: defaultDispatcher,
  modelRouter: new ProviderModelRouter(defaultDispatcher),
})
