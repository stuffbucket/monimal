import { z } from "zod"

/** Required controls for exposure, not a score or a declaration of absolute safety. */
export const SERVING_HARDENING_CONTROLS = [
  "unprivileged-process",
  "capabilities-restricted",
  "no-new-privileges",
  "syscall-filter",
  "read-only-root",
  "restricted-mounts",
  "bounded-writable-storage",
  "resource-limits",
  "isolated-network",
  "egress-default-deny",
  "host-and-lan-access-restricted",
  "safe-model-loader",
  "authenticated-ingress",
  "encrypted-ingress",
  "inference-route-allowlist",
  "upgrade-restrictions",
  "isolation-boundary-reviewed",
] as const
export type ServingHardeningControl =
  (typeof SERVING_HARDENING_CONTROLS)[number]

const Id = z.string().trim().min(1).max(200)
const Digest = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const Digests = z
  .array(Digest)
  .min(1)
  .refine(
    (values) => new Set(values).size === values.length,
    "Artifact digests must be distinct.",
  )
  .readonly()

/** Any change to the serving or ingress/egress configuration invalidates review. */
export const ServingHardeningBindingSchema = z
  .object({
    targetId: Id,
    deploymentRevision: Id,
    runtimeDigest: Digest,
    configurationDigest: Digest,
    artifactDigests: Digests,
    ingressPolicyDigest: Digest,
    egressPolicyDigest: Digest,
  })
  .strict()
  .readonly()
export type ServingHardeningBinding = z.infer<
  typeof ServingHardeningBindingSchema
>

/**
 * Wire evidence only. Schema validity, an inspector name, and passing controls
 * are NOT proof of authenticity or permission to share. Core must obtain this
 * from an authenticated inspector through its authoritative report reader.
 * No credentials, executable configuration, file paths, or endpoints belong here.
 */
export const ServingHardeningReportSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: Id,
    inspectorId: Id,
    observedAt: z.iso.datetime({ offset: true }),
    expiresAt: z.iso.datetime({ offset: true }),
    binding: ServingHardeningBindingSchema,
    controls: z
      .record(
        z.enum(SERVING_HARDENING_CONTROLS),
        z.enum(["pass", "fail", "unknown"]),
      )
      .readonly(),
  })
  .strict()
  .readonly()
export type ServingHardeningReport = z.infer<
  typeof ServingHardeningReportSchema
>

export const ServingHardeningIssueSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("control"),
      control: z.enum(SERVING_HARDENING_CONTROLS),
      state: z.enum(["fail", "unknown"]),
    })
    .strict()
    .readonly(),
  z
    .object({
      kind: z.enum([
        "missing-report",
        "invalid-report",
        "untrusted-inspector",
        "inspection-unavailable",
        "deployment-changed",
        "stale-report",
        "future-report",
      ]),
    })
    .strict()
    .readonly(),
])
export type ServingHardeningIssue = z.infer<typeof ServingHardeningIssueSchema>

export const ServingHardeningDecisionSchema = z.discriminatedUnion("state", [
  z
    .object({
      state: z.literal("blocked"),
      issues: z.array(ServingHardeningIssueSchema).min(1).readonly(),
    })
    .strict()
    .readonly(),
  z
    .object({
      state: z.literal("checks-passed"),
      reportId: Id,
      expiresAt: z.iso.datetime({ offset: true }),
    })
    .strict()
    .readonly(),
])
export type ServingHardeningDecision = z.infer<
  typeof ServingHardeningDecisionSchema
>
