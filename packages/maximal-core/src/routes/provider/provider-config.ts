import type { Context } from "hono"

import type { ResolvedProviderConfig } from "~/lib/config/config"

import { getProviderConfig } from "~/lib/config/config"

export function providerConfigOrError(
  c: Context,
  provider: string,
): ResolvedProviderConfig | Response {
  const config = getProviderConfig(provider)
  if (config) return config
  return c.json(
    {
      error: {
        message: `Provider '${provider}' not found or disabled`,
        type: "invalid_request_error",
      },
    },
    404,
  )
}
