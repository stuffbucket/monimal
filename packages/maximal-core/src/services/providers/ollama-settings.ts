import type { AppConfig } from "~/lib/config/config"
import type {
  OllamaSettingsResponse,
  OllamaSettingsUpdateRequest,
} from "~/lib/config/settings-types"

import {
  readSecret,
  removeSecret,
  secretIsFromFile,
  writeSecret,
} from "~/lib/auth/secrets"
import {
  DEFAULT_OLLAMA_CLOUD_BASE_URL,
  getConfig,
  type ResolvedOllamaProviderConfig,
  writeConfig,
} from "~/lib/config/config"
import { SettingsOperationError } from "~/lib/config/settings-operations"
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
  const fromFile =
    secret.value !== undefined
    && secretIsFromFile(SECRET.fileName, secret.value)
  return {
    has_api_key: secret.value !== undefined,
    credential_source: credentialSource(secret.source, fromFile),
    local_enabled:
      config.providers === undefined
      || !("ollama" in config.providers)
      || config.providers.ollama.enabled !== false,
    prefer_local_models: config.ollama?.preferLocalModels ?? true,
  }
}

async function validateApiKey(apiKey: string): Promise<void> {
  const provider: ResolvedOllamaProviderConfig = {
    name: "ollama-cloud",
    type: "ollama",
    baseUrl: DEFAULT_OLLAMA_CLOUD_BASE_URL,
    authType: "authorization",
    apiKey,
  }
  let response: Response
  try {
    response = await sendProviderRequest(
      provider,
      `${provider.baseUrl}/api/chat`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(5_000),
      },
    )
  } catch (error) {
    throw new SettingsOperationError(
      `Could not validate the Ollama API key: ${error instanceof Error ? error.message : "request failed"}`,
      "validation_error",
    )
  }
  if (response.ok || response.status === 400) return
  throw new SettingsOperationError(
    response.status === 401 || response.status === 403 ?
      "Ollama rejected this API key."
    : `Ollama API-key validation returned HTTP ${response.status}.`,
    "validation_error",
  )
}

export async function updateOllamaSettings(
  input: OllamaSettingsUpdateRequest,
): Promise<OllamaSettingsResponse> {
  if (input.api_key !== undefined) {
    const apiKey = input.api_key.trim()
    if (apiKey.length > 0) {
      await validateApiKey(apiKey)
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
  return getOllamaSettings()
}
