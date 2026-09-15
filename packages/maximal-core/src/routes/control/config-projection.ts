import type { AppConfig, ApiKeyEntry } from "~/lib/config/config"

type RedactedApiKeyEntry = Omit<ApiKeyEntry, "key">

export interface ControlConfigSnapshot extends Omit<
  AppConfig,
  "auth" | "providers" | "anthropicApiKey" | "providerPlugins"
> {
  auth?: Omit<NonNullable<AppConfig["auth"]>, "apiKeys" | "apiKeyEntries"> & {
    apiKeyEntries?: Array<RedactedApiKeyEntry>
  }
  providers?: Record<
    string,
    Omit<NonNullable<AppConfig["providers"]>[string], "apiKey">
  >
}

function redactApiKeyEntry(entry: ApiKeyEntry): RedactedApiKeyEntry {
  const { key: _key, ...summary } = entry
  return summary
}

/**
 * Project persisted configuration into the broad control-plane read shape.
 * Credential values are intentionally available only through the narrowly
 * scoped connection credential reveal operation.
 */
export function projectControlConfig(config: AppConfig): ControlConfigSnapshot {
  const {
    anthropicApiKey: _anthropicApiKey,
    auth,
    providers,
    providerPlugins: _providerPlugins,
    ...rest
  } = config
  const nextAuth =
    auth
    && (() => {
      const { apiKeys: _apiKeys, apiKeyEntries, ...safeAuth } = auth
      return {
        ...safeAuth,
        ...(apiKeyEntries === undefined ?
          {}
        : {
            apiKeyEntries: apiKeyEntries.map((entry) =>
              redactApiKeyEntry(entry),
            ),
          }),
      }
    })()
  const nextProviders =
    providers
    && Object.fromEntries(
      Object.entries(providers).map(([id, provider]) => {
        const { apiKey: _apiKey, ...safeProvider } = provider
        return [id, safeProvider]
      }),
    )

  return {
    ...rest,
    ...(nextAuth === undefined ? {} : { auth: nextAuth }),
    ...(nextProviders === undefined ? {} : { providers: nextProviders }),
  }
}
