/** An HTTP operation a provider can serve through the gateway. */
export const MODEL_OPERATIONS = Object.freeze([
  "messages",
  "chat-completions",
  "responses",
  "embeddings",
  "systemone",
] as const)

export type ModelOperation = (typeof MODEL_OPERATIONS)[number]

export type ProviderOperation = ModelOperation | "count-tokens" | "models"

export interface ModelTokenizerDescriptor {
  readonly id: string
}

export interface ModelDiagnosticEvidence {
  readonly code: string
  readonly message: string
}

export type ModelLifecycleState =
  "active" | "pending-deprecation" | "deprecated" | "unknown"

export interface ModelLifecycleEvidence {
  readonly deprecationDate?: string
  readonly info: ReadonlyArray<ModelDiagnosticEvidence>
  readonly state: ModelLifecycleState
  readonly warnings: ReadonlyArray<ModelDiagnosticEvidence>
}

export interface ModelSelectionEvidence {
  readonly default?: boolean
  readonly fallback?: boolean
  readonly preview?: boolean
  readonly selectable?: boolean
}

export interface ModelAccessEvidence {
  readonly restrictedTo?: ReadonlyArray<string>
  readonly state?: string
  readonly terms?: string
}

export interface ModelVisionLimits {
  readonly maxImageBytes?: number | null
  readonly maxImages?: number | null
  readonly supportedMediaTypes?: ReadonlyArray<string>
}

export interface ModelRuntimeLimits {
  readonly contextTokens?: number | null
  readonly embeddingMaxInputs?: number | null
  readonly inputTokens?: number | null
  readonly nonStreamingOutputTokens?: number | null
  readonly outputTokens?: number | null
  readonly vision?: ModelVisionLimits
}

export interface ModelRuntimeCapabilities {
  readonly adaptiveThinking?: boolean
  readonly dimensions?: boolean
  readonly maxThinkingBudget?: number | null
  readonly minThinkingBudget?: number | null
  readonly parallelToolCalls?: boolean
  readonly reasoningEffort?: ReadonlyArray<string>
  readonly streaming?: boolean
  readonly structuredOutputs?: boolean
  readonly toolCalls?: boolean
  readonly vision?: boolean
}

export interface ModelTokenPriceTier {
  readonly cacheReadAmount?: number | null
  readonly cacheWrite1HourAmount?: number | null
  readonly cacheWriteAmount?: number | null
  readonly inputAmount?: number | null
  readonly maxInputTokens?: number | null
  readonly outputAmount?: number | null
  readonly reasoningAmount?: number | null
}

export interface ModelTokenPriceUnit {
  readonly currency: string | null
  readonly tokensPerBatch: number | null
}

export interface ModelTokenPricing {
  readonly autoDiscount?: number | null
  readonly default: ModelTokenPriceTier
  readonly longContext?: ModelTokenPriceTier
  readonly unit: ModelTokenPriceUnit
}

export interface GithubCopilotModelDetails {
  readonly kind: "github-copilot"
  readonly legacyBilling?: {
    readonly isPremium: boolean | null
    readonly multiplier: number | null
  }
  readonly pickerCategory?: string
  readonly pickerPriceCategory?: string
  readonly version: string
}

export type ModelProviderDetails = GithubCopilotModelDetails

export interface ModelRuntimeEvidence {
  readonly access?: ModelAccessEvidence
  readonly capabilities?: ModelRuntimeCapabilities
  readonly endpoints?: ReadonlyArray<string>
  readonly lifecycle?: ModelLifecycleEvidence
  readonly limits?: ModelRuntimeLimits
  readonly pricing?: ModelTokenPricing
  readonly providerDetails?: ModelProviderDetails
  readonly selection?: ModelSelectionEvidence
}

export interface ProviderModelDescriptor {
  readonly capabilities?: ReadonlyArray<string>
  readonly contextWindowTokens?: number
  readonly enabled?: boolean
  readonly evidence?: ModelRuntimeEvidence
  readonly family?: string
  readonly id: string
  readonly maxOutputTokens?: number
  readonly name: string
  readonly operations?: ReadonlyArray<ModelOperation>
  readonly provider: string
  readonly providerName: string
  readonly tokenizer?: ModelTokenizerDescriptor
}

/** How evidence entered the model topology. */
export type ModelEvidenceMethod =
  "declared" | "discovered" | "observed" | "derived"

/** The owner of one model-topology fact. */
export type ModelEvidenceSource =
  | "catalog"
  | "configuration"
  | "manifest"
  | "provider"
  | "runner"
  | "compatibility"

/** Serializable attribution for model-topology evidence. */
export interface ModelEvidenceProvenance {
  readonly method: ModelEvidenceMethod
  readonly observedAt?: string
  readonly revision?: string
  readonly source: ModelEvidenceSource
  readonly sourceId: string
}

/** The account through which a provider-backed target is accessed. */
export interface ModelProviderAccountReference {
  readonly accountId?: string
  readonly provider: string
  readonly providerName?: string
}

/** The execution engine that serves a target. */
export interface ModelRunnerReference {
  readonly id: string
  readonly kind: "managed-local" | "external-local" | "remote-managed"
  readonly name?: string
}

/** Where the runner endpoint executes relative to Maximal. */
export type ModelExecutionLocation = "device" | "lan" | "cloud"

/** A credential-free endpoint identity used by an execution target. */
export interface ModelEndpointReference {
  readonly id: string
  readonly url?: string
}

/** The adapter used to invoke one operation on an execution target. */
export interface ModelOperationAdapterReference {
  readonly id: string
  readonly operation: ModelOperation
}

export type ModelExecutionTargetAvailabilityState =
  "available" | "degraded" | "unavailable" | "disabled" | "unknown"

/** Current reachability of an execution target. */
export interface ModelExecutionTargetAvailability {
  readonly message?: string
  readonly state: ModelExecutionTargetAvailabilityState
}

export type ModelExecutionTargetLifecycleState =
  | "declared"
  | "provisioning"
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "failed"
  | "unknown"

/** Current lifecycle phase of the runner/deployment behind a target. */
export interface ModelExecutionTargetLifecycle {
  readonly message?: string
  readonly state: ModelExecutionTargetLifecycleState
}

export interface ModelExecutionTargetLimits {
  readonly effective?: ModelRuntimeLimits
  readonly effectiveProvenance?: ModelEvidenceProvenance
  readonly intrinsic?: ModelRuntimeLimits
  readonly intrinsicProvenance?: ModelEvidenceProvenance
}

/** Tokenizer identity observed for one execution target. */
export interface ModelTokenizerEvidence {
  readonly provenance: ModelEvidenceProvenance
  readonly tokenizer: ModelTokenizerDescriptor
}

/** Provider and runner evidence retained on one execution target. */
export interface ModelExecutionTargetEvidence {
  readonly access?: ModelAccessEvidence
  readonly advertisedEndpoints?: ReadonlyArray<string>
  readonly capabilities?: ModelRuntimeCapabilities
  readonly declaredCapabilities?: ReadonlyArray<string>
  readonly limits: ModelExecutionTargetLimits
  readonly modelLifecycle?: ModelLifecycleEvidence
  readonly pricing?: ModelTokenPricing
  readonly providerDetails?: ModelProviderDetails
  readonly provenance: ModelEvidenceProvenance
  readonly selection?: ModelSelectionEvidence
  readonly tokenizer?: ModelTokenizerEvidence
}

/** One concrete, operation-aware way to execute a model. */
export interface ModelExecutionTarget {
  readonly adapters: ReadonlyArray<ModelOperationAdapterReference>
  readonly availability: ModelExecutionTargetAvailability
  readonly endpoint: ModelEndpointReference
  readonly evidence: ModelExecutionTargetEvidence
  readonly id: string
  readonly lifecycle: ModelExecutionTargetLifecycle
  readonly location: ModelExecutionLocation
  readonly modelId: string
  readonly providerAccount: ModelProviderAccountReference
  readonly runner: ModelRunnerReference
}

/** Explicit runtime binding used to project a provider-model pair. */
export interface ProviderModelTargetBinding {
  readonly accountId?: string
  readonly adapters: ReadonlyArray<ModelOperationAdapterReference>
  readonly availability?: ModelExecutionTargetAvailability
  readonly endpoint: ModelEndpointReference
  readonly id: string
  readonly intrinsicLimits?: ModelRuntimeLimits
  readonly intrinsicLimitsProvenance?: ModelEvidenceProvenance
  readonly lifecycle?: ModelExecutionTargetLifecycle
  readonly location: ModelExecutionLocation
  readonly provenance: ModelEvidenceProvenance
  readonly runner: ModelRunnerReference
}

export interface ModelTopologySnapshot {
  readonly revision: number
  readonly targets: ReadonlyArray<ModelExecutionTarget>
}

export type ModelTopologyListener = (snapshot: ModelTopologySnapshot) => void

export interface ModelTopologyRegistration {
  dispose(): void
}

export interface ModelTopologyService {
  registerTarget(
    target: ModelExecutionTarget,
    lifetime?: AbortSignal,
  ): ModelTopologyRegistration
  snapshot(): ModelTopologySnapshot
  subscribe(listener: ModelTopologyListener): ProviderUnsubscribe
}

function immutableProvenance(
  provenance: ModelEvidenceProvenance,
): ModelEvidenceProvenance {
  return Object.freeze({ ...provenance })
}

function immutableLimits(limits: ModelRuntimeLimits): ModelRuntimeLimits {
  if (limits.vision === undefined) return Object.freeze({ ...limits })
  return Object.freeze({
    ...limits,
    vision: Object.freeze({
      ...limits.vision,
      supportedMediaTypes:
        limits.vision.supportedMediaTypes === undefined ?
          undefined
        : Object.freeze([...limits.vision.supportedMediaTypes]),
    }),
  })
}

function effectiveProviderLimits(
  descriptor: ProviderModelDescriptor,
): ModelRuntimeLimits | undefined {
  if (descriptor.evidence?.limits !== undefined) {
    return immutableLimits(descriptor.evidence.limits)
  }
  if (
    descriptor.contextWindowTokens === undefined
    && descriptor.maxOutputTokens === undefined
  ) {
    return undefined
  }
  return immutableLimits({
    contextTokens: descriptor.contextWindowTokens,
    outputTokens: descriptor.maxOutputTokens,
  })
}

function assertCredentialFreeEndpoint(endpoint: ModelEndpointReference): void {
  if (endpoint.url === undefined) return
  const url = new URL(endpoint.url)
  if (url.username !== "" || url.password !== "") {
    throw new TypeError(
      `Execution target endpoint "${endpoint.id}" must not contain credentials.`,
    )
  }
}

function intrinsicLimitProvenance(
  binding: ProviderModelTargetBinding,
): ModelEvidenceProvenance | undefined {
  if (binding.intrinsicLimits === undefined) return undefined
  if (binding.intrinsicLimitsProvenance === undefined) {
    throw new TypeError(
      `Execution target "${binding.id}" intrinsic limits require their own provenance.`,
    )
  }
  return immutableProvenance(binding.intrinsicLimitsProvenance)
}

function immutableLifecycle(
  lifecycle: ModelLifecycleEvidence,
): ModelLifecycleEvidence {
  return Object.freeze({
    ...lifecycle,
    info: Object.freeze(
      lifecycle.info.map((diagnostic) => Object.freeze({ ...diagnostic })),
    ),
    warnings: Object.freeze(
      lifecycle.warnings.map((diagnostic) => Object.freeze({ ...diagnostic })),
    ),
  })
}

function immutableAccess(
  access: ModelAccessEvidence | undefined,
): ModelAccessEvidence | undefined {
  if (access === undefined) return undefined
  return Object.freeze({
    ...access,
    ...(access.restrictedTo === undefined ?
      {}
    : { restrictedTo: Object.freeze([...access.restrictedTo]) }),
  })
}

function immutableCapabilities(
  capabilities: ModelRuntimeCapabilities | undefined,
): ModelRuntimeCapabilities | undefined {
  if (capabilities === undefined) return undefined
  return Object.freeze({
    ...capabilities,
    ...(capabilities.reasoningEffort === undefined ?
      {}
    : { reasoningEffort: Object.freeze([...capabilities.reasoningEffort]) }),
  })
}

function immutablePricing(
  pricing: ModelTokenPricing | undefined,
): ModelTokenPricing | undefined {
  if (pricing === undefined) return undefined
  return Object.freeze({
    ...pricing,
    default: Object.freeze({ ...pricing.default }),
    ...(pricing.longContext === undefined ?
      {}
    : { longContext: Object.freeze({ ...pricing.longContext }) }),
    unit: Object.freeze({ ...pricing.unit }),
  })
}

function immutableProviderDetails(
  details: ModelProviderDetails | undefined,
): ModelProviderDetails | undefined {
  if (details === undefined) return undefined
  return Object.freeze({
    ...details,
    ...(details.legacyBilling === undefined ?
      {}
    : { legacyBilling: Object.freeze({ ...details.legacyBilling }) }),
  })
}

function immutableOptionalRecord<T extends object>(
  value: T | undefined,
): Readonly<T> | undefined {
  if (value === undefined) return undefined
  return Object.freeze({ ...value })
}

function immutableOptionalArray<T>(
  value: ReadonlyArray<T> | undefined,
): ReadonlyArray<T> | undefined {
  if (value === undefined) return undefined
  return Object.freeze([...value])
}

function projectTokenizerEvidence(
  tokenizer: ModelTokenizerDescriptor | undefined,
  provenance: ModelEvidenceProvenance,
): ModelTokenizerEvidence | undefined {
  if (tokenizer === undefined) return undefined
  return Object.freeze({
    provenance,
    tokenizer: Object.freeze({ ...tokenizer }),
  })
}

function assertAdapterCoverage(
  descriptor: ProviderModelDescriptor,
  adapters: ReadonlyArray<ModelOperationAdapterReference>,
): void {
  const operations = adapters.map(({ operation }) => operation)
  if (new Set(operations).size !== operations.length) {
    throw new TypeError(
      `Execution target "${descriptor.id}" has duplicate operation adapters.`,
    )
  }
  if (descriptor.operations === undefined) return
  const expected = new Set(descriptor.operations)
  const actual = new Set(operations)
  if (
    expected.size !== actual.size
    || [...expected].some((operation) => !actual.has(operation))
  ) {
    throw new TypeError(
      `Execution target "${descriptor.id}" must bind every advertised operation exactly once.`,
    )
  }
}

function projectTargetEvidence(
  descriptor: ProviderModelDescriptor,
  binding: ProviderModelTargetBinding,
  provenance: ModelEvidenceProvenance,
): ModelExecutionTargetEvidence {
  const runtimeEvidence: Partial<ModelRuntimeEvidence> =
    descriptor.evidence ?? {}
  const effectiveLimits = effectiveProviderLimits(descriptor)
  return Object.freeze({
    access: immutableAccess(runtimeEvidence.access),
    advertisedEndpoints: immutableOptionalArray(runtimeEvidence.endpoints),
    capabilities: immutableCapabilities(runtimeEvidence.capabilities),
    declaredCapabilities: immutableOptionalArray(descriptor.capabilities),
    limits: Object.freeze({
      effective: effectiveLimits,
      effectiveProvenance:
        effectiveLimits === undefined ? undefined : provenance,
      intrinsic:
        binding.intrinsicLimits === undefined ?
          undefined
        : immutableLimits(binding.intrinsicLimits),
      intrinsicProvenance: intrinsicLimitProvenance(binding),
    }),
    modelLifecycle:
      runtimeEvidence.lifecycle === undefined ?
        undefined
      : immutableLifecycle(runtimeEvidence.lifecycle),
    pricing: immutablePricing(runtimeEvidence.pricing),
    providerDetails: immutableProviderDetails(runtimeEvidence.providerDetails),
    provenance,
    selection: immutableOptionalRecord(runtimeEvidence.selection),
    tokenizer: projectTokenizerEvidence(descriptor.tokenizer, provenance),
  })
}

function providerAvailability(
  enabled: boolean | undefined,
): ModelExecutionTargetAvailability {
  if (enabled === false) return { state: "disabled" }
  if (enabled === true) return { state: "available" }
  return { state: "unknown" }
}

/**
 * Projects provider discovery into an execution target without inferring
 * runner, endpoint, location, account, adapter, or intrinsic model facts.
 */
export function projectProviderModelExecutionTarget(
  descriptor: ProviderModelDescriptor,
  binding: ProviderModelTargetBinding,
): ModelExecutionTarget {
  assertAdapterCoverage(descriptor, binding.adapters)
  assertCredentialFreeEndpoint(binding.endpoint)
  const provenance = immutableProvenance(binding.provenance)
  const availability: ModelExecutionTargetAvailability =
    binding.availability ?? providerAvailability(descriptor.enabled)
  const lifecycle: ModelExecutionTargetLifecycle = binding.lifecycle ?? {
    state: "unknown",
  }
  return Object.freeze({
    adapters: Object.freeze(
      binding.adapters.map((adapter) => Object.freeze({ ...adapter })),
    ),
    availability: Object.freeze({ ...availability }),
    endpoint: Object.freeze({ ...binding.endpoint }),
    evidence: projectTargetEvidence(descriptor, binding, provenance),
    id: binding.id,
    lifecycle: Object.freeze({ ...lifecycle }),
    location: binding.location,
    modelId: descriptor.id,
    providerAccount: Object.freeze({
      accountId: binding.accountId,
      provider: descriptor.provider,
      providerName: descriptor.providerName,
    }),
    runner: Object.freeze({ ...binding.runner }),
  })
}

/**
 * One provider-bound Web API exchange.
 *
 * Gateways preserve the request and signal so providers can consume request
 * streams and observe the caller's cancellation without an adapter-specific
 * transport type.
 */
export interface ProviderDispatch {
  readonly operation: ProviderOperation
  readonly provider: string
  readonly request: Request
  readonly signal: AbortSignal
}

/** Stable, machine-readable reasons attached to provider diagnostics. */
export type ProviderDiagnosticCode =
  | "provider-missing"
  | "provider-disabled"
  | "provider-invalid"
  | "provider-load-failed"
  | "provider-activation-failed"
  | "provider-conflict"
  | "provider-disposal-failed"
  | "provider-unavailable"

/** A serializable diagnostic snapshot with no runtime error object attached. */
export interface ProviderDiagnostic {
  readonly code: ProviderDiagnosticCode
  readonly message: string
  readonly provider?: string
}

/** The externally observable availability of one provider. */
export type ProviderStatusState = "available" | "disabled" | "unavailable"

/** An immutable snapshot of one provider's externally observable state. */
export interface ProviderStatus {
  readonly diagnostics: ReadonlyArray<ProviderDiagnostic>
  readonly displayName?: string
  readonly operations: ReadonlyArray<ProviderOperation>
  readonly provider: string
  readonly state: ProviderStatusState
}

/**
 * An immutable snapshot emitted when the provider topology changes.
 * `revision` increases monotonically for the lifetime of a gateway.
 */
export interface ProviderTopology {
  readonly diagnostics: ReadonlyArray<ProviderDiagnostic>
  readonly revision: number
  readonly statuses: ReadonlyArray<ProviderStatus>
}

export type ProviderTopologyListener = (topology: ProviderTopology) => void

/** An idempotent function that removes a topology listener. */
export type ProviderUnsubscribe = () => void

/** Controls whether a local model appears in provider model catalogs. */
export type LocalModelPublication = "none" | "provider" | "aggregate"

/** Provider-neutral input and output features required by a local model. */
export interface LocalModelCapabilities {
  readonly input: ReadonlyArray<string>
  readonly output: ReadonlyArray<string>
}

/** Token limits advertised for a local model. */
export interface LocalModelContextLimits {
  readonly contextWindow: number
  readonly maxOutputTokens?: number
}

/** Serializable provisioning state for a registered local model. */
export type LocalModelState = "registered" | "provisioning" | "ready" | "failed"

/** A serializable, path-free local-model catalog entry. */
export interface LocalModelCatalogEntry {
  readonly capabilities: LocalModelCapabilities
  readonly context: LocalModelContextLimits
  readonly displayName: string
  readonly expectedBytes: number
  readonly format: string
  readonly key: string
  readonly modelId: string
  readonly operations?: ReadonlyArray<ModelOperation>
  readonly publication: LocalModelPublication
  readonly state: LocalModelState
  readonly tokenizer?: ModelTokenizerDescriptor
}

/** An immutable local-model catalog snapshot. */
export interface LocalModelCatalogSnapshot {
  readonly models: ReadonlyArray<LocalModelCatalogEntry>
  readonly revision: number
}

/** Serializable phases emitted while a local model is being provisioned. */
export type LocalModelProvisionPhase =
  "checking" | "downloading" | "verifying" | "committing"

/** A serializable, path-free local-model provisioning update. */
export interface LocalModelProvisionProgress {
  readonly completedBytes: number
  readonly modelKey: string
  readonly phase: LocalModelProvisionPhase
  readonly totalBytes: number
}

export type LocalModelCatalogListener = (
  snapshot: LocalModelCatalogSnapshot,
) => void
export type LocalModelProgressListener = (
  progress: LocalModelProvisionProgress,
) => void

/**
 * Optional host-facing local-model control capability.
 *
 * Implementations publish deeply immutable snapshots and invoke `subscribe`
 * synchronously with the current snapshot. Provisioning results and progress
 * never contain filesystem paths or download sources.
 */
export interface LocalModelControl {
  ensure(
    modelKey: string,
    signal: AbortSignal,
    onProgress?: LocalModelProgressListener,
  ): Promise<LocalModelCatalogEntry>
  list(): LocalModelCatalogSnapshot
  subscribe(listener: LocalModelCatalogListener): ProviderUnsubscribe
}

/**
 * The host-facing provider boundary.
 *
 * Status and topology values are deeply readonly snapshots: implementations
 * must not mutate a value after returning or publishing it. `subscribe`
 * synchronously publishes the current topology before returning its idempotent
 * unsubscribe function. `dispose` is asynchronous and idempotent; once it has
 * resolved, no subscribed listener may be called again.
 */
export interface ProviderGateway {
  /** Present only when the active provider host exposes local-model control. */
  readonly localModels?: LocalModelControl | undefined
  /** Present when the provider host exposes normalized execution topology. */
  readonly modelTopology?: ModelTopologyService | undefined
  dispatch(dispatch: ProviderDispatch): Promise<Response>
  dispose(): Promise<void>
  getStatus(provider: string): ProviderStatus | undefined
  listStatuses(): ReadonlyArray<ProviderStatus>
  subscribe(listener: ProviderTopologyListener): ProviderUnsubscribe
}
