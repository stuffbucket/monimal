import type {
  ModelAccessEvidence,
  ModelLifecycleEvidence,
  ModelProviderDetails,
  ModelRuntimeCapabilities,
  ModelRuntimeEvidence,
  ModelRuntimeLimits,
  ModelSelectionEvidence,
  ModelTokenPricing,
} from "@maximal/maximal-model-contract"

import type {
  CanonicalModelSnapshot,
  DeepReadonly,
  ModelCatalogLookup,
  ProviderOfferingSnapshot,
} from "./catalog.ts"
import type {
  ModelCatalogCapabilityState,
  ModelCatalogLimits,
  ModelCatalogModalities,
} from "./schema.ts"

export type ModelLocation = "cloud" | "local"
export type ModelAvailability = "available" | "disabled" | "unavailable"
export type RuntimeModelFeature =
  | "attachments"
  | "imageGeneration"
  | "reasoning"
  | "streaming"
  | "structuredOutput"
  | "temperatureControl"
  | "toolCalls"
  | "videoGeneration"
  | "vision"

export interface RuntimeModelObservation {
  readonly id: string
  readonly instanceId?: string
  readonly canonicalModelId?: string
  readonly name: string
  readonly family?: string
  readonly kind: string
  readonly location: ModelLocation
  readonly preview?: boolean
  readonly availability?: ModelAvailability
  readonly evidence?: ModelRuntimeEvidence
  readonly provider: {
    readonly id: string
    readonly name: string
  }
  readonly operations?: ReadonlyArray<
    import("@maximal/maximal-model-contract").ModelOperation
  >
  readonly tokenizer?: import("@maximal/maximal-model-contract").ModelTokenizerDescriptor
  readonly limits?: ModelRuntimeLimits
  readonly features?: Partial<Record<RuntimeModelFeature, boolean>>
}

export type ResolvedValueSource =
  "runtime" | "provider-catalog" | "canonical-catalog" | "unknown"

export interface ResolvedValue<T> {
  readonly value: T | null
  readonly source: ResolvedValueSource
}

export interface ModelFeatureEvidence {
  readonly runtime: boolean | null
  readonly catalog: ModelCatalogCapabilityState
}

export interface ModelInventoryEntry {
  readonly key: string
  readonly id: string
  readonly instanceId: string
  readonly canonicalModelId: string | null
  readonly name: string
  readonly family: ResolvedValue<string>
  readonly kind: string
  readonly location: ModelLocation
  readonly preview: boolean
  readonly availability: ModelAvailability
  readonly provider: {
    readonly id: string
    readonly name: string
  }
  readonly operations: ReadonlyArray<
    import("@maximal/maximal-model-contract").ModelOperation
  >
  readonly tokenizer:
    import("@maximal/maximal-model-contract").ModelTokenizerDescriptor | null
  readonly evidence: ModelRuntimeEvidence | null
  readonly access: ResolvedValue<ModelAccessEvidence>
  readonly capabilityDetails: ResolvedValue<ModelRuntimeCapabilities>
  readonly endpoints: ResolvedValue<ReadonlyArray<string>>
  readonly lifecycle: ResolvedValue<ModelLifecycleEvidence>
  readonly limits: {
    readonly contextTokens: ResolvedValue<number>
    readonly embeddingMaxInputs: ResolvedValue<number>
    readonly inputTokens: ResolvedValue<number>
    readonly nonStreamingOutputTokens: ResolvedValue<number>
    readonly outputTokens: ResolvedValue<number>
    readonly vision: ResolvedValue<NonNullable<ModelRuntimeLimits["vision"]>>
  }
  readonly pricing: ResolvedValue<ModelTokenPricing>
  readonly providerDetails: ModelProviderDetails | null
  readonly selection: ResolvedValue<ModelSelectionEvidence>
  readonly features: Readonly<Record<RuntimeModelFeature, ModelFeatureEvidence>>
  readonly catalog: {
    readonly canonical: CanonicalModelSnapshot | null
    readonly offering: ProviderOfferingSnapshot | null
  }
}

export interface ProviderInventoryEntry {
  readonly id: string
  readonly name: string
  readonly locations: ReadonlyArray<ModelLocation>
  readonly modelCount: number
}

export interface ModelInventory {
  readonly models: ReadonlyArray<ModelInventoryEntry>
  readonly providers: ReadonlyArray<ProviderInventoryEntry>
}

export function normalizeProviderId(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (normalized === "ollama-cloud") return "ollama"
  if (normalized.includes("github") || normalized.includes("copilot")) {
    return "github-copilot"
  }
  return normalized
}

export function providerDisplayName(id: string, name?: string): string {
  if (id === "github-copilot") return "GitHub Copilot"
  if (id === "ollama") return "Ollama"
  return name?.trim() || id
}

function resolveValue<T>(
  runtime: T | undefined,
  provider: T | null | undefined,
  canonical: T | null | undefined,
): ResolvedValue<T> {
  if (runtime !== undefined) return { source: "runtime", value: runtime }
  if (provider !== undefined && provider !== null) {
    return { source: "provider-catalog", value: provider }
  }
  if (canonical !== undefined && canonical !== null) {
    return { source: "canonical-catalog", value: canonical }
  }
  return { source: "unknown", value: null }
}

function catalogFeature(
  feature: RuntimeModelFeature,
  capabilities: ProviderOfferingSnapshot["capabilities"],
  modalities: DeepReadonly<ModelCatalogModalities>,
): ModelCatalogCapabilityState {
  switch (feature) {
    case "attachments": {
      return capabilities.attachments
    }
    case "imageGeneration": {
      return modalities.output.includes("image") ? "supported" : "unsupported"
    }
    case "reasoning": {
      return capabilities.reasoning
    }
    case "streaming": {
      return "unknown"
    }
    case "structuredOutput": {
      return capabilities.structuredOutput
    }
    case "temperatureControl": {
      return capabilities.temperatureControl
    }
    case "toolCalls": {
      return capabilities.toolCalls
    }
    case "videoGeneration": {
      return modalities.output.includes("video") ? "supported" : "unsupported"
    }
    case "vision": {
      return modalities.input.includes("image") ? "supported" : "unsupported"
    }
    default: {
      return feature satisfies never
    }
  }
}

const FEATURES: ReadonlyArray<RuntimeModelFeature> = [
  "attachments",
  "imageGeneration",
  "reasoning",
  "streaming",
  "structuredOutput",
  "temperatureControl",
  "toolCalls",
  "videoGeneration",
  "vision",
]

function featureEvidence(
  observation: RuntimeModelObservation,
  offering: ProviderOfferingSnapshot | undefined,
  canonical: CanonicalModelSnapshot | undefined,
): Readonly<Record<RuntimeModelFeature, ModelFeatureEvidence>> {
  const catalog = offering ?? canonical
  return Object.fromEntries(
    FEATURES.map((feature) => [
      feature,
      {
        runtime: observation.features?.[feature] ?? null,
        catalog:
          catalog === undefined ? "unknown" : (
            catalogFeature(feature, catalog.capabilities, catalog.modalities)
          ),
      },
    ]),
  ) as Record<RuntimeModelFeature, ModelFeatureEvidence>
}

interface ResolveCanonicalOptions {
  readonly index: ModelCatalogLookup | null
  readonly observation: RuntimeModelObservation
  readonly providerId: string
  readonly offering: ProviderOfferingSnapshot | undefined
}

function resolveCanonical({
  index,
  observation,
  providerId,
  offering,
}: ResolveCanonicalOptions): CanonicalModelSnapshot | undefined {
  if (index === null) return undefined
  const candidates = [
    observation.canonicalModelId,
    offering?.canonicalModelId ?? undefined,
    observation.id,
    `${providerId}/${observation.id}`,
  ]
  for (const id of candidates) {
    if (id === undefined) continue
    const model = index.canonicalModel(id)
    if (model !== undefined) return model
  }
  return undefined
}

function resolveLimits(
  runtime: RuntimeModelObservation["limits"],
  offering: ModelCatalogLimits | undefined,
  canonical: ModelCatalogLimits | undefined,
): ModelInventoryEntry["limits"] {
  const valid = (value: number | null | undefined): number | undefined =>
    value === null ? undefined : value
  return {
    contextTokens: resolveValue(
      valid(runtime?.contextTokens),
      offering?.contextTokens,
      canonical?.contextTokens,
    ),
    embeddingMaxInputs: resolveValue(
      valid(runtime?.embeddingMaxInputs),
      undefined,
      undefined,
    ),
    inputTokens: resolveValue(
      valid(runtime?.inputTokens),
      offering?.inputTokens,
      canonical?.inputTokens,
    ),
    nonStreamingOutputTokens: resolveValue(
      valid(runtime?.nonStreamingOutputTokens),
      undefined,
      undefined,
    ),
    outputTokens: resolveValue(
      valid(runtime?.outputTokens),
      offering?.outputTokens,
      canonical?.outputTokens,
    ),
    vision: resolveValue(runtime?.vision, undefined, undefined),
  }
}

function catalogLifecycle(
  offering: ProviderOfferingSnapshot | undefined,
): ModelLifecycleEvidence | undefined {
  if (offering === undefined) return undefined
  let state: ModelLifecycleEvidence["state"] = "active"
  if (offering.status === "deprecated") state = "deprecated"
  if (offering.status === "unknown") state = "unknown"
  return { info: [], state, warnings: [] }
}

function catalogPricing(
  offering: ProviderOfferingSnapshot | undefined,
): ModelTokenPricing | undefined {
  if (offering === undefined) return undefined
  const pricing = offering.pricing
  const hasPrice = Object.values(pricing).some((value) => value !== null)
  if (!hasPrice) return undefined
  return {
    default: {
      ...(pricing.cacheReadUsdPerMillion === null ?
        {}
      : { cacheReadAmount: pricing.cacheReadUsdPerMillion }),
      ...(pricing.cacheWriteUsdPerMillion === null ?
        {}
      : { cacheWriteAmount: pricing.cacheWriteUsdPerMillion }),
      ...(pricing.inputUsdPerMillion === null ?
        {}
      : { inputAmount: pricing.inputUsdPerMillion }),
      ...(pricing.outputUsdPerMillion === null ?
        {}
      : { outputAmount: pricing.outputUsdPerMillion }),
      ...(pricing.reasoningUsdPerMillion === null ?
        {}
      : { reasoningAmount: pricing.reasoningUsdPerMillion }),
    },
    unit: { currency: "USD", tokensPerBatch: 1_000_000 },
  }
}

interface CatalogMatch {
  readonly canonical: CanonicalModelSnapshot | undefined
  readonly offering: ProviderOfferingSnapshot | undefined
}

function matchCatalog(
  index: ModelCatalogLookup | null,
  observation: RuntimeModelObservation,
  providerId: string,
): CatalogMatch {
  const offering = index?.offering(providerId, observation.id)
  return {
    offering,
    canonical: resolveCanonical({
      index,
      observation,
      providerId,
      offering,
    }),
  }
}

function requiredProviderId(observation: RuntimeModelObservation): string {
  const providerId = normalizeProviderId(observation.provider.id)
  if (providerId.length === 0) throw new TypeError("Provider id is required.")
  return providerId
}

function assertModelId(observation: RuntimeModelObservation): void {
  if (observation.id.trim().length === 0) {
    throw new TypeError("Model id is required.")
  }
}

function inventoryName(
  observation: RuntimeModelObservation,
  match: CatalogMatch,
): string {
  const observed = observation.name.trim()
  if (observed.length > 0) return observed
  return match.offering?.name ?? match.canonical?.name ?? observation.id
}

function inventoryProviderName(
  index: ModelCatalogLookup | null,
  observation: RuntimeModelObservation,
  providerId: string,
): string {
  const observed = observation.provider.name.trim()
  const fallback = index?.provider(providerId)?.name
  return providerDisplayName(providerId, observed || fallback)
}

function observedPreview(observation: RuntimeModelObservation): boolean {
  if (observation.preview !== undefined) return observation.preview
  return observation.evidence?.selection?.preview ?? false
}

function observedLimits(
  observation: RuntimeModelObservation,
): ModelRuntimeLimits {
  return {
    ...observation.evidence?.limits,
    ...observation.limits,
  }
}

function inventoryEvidence(
  observation: RuntimeModelObservation,
  match: CatalogMatch,
): Pick<
  ModelInventoryEntry,
  | "access"
  | "capabilityDetails"
  | "endpoints"
  | "lifecycle"
  | "limits"
  | "pricing"
  | "providerDetails"
  | "selection"
> {
  const evidence = observation.evidence
  return {
    access: resolveValue(evidence?.access, undefined, undefined),
    capabilityDetails: resolveValue(
      evidence?.capabilities,
      undefined,
      undefined,
    ),
    endpoints: resolveValue(evidence?.endpoints, undefined, undefined),
    lifecycle: resolveValue(
      evidence?.lifecycle,
      catalogLifecycle(match.offering),
      undefined,
    ),
    limits: resolveLimits(
      observedLimits(observation),
      match.offering?.limits,
      match.canonical?.limits,
    ),
    pricing: resolveValue(
      evidence?.pricing,
      catalogPricing(match.offering),
      undefined,
    ),
    providerDetails: evidence?.providerDetails ?? null,
    selection: resolveValue(evidence?.selection, undefined, undefined),
  }
}

function inventoryModel(
  index: ModelCatalogLookup | null,
  observation: RuntimeModelObservation,
): ModelInventoryEntry {
  const providerId = requiredProviderId(observation)
  assertModelId(observation)
  const match = matchCatalog(index, observation, providerId)
  const key = [
    providerId,
    observation.location,
    observation.instanceId ?? observation.id,
  ].join("\u0000")
  return {
    key,
    id: observation.id,
    instanceId: observation.instanceId ?? observation.id,
    canonicalModelId: match.canonical?.id ?? null,
    name: inventoryName(observation, match),
    family: resolveValue(
      observation.family?.trim() || undefined,
      undefined,
      match.canonical?.family,
    ),
    kind: observation.kind,
    location: observation.location,
    preview: observedPreview(observation),
    availability: observation.availability ?? "available",
    provider: {
      id: providerId,
      name: inventoryProviderName(index, observation, providerId),
    },
    operations: Object.freeze([...(observation.operations ?? [])]),
    tokenizer: observation.tokenizer ?? null,
    evidence: observation.evidence ?? null,
    ...inventoryEvidence(observation, match),
    features: featureEvidence(observation, match.offering, match.canonical),
    catalog: {
      canonical: match.canonical ?? null,
      offering: match.offering ?? null,
    },
  }
}

export function reconcileModelInventory(
  index: ModelCatalogLookup | null,
  observations: ReadonlyArray<RuntimeModelObservation>,
): ModelInventory {
  const models = observations.map((observation) =>
    inventoryModel(index, observation),
  )
  const keys = new Set<string>()
  const providers = new Map<
    string,
    { name: string; locations: Set<ModelLocation>; modelCount: number }
  >()
  for (const model of models) {
    if (keys.has(model.key)) {
      throw new TypeError(`Duplicate observed model key "${model.key}".`)
    }
    keys.add(model.key)
    const provider = providers.get(model.provider.id) ?? {
      name: model.provider.name,
      locations: new Set<ModelLocation>(),
      modelCount: 0,
    }
    provider.locations.add(model.location)
    provider.modelCount += 1
    providers.set(model.provider.id, provider)
  }
  return {
    models,
    providers: [...providers]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, provider]) => ({
        id,
        name: provider.name,
        locations: [...provider.locations].sort(),
        modelCount: provider.modelCount,
      })),
  }
}
