import type {
  AppConfig,
  ResolvedOllamaProviderConfig,
} from "~/lib/config/config"
import type { OllamaAccountsListResponse } from "~/lib/config/settings-types"

import {
  getConfig,
  getProviderConfig,
  resolveProviderConfig,
} from "~/lib/config/config"
import { sendProviderRequest } from "~/lib/http/send-request"
import { asRecord } from "~/lib/http/untrusted-frame"

const PROBE_TIMEOUT_MS = 1_000

type OllamaProbe = (
  provider: ResolvedOllamaProviderConfig,
  signal: AbortSignal,
) => Promise<Response>

async function probeOllama(
  provider: ResolvedOllamaProviderConfig,
  signal: AbortSignal,
): Promise<Response> {
  return await sendProviderRequest(provider, `${provider.baseUrl}/v1/models`, {
    method: "GET",
    signal,
  })
}

function implicitLocalProvider(
  config: AppConfig,
): ResolvedOllamaProviderConfig {
  const resolved = resolveProviderConfig(config, "ollama")
  if (!resolved || resolved.type !== "ollama") {
    throw new Error("Could not resolve the implicit Ollama provider")
  }
  return resolved
}

function runtimeLocalProvider(): ResolvedOllamaProviderConfig {
  const resolved = getProviderConfig("ollama")
  if (!resolved || resolved.type !== "ollama") {
    throw new Error("Could not resolve the runtime Ollama provider")
  }
  return resolved
}

function configuredOllamaProviders(
  config: AppConfig,
  runtime: boolean,
): Array<ResolvedOllamaProviderConfig> {
  return Object.entries(config.providers ?? {}).flatMap(([name, provider]) => {
    if (
      provider.enabled === false
      || provider.type?.trim().toLowerCase() !== "ollama"
    ) {
      return []
    }
    const resolved =
      runtime ? getProviderConfig(name) : resolveProviderConfig(config, name)
    return resolved?.type === "ollama" ? [resolved] : []
  })
}

function isLocalEndpoint(endpoint: string): boolean {
  try {
    const hostname = new URL(endpoint).hostname
    return (
      hostname === "127.0.0.1" || hostname === "::1" || hostname === "localhost"
    )
  } catch {
    return false
  }
}

async function inspectProvider(
  provider: ResolvedOllamaProviderConfig,
  probe: OllamaProbe,
): Promise<OllamaAccountsListResponse["accounts"][number]> {
  try {
    const response = await probe(
      provider,
      AbortSignal.timeout(PROBE_TIMEOUT_MS),
    )
    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`)
    const body = asRecord(await response.json())
    const modelCount = Array.isArray(body?.data) ? body.data.length : 0
    return {
      type: "ollama",
      provider: provider.name,
      endpoint: provider.baseUrl,
      scope: isLocalEndpoint(provider.baseUrl) ? "localhost" : "remote",
      account_state: provider.apiKey ? "authenticated" : "unauthenticated",
      availability: "available",
      model_count: modelCount,
    }
  } catch {
    return {
      type: "ollama",
      provider: provider.name,
      endpoint: provider.baseUrl,
      scope: isLocalEndpoint(provider.baseUrl) ? "localhost" : "remote",
      account_state: provider.apiKey ? "authenticated" : "unauthenticated",
      availability: "unavailable",
      model_count: null,
    }
  }
}

export async function listOllamaAccounts(
  config?: AppConfig,
  probe: OllamaProbe = probeOllama,
): Promise<OllamaAccountsListResponse> {
  const runtime = config === undefined
  const effectiveConfig = config ?? getConfig()
  const configured = configuredOllamaProviders(effectiveConfig, runtime)
  const providers = [...configured]
  const configuredLocal = effectiveConfig.providers?.ollama
  if (
    !providers.some(({ name }) => name === "ollama")
    && (configuredLocal === undefined || configuredLocal.enabled !== false)
  ) {
    providers.unshift(
      runtime ? runtimeLocalProvider() : implicitLocalProvider(effectiveConfig),
    )
  }
  if (runtime && process.env.OLLAMA_API_KEY?.trim()) {
    const cloud = getProviderConfig("ollama-cloud")
    if (cloud?.type === "ollama") providers.push(cloud)
  }
  return {
    accounts: await Promise.all(
      providers.map((provider) => inspectProvider(provider, probe)),
    ),
  }
}
