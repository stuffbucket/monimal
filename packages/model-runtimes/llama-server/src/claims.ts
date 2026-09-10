import type {
  LocalModelLease,
  LocalModelRunnerDescriptor,
} from "@stuffbucket/local-model-registry"

export interface LocalModelClaimer {
  claim(modelKey: string, runner: LocalModelRunnerDescriptor): LocalModelLease
}

export interface ClaimedModel {
  readonly provider: string
  readonly lease: LocalModelLease
}

export const llamaServerRunnerDescriptor: LocalModelRunnerDescriptor =
  Object.freeze({
    id: "llama-server",
    formats: Object.freeze(["gguf"]),
    capabilities: Object.freeze({
      input: Object.freeze(["text"]),
      output: Object.freeze(["text", "reasoning", "tool-call"]),
    }),
  })

/** Claim the complete assignment set, releasing every earlier claim on failure. */
export function claimAssignedModels(
  registry: LocalModelClaimer,
  assignments: ReadonlyMap<string, string>,
): ReadonlyArray<ClaimedModel> {
  const claimed: Array<ClaimedModel> = []
  const leases = new Map<string, LocalModelLease>()
  try {
    for (const [provider, modelKey] of assignments) {
      let lease = leases.get(modelKey)
      if (lease === undefined) {
        lease = registry.claim(modelKey, llamaServerRunnerDescriptor)
        leases.set(modelKey, lease)
      }
      claimed.push(Object.freeze({ provider, lease }))
    }
    return Object.freeze(claimed)
  } catch (error) {
    for (const lease of [...leases.values()].reverse()) lease.dispose()
    throw error
  }
}

export function releaseClaimedModels(
  assignments: ReadonlyArray<ClaimedModel>,
): void {
  for (const assignment of assignments) assignment.lease.dispose()
}
