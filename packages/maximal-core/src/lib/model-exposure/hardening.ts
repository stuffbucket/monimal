import type {
  ServingHardeningBinding,
  ServingHardeningDecision,
  ServingHardeningIssue,
} from "@maximal/maximal-core-contract/control"

import {
  SERVING_HARDENING_CONTROLS,
  ServingHardeningBindingSchema,
  ServingHardeningDecisionSchema,
  ServingHardeningReportSchema,
} from "@maximal/maximal-core-contract/control"

export interface SharingHardeningGateOptions {
  /**
   * Must authenticate the inspector/report, including integrity and revocation,
   * before returning evidence. Never wire this to a browser-supplied report or
   * a discovered server's self-description. Return undefined if no trusted
   * report exists for the authoritative deployment.
   */
  readTrustedReport(binding: ServingHardeningBinding): Promise<unknown>
  /** Consult current policy on every action so inspector revocation takes effect. */
  isTrustedInspector(inspectorId: string): boolean
  /** Explicit policy, never inferred from a report's self-selected expiry. */
  maxEvidenceAgeMs: number
  now?: () => number
}

function sameDeployment(
  left: ServingHardeningBinding,
  right: ServingHardeningBinding,
): boolean {
  return (
    left.targetId === right.targetId
    && left.deploymentRevision === right.deploymentRevision
    && left.runtimeDigest === right.runtimeDigest
    && left.configurationDigest === right.configurationDigest
    && left.ingressPolicyDigest === right.ingressPolicyDigest
    && left.egressPolicyDigest === right.egressPolicyDigest
    && JSON.stringify([...left.artifactDigests].sort())
      === JSON.stringify([...right.artifactDigests].sort())
  )
}

function blocked(
  issues: ReadonlyArray<ServingHardeningIssue>,
): ServingHardeningDecision {
  return ServingHardeningDecisionSchema.parse({ state: "blocked", issues })
}

export class ServingHardeningError extends Error {
  readonly decision: ServingHardeningDecision

  constructor(decision: ServingHardeningDecision) {
    super(
      "Serving hardening checks did not pass. Review the blocking controls before exposure.",
    )
    this.name = "ServingHardeningError"
    this.decision = decision
  }
}

/**
 * Precondition for future sharing/re-exposure control operations, not permission
 * to share. Callers must separately enforce policy, ownership, and user consent.
 * The binding must come from current authoritative deployment state, not RPC
 * input. Check while holding that deployment's lifecycle lock immediately before
 * opening/renewing ingress; never cache a successful decision as standing consent.
 */
export function createSharingHardeningGate(
  options: SharingHardeningGateOptions,
) {
  const maxEvidenceAgeMs = options.maxEvidenceAgeMs
  if (!Number.isSafeInteger(maxEvidenceAgeMs) || maxEvidenceAgeMs <= 0) {
    throw new TypeError("A positive, explicit evidence age limit is required.")
  }
  const now = options.now ?? Date.now

  async function check(
    value: ServingHardeningBinding,
  ): Promise<ServingHardeningDecision> {
    const binding = ServingHardeningBindingSchema.parse(value)
    let raw: unknown
    try {
      raw = await options.readTrustedReport(binding)
    } catch {
      return blocked([{ kind: "inspection-unavailable" }])
    }
    if (raw === undefined || raw === null)
      return blocked([{ kind: "missing-report" }])
    const parsed = ServingHardeningReportSchema.safeParse(raw)
    if (!parsed.success) return blocked([{ kind: "invalid-report" }])
    const report = parsed.data
    try {
      if (!options.isTrustedInspector(report.inspectorId)) {
        return blocked([{ kind: "untrusted-inspector" }])
      }
    } catch {
      return blocked([{ kind: "inspection-unavailable" }])
    }
    if (!sameDeployment(binding, report.binding)) {
      return blocked([{ kind: "deployment-changed" }])
    }
    const observedAt = Date.parse(report.observedAt)
    const expiresAt = Date.parse(report.expiresAt)
    const checkedAt = now()
    if (
      ![observedAt, expiresAt, checkedAt].every((value) =>
        Number.isFinite(value),
      )
      || expiresAt <= observedAt
    ) {
      return blocked([{ kind: "invalid-report" }])
    }
    if (observedAt > checkedAt) return blocked([{ kind: "future-report" }])
    if (expiresAt <= checkedAt || observedAt + maxEvidenceAgeMs <= checkedAt) {
      return blocked([{ kind: "stale-report" }])
    }
    const issues: Array<ServingHardeningIssue> = []
    for (const control of SERVING_HARDENING_CONTROLS) {
      const state = report.controls[control]
      if (state !== "pass") issues.push({ kind: "control", control, state })
    }
    if (issues.length > 0) return blocked(issues)
    return ServingHardeningDecisionSchema.parse({
      state: "checks-passed",
      reportId: report.id,
      expiresAt: new Date(
        Math.min(expiresAt, observedAt + maxEvidenceAgeMs),
      ).toISOString(),
    })
  }

  return Object.freeze({
    check,
    async require(binding: ServingHardeningBinding) {
      const decision = await check(binding)
      if (decision.state !== "checks-passed")
        throw new ServingHardeningError(decision)
      return decision
    },
  })
}
