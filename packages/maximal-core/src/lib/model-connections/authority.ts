/** Trusted host callbacks; these types are not a control-plane authorization API. */
import type {
  ConnectionDescriptor,
  ModelConnectionBinding,
  ModelConnectionReview,
  ModelConnectionSelection,
} from "@maximal/maximal-core-contract/control"

/**
 * Host-owned transaction under the authoritative deployment/configuration lock.
 * The host must read current policy, installed runtime content, transport, and
 * credential-destination scope without sending credentials or probing inference.
 * Nothing in this transaction may install code, change provider mode, or share.
 */
export interface ModelConnectionTransaction {
  readonly binding: ModelConnectionBinding
  /**
   * Atomically persist only this reviewed connection while the same lock is
   * held. Use review.id as an idempotency key; preserve unrelated settings and
   * advance the authoritative deployment/configuration revision before releasing
   * the lock so other outstanding reviews cannot commit the old revision.
   * Only here may the host release a credential, and only to the exact bound
   * destination. Return credential-free external-client descriptors, never keys.
   * A rejected/uncertain commit must not be retried automatically.
   */
  commit(
    review: ModelConnectionReview,
  ): Promise<ReadonlyArray<ConnectionDescriptor>>
}

/**
 * Injected by trusted host composition, never by a control request or plugin
 * self-report. A host without BOTH transaction and outside-agent consent must
 * not supply this authority and must report reviewed connections unsupported.
 */
export interface ModelConnectionAuthority {
  withCandidate<T>(
    selection: ModelConnectionSelection,
    action: (transaction: ModelConnectionTransaction) => Promise<T> | T,
  ): Promise<T>
  /**
   * Obtain fresh user consent outside the agent (for example a native review
   * dialog) for this complete immutable review. A renderer approval boolean,
   * agent message, or stored plan record is not an implementation of consent.
   * Honor cancellation. Do not persist or send credentials during this call.
   */
  requestConsent(
    review: ModelConnectionReview,
    signal: AbortSignal,
  ): Promise<"approved" | "declined">
}
