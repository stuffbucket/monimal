import {
  assertCredentialFreeEndpoint,
  MODEL_OPERATIONS,
} from "@maximal/maximal-model-contract"
import { z } from "zod"

/**
 * Wire records for agent-led local model exploration.
 *
 * Each record is strict, so unknown keys (such as a `command` field) fail to
 * parse. Records carry no credentials, executable commands, filesystem paths,
 * or download URLs. Every record is versioned with `schemaVersion`. Behavior
 * (planning, digests, approvals, operations) lives in maximal-core.
 */

export const LOCAL_MODEL_EXPLORATION_SCHEMA_VERSION = 1 as const

const SchemaVersionSchema = z.literal(LOCAL_MODEL_EXPLORATION_SCHEMA_VERSION)
const IdSchema = z.string().trim().min(1).max(200)
const TimestampSchema = z.iso.datetime({ offset: true })
const ByteCountSchema = z.number().int().nonnegative()
const DigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const OperationSchema = z.enum(MODEL_OPERATIONS)
const UniqueOperationsSchema = z
  .array(OperationSchema)
  .refine((values) => new Set(values).size === values.length, {
    message: "operations must be unique",
  })

/** A user-facing outcome that a gallery card offers. */
export const ExperienceDefinitionSchema = z
  .object({
    capabilities: z
      .object({
        input: z.array(IdSchema).min(1),
        output: z.array(IdSchema).min(1),
      })
      .strict(),
    id: IdSchema,
    outcome: z.string().trim().min(1).max(300),
    requiredOperations: UniqueOperationsSchema,
    schemaVersion: SchemaVersionSchema,
    title: z.string().trim().min(1).max(120),
  })
  .strict()
export type ExperienceDefinition = z.infer<typeof ExperienceDefinitionSchema>

export const AcceleratorKindSchema = z.enum([
  "none",
  "cuda",
  "metal",
  "rocm",
  "vulkan",
  "unknown",
])
export type AcceleratorKind = z.infer<typeof AcceleratorKindSchema>

/** Local hardware facts behind one assessment. Never published. */
export const DeviceProfileSchema = z
  .object({
    accelerator: AcceleratorKindSchema,
    /** Unified memory is reported once, in `memoryBytes`. */
    memoryBytes: ByteCountSchema,
    runtimeVersion: z.string().trim().min(1).max(64).nullable(),
    storageBytesAvailable: ByteCountSchema,
    unifiedMemory: z.boolean(),
  })
  .strict()
export type DeviceProfile = z.infer<typeof DeviceProfileSchema>

export const UnsupportedReasonSchema = z.enum([
  "not-enough-memory",
  "not-enough-storage",
  "no-supported-accelerator",
  "runtime-too-old",
])
export type UnsupportedReason = z.infer<typeof UnsupportedReasonSchema>

const DeviceAssessmentBaseSchema = z.object({
  candidateId: IdSchema,
  device: DeviceProfileSchema,
  id: IdSchema,
  observedAt: TimestampSchema,
  schemaVersion: SchemaVersionSchema,
})

/** An unsupported assessment always carries exactly one reason. */
export const DeviceAssessmentSchema = z.discriminatedUnion("fit", [
  DeviceAssessmentBaseSchema.extend({
    fit: z.enum(["fits", "constrained", "unknown"]),
  }).strict(),
  DeviceAssessmentBaseSchema.extend({
    fit: z.literal("unsupported"),
    reason: UnsupportedReasonSchema,
  }).strict(),
])
export type DeviceAssessment = z.infer<typeof DeviceAssessmentSchema>

export const CandidateBlockReasonSchema = z.enum([
  "policy",
  "license",
  "unsupported-operation",
  "runtime-unavailable",
  "resource-limit",
])
export type CandidateBlockReason = z.infer<typeof CandidateBlockReasonSchema>

export const CandidateEligibilitySchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("eligible") }).strict(),
  z
    .object({
      reason: CandidateBlockReasonSchema,
      state: z.literal("blocked"),
    })
    .strict(),
])
export type CandidateEligibility = z.infer<typeof CandidateEligibilitySchema>

/** A model file, identified by content digest and never by path. */
export const ModelFileReferenceSchema = z
  .object({
    digest: DigestSchema,
    sizeBytes: ByteCountSchema,
  })
  .strict()
  .readonly()
export type ModelFileReference = z.infer<typeof ModelFileReferenceSchema>

const ModelFilesSchema = z
  .array(ModelFileReferenceSchema)
  .min(1)
  .refine(
    (files) => new Set(files.map((file) => file.digest)).size === files.length,
    {
      message: "file digests must be unique",
    },
  )
  .readonly()

/** A reviewed runtime package pinned to immutable content, not a release tag. */
export const SetupRuntimeReferenceSchema = z
  .object({
    digest: DigestSchema,
    id: IdSchema,
    packageId: IdSchema,
    revision: IdSchema,
  })
  .strict()
  .readonly()
export type SetupRuntimeReference = z.infer<typeof SetupRuntimeReferenceSchema>

/** One exact model variant that could serve an experience. */
export const ModelCandidateSchema = z
  .object({
    approvalRequired: z.boolean(),
    eligibility: CandidateEligibilitySchema,
    experienceId: IdSchema,
    files: ModelFilesSchema,
    id: IdSchema,
    location: z.enum(["device", "lan", "cloud"]),
    modelId: IdSchema,
    operations: UniqueOperationsSchema,
    runtime: SetupRuntimeReferenceSchema,
    schemaVersion: SchemaVersionSchema,
    /** An approved source identifier. Source URLs are never stored here. */
    sourceId: IdSchema,
    variantId: IdSchema,
  })
  .strict()
  .readonly()
export type ModelCandidate = z.infer<typeof ModelCandidateSchema>

/** A fixed, checked setup step. Steps never carry commands. */
export const SetupStepSchema = z
  .discriminatedUnion("kind", [
    z
      .object({ digest: DigestSchema, kind: z.literal("download-file") })
      .strict(),
    z.object({ digest: DigestSchema, kind: z.literal("verify-file") }).strict(),
    z
      .object({ kind: z.literal("activate-runtime"), runtimeId: IdSchema })
      .strict(),
    z
      .object({ deploymentId: IdSchema, kind: z.literal("start-deployment") })
      .strict(),
    z
      .object({ kind: z.literal("test-operation"), operation: OperationSchema })
      .strict(),
  ])
  .readonly()
export type SetupStep = z.infer<typeof SetupStepSchema>

/**
 * A reviewed, path-free setup plan. It carries every fact the user approves
 * (source, download size, destination, steps), so the digest covers them all.
 */
export const SetupPlanSchema = z
  .object({
    candidateId: IdSchema,
    deviceAssessmentId: IdSchema,
    /** Content hash of the plan without this field. Core recomputes it. */
    digest: DigestSchema,
    downloadBytes: ByteCountSchema,
    files: ModelFilesSchema,
    id: IdSchema,
    modelId: IdSchema,
    runtime: SetupRuntimeReferenceSchema,
    schemaVersion: SchemaVersionSchema,
    sourceId: IdSchema,
    steps: z.array(SetupStepSchema).min(1).readonly(),
    storeId: IdSchema,
    variantId: IdSchema,
  })
  .strict()
  .readonly()
export type SetupPlan = z.infer<typeof SetupPlanSchema>

/** Consent for one exact plan. A changed plan needs a new approval. */
export const SetupApprovalSchema = z
  .object({
    approvedAt: TimestampSchema,
    id: IdSchema,
    planDigest: DigestSchema,
    planId: IdSchema,
    schemaVersion: SchemaVersionSchema,
  })
  .strict()
  .readonly()
export type SetupApproval = z.infer<typeof SetupApprovalSchema>

export const SetupErrorCodeSchema = z.enum([
  "download-failed",
  "verification-failed",
  "activation-failed",
  "start-failed",
  "test-failed",
])
export type SetupErrorCode = z.infer<typeof SetupErrorCodeSchema>

/** Every failure gives a short reason and a next step. */
export const SetupFailureSchema = z
  .object({
    code: SetupErrorCodeSchema,
    message: z.string().trim().min(1).max(500),
    nextStep: z.string().trim().min(1).max(500),
  })
  .strict()
  .readonly()
export type SetupFailure = z.infer<typeof SetupFailureSchema>

const SetupOperationBaseSchema = z.object({
  approvalId: IdSchema,
  id: IdSchema,
  /** Workers this operation started. Failure or cancel stops only these. */
  ownedWorkerIds: z.array(IdSchema).readonly(),
  planId: IdSchema,
  /** Renderers ignore events whose revision is not newer than their own. */
  revision: z.number().int().nonnegative(),
  schemaVersion: SchemaVersionSchema,
  stepIndex: z.number().int().nonnegative(),
})

/** A failed operation must carry a failure; no other state may. */
export const SetupOperationSchema = z
  .discriminatedUnion("state", [
    SetupOperationBaseSchema.extend({
      failure: z.undefined().optional(),
      state: z.enum(["queued", "running", "succeeded", "cancelled"]),
    }).strict(),
    SetupOperationBaseSchema.extend({
      failure: SetupFailureSchema,
      state: z.literal("failed"),
    }).strict(),
  ])
  .readonly()
export type SetupOperation = z.infer<typeof SetupOperationSchema>

export const ConnectionAuthSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }).strict(),
  z
    .object({
      credentialId: IdSchema,
      kind: z.literal("credential-reference"),
    })
    .strict(),
])
export type ConnectionAuth = z.infer<typeof ConnectionAuthSchema>

/**
 * What an external client needs to connect. It lists only operations the
 * protocol supports, and the agent never writes the client's config files.
 */
export const ConnectionDescriptorSchema = z
  .object({
    auth: ConnectionAuthSchema,
    endpoint: z
      .object({
        id: IdSchema,
        url: z.url().optional(),
      })
      .strict()
      .superRefine((endpoint, context) => {
        try {
          assertCredentialFreeEndpoint(endpoint)
        } catch {
          context.addIssue({
            code: "custom",
            message: "endpoint must not contain credentials",
            path: ["url"],
          })
        }
      }),
    id: IdSchema,
    manualSteps: z.array(z.string().trim().min(1).max(500)),
    operations: UniqueOperationsSchema,
    schemaVersion: SchemaVersionSchema,
    targetId: IdSchema,
  })
  .strict()
export type ConnectionDescriptor = z.infer<typeof ConnectionDescriptorSchema>
