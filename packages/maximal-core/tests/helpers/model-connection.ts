import type {
  ConnectionDescriptor,
  ModelConnectionBinding,
  ModelConnectionReview,
  ModelConnectionSelection,
} from "@maximal/maximal-core-contract/control"

import type {
  ModelConnectionAuthority,
  ModelConnectionTransaction,
} from "~/lib/model-connections/authority"

import { AsyncMutex } from "~/lib/live/mutex"

export const connectionNow = Date.parse("2026-10-24T00:00:00Z")

export function connectionBinding(): ModelConnectionBinding {
  const origin = "https://deployment.example.test"
  return {
    schemaVersion: 1,
    selection: {
      discoveryId: "discovery-1",
      endpointId: "endpoint-1",
      runtimeId: "vllm",
      modelIds: ["served-alias"],
      location: "lan",
      credentialId: "upstream-credential",
    },
    deploymentId: "perun-deployment",
    deploymentRevision: "deployment-revision-1",
    provider: "perun",
    endpoint: { id: "endpoint-1", url: origin },
    runnerId: "vllm-worker",
    runtime: {
      id: "vllm",
      packageId: "@maximal/vllm",
      revision: "0.1.0",
      digest: `sha256:${"a".repeat(64)}`,
    },
    models: [{ id: "served-alias", targetId: "perun-target" }],
    operations: ["messages"],
    auth: { kind: "credential-reference", credentialId: "upstream-credential" },
    credentialDestination: origin,
    transport: "tls",
    providerMode: "plugins",
    requiredProviderMode: "plugins",
    runtimeState: "installed",
    policy: { state: "allowed", revision: "policy-1" },
    observedAt: new Date(connectionNow).toISOString(),
    expiresAt: new Date(connectionNow + 60_000).toISOString(),
  }
}

/** Simulated host; assertions must not count this as native consent or LAN acceptance. */
export class ConnectionAuthorityFixture implements ModelConnectionAuthority {
  binding = connectionBinding()
  now = connectionNow
  readonly consentReviews: Array<ModelConnectionReview> = []
  readonly persisted: Array<ModelConnectionReview> = []
  readonly selections: Array<ModelConnectionSelection> = []
  readonly mutex = new AsyncMutex()
  inTransaction = false
  commitCalls = 0
  failAfterPersist = false
  consent: (
    review: ModelConnectionReview,
    signal: AbortSignal,
  ) => Promise<"approved" | "declined"> = () => Promise.resolve("approved")
  beforeCommit: () => Promise<void> = () => Promise.resolve()

  withCandidate<T>(
    selection: ModelConnectionSelection,
    action: (transaction: ModelConnectionTransaction) => Promise<T> | T,
  ): Promise<T> {
    return this.mutex.runExclusive(async () => {
      this.selections.push(selection)
      this.inTransaction = true
      try {
        return await action({
          binding: this.binding,
          commit: (review) => this.#commit(review),
        })
      } finally {
        this.inTransaction = false
      }
    })
  }

  requestConsent(
    review: ModelConnectionReview,
    signal: AbortSignal,
  ): Promise<"approved" | "declined"> {
    if (this.inTransaction)
      throw new Error("Do not hold the deployment lock during user consent")
    this.consentReviews.push(review)
    return this.consent(review, signal)
  }

  async #commit(
    review: ModelConnectionReview,
  ): Promise<ReadonlyArray<ConnectionDescriptor>> {
    if (!this.inTransaction) throw new Error("No authoritative transaction")
    this.commitCalls++
    await this.beforeCommit()
    this.persisted.push(review)
    this.binding = {
      ...this.binding,
      deploymentRevision: `committed-${review.id}`,
    }
    if (this.failAfterPersist) throw new Error("untrusted-secret-from-host")
    return review.binding.models.map(({ targetId }) => ({
      schemaVersion: 1,
      id: `connection-${targetId}`,
      targetId,
      endpoint: {
        id: "maximal-proxy",
        url: "https://proxy.example.test/perun/v1",
      },
      operations: ["messages"],
      auth: {
        kind: "credential-reference",
        credentialId: "maximal-client-key",
      },
      manualSteps: ["Use the provider-qualified proxy endpoint."],
    }))
  }
}
