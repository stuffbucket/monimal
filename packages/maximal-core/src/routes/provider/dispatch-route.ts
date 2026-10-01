import type { ProviderOperation } from "@maximal/maximal-model-contract"
import type { Context } from "hono"

import { Hono } from "hono"

import type { ProviderDispatcher } from "~/services/providers/provider-dispatcher"

import { forwardError } from "~/lib/errors/error"

export function createProviderDispatchRoute(
  dispatcher: ProviderDispatcher,
  operation: ProviderOperation,
  legacy: (c: Context, provider: string) => Promise<Response>,
): Hono {
  const routes = new Hono()
  routes.post("/", async (c) => {
    const provider = c.req.param("provider") ?? ""
    try {
      return await dispatcher.dispatch({
        legacy: async () => await legacy(c, provider),
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
