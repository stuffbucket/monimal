/** An HTTP operation a provider can serve through the gateway. */
export type ProviderOperation = "messages" | "count-tokens" | "models"

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
  readonly publication: LocalModelPublication
  readonly state: LocalModelState
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
  dispatch(dispatch: ProviderDispatch): Promise<Response>
  dispose(): Promise<void>
  getStatus(provider: string): ProviderStatus | undefined
  listStatuses(): ReadonlyArray<ProviderStatus>
  subscribe(listener: ProviderTopologyListener): ProviderUnsubscribe
}
