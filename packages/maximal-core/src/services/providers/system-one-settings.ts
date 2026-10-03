import {
  SYSTEM_ONE_DEFAULT_MODEL_DOWNLOAD_URLS,
  SYSTEM_ONE_LOCAL_MODELS,
  type SystemOneSettingsResponse,
  type SystemOneSettingsUpdateRequest,
} from "@maximal/maximal-core-contract/settings"

import type { AppConfig } from "~/lib/config/config"

import {
  readSecret,
  removeSecret,
  secretIsFromFile,
  writeSecret,
} from "~/lib/auth/secrets"
import { getConfig, writeConfig } from "~/lib/config/config"

const SECRET = { envVar: "TYPESAFE_API_KEY", fileName: "typesafe" }
const TYPESAFE_PROVIDER = "typesafe-jev"
const TYPESAFE_BASE_URL = "https://api.typesafe.ai"

function credentialSource(
  source: "env" | "file" | "unset",
  fromFile: boolean,
): SystemOneSettingsResponse["credential_source"] {
  if (fromFile) return "file"
  return source === "env" ? "environment" : "none"
}

function hasConfiguredOllamaPath(config: AppConfig): boolean {
  const provider = config.providers?.ollama
  return (
    provider !== undefined
    && provider.enabled !== false
    && Boolean(provider.baseUrl?.trim())
  )
}

export function getSystemOneSettings(
  config: AppConfig = getConfig(),
): SystemOneSettingsResponse {
  const secret = readSecret(SECRET)
  const fromFile =
    secret.value !== undefined
    && secretIsFromFile(SECRET.fileName, secret.value)
  const ollamaConfigured = hasConfiguredOllamaPath(config)
  const configuredProvider = config.systemOne?.localProvider ?? "maximal"
  return {
    has_api_key: secret.value !== undefined,
    api_key: secret.value ?? null,
    credential_source: credentialSource(secret.source, fromFile),
    local_provider:
      configuredProvider === "ollama" && !ollamaConfigured ?
        "maximal"
      : configuredProvider,
    ollama_configured: ollamaConfigured,
    model_order: config.systemOne?.modelOrder ?? [...SYSTEM_ONE_LOCAL_MODELS],
    model_download_urls: {
      ...SYSTEM_ONE_DEFAULT_MODEL_DOWNLOAD_URLS,
      ...config.systemOne?.modelDownloadUrls,
    },
    fallback_to_local: config.systemOne?.fallbackToLocal ?? true,
  }
}

export function updateSystemOneSettings(
  input: SystemOneSettingsUpdateRequest,
): SystemOneSettingsResponse {
  if (
    input.local_provider === "ollama"
    && !hasConfiguredOllamaPath(getConfig())
  ) {
    throw new Error(
      "Configure an Ollama local endpoint before selecting Ollama for System One.",
    )
  }

  if (input.api_key !== undefined) {
    const apiKey = input.api_key.trim()
    if (apiKey) {
      writeSecret(SECRET.fileName, apiKey)
    } else {
      removeSecret(SECRET.fileName)
    }
  }

  const config = getConfig()
  const hasApiKey = readSecret(SECRET).value !== undefined
  writeConfig({
    ...config,
    providers: {
      ...config.providers,
      [TYPESAFE_PROVIDER]: {
        ...config.providers?.[TYPESAFE_PROVIDER],
        authType: "authorization",
        baseUrl: TYPESAFE_BASE_URL,
        enabled: hasApiKey,
        type: "systemone",
      },
    },
    systemOne: {
      ...config.systemOne,
      ...(input.local_provider === undefined ?
        {}
      : { localProvider: input.local_provider }),
      ...(input.model_order === undefined ?
        {}
      : { modelOrder: [...input.model_order] }),
      ...(input.model_download_urls === undefined ?
        {}
      : {
          modelDownloadUrls: {
            ...config.systemOne?.modelDownloadUrls,
            ...input.model_download_urls,
          },
        }),
      ...(input.fallback_to_local === undefined ?
        {}
      : { fallbackToLocal: input.fallback_to_local }),
    },
  })
  return getSystemOneSettings()
}
