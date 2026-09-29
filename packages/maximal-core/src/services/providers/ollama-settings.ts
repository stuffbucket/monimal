import type {
  OllamaApiKeyTestRequest,
  OllamaApiKeyTestResponse,
  OllamaSettingsResponse,
  OllamaSettingsUpdateRequest,
} from "@maximal/maximal-core-contract/settings"

import type { AppConfig } from "~/lib/config/config"

import {
  readSecret,
  removeSecret,
  secretIsFromFile,
  writeSecret,
} from "~/lib/auth/secrets"
import { getConfig, writeConfig } from "~/lib/config/config"
import {
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_CLOUD_BASE_URL,
  normalizeProviderBaseUrl,
  type ResolvedOllamaProviderConfig,
} from "~/lib/config/config"
import { sendProviderRequest } from "~/lib/http/send-request"

const SECRET = { envVar: "OLLAMA_API_KEY", fileName: "ollama" }

function credentialSource(
  source: "env" | "file" | "unset",
  fromFile: boolean,
): OllamaSettingsResponse["credential_source"] {
  if (fromFile) return "file"
  return source === "env" ? "environment" : "none"
}

export function getOllamaSettings(
  config: AppConfig = getConfig(),
): OllamaSettingsResponse {
  const secret = readSecret(SECRET)
  const configuredOllama =
    config.providers !== undefined && "ollama" in config.providers ?
      config.providers.ollama
    : undefined
  const fromFile =
    secret.value !== undefined
    && secretIsFromFile(SECRET.fileName, secret.value)
  return {
    has_api_key: secret.value !== undefined,
    api_key: secret.value ?? null,
    credential_source: credentialSource(secret.source, fromFile),
    cloud_enabled: config.providers?.["ollama-cloud"]?.enabled !== false,
    local_enabled: configuredOllama?.enabled !== false,
    local_endpoint: normalizeProviderBaseUrl(
      configuredOllama?.baseUrl ?? DEFAULT_OLLAMA_BASE_URL,
    ),
    prefer_local_models: config.ollama?.preferLocalModels ?? true,
  }
}

export function updateOllamaSettings(
  input: OllamaSettingsUpdateRequest,
): Promise<OllamaSettingsResponse> {
  if (input.api_key !== undefined) {
    const apiKey = input.api_key.trim()
    if (apiKey.length > 0) {
      writeSecret(SECRET.fileName, apiKey)
      process.env[SECRET.envVar] = apiKey
    } else {
      removeSecret(SECRET.fileName)
      delete process.env.OLLAMA_API_KEY
    }
  }
  if (input.prefer_local_models !== undefined) {
    const config = getConfig()
    writeConfig({
      ...config,
      ollama: {
        ...config.ollama,
        preferLocalModels: input.prefer_local_models,
      },
    })
  }
  if (input.cloud_enabled !== undefined) {
    const config = getConfig()
    writeConfig({
      ...config,
      providers: {
        ...config.providers,
        "ollama-cloud": {
          ...config.providers?.["ollama-cloud"],
          baseUrl: DEFAULT_OLLAMA_CLOUD_BASE_URL,
          enabled: input.cloud_enabled,
          type: "ollama",
        },
      },
    })
  }
  if (input.local_enabled !== undefined) {
    const config = getConfig()
    writeConfig({
      ...config,
      providers: {
        ...config.providers,
        ollama: {
          ...config.providers?.ollama,
          enabled: input.local_enabled,
          type: "ollama",
        },
      },
    })
  }
  if (input.local_endpoint !== undefined) {
    const endpoint =
      normalizeProviderBaseUrl(input.local_endpoint) || DEFAULT_OLLAMA_BASE_URL
    const config = getConfig()
    writeConfig({
      ...config,
      providers: {
        ...config.providers,
        ollama: {
          ...config.providers?.ollama,
          baseUrl: endpoint,
          type: "ollama",
        },
      },
    })
  }
  return Promise.resolve(getOllamaSettings())
}

export async function testOllamaApiKey(
  input: OllamaApiKeyTestRequest,
): Promise<OllamaApiKeyTestResponse> {
  const candidate = input.api_key?.trim() || readSecret(SECRET).value
  if (!candidate) {
    return {
      status: "invalid",
      message: "Enter or configure an Ollama API key before testing.",
    }
  }
  const provider: ResolvedOllamaProviderConfig = {
    name: "ollama-cloud",
    type: "ollama",
    baseUrl: DEFAULT_OLLAMA_CLOUD_BASE_URL,
    authType: "authorization",
    apiKey: candidate,
  }
  const response = await sendProviderRequest(
    provider,
    `${DEFAULT_OLLAMA_CLOUD_BASE_URL}/v1/models`,
    { method: "GET", timeoutMs: 5_000 },
  )
  await response.body?.cancel()
  if (response.ok) {
    return {
      status: "valid",
      message: "Ollama accepted this API key.",
    }
  }
  if (response.status === 401 || response.status === 403) {
    return {
      status: "invalid",
      message: "Ollama rejected this API key.",
    }
  }
  throw new Error(`Ollama API key test failed with HTTP ${response.status}.`)
}
