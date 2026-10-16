import type {
  DeviceAssessment,
  ModelCandidate,
  SetupPlan,
  SetupStep,
} from "@maximal/maximal-core-contract/control"

import {
  DeviceAssessmentSchema,
  LOCAL_MODEL_EXPLORATION_SCHEMA_VERSION,
  ModelCandidateSchema,
  SetupPlanSchema,
  SetupStepSchema,
} from "@maximal/maximal-core-contract/control"

import { computeSetupPlanDigest } from "~/lib/local-model-setup/digest"

export interface CreateSetupPlanInput {
  readonly assessment: DeviceAssessment
  readonly candidate: ModelCandidate
  readonly id: string
  readonly steps: ReadonlyArray<SetupStep>
  readonly storeId: string
}

function assertCandidateFits(
  candidate: ModelCandidate,
  assessment: DeviceAssessment,
): void {
  if (candidate.eligibility.state === "blocked") {
    throw new TypeError(
      `Candidate "${candidate.id}" is blocked (${candidate.eligibility.reason}) and cannot be set up.`,
    )
  }
  if (assessment.candidateId !== candidate.id) {
    throw new TypeError(
      `Assessment "${assessment.id}" does not belong to candidate "${candidate.id}".`,
    )
  }
  if (assessment.fit === "unsupported") {
    throw new TypeError(
      `Candidate "${candidate.id}" is unsupported on this device (${assessment.reason}); setup is not offered.`,
    )
  }
}

function validateSteps(
  candidate: ModelCandidate,
  steps: ReadonlyArray<SetupStep>,
): ReadonlySet<string> {
  if (steps.length === 0) throw new TypeError("Setup plan has no steps.")
  const declared = new Set(candidate.files.map((file) => file.digest))
  const downloaded = new Set<string>()
  const verified = new Set<string>()
  let executionStarted = false

  for (const step of steps) {
    if (step.kind === "download-file" || step.kind === "verify-file") {
      if (!declared.has(step.digest)) {
        throw new TypeError(
          `Setup plan names a file that candidate "${candidate.id}" does not declare.`,
        )
      }
      if (executionStarted) {
        throw new TypeError("File steps must precede runtime execution steps.")
      }
      if (step.kind === "download-file") {
        downloaded.add(step.digest)
        verified.delete(step.digest)
      } else {
        verified.add(step.digest)
      }
      continue
    }
    if (
      step.kind === "activate-runtime"
      && step.runtimeId !== candidate.runtime.id
    ) {
      throw new TypeError(
        "Setup step runtime does not match the candidate runtime.",
      )
    }
    if (
      step.kind === "test-operation"
      && !candidate.operations.includes(step.operation)
    ) {
      throw new TypeError(
        "Setup step operation is not supported by the candidate.",
      )
    }
    if (verified.size !== declared.size) {
      throw new TypeError(
        "All model files must be verified before runtime execution.",
      )
    }
    executionStarted = true
  }
  if ([...downloaded].some((digest) => !verified.has(digest))) {
    throw new TypeError(
      "Every downloaded file must be verified after its download.",
    )
  }
  return downloaded
}

/**
 * Snapshots validated input and binds the exact model, files, and runtime
 * package to the digest. Runtime approval is still checked by the executor;
 * a digest is integrity evidence, not policy authorization.
 */
export function createSetupPlan(input: CreateSetupPlanInput): SetupPlan {
  const candidate = ModelCandidateSchema.parse(input.candidate)
  const assessment = DeviceAssessmentSchema.parse(input.assessment)
  const steps = input.steps.map((step) => SetupStepSchema.parse(step))
  assertCandidateFits(candidate, assessment)
  const downloaded = validateSteps(candidate, steps)
  const body = {
    candidateId: candidate.id,
    deviceAssessmentId: assessment.id,
    downloadBytes: candidate.files.reduce(
      (total, file) =>
        downloaded.has(file.digest) ? total + file.sizeBytes : total,
      0,
    ),
    files: candidate.files,
    id: input.id,
    modelId: candidate.modelId,
    runtime: candidate.runtime,
    schemaVersion: LOCAL_MODEL_EXPLORATION_SCHEMA_VERSION,
    sourceId: candidate.sourceId,
    steps,
    storeId: input.storeId,
    variantId: candidate.variantId,
  }
  return SetupPlanSchema.parse({
    ...body,
    digest: computeSetupPlanDigest(body),
  })
}
