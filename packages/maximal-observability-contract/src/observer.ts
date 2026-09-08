import { z } from "zod"

import {
  TrafficAttributionMetadataSchema,
  TrafficContextMetadataSchema,
  TrafficDispatchMetadataSchema,
  TrafficErrorMetadataSchema,
  TrafficIdentityMetadataSchema,
  TrafficRouteMetadataSchema,
  TrafficSizeMetadataSchema,
  TrafficTokenMetadataSchema,
} from "./metadata.ts"
import {
  TrafficRequestOutcomeSchema,
  TrafficTimestampSchema,
} from "./primitives.ts"

/** Runtime-neutral facts available when a request enters the observed boundary. */
export const TrafficObservationStartSchema = z
  .object({
    identity: TrafficIdentityMetadataSchema,
    acceptedAt: TrafficTimestampSchema,
    route: TrafficRouteMetadataSchema,
    attribution: TrafficAttributionMetadataSchema,
    context: TrafficContextMetadataSchema,
    size: TrafficSizeMetadataSchema,
  })
  .strict()

export type TrafficObservationStart = z.infer<
  typeof TrafficObservationStartSchema
>

export const TrafficDispatchObservationSchema = z
  .object({
    at: TrafficTimestampSchema,
    attribution: TrafficAttributionMetadataSchema,
    dispatch: TrafficDispatchMetadataSchema,
  })
  .strict()

export type TrafficDispatchObservation = z.infer<
  typeof TrafficDispatchObservationSchema
>

export const TrafficFirstResponseObservationSchema = z
  .object({
    at: TrafficTimestampSchema,
    statusCode: z.number().int().min(100).max(599),
    streamed: z.boolean(),
  })
  .strict()

export type TrafficFirstResponseObservation = z.infer<
  typeof TrafficFirstResponseObservationSchema
>

/** A complete token snapshot; repeated observations replace rather than add. */
export const TrafficTokenObservationSchema = z
  .object({
    at: TrafficTimestampSchema,
    tokens: TrafficTokenMetadataSchema,
  })
  .strict()

export type TrafficTokenObservation = z.infer<
  typeof TrafficTokenObservationSchema
>

export const TrafficCompletionObservationSchema = z
  .object({
    at: TrafficTimestampSchema,
    outcome: TrafficRequestOutcomeSchema,
    dispatch: TrafficDispatchMetadataSchema,
    tokens: TrafficTokenMetadataSchema.nullable(),
    size: TrafficSizeMetadataSchema,
    error: TrafficErrorMetadataSchema.nullable(),
  })
  .strict()
  .superRefine(({ outcome, error }, context) => {
    if (error !== null && outcome !== "failed") {
      context.addIssue({
        code: "custom",
        message: "error metadata requires a failed outcome",
        path: ["error"],
      })
    }
  })

export type TrafficCompletionObservation = z.infer<
  typeof TrafficCompletionObservationSchema
>

/**
 * Per-request passive observation handle.
 *
 * Methods are synchronous notifications, return no control value, and must not
 * influence routing or response delivery. Implementations must not throw into
 * the request path. `complete` is terminal; later calls must be ignored.
 */
export interface TrafficObservationHandle {
  recordDispatch(observation: TrafficDispatchObservation): void
  recordFirstResponse(observation: TrafficFirstResponseObservation): void
  recordTokens(observation: TrafficTokenObservation): void
  complete(observation: TrafficCompletionObservation): void
}

/**
 * Passive ingress boundary for traffic observations. Implementations must not
 * mutate the supplied snapshots or make request progress depend on persistence.
 */
export interface TrafficObserver {
  beginRequest(observation: TrafficObservationStart): TrafficObservationHandle
}

export type TrafficRequestObservationHandle = TrafficObservationHandle
