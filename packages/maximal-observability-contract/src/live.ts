import { z } from "zod"

import {
  TRAFFIC_INVALIDATION_REQUEST_IDS_MAX,
  TrafficContractVersionSchema,
  TrafficRequestIdSchema,
  TrafficTimestampSchema,
} from "./primitives.ts"

export const TrafficInvalidationScopeSchema = z.enum([
  "requests",
  "request-detail",
  "overview",
])

export type TrafficInvalidationScope = z.infer<
  typeof TrafficInvalidationScopeSchema
>

/**
 * A bounded, payload-free live hint. Consumers re-read named queries instead of
 * treating this event as state. Revisions increase monotonically per publisher.
 */
export const TrafficInvalidationSchema = z
  .object({
    contractVersion: TrafficContractVersionSchema,
    revision: z.number().int().nonnegative(),
    emittedAt: TrafficTimestampSchema,
    scopes: z
      .array(TrafficInvalidationScopeSchema)
      .min(1)
      .max(TrafficInvalidationScopeSchema.options.length)
      .refine((scopes) => new Set(scopes).size === scopes.length, {
        message: "invalidation scopes must be unique",
      }),
    requestIds: z
      .array(TrafficRequestIdSchema)
      .max(TRAFFIC_INVALIDATION_REQUEST_IDS_MAX)
      .refine((requestIds) => new Set(requestIds).size === requestIds.length, {
        message: "invalidation request IDs must be unique",
      }),
  })
  .strict()

export type TrafficInvalidation = z.infer<typeof TrafficInvalidationSchema>
export type TrafficInvalidationListener = (
  invalidation: TrafficInvalidation,
) => void
export type TrafficUnsubscribe = () => void
