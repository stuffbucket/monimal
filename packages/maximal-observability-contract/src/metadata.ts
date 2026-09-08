import { z } from "zod"

import {
  TrafficByteCountSchema,
  TrafficCountSchema,
  TrafficDurationMsSchema,
  TrafficRequestIdSchema,
  TrafficTimestampSchema,
} from "./primitives.ts"

const nullableIdentifier = z.string().trim().min(1).max(200).nullable()

/** Correlation identifiers. Values are opaque and must not contain request bodies. */
export const TrafficIdentityMetadataSchema = z
  .object({
    requestId: TrafficRequestIdSchema,
    traceId: nullableIdentifier,
    sessionId: nullableIdentifier,
    parentRequestId: TrafficRequestIdSchema.nullable(),
    clientRequestId: nullableIdentifier,
  })
  .strict()

export type TrafficIdentityMetadata = z.infer<
  typeof TrafficIdentityMetadataSchema
>

/** Request timing. Unknown milestones are explicitly null. */
export const TrafficTimingMetadataSchema = z
  .object({
    acceptedAt: TrafficTimestampSchema,
    dispatchStartedAt: TrafficTimestampSchema.nullable(),
    firstResponseAt: TrafficTimestampSchema.nullable(),
    completedAt: TrafficTimestampSchema.nullable(),
    queueMs: TrafficDurationMsSchema.nullable(),
    timeToFirstResponseMs: TrafficDurationMsSchema.nullable(),
    durationMs: TrafficDurationMsSchema.nullable(),
  })
  .strict()

export type TrafficTimingMetadata = z.infer<typeof TrafficTimingMetadataSchema>

/** Logical public route, independent of any web framework router type. */
export const TrafficRouteMetadataSchema = z
  .object({
    method: z
      .string()
      .trim()
      .min(1)
      .max(20)
      .regex(/^[A-Z]+$/u),
    path: z.string().min(1).max(1_024).startsWith("/"),
    operation: z.string().trim().min(1).max(100),
  })
  .strict()

export type TrafficRouteMetadata = z.infer<typeof TrafficRouteMetadataSchema>

/** Non-secret ownership and routing dimensions used for grouping. */
export const TrafficAttributionMetadataSchema = z
  .object({
    source: nullableIdentifier,
    client: nullableIdentifier,
    project: nullableIdentifier,
    provider: nullableIdentifier,
    model: nullableIdentifier,
  })
  .strict()

export type TrafficAttributionMetadata = z.infer<
  typeof TrafficAttributionMetadataSchema
>

/** Upstream dispatch facts, with no URL, headers, or transport objects. */
export const TrafficDispatchMetadataSchema = z
  .object({
    attemptCount: TrafficCountSchema,
    retryCount: TrafficCountSchema,
    statusCode: z.number().int().min(100).max(599).nullable(),
    streamed: z.boolean().nullable(),
    upstreamRequestId: nullableIdentifier,
  })
  .strict()

export type TrafficDispatchMetadata = z.infer<
  typeof TrafficDispatchMetadataSchema
>

/** Final token counters. Cache counters are part of input token accounting. */
export const TrafficTokenMetadataSchema = z
  .object({
    inputTokens: TrafficCountSchema,
    outputTokens: TrafficCountSchema,
    cacheReadInputTokens: TrafficCountSchema,
    cacheCreationInputTokens: TrafficCountSchema,
    reasoningTokens: TrafficCountSchema,
    totalTokens: TrafficCountSchema,
  })
  .strict()

export type TrafficTokenMetadata = z.infer<typeof TrafficTokenMetadataSchema>

/** Counts and limits that characterize a request without retaining its content. */
export const TrafficContextMetadataSchema = z
  .object({
    messageCount: TrafficCountSchema.nullable(),
    toolDefinitionCount: TrafficCountSchema.nullable(),
    contextWindowTokens: TrafficCountSchema.nullable(),
    requestedMaxOutputTokens: TrafficCountSchema.nullable(),
  })
  .strict()

export type TrafficContextMetadata = z.infer<
  typeof TrafficContextMetadataSchema
>

/** Payload sizes and streaming density; no payload content is represented. */
export const TrafficSizeMetadataSchema = z
  .object({
    requestBytes: TrafficByteCountSchema.nullable(),
    responseBytes: TrafficByteCountSchema.nullable(),
    responseChunks: TrafficCountSchema.nullable(),
  })
  .strict()

export type TrafficSizeMetadata = z.infer<typeof TrafficSizeMetadataSchema>

export const TrafficErrorCategorySchema = z.enum([
  "client",
  "routing",
  "provider",
  "transport",
  "timeout",
  "internal",
])

export type TrafficErrorCategory = z.infer<typeof TrafficErrorCategorySchema>

/** Bounded, serializable failure metadata. Stack traces and causes stay private. */
export const TrafficErrorMetadataSchema = z
  .object({
    category: TrafficErrorCategorySchema,
    code: z.string().trim().min(1).max(100),
    message: z.string().trim().min(1).max(1_000),
    retryable: z.boolean(),
  })
  .strict()

export type TrafficErrorMetadata = z.infer<typeof TrafficErrorMetadataSchema>
