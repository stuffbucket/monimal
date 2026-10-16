import type {
  SetupApproval,
  SetupOperation,
  SetupPlan,
} from "@maximal/maximal-core-contract/control"

import {
  LOCAL_MODEL_EXPLORATION_SCHEMA_VERSION,
  SetupOperationSchema,
} from "@maximal/maximal-core-contract/control"

import { assertApprovalCoversPlan } from "~/lib/local-model-setup/approval"

/** Starts a queued setup operation for an approved plan. */
export function createSetupOperation(input: {
  readonly approval: SetupApproval
  readonly id: string
  readonly plan: SetupPlan
  readonly revision: number
}): SetupOperation {
  assertApprovalCoversPlan(input.plan, input.approval)
  const operation: SetupOperation = {
    approvalId: input.approval.id,
    id: input.id,
    ownedWorkerIds: [],
    planId: input.plan.id,
    revision: input.revision,
    schemaVersion: LOCAL_MODEL_EXPLORATION_SCHEMA_VERSION,
    state: "queued",
    stepIndex: 0,
  }
  return SetupOperationSchema.parse(operation)
}
