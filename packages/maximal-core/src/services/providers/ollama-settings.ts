import type {
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
  return Promise.resolve(getOllamaSettings())
}
