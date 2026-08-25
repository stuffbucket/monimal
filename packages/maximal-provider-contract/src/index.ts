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
  dispatch(dispatch: ProviderDispatch): Promise<Response>
  dispose(): Promise<void>
  getStatus(provider: string): ProviderStatus | undefined
  listStatuses(): ReadonlyArray<ProviderStatus>
  subscribe(listener: ProviderTopologyListener): ProviderUnsubscribe
}
