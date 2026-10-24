import type {
  MaximalModelList,
  MaximalModelListEntry,
} from "@maximal/maximal-core-contract/control"

import type { PiCost, PiDiscoveryConfig } from "./config.ts"

type PiChatApi =
  "anthropic-messages" | "openai-responses" | "openai-completions"

/** Our adapter's output port; Pi owns the API implementations and model registry. */
export interface PiDiscoveredModel {
  type: "chat"
  id: string
  name: string
  api: PiChatApi
  baseUrl: string
  reasoning: boolean
  input: Array<"text" | "image">
  cost: PiCost
  contextWindow: number
  maxTokens: number
  compat?: {
    supportsEagerToolInputStreaming: false
    supportsCacheControlOnTools: false
  }
}

export interface PiProjection {
  providers: Array<{ id: string; models: Array<PiDiscoveredModel> }>
  skipped: Array<{
    source: string
    provider: string
    id: string
    reason: string
  }>
}

export function piProviderId(
  entry: Pick<MaximalModelListEntry, "source" | "provider">,
): string {
  return `maximal-${entry.source}-${encodeURIComponent(entry.provider)}`
}

function apiFor(entry: MaximalModelListEntry): PiChatApi | undefined {
  if (entry.operations?.includes("messages")) return "anthropic-messages"
  if (entry.operations?.includes("responses")) return "openai-responses"
  if (entry.operations?.includes("chat-completions"))
    return "openai-completions"
  return undefined
}

function reviewedMetadata(
  entry: MaximalModelListEntry,
  config: PiDiscoveryConfig,
) {
  const matches = config.overrides.filter(
    (override) =>
      override.source === entry.source && override.provider === entry.provider,
  )
  const defaults = matches.find(({ id }) => id === undefined)
  const exact = matches.find(({ id }) => id === entry.id)
  return {
    contextWindow:
      exact?.contextWindowTokens
      ?? defaults?.contextWindowTokens
      ?? entry.contextWindowTokens,
    maxTokens:
      exact?.maxOutputTokens
      ?? defaults?.maxOutputTokens
      ?? entry.maxOutputTokens,
    cost: exact?.cost ?? defaults?.cost,
  }
}

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const point = character.codePointAt(0)
    if (point !== undefined && (point < 32 || (point >= 127 && point <= 159)))
      return true
  }
  return false
}

function skipReason(
  entry: MaximalModelListEntry,
  config: PiDiscoveryConfig,
): string | null {
  if ([entry.id, entry.name].some((value) => hasControlCharacters(value)))
    return "Model ID or display name contains unsafe terminal control characters."
  if (entry.basePath === null) return "Routing is ambiguous or unavailable."
  const expected =
    entry.source === "provider" ?
      `/${encodeURIComponent(entry.provider)}/v1`
    : "/v1"
  if (
    entry.provider === "."
    || entry.provider === ".."
    || entry.basePath !== expected
  )
    return "The returned route does not match its provider identity."
  if (!apiFor(entry)) return "No supported chat operation is advertised."
  if (
    entry.targets.length > 0
    && entry.targets.every(
      ({ availability }) =>
        availability === "disabled" || availability === "unavailable",
    )
  )
    return "All configured targets are disabled or unavailable."
  const metadata = reviewedMetadata(entry, config)
  if (metadata.contextWindow === null || metadata.maxTokens === null)
    return "Token limits are unknown; supply reviewed overrides."
  if (metadata.maxTokens > metadata.contextWindow)
    return "The output limit exceeds the context window."
  if (metadata.cost === undefined)
    return "Pricing is unknown; supply explicit USD-per-million-token cost metadata (including explicit zero for an unbilled local service)."
  return null
}

/** Inventory is authoritative: overrides cannot create a model or authorize a new route. */
export function projectPiModels(
  catalog: MaximalModelList,
  config: PiDiscoveryConfig,
): PiProjection {
  const projection: PiProjection = { providers: [], skipped: [] }
  const seen = new Set<string>()
  for (const entry of catalog.data) {
    const identity = JSON.stringify([entry.source, entry.provider, entry.id])
    if (seen.has(identity))
      throw new Error("Maximal returned duplicate offering identities.")
    seen.add(identity)
    const reason = skipReason(entry, config)
    if (reason !== null) {
      projection.skipped.push({
        source: entry.source,
        provider: entry.provider,
        id: entry.id,
        reason,
      })
      continue
    }
    const api = apiFor(entry)
    const metadata = reviewedMetadata(entry, config)
    if (
      !api
      || !entry.basePath
      || metadata.contextWindow === null
      || metadata.maxTokens === null
      || !metadata.cost
    )
      throw new Error("The model projection lost validated metadata.")
    const model: PiDiscoveredModel = {
      type: "chat",
      id: entry.id,
      name: entry.name,
      api,
      // Anthropic's SDK adds /v1/messages; OpenAI's SDK adds /responses or
      // /chat/completions to a base that already includes /v1.
      baseUrl: new URL(
        api === "anthropic-messages" ?
          `${entry.basePath.slice(0, -3)}/`
        : entry.basePath,
        config.origin,
      ).href.replace(/\/$/u, ""),
      reasoning: entry.capabilities.reasoning === true,
      input: entry.capabilities.vision === true ? ["text", "image"] : ["text"],
      cost: metadata.cost,
      contextWindow: metadata.contextWindow,
      maxTokens: metadata.maxTokens,
      ...(api === "anthropic-messages" ?
        {
          compat: {
            supportsEagerToolInputStreaming: false as const,
            supportsCacheControlOnTools: false as const,
          },
        }
      : {}),
    }
    const providerId = piProviderId(entry)
    let provider = projection.providers.find(({ id }) => id === providerId)
    if (!provider) {
      provider = { id: providerId, models: [] }
      projection.providers.push(provider)
    }
    provider.models.push(model)
  }
  return projection
}
