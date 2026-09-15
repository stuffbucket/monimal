import type { ProviderOperation } from "@stuffbucket/maximal-model-contract"
import type { Context } from "hono"

import { sendProviderRequest } from "~/lib/http/send-request"
import { createProviderProxyResponse } from "~/services/providers/anthropic-proxy"

import { providerConfigOrError } from "./provider-config"

const operationPath: Record<
  Extract<ProviderOperation, "chat-completions" | "responses" | "embeddings">,
  string
> = {
  "chat-completions": "/v1/chat/completions",
  responses: "/v1/responses",
  embeddings: "/v1/embeddings",
}

export async function handleLegacyOpenAiProvider(
  c: Context,
  provider: string,
  operation: keyof typeof operationPath,
): Promise<Response> {
  const config = providerConfigOrError(c, provider)
  if (config instanceof Response) return config
  const upstream = await sendProviderRequest(
    config,
    `${config.baseUrl}${operationPath[operation]}`,
    {
      method: "POST",
      headers: {
        accept: c.req.header("accept") ?? "application/json",
        "content-type": "application/json",
      },
      body: await c.req.text(),
      signal: c.req.raw.signal,
    },
  )
  return createProviderProxyResponse(upstream)
}
