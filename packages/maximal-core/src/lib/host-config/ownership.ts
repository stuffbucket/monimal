import type {
  DisconnectTargetResult,
  RuntimeIdentity,
  RuntimeIdentityProbe,
  TargetClaim,
} from "~/lib/host-config/types"

import { sameRuntimeIdentity } from "~/lib/host-config/runtime-identity"

const configuratorIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u

export interface OwnerIdentity {
  configuratorId: string
  runtime: RuntimeIdentity
}

export interface OwnershipOptions extends OwnerIdentity {
  probeRuntime: RuntimeIdentityProbe
}

interface OwnershipConflict {
  status: "owned-by-another-configurator" | "stale-recovery-required"
  claim: TargetClaim
}

interface ConnectOwnership {
  stale: boolean
  conflict?: OwnershipConflict
}

export function validateConfiguratorId(id: string): void {
  if (!configuratorIdPattern.test(id)) {
    throw new Error(`Invalid configurator id: ${id}`)
  }
}

export async function runtimeOwnership(
  claim: TargetClaim,
  runtime: RuntimeIdentity,
  probeRuntime: RuntimeIdentityProbe,
): Promise<"current" | "live-other" | "stale"> {
  if (sameRuntimeIdentity(claim.runtime, runtime)) return "current"
  return (await probeRuntime(claim.runtime)) ? "live-other" : "stale"
}

export async function connectOwnership(
  claim: TargetClaim,
  options: OwnershipOptions,
): Promise<ConnectOwnership> {
  const ownership = await runtimeOwnership(
    claim,
    options.runtime,
    options.probeRuntime,
  )
  if (ownership === "live-other") {
    return {
      stale: false,
      conflict: { status: "owned-by-another-configurator", claim },
    }
  }
  return { stale: ownership === "stale" }
}

export async function activeOwnershipConflict(
  claim: TargetClaim,
  options: OwnershipOptions,
): Promise<OwnershipConflict | null> {
  const ownership = await runtimeOwnership(
    claim,
    options.runtime,
    options.probeRuntime,
  )
  if (ownership !== "current") {
    return {
      status:
        ownership === "live-other" ?
          "owned-by-another-configurator"
        : "stale-recovery-required",
      claim,
    }
  }
  if (claim.configuratorId !== options.configuratorId) {
    return { status: "owned-by-another-configurator", claim }
  }
  return null
}

function claimBelongsTo(
  claim: TargetClaim,
  configuratorId: string,
  runtime: RuntimeIdentity,
): boolean {
  return (
    claim.configuratorId === configuratorId
    && sameRuntimeIdentity(claim.runtime, runtime)
  )
}

export function disconnectClaim(
  claim: TargetClaim | null,
  configuratorId: string,
  runtime: RuntimeIdentity,
): TargetClaim | DisconnectTargetResult {
  if (!claim) return { status: "not-connected", preservedPaths: [] }
  if (!claimBelongsTo(claim, configuratorId, runtime)) {
    return { status: "owned-by-another-configurator", preservedPaths: [] }
  }
  return claim
}
