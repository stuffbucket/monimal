export {
  createDshHost,
  DshHost,
  type DshHostOptions,
  type DshHostReconcileInput,
  type DshHostReconcileResult,
  startDshHost,
} from "./host.ts"
export {
  type ActivationEntry,
  type ActivationSnapshot,
  type ActivationSource,
  type ExternalProfileDocument,
  type ProfilePlugin,
  type ProfileService,
  ProfileValidationError,
  RestartRequiredError,
} from "./profile.ts"
export type {
  ProviderDiagnostic,
  ProviderDispatch,
  ProviderGateway,
  ProviderOperation,
  ProviderStatus,
  ProviderStatusState,
  ProviderTopology,
  ProviderTopologyListener,
  ProviderUnsubscribe,
} from "@stuffbucket/maximal-provider-contract"

/**
 * Trust boundary: profile packages execute in-process with the embedding
 * process's authority. Cordis disposes resources registered in its scope, but
 * cannot recover timers, listeners, or other ambient resources a plugin leaks
 * outside that scope.
 */
export const DSH_HOST_TRUST_LIMITATION =
  "External profile packages are trusted in-process code; resources leaked outside Cordis scope cannot be recovered by the host."
