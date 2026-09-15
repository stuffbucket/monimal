import type { Context } from "hono"

import { Hono } from "hono"

import type { ProviderDispatcher } from "~/services/providers/provider-dispatcher"

import { forwardError } from "~/lib/errors/error"
import { createHandlerLogger } from "~/lib/platform/logger"
import {
  createProviderProxyResponse,
  forwardProviderModels,
} from "~/services/providers/anthropic-proxy"
import { createProviderDispatcher } from "~/services/providers/provider-dispatcher"

import { providerConfigOrError } from "../provider-config"

const logger = createHandlerLogger("provider-models-handler")

export function createProviderModelRoutes(
  dispatcher: ProviderDispatcher = createProviderDispatcher(),
): Hono {
  const routes = new Hono()

  routes.get("/", async (c) => {
    const provider = c.req.param("provider") ?? ""

    try {
      return await dispatcher.dispatch({
        legacy: async () => await handleLegacyProviderModels(c, provider),
        operation: "models",
        provider,
        request: c.req.raw,
        signal: c.req.raw.signal,
      })
    } catch (error) {
      logger.error("provider.models.error", {
        provider,
        error,
      })
      return await forwardError(c, error)
    }
  })

  return routes
}

async function handleLegacyProviderModels(
  c: Context,
  provider: string,
): Promise<Response> {
  const providerConfig = providerConfigOrError(c, provider)
  if (providerConfig instanceof Response) return providerConfig

  const upstreamResponse = await forwardProviderModels(
    providerConfig,
    c.req.raw.headers,
  )

  logger.debug("provider.models.response", {
    provider,
    statusCode: upstreamResponse.status,
  })

  return createProviderProxyResponse(upstreamResponse)
}

/** @internal Legacy standalone route instance. */
export const providerModelRoutes = createProviderModelRoutes()
