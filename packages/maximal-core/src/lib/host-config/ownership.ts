import type {
  DisconnectTargetResult,
  InspectTargetResult,
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

type ImmediateOwnership = OwnershipConflict | "foreign-runtime" | null

type ClaimInspection =
  { result: InspectTargetResult | TargetClaim } | { claim: TargetClaim }

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

export function immediateOwnership(
  claim: TargetClaim,
  owner: OwnerIdentity,
): ImmediateOwnership {
  if (!sameRuntimeIdentity(claim.runtime, owner.runtime)) {
    return "foreign-runtime"
  }
  if (claim.configuratorId !== owner.configuratorId) {
    return { status: "owned-by-another-configurator", claim }
  }
  return null
}

export function inspectClaimOwnership(
  claim: TargetClaim | null,
  owner: OwnerIdentity,
): ClaimInspection {
  if (!claim) return { result: { status: "available" } }
  const ownership = immediateOwnership(claim, owner)
  if (ownership === "foreign-runtime") return { result: claim }
  if (ownership) return { result: ownership }
  return { claim }
}

export async function inspectUnlockedOwnership(
  claim: TargetClaim | null,
  recoveryPending: boolean,
  options: OwnershipOptions,
): Promise<InspectTargetResult | null> {
  if (!claim) {
    return recoveryPending ? null : { status: "available" }
  }
  if (immediateOwnership(claim, options) !== "foreign-runtime") {
    return null
  }
  return resolveInspection(claim, options)
}

export async function resolveInspection(
  inspected: InspectTargetResult | TargetClaim,
  options: OwnershipOptions,
): Promise<InspectTargetResult> {
  if ("status" in inspected) return inspected
  const ownership = await runtimeOwnership(
    inspected,
    options.runtime,
    options.probeRuntime,
  )
  return {
    status:
      ownership === "live-other" ?
        "owned-by-another-configurator"
      : "stale-recovery-required",
    claim: inspected,
  }
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

export function disconnectUnlocked(
  claim: TargetClaim | null,
  recoveryPending: boolean,
): DisconnectTargetResult | null {
  return !claim && !recoveryPending ?
      { status: "not-connected", preservedPaths: [] }
    : null
}
