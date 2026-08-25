import { Hono } from "hono"

import type { ProviderDispatcher } from "~/services/providers/provider-dispatcher"

import { forwardError } from "~/lib/errors/error"
import { createProviderDispatcher } from "~/services/providers/provider-dispatcher"

import { handleProviderCountTokens } from "./count-tokens-handler"
import { handleProviderMessages } from "./handler"

export function createProviderMessageRoutes(
  dispatcher: ProviderDispatcher = createProviderDispatcher(),
): Hono {
  const routes = new Hono()

  routes.post("/", async (c) => {
    try {
      return await dispatcher.dispatch({
        legacy: async () => await handleProviderMessages(c),
        operation: "messages",
        provider: c.req.param("provider") ?? "",
        request: c.req.raw,
        signal: c.req.raw.signal,
      })
    } catch (error) {
      return await forwardError(c, error)
    }
  })

  routes.post("/count_tokens", async (c) => {
    try {
      return await dispatcher.dispatch({
        legacy: async () => await handleProviderCountTokens(c),
        operation: "count-tokens",
        provider: c.req.param("provider") ?? "",
        request: c.req.raw,
        signal: c.req.raw.signal,
      })
    } catch (error) {
      return await forwardError(c, error)
    }
  })

  return routes
}

/** @internal Legacy standalone route instance. */
export const providerMessageRoutes = createProviderMessageRoutes()
