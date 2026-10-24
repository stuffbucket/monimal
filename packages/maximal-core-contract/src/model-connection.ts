import { MODEL_OPERATIONS } from "@maximal/maximal-model-contract"
import { z } from "zod"

import {
  ConnectionAuthSchema,
  ConnectionDescriptorSchema,
  SetupRuntimeReferenceSchema,
} from "./local-model-exploration.ts"

const id = z.string().min(1).max(512)
const timestamp = z.iso.datetime({ offset: true })
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/u)
const uniqueIds = z
  .array(id)
  .min(1)
  .max(128)
  .refine((ids) => new Set(ids).size === ids.length)
  .readonly()
const operations = z
  .array(z.enum(MODEL_OPERATIONS))
  .min(1)
  .refine((values) => new Set(values).size === values.length)
  .readonly()

/** An endpoint destination, never an upstream credential or executable path. */
export const ModelConnectionEndpointSchema = z
  .object({
    id,
    url: z
      .url()
      .max(2048)
      .refine((value) => {
        try {
          const url = new URL(value)
          return (
            ["http:", "https:"].includes(url.protocol)
            && !url.username
            && !url.password
            && url.pathname === "/"
            && !url.search
            && !url.hash
          )
        } catch {
          return false
        }
      }, "Connection destinations must be root HTTP(S) URLs without credentials."),
  })
  .strict()
  .readonly()

/** Selections are requests, not authority to connect or release credentials. */
export const ModelConnectionSelectionSchema = z
  .object({
    discoveryId: id,
    endpointId: id,
    runtimeId: id,
    modelIds: uniqueIds,
    location: z.enum(["device", "lan", "cloud"]),
    credentialId: id.nullable(),
  })
  .strict()
  .readonly()
export type ModelConnectionSelection = z.infer<
  typeof ModelConnectionSelectionSchema
>

/**
 * A host-authenticated candidate read under the deployment/configuration lock.
 * Never accept this record from an agent, renderer, or discovered server.
 * Installed runtime, transport, credential scope, and policy are host facts;
 * endpoint metadata alone cannot establish them.
 */
export const ModelConnectionBindingSchema = z
  .object({
    schemaVersion: z.literal(1),
    selection: ModelConnectionSelectionSchema,
    deploymentId: id,
    deploymentRevision: id,
    provider: id,
    endpoint: ModelConnectionEndpointSchema,
    runnerId: id,
    runtime: SetupRuntimeReferenceSchema,
    models: z
      .array(z.object({ id, targetId: id }).strict().readonly())
      .min(1)
      .max(128)
      .refine(
        (models) =>
          new Set(models.map(({ id }) => id)).size === models.length
          && new Set(models.map(({ targetId }) => targetId)).size
            === models.length,
      )
      .readonly(),
    operations,
    auth: ConnectionAuthSchema.readonly(),
    credentialDestination:
      ModelConnectionEndpointSchema.unwrap().shape.url.nullable(),
    transport: z.enum(["loopback", "tls", "authenticated-tunnel"]),
    providerMode: z.enum(["legacy", "plugins"]),
    requiredProviderMode: z.enum(["legacy", "plugins"]),
    runtimeState: z.enum(["installed", "unavailable", "unknown"]),
    policy: z
      .object({
        revision: id,
        state: z.enum(["allowed", "blocked", "unknown"]),
      })
      .strict()
      .readonly(),
    observedAt: timestamp,
    expiresAt: timestamp,
  })
  .strict()
  .readonly()
export type ModelConnectionBinding = z.infer<
  typeof ModelConnectionBindingSchema
>

export const ModelConnectionReviewSchema = z
  .object({
    schemaVersion: z.literal(1),
    id,
    digest,
    createdAt: timestamp,
    expiresAt: timestamp,
    binding: ModelConnectionBindingSchema,
  })
  .strict()
  .readonly()
export type ModelConnectionReview = z.infer<typeof ModelConnectionReviewSchema>

export const ModelConnectionActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("describe") }).strict(),
  z
    .object({
      action: z.literal("review"),
      selection: ModelConnectionSelectionSchema,
    })
    .strict(),
  // No approval flag, candidate, credential value, settings patch, or commands
  // can be supplied here. Only the trusted host can obtain user consent.
  z
    .object({ action: z.enum(["connect", "read", "cancel"]), id, digest })
    .strict(),
])
export type ModelConnectionAction = z.infer<typeof ModelConnectionActionSchema>

export const ModelConnectionSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: id.nullable(),
    revision: z.number().int().nonnegative(),
    state: z.enum([
      "available",
      "unsupported",
      "reviewed",
      "awaiting-consent",
      "connecting",
      "connected",
      "declined",
      "invalidated",
      "failed",
      "cancelled",
    ]),
    review: ModelConnectionReviewSchema.nullable(),
    connections: z.array(ConnectionDescriptorSchema),
    message: z.string().max(500).nullable(),
  })
  .strict()
  .superRefine((snapshot, context) => {
    const description =
      snapshot.state === "available" || snapshot.state === "unsupported"
    if (
      description ?
        snapshot.id !== null
        || snapshot.review !== null
        || snapshot.revision !== 0
      : snapshot.review === null
        || snapshot.id !== snapshot.review.id
        || snapshot.revision < 1
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Connection states must retain their review identity and revision.",
      })
    }
    if (
      snapshot.state === "connected" ?
        snapshot.connections.length === 0
      : snapshot.connections.length > 0
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Only a confirmed connection may expose nonempty connection descriptors.",
      })
    }
  })
export type ModelConnectionSnapshot = z.infer<
  typeof ModelConnectionSnapshotSchema
>
