import type {
  SetupApproval,
  SetupPlan,
} from "@maximal/maximal-core-contract/control"

import {
  LOCAL_MODEL_EXPLORATION_SCHEMA_VERSION,
  SetupApprovalSchema,
  SetupPlanSchema,
} from "@maximal/maximal-core-contract/control"

import { computeSetupPlanDigest } from "~/lib/local-model-setup/digest"

/**
 * Recomputes the plan digest. A stored plan whose contents no longer match
 * its digest is refused, whatever the approval says.
 */
export function assertPlanIntact(plan: SetupPlan): void {
  const { digest, ...body } = SetupPlanSchema.parse(plan)
  if (computeSetupPlanDigest(body) !== digest) {
    throw new TypeError(
      `Setup plan "${plan.id}" does not match its digest; it cannot be approved or run.`,
    )
  }
}

/** Records consent for exactly this plan and its digest. */
export function createSetupApproval(input: {
  readonly approvedAt: string
  readonly id: string
  readonly plan: SetupPlan
}): SetupApproval {
  assertPlanIntact(input.plan)
  return SetupApprovalSchema.parse({
    approvedAt: input.approvedAt,
    id: input.id,
    planDigest: input.plan.digest,
    planId: input.plan.id,
    schemaVersion: LOCAL_MODEL_EXPLORATION_SCHEMA_VERSION,
  })
}

/**
 * Refuses an approval that does not cover this plan's identity and digest.
 * A changed plan always needs a new approval.
 */
export function assertApprovalCoversPlan(
  plan: SetupPlan,
  approval: SetupApproval,
): void {
  assertPlanIntact(plan)
  const validated = SetupApprovalSchema.parse(approval)
  if (validated.planId !== plan.id || validated.planDigest !== plan.digest) {
    throw new TypeError(
      `Approval "${approval.id}" does not cover plan "${plan.id}"; a changed plan needs a new approval.`,
    )
  }
}
