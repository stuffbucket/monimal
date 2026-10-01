import type { Context } from "hono"

import {
  SYSTEM_ONE_MEDIA_TYPE,
  SYSTEM_ONE_PATH,
} from "@maximal/maximal-systemone"
import { Hono } from "hono"

import type { ProviderModelRouter } from "~/services/providers/model-router"
import type { ProviderDispatcher } from "~/services/providers/provider-dispatcher"

import { forwardError } from "~/lib/errors/error"
import { sendProviderRequest } from "~/lib/http/send-request"
import { createProviderProxyResponse } from "~/services/providers/anthropic-proxy"
import { readRequestedModel } from "~/services/providers/model-request"

import { createProviderDispatchRoute } from "../provider/dispatch-route"
import { providerConfigOrError } from "../provider/provider-config"

function invalidRequest(message: string, status = 400): Response {
  return Response.json(
    { error: { message, type: "invalid_request_error" } },
    { status },
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

async function forwardSystemOne(
  c: Context,
  request: Request,
  provider: string,
): Promise<Response> {
  const config = providerConfigOrError(c, provider)
  if (config instanceof Response) return config
  const upstream = await sendProviderRequest(
    config,
    `${config.baseUrl}${SYSTEM_ONE_PATH}`,
    {
      method: "POST",
      headers: {
        accept: request.headers.get("accept") ?? SYSTEM_ONE_MEDIA_TYPE,
        "content-type": SYSTEM_ONE_MEDIA_TYPE,
      },
      body: await request.text(),
      signal: request.signal,
    },
  )
  return createProviderProxyResponse(upstream)
}

function requestForModel(
  request: Request,
  model: string,
  body: Record<string, unknown>,
): Request {
  return new Request(request.url, {
    body: JSON.stringify({ ...body, model }),
    headers: request.headers,
    method: "POST",
    signal: request.signal,
  })
}

function canFallback(response: Response): boolean {
  return (
    response.status === 401
    || response.status === 403
    || response.status === 404
    || response.status === 408
    || response.status === 425
    || response.status === 429
    || response.status >= 500
  )
}

export function createSystemOneRoute(options: {
  dispatcher: ProviderDispatcher
  modelRouter: ProviderModelRouter
}): Hono {
  const routes = new Hono()
  routes.post("/", async (c) => {
    try {
      const model = await readRequestedModel(c.req.raw)
      if (model === undefined) {
        return invalidRequest("A System One request requires a model.")
      }
      const routes = await options.modelRouter.resolveSystemOne(model)
      if (routes.length === 0) {
        return invalidRequest(
          `Model '${model}' does not support System One.`,
          404,
        )
      }
      const body: unknown = await c.req.raw.clone().json()
      if (!isRecord(body)) {
        return invalidRequest("A System One request body must be an object.")
      }
      let lastResponse: Response | undefined
      let lastError: unknown
      for (const [index, route] of routes.entries()) {
        const request = requestForModel(c.req.raw, route.model, body)
        try {
          const response = await options.dispatcher.dispatch({
            legacy: async () =>
              await forwardSystemOne(c, request, route.provider),
            operation: "systemone",
            provider: route.provider,
            request,
            signal: c.req.raw.signal,
          })
          if (
            response.ok
            || !canFallback(response)
            || index === routes.length - 1
          ) {
            return response
          }
          await response.body?.cancel()
          lastResponse = response
        } catch (error) {
          lastError = error
          if (index === routes.length - 1) throw error
        }
      }
      if (lastResponse) return lastResponse
      throw lastError
    } catch (error) {
      return await forwardError(c, error)
    }
  })
  return routes
}

export function createProviderSystemOneRoute(
  dispatcher: ProviderDispatcher,
): Hono {
  return createProviderDispatchRoute(
    dispatcher,
    "systemone",
    async (c, provider) => await forwardSystemOne(c, c.req.raw, provider),
  )
}
