import type {
  ConnectionDescriptor,
  ModelConnectionReview,
  ModelConnectionSelection,
  ModelConnectionSnapshot,
} from "@maximal/maximal-core-contract/control"

import {
  ConnectionDescriptorSchema,
  ModelConnectionActionSchema,
  ModelConnectionSnapshotSchema,
} from "@maximal/maximal-core-contract/control"

import type { ModelConnectionAuthority } from "~/lib/model-connections/authority"

import {
  assertConnectionReviewCurrent,
  createConnectionReview,
} from "~/lib/model-connections/review"

interface Job {
  readonly controller: AbortController
  snapshot: ModelConnectionSnapshot & {
    review: ModelConnectionReview
    id: string
  }
}

const MAX_REVIEWS = 32
const unavailableMessage =
  "Reviewed connections require a trusted installed-runtime, credential-destination, policy, and outside-agent consent authority. This host does not provide one; existing providers are unchanged."

function description(available: boolean): ModelConnectionSnapshot {
  return {
    schemaVersion: 1,
    id: null,
    revision: 0,
    state: available ? "available" : "unsupported",
    review: null,
    connections: [],
    message: available ? null : unavailableMessage,
  }
}

function connectionDescriptors(
  review: ModelConnectionReview,
  input: ReadonlyArray<ConnectionDescriptor>,
): Array<ConnectionDescriptor> {
  const descriptors = input.map((value) =>
    ConnectionDescriptorSchema.parse(value),
  )
  const targets = new Set(review.binding.models.map(({ targetId }) => targetId))
  if (
    descriptors.length !== targets.size
    || new Set(descriptors.map(({ targetId }) => targetId)).size
      !== targets.size
  ) {
    throw new Error("Connection descriptors do not match the reviewed targets.")
  }
  for (const descriptor of descriptors) {
    if (
      !targets.has(descriptor.targetId)
      || descriptor.operations.length === 0
      || descriptor.operations.some(
        (operation) => !review.binding.operations.includes(operation),
      )
    ) {
      throw new Error("Connection descriptors exceed the reviewed operations.")
    }
  }
  return descriptors
}

/**
 * One server's bounded, single-use reviewed-connection state. Neither RPC input
 * nor a review digest is consent. The host asks the user outside the agent,
 * then rereads and commits under its authoritative lifecycle/configuration lock.
 * No authority means unsupported, never a successful empty connection list.
 */
export class ModelConnectionControl {
  readonly #authority: ModelConnectionAuthority | undefined
  readonly #now: () => number
  readonly #onCommitSettled: () => void
  readonly #jobs = new Map<string, Job>()
  #preparing = 0
  #disposed = false

  constructor(
    authority?: ModelConnectionAuthority,
    now: () => number = Date.now,
    onCommitSettled: () => void = () => undefined,
  ) {
    this.#authority = authority
    this.#now = now
    this.#onCommitSettled = onCommitSettled
  }

  async act(input: unknown): Promise<ModelConnectionSnapshot> {
    const request = ModelConnectionActionSchema.parse(input)
    if (this.#disposed) throw new Error("Reviewed connections are stopped.")
    const authority = this.#authority
    if (!authority) return description(false)
    if (request.action === "describe") return description(true)
    if (request.action === "review")
      return this.#review(authority, request.selection)
    const job = this.#jobs.get(request.id)
    if (!job || job.snapshot.review.digest !== request.digest) {
      throw new Error(
        "This connection review is unavailable or changed. Review the deployment again.",
      )
    }
    this.#expire(job)
    if (request.action === "cancel") this.#cancel(job)
    if (request.action === "connect" && job.snapshot.state === "reviewed") {
      await this.#connect(authority, job)
    }
    return this.#snapshot(job)
  }

  dispose(): void {
    this.#disposed = true
    for (const job of this.#jobs.values()) this.#cancel(job)
  }

  #snapshot(job: Job): ModelConnectionSnapshot {
    // Return detached descriptors and immutable review records, not held state.
    return ModelConnectionSnapshotSchema.parse(job.snapshot)
  }

  #change(
    job: Job,
    state: ModelConnectionSnapshot["state"],
    message: string | null,
  ): void {
    job.snapshot = {
      ...job.snapshot,
      revision: job.snapshot.revision + 1,
      state,
      message,
      connections: [],
    }
  }

  #expire(job: Job): void {
    if (
      (job.snapshot.state === "reviewed"
        || job.snapshot.state === "awaiting-consent")
      && Date.parse(job.snapshot.review.expiresAt) <= this.#now()
    ) {
      this.#change(
        job,
        "invalidated",
        "The connection review expired. Refresh discovery and review again.",
      )
      job.controller.abort()
    }
  }

  #cancel(job: Job): void {
    if (
      job.snapshot.state !== "reviewed"
      && job.snapshot.state !== "awaiting-consent"
    )
      return
    this.#change(
      job,
      "cancelled",
      "Connection cancelled before persistence. Existing providers are unchanged.",
    )
    job.controller.abort()
    // Once committing, persistence is the linearization boundary: cancellation
    // cannot claim to undo a connection or race a host's atomic settings write.
  }

  async #review(
    authority: ModelConnectionAuthority,
    selection: ModelConnectionSelection,
  ): Promise<ModelConnectionSnapshot> {
    for (const [id, job] of this.#jobs) {
      this.#expire(job)
      if (this.#jobs.size + this.#preparing < MAX_REVIEWS) break
      if (
        !["awaiting-consent", "connecting", "reviewed"].includes(
          job.snapshot.state,
        )
      )
        this.#jobs.delete(id)
    }
    if (this.#jobs.size + this.#preparing >= MAX_REVIEWS)
      throw new Error(
        "Too many connection reviews. Cancel an existing review first.",
      )
    this.#preparing += 1
    try {
      const review = await authority.withCandidate(selection, (transaction) =>
        createConnectionReview(transaction.binding, selection, this.#now()),
      )
      if (this.#disposed) throw new Error("Reviewed connections are stopped.")
      const job: Job = {
        controller: new AbortController(),
        snapshot: {
          ...description(true),
          id: review.id,
          review,
          revision: 1,
          state: "reviewed",
        },
      }
      this.#jobs.set(review.id, job)
      return this.#snapshot(job)
    } catch {
      // A backend/schema exception may contain rejected config or secrets.
      throw new Error(
        "Connection review is unavailable. Check current policy, installed runtime, transport, credential scope, and discovery freshness; existing providers are unchanged.",
      )
    } finally {
      this.#preparing -= 1
    }
  }

  async #connect(authority: ModelConnectionAuthority, job: Job): Promise<void> {
    this.#change(
      job,
      "awaiting-consent",
      "Waiting for the trusted host to obtain user consent for this exact review.",
    )
    try {
      const decision = await authority.requestConsent(
        job.snapshot.review,
        job.controller.signal,
      )
      this.#expire(job)
      if (
        job.snapshot.state !== "awaiting-consent"
        || job.controller.signal.aborted
      )
        return
      if (decision !== "approved") {
        this.#change(
          job,
          "declined",
          "Connection was not approved. Existing providers are unchanged.",
        )
        return
      }
      await this.#commit(authority, job)
    } catch {
      if (
        job.snapshot.state === "awaiting-consent"
        || job.snapshot.state === "connecting"
      ) {
        this.#change(
          job,
          "failed",
          "Connection was not confirmed. Inspect the host's connection state before creating a new review; this operation will not retry automatically.",
        )
      }
    }
  }

  async #commit(authority: ModelConnectionAuthority, job: Job): Promise<void> {
    const review = job.snapshot.review
    await authority.withCandidate(
      review.binding.selection,
      async (transaction) => {
        this.#expire(job)
        if (
          job.snapshot.state !== "awaiting-consent"
          || job.controller.signal.aborted
        )
          return
        try {
          assertConnectionReviewCurrent(
            review,
            transaction.binding,
            this.#now(),
          )
        } catch {
          this.#change(
            job,
            "invalidated",
            "The reviewed deployment, runtime, policy, mode, transport, or credential scope changed. Review again before connecting.",
          )
          return
        }
        this.#change(
          job,
          "connecting",
          "Committing the reviewed connection. Cancellation can no longer undo this operation.",
        )
        let result: ReadonlyArray<ConnectionDescriptor>
        try {
          result = await transaction.commit(review)
        } finally {
          // Even a rejected commit may have persisted. Refresh inventory rather
          // than reusing a pre-commit catalog or inferring success from an error.
          try {
            this.#onCommitSettled()
          } catch {
            // Ancillary invalidation cannot determine the persistence outcome.
          }
        }
        const descriptors = connectionDescriptors(review, result)
        this.#change(
          job,
          "connected",
          "Connection persisted. This does not load models, establish serving isolation, or enable sharing.",
        )
        job.snapshot = { ...job.snapshot, connections: descriptors }
      },
    )
  }
}
