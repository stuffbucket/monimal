import type { Context } from "hono"

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

async function forwardSystemOne(
  c: Context,
  provider: string,
): Promise<Response> {
  const config = providerConfigOrError(c, provider)
  if (config instanceof Response) return config
  const request = c.req.raw
  const upstream = await sendProviderRequest(
    config,
    `${config.baseUrl}/v1/systemone`,
    {
      method: "POST",
      headers: {
        accept: request.headers.get("accept") ?? "application/json",
        "content-type": "application/json",
      },
      body: await request.text(),
      signal: request.signal,
    },
  )
  return createProviderProxyResponse(upstream)
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
      const route = await options.modelRouter.resolve(model)
      if (route.kind === "copilot") {
        return invalidRequest(
          `Model '${model}' does not support System One.`,
          404,
        )
      }
      return await options.dispatcher.dispatch({
        legacy: async () => await forwardSystemOne(c, route.provider),
        operation: "systemone",
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

export function createProviderSystemOneRoute(
  dispatcher: ProviderDispatcher,
): Hono {
  return createProviderDispatchRoute(dispatcher, "systemone", forwardSystemOne)
}
