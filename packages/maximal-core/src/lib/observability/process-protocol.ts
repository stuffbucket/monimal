import {
  TrafficCompletionObservationSchema,
  TrafficContextObservationSchema,
  TrafficDispatchObservationSchema,
  TrafficFirstResponseObservationSchema,
  TrafficInvalidationSchema,
  TrafficObservationStartSchema,
  TrafficOverviewQuerySchema,
  TrafficRequestIdSchema,
  TrafficRequestListQuerySchema,
  TrafficSessionObservationSchema,
  TrafficTokenObservationSchema,
} from "@maximal/maximal-observability-contract"
import { z } from "zod"

export const TRAFFIC_OBSERVABILITY_CHILD_ARGUMENT =
  "--internal-traffic-observability-child"

const commandId = z.string().trim().min(1).max(100)
const tokenUsagePeriodSchema = z.enum(["day", "week", "month", "all"])
const tokenCountSchema = z.number().int().nonnegative()
const tokenUsageTotalsSchema = z
  .object({
    cache_creation_input_tokens: tokenCountSchema,
    cache_read_input_tokens: tokenCountSchema,
    input_tokens: tokenCountSchema,
    output_tokens: tokenCountSchema,
    request_count: tokenCountSchema,
    total_tokens: tokenCountSchema,
    total_nano_aiu: tokenCountSchema,
  })
  .strict()
const tokenUsageRangeSchema = z
  .object({
    end_ms: z.number().int().nonnegative(),
    end_utc: z.iso.datetime(),
    start_ms: z.number().int().nonnegative(),
    start_utc: z.iso.datetime(),
  })
  .strict()
export const PersistedTokenUsageEventSchema = z
  .object({
    api_key_id: z.string().nullable(),
    cache_creation_input_tokens: tokenCountSchema,
    cache_read_input_tokens: tokenCountSchema,
    created_at_ms: z.number().int().nonnegative(),
    created_at_utc: z.iso.datetime(),
    endpoint: z.enum([
      "chat_completions",
      "embeddings",
      "messages",
      "provider_messages",
      "responses",
    ]),
    input_tokens: tokenCountSchema,
    is_premium: z.number().int().min(0).max(1).nullable(),
    model: z.string(),
    output_tokens: tokenCountSchema,
    project_id: z.string().nullable(),
    provider_name: z.string().nullable(),
    session_id: z.string(),
    source: z.enum(["copilot", "provider"]),
    total_nano_aiu: tokenCountSchema,
    total_tokens: tokenCountSchema,
    trace_id: z.string(),
    traffic_request_id: z.string().nullable(),
    user_id: z.string(),
  })
  .strict()

export const TokenUsageSummarySchema = z
  .object({
    byModel: z.array(
      tokenUsageTotalsSchema.extend({
        is_premium: z.boolean().nullable(),
        model: z.string(),
      }),
    ),
    byProvider: z.array(
      tokenUsageTotalsSchema.extend({
        provider: z.string(),
        provider_name: z.string().nullable(),
        source: z.enum(["copilot", "provider"]),
      }),
    ),
    period: tokenUsagePeriodSchema,
    range: tokenUsageRangeSchema,
    totals: tokenUsageTotalsSchema,
  })
  .strict()

export const TokenUsageEventsPageSchema = z
  .object({
    items: z.array(
      PersistedTokenUsageEventSchema.omit({ traffic_request_id: true }).extend({
        id: z.number().int().positive(),
        is_premium: z.boolean().nullable(),
      }),
    ),
    page: z.number().int().positive(),
    page_size: z.number().int().positive(),
    period: tokenUsagePeriodSchema,
    range: tokenUsageRangeSchema,
    total: tokenCountSchema,
    total_pages: tokenCountSchema,
  })
  .strict()

export const TokenUsageSeriesSchema = z
  .object({
    buckets: z.array(
      tokenUsageTotalsSchema.extend({
        bucket_start_ms: z.number().int().nonnegative(),
      }),
    ),
    bucket_ms: z.number().int().positive(),
    period: tokenUsagePeriodSchema,
    range: tokenUsageRangeSchema,
  })
  .strict()

const requestEventBase = {
  requestId: TrafficRequestIdSchema,
}

export const TrafficProcessObservationEventSchema = z.discriminatedUnion(
  "kind",
  [
    z
      .object({
        kind: z.literal("begin"),
        observation: TrafficObservationStartSchema,
      })
      .strict(),
    z
      .object({
        kind: z.literal("dispatch"),
        ...requestEventBase,
        observation: TrafficDispatchObservationSchema,
      })
      .strict(),
    z
      .object({
        kind: z.literal("first-response"),
        ...requestEventBase,
        observation: TrafficFirstResponseObservationSchema,
      })
      .strict(),
    z
      .object({
        kind: z.literal("context"),
        ...requestEventBase,
        observation: TrafficContextObservationSchema,
      })
      .strict(),
    z
      .object({
        kind: z.literal("session"),
        ...requestEventBase,
        observation: TrafficSessionObservationSchema,
      })
      .strict(),
    z
      .object({
        kind: z.literal("tokens"),
        ...requestEventBase,
        observation: TrafficTokenObservationSchema,
      })
      .strict(),
    z
      .object({
        kind: z.literal("complete"),
        ...requestEventBase,
        observation: TrafficCompletionObservationSchema,
      })
      .strict(),
    z
      .object({
        kind: z.literal("token-usage"),
        event: PersistedTokenUsageEventSchema,
      })
      .strict(),
  ],
)

export type TrafficProcessObservationEvent = z.infer<
  typeof TrafficProcessObservationEventSchema
>

const TrafficProcessQuerySchema = z.discriminatedUnion("method", [
  z
    .object({
      method: z.literal("list-requests"),
      query: TrafficRequestListQuerySchema,
    })
    .strict(),
  z
    .object({
      method: z.literal("get-request"),
      requestId: TrafficRequestIdSchema,
    })
    .strict(),
  z
    .object({
      method: z.literal("get-overview"),
      query: TrafficOverviewQuerySchema,
    })
    .strict(),
  z
    .object({
      method: z.literal("get-token-usage-summary"),
      period: tokenUsagePeriodSchema,
    })
    .strict(),
  z
    .object({
      method: z.literal("get-token-usage-events"),
      page: z.number().int(),
      pageSize: z.number().int(),
      period: tokenUsagePeriodSchema,
    })
    .strict(),
  z
    .object({
      method: z.literal("get-token-usage-series"),
      bucketMs: z.number().optional(),
      period: tokenUsagePeriodSchema,
    })
    .strict(),
  z
    .object({
      method: z.literal("prune-token-usage"),
      beforeMs: z.number().int().nonnegative(),
    })
    .strict(),
  z.object({ method: z.literal("flush-token-usage") }).strict(),
])

export type TrafficProcessQuery = z.infer<typeof TrafficProcessQuerySchema>

export const TrafficProcessParentMessageSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("initialize"),
      databasePath: z.string().min(1),
      retentionDays: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("observe"),
      id: commandId,
      events: z.array(TrafficProcessObservationEventSchema).min(1).max(64),
    })
    .strict(),
  z
    .object({
      kind: z.literal("query"),
      id: commandId,
      query: TrafficProcessQuerySchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("close"),
      id: commandId,
    })
    .strict(),
])

export type TrafficProcessParentMessage = z.infer<
  typeof TrafficProcessParentMessageSchema
>

const processErrorSchema = z
  .object({
    message: z.string().min(1),
  })
  .strict()

export const TrafficProcessChildMessageSchema = z.union([
  z.object({ kind: z.literal("ready") }).strict(),
  z.object({ kind: z.literal("acknowledged"), id: commandId }).strict(),
  z
    .object({
      kind: z.literal("result"),
      id: commandId,
      ok: z.literal(true),
      value: z.unknown(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("result"),
      id: commandId,
      ok: z.literal(false),
      error: processErrorSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("invalidation"),
      invalidation: TrafficInvalidationSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("fatal"),
      error: processErrorSchema,
    })
    .strict(),
])

export type TrafficProcessChildMessage = z.infer<
  typeof TrafficProcessChildMessageSchema
>
