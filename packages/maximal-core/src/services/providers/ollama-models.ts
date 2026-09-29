import type { ResolvedOllamaProviderConfig } from "~/lib/config/config"
import type { ProviderCatalogueModel } from "~/lib/live/resources"

import { sendProviderRequest } from "~/lib/http/send-request"
import { asRecord } from "~/lib/http/untrusted-frame"
import { runtimeLogger } from "~/lib/platform/runtime-logger"

const DETAIL_CONCURRENCY = 4
const DETAIL_TIMEOUT_MS = 5_000

export async function fetchOllamaModelCatalogue(
  provider: ResolvedOllamaProviderConfig,
): Promise<Response> {
  const path = provider.name === "ollama-cloud" ? "/api/tags" : "/v1/models"
  return await sendProviderRequest(provider, `${provider.baseUrl}${path}`, {
    method: "GET",
    headers: { accept: "application/json" },
  })
}

export function parseOllamaModelCatalogue(
  provider: ResolvedOllamaProviderConfig,
  value: unknown,
  enabled: boolean,
): Array<ProviderCatalogueModel> {
  const body = asRecord(value)
  const entries = provider.name === "ollama-cloud" ? body?.models : body?.data
  if (!Array.isArray(entries)) return []
  return entries.flatMap((value): Array<ProviderCatalogueModel> => {
    const model = asRecord(value)
    const id = readCatalogueModelId(provider, model)
    if (typeof id !== "string") return []
    const displayName =
      typeof model?.display_name === "string" ? model.display_name : undefined
    const name =
      typeof model?.name === "string" ? model.name : (displayName ?? id)
    return [
      {
        id,
        name,
        enabled,
        provider: provider.name,
        providerName: provider.name,
      },
    ]
  })
}

interface OllamaModelDetails {
  capabilities?: ReadonlyArray<string>
  contextWindowTokens?: number
  family?: string
}

function readCatalogueModelId(
  provider: ResolvedOllamaProviderConfig,
  model: Record<string, unknown> | undefined,
): unknown {
  if (provider.name !== "ollama-cloud") return model?.id
  return typeof model?.model === "string" ? model.model : model?.name
}

function readCapabilities(value: unknown): ReadonlyArray<string> | undefined {
  if (!Array.isArray(value)) return undefined
  const capabilities = value.filter(
    (capability): capability is string => typeof capability === "string",
  )
  return capabilities.length > 0 ? [...new Set(capabilities)] : undefined
}

function readContextWindow(value: unknown): number | undefined {
  const modelInfo = asRecord(value)
  if (!modelInfo) return undefined
  for (const [key, candidate] of Object.entries(modelInfo)) {
    if (
      key.endsWith(".context_length")
      && typeof candidate === "number"
      && Number.isSafeInteger(candidate)
      && candidate > 0
    ) {
      return candidate
    }
  }
  return undefined
}

export function parseOllamaModelDetails(value: unknown): OllamaModelDetails {
  const details = asRecord(value)
  const modelDetails = asRecord(details?.details)
  return {
    capabilities: readCapabilities(details?.capabilities),
    contextWindowTokens: readContextWindow(details?.model_info),
    family:
      typeof modelDetails?.family === "string" && modelDetails.family ?
        modelDetails.family
      : undefined,
  }
}

async function loadOllamaModelDetails(
  provider: ResolvedOllamaProviderConfig,
  model: string,
): Promise<OllamaModelDetails | undefined> {
  try {
    const response = await sendProviderRequest(
      provider,
      `${provider.baseUrl}/api/show`,
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({ model }),
        timeoutMs: DETAIL_TIMEOUT_MS,
      },
    )
    if (!response.ok) {
      runtimeLogger.warn(
        `Ollama model details unavailable for '${model}' (${response.status})`,
      )
      return undefined
    }
    return parseOllamaModelDetails(await response.json())
  } catch (error) {
    runtimeLogger.warn(`Ollama model details unavailable for '${model}'`, error)
    return undefined
  }
}

export async function enrichOllamaModels(
  provider: ResolvedOllamaProviderConfig,
  models: ReadonlyArray<ProviderCatalogueModel>,
): Promise<ReadonlyArray<ProviderCatalogueModel>> {
  const enriched: Array<ProviderCatalogueModel> = []
  let nextIndex = 0

  const worker = async (): Promise<void> => {
    while (nextIndex < models.length) {
      const index = nextIndex
      nextIndex += 1
      const model = models[index]
      const details = await loadOllamaModelDetails(provider, model.id)
      enriched[index] = details ? { ...model, ...details } : model
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(DETAIL_CONCURRENCY, models.length) }, worker),
  )
  return enriched
}
