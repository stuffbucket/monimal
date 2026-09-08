import { z } from "zod"

import {
  TrafficAttributionMetadataSchema,
  TrafficContextMetadataSchema,
  TrafficDispatchMetadataSchema,
  TrafficErrorMetadataSchema,
  TrafficIdentityMetadataSchema,
  TrafficResponseMetadataSchema,
  TrafficRouteMetadataSchema,
  TrafficSizeMetadataSchema,
  TrafficTimingMetadataSchema,
  TrafficTokenMetadataSchema,
} from "./metadata.ts"
import {
  TRAFFIC_REQUEST_PAGE_SIZE_MAX,
  TrafficContractVersionSchema,
  TrafficCursorSchema,
  TrafficDurationMsSchema,
  TrafficRequestIdSchema,
  TrafficRequestOutcomeSchema,
  TrafficRequestStateSchema,
  TrafficTimeRangeSchema,
  TrafficTimestampSchema,
} from "./primitives.ts"

const boundedFilterValue = z.string().trim().min(1).max(200)
const uniqueFilter = z
  .array(boundedFilterValue)
  .max(50)
  .refine((values) => new Set(values).size === values.length, {
    message: "filter values must be unique",
  })

/** Filters shared by list and overview reads. Empty arrays do not constrain a dimension. */
export const TrafficRequestFiltersSchema = z
  .object({
    range: TrafficTimeRangeSchema.nullable().default(null),
    states: z.array(TrafficRequestStateSchema).max(4).default([]),
    outcomes: z.array(TrafficRequestOutcomeSchema).max(3).default([]),
    operations: uniqueFilter.default([]),
    providers: uniqueFilter.default([]),
    models: uniqueFilter.default([]),
    clients: uniqueFilter.default([]),
    projects: uniqueFilter.default([]),
    streaming: z.boolean().nullable().default(null),
    search: z.string().trim().max(200).nullable().default(null),
    minimumDurationMs: TrafficDurationMsSchema.nullable().default(null),
    maximumDurationMs: TrafficDurationMsSchema.nullable().default(null),
  })
  .strict()
  .superRefine(({ minimumDurationMs, maximumDurationMs }, context) => {
    if (
      minimumDurationMs !== null
      && maximumDurationMs !== null
      && minimumDurationMs > maximumDurationMs
    ) {
      context.addIssue({
        code: "custom",
        message: "minimumDurationMs must not exceed maximumDurationMs",
        path: ["minimumDurationMs"],
      })
    }
  })

export type TrafficRequestFilters = z.infer<typeof TrafficRequestFiltersSchema>

export const TrafficRequestSortSchema = z.enum(["acceptedAt", "durationMs"])
export type TrafficRequestSort = z.infer<typeof TrafficRequestSortSchema>

export const TrafficSortDirectionSchema = z.enum(["ascending", "descending"])
export type TrafficSortDirection = z.infer<typeof TrafficSortDirectionSchema>

/** Cursor query. Cursors are opaque and are only meaningful with the same filters. */
export const TrafficRequestListQuerySchema = z
  .object({
    filters: TrafficRequestFiltersSchema.default(() =>
      TrafficRequestFiltersSchema.parse({}),
    ),
    cursor: TrafficCursorSchema.nullable().default(null),
    limit: z
      .number()
      .int()
      .min(1)
      .max(TRAFFIC_REQUEST_PAGE_SIZE_MAX)
      .default(50),
    sort: TrafficRequestSortSchema.default("acceptedAt"),
    direction: TrafficSortDirectionSchema.default("descending"),
  })
  .strict()

export type TrafficRequestListQuery = z.infer<
  typeof TrafficRequestListQuerySchema
>

/** A request row suitable for list rendering and summary aggregation. */
export const TrafficRequestSummarySchema = z
  .object({
    identity: TrafficIdentityMetadataSchema,
    state: TrafficRequestStateSchema,
    outcome: TrafficRequestOutcomeSchema.nullable(),
    timing: TrafficTimingMetadataSchema,
    route: TrafficRouteMetadataSchema,
    attribution: TrafficAttributionMetadataSchema,
    dispatch: TrafficDispatchMetadataSchema,
    tokens: TrafficTokenMetadataSchema.nullable(),
    context: TrafficContextMetadataSchema,
    size: TrafficSizeMetadataSchema,
    response: TrafficResponseMetadataSchema.default(() =>
      TrafficResponseMetadataSchema.parse({}),
    ),
    error: TrafficErrorMetadataSchema.nullable(),
  })
  .strict()
  .superRefine(({ state, outcome, error }, context) => {
    if (state === "completed" && outcome === null) {
      context.addIssue({
        code: "custom",
        message: "a completed request must have an outcome",
        path: ["outcome"],
      })
    }
    if (state !== "completed" && outcome !== null) {
      context.addIssue({
        code: "custom",
        message: "an active request must not have an outcome",
        path: ["outcome"],
      })
    }
    if (error !== null && outcome !== "failed") {
      context.addIssue({
        code: "custom",
        message: "error metadata requires a failed outcome",
        path: ["error"],
      })
    }
  })

export type TrafficRequestSummary = z.infer<typeof TrafficRequestSummarySchema>

export const TrafficLifecycleEventKindSchema = z.enum([
  "accepted",
  "dispatch-started",
  "response-started",
  "completed",
])

export type TrafficLifecycleEventKind = z.infer<
  typeof TrafficLifecycleEventKindSchema
>

/** One ordered lifecycle milestone. The event never carries request content. */
export const TrafficLifecycleEventSchema = z
  .object({
    sequence: z.number().int().nonnegative(),
    at: TrafficTimestampSchema,
    kind: TrafficLifecycleEventKindSchema,
    state: TrafficRequestStateSchema,
    outcome: TrafficRequestOutcomeSchema.nullable(),
  })
  .strict()

export type TrafficLifecycleEvent = z.infer<typeof TrafficLifecycleEventSchema>

/** Cursor-paged request list envelope. */
export const TrafficRequestListSchema = z
  .object({
    contractVersion: TrafficContractVersionSchema,
    items: z
      .array(TrafficRequestSummarySchema)
      .max(TRAFFIC_REQUEST_PAGE_SIZE_MAX),
    nextCursor: TrafficCursorSchema.nullable(),
    hasMore: z.boolean(),
  })
  .strict()
  .superRefine(({ hasMore, nextCursor }, context) => {
    if (hasMore !== (nextCursor !== null)) {
      context.addIssue({
        code: "custom",
        message: "hasMore must match the presence of nextCursor",
        path: ["hasMore"],
      })
    }
  })

export type TrafficRequestList = z.infer<typeof TrafficRequestListSchema>

/** Compatibility name emphasizing that the list uses cursor pagination. */
export const TrafficRequestPageSchema = TrafficRequestListSchema
export type TrafficRequestPage = TrafficRequestList

/** Full request read with its ordered lifecycle. */
export const TrafficRequestDetailSchema = z
  .object({
    contractVersion: TrafficContractVersionSchema,
    request: TrafficRequestSummarySchema,
    lifecycle: z.array(TrafficLifecycleEventSchema).min(1).max(32),
  })
  .strict()
  .superRefine(({ request, lifecycle }, context) => {
    let previousSequence = -1
    let previousTime = Number.NEGATIVE_INFINITY
    for (const [index, event] of lifecycle.entries()) {
      const time = Date.parse(event.at)
      if (event.sequence <= previousSequence || time < previousTime) {
        context.addIssue({
          code: "custom",
          message: "lifecycle events must be ordered",
          path: ["lifecycle", index],
        })
        return
      }
      previousSequence = event.sequence
      previousTime = time
    }
    if (lifecycle[0]?.kind !== "accepted") {
      context.addIssue({
        code: "custom",
        message: "the lifecycle must start with accepted",
        path: ["lifecycle", 0, "kind"],
      })
    }
    if (
      request.state === "completed"
      && lifecycle.at(-1)?.kind !== "completed"
    ) {
      context.addIssue({
        code: "custom",
        message: "a completed request must end with a completed event",
        path: ["lifecycle"],
      })
    }
  })

export type TrafficRequestDetail = z.infer<typeof TrafficRequestDetailSchema>

export const TrafficRequestDetailQuerySchema = z
  .object({ requestId: TrafficRequestIdSchema })
  .strict()

export type TrafficRequestDetailQuery = z.infer<
  typeof TrafficRequestDetailQuerySchema
>
