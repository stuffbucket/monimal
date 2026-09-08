import { z } from "zod"

import {
  TRAFFIC_FLOW_EDGES_MAX,
  TRAFFIC_FLOW_NODES_MAX,
  TRAFFIC_TOKEN_SERIES_POINTS_MAX,
  TrafficByteCountSchema,
  TrafficContractVersionSchema,
  TrafficCountSchema,
  TrafficDurationMsSchema,
  TrafficTimeRangeSchema,
  TrafficTimestampSchema,
} from "./primitives.ts"
import { TrafficRequestFiltersSchema } from "./requests.ts"

/** Overview query. Bucket width is a hint and implementations may widen it. */
export const TrafficOverviewQuerySchema = z
  .object({
    filters: TrafficRequestFiltersSchema.default(() =>
      TrafficRequestFiltersSchema.parse({}),
    ),
    tokenBucketMs: z.number().int().positive().nullable().default(null),
  })
  .strict()

export type TrafficOverviewQuery = z.infer<typeof TrafficOverviewQuerySchema>

export const TrafficOverviewTotalsSchema = z
  .object({
    requests: TrafficCountSchema,
    active: TrafficCountSchema,
    succeeded: TrafficCountSchema,
    failed: TrafficCountSchema,
    cancelled: TrafficCountSchema,
    inputTokens: TrafficCountSchema,
    outputTokens: TrafficCountSchema,
    cacheReadInputTokens: TrafficCountSchema,
    cacheCreationInputTokens: TrafficCountSchema,
    totalTokens: TrafficCountSchema,
    requestBytes: TrafficByteCountSchema,
    responseBytes: TrafficByteCountSchema,
  })
  .strict()
  .superRefine((totals, context) => {
    const classified =
      totals.active + totals.succeeded + totals.failed + totals.cancelled
    if (classified !== totals.requests) {
      context.addIssue({
        code: "custom",
        message: "request outcome totals must equal requests",
        path: ["requests"],
      })
    }
  })

export type TrafficOverviewTotals = z.infer<typeof TrafficOverviewTotalsSchema>

/** Nearest-rank percentile values over a named latency population. */
export const TrafficLatencyPercentilesSchema = z
  .object({
    sampleCount: TrafficCountSchema,
    p50Ms: TrafficDurationMsSchema.nullable(),
    p90Ms: TrafficDurationMsSchema.nullable(),
    p95Ms: TrafficDurationMsSchema.nullable(),
    p99Ms: TrafficDurationMsSchema.nullable(),
  })
  .strict()
  .superRefine((percentiles, context) => {
    const values = [
      percentiles.p50Ms,
      percentiles.p90Ms,
      percentiles.p95Ms,
      percentiles.p99Ms,
    ]
    if (
      percentiles.sampleCount === 0
      && values.some((value) => value !== null)
    ) {
      context.addIssue({
        code: "custom",
        message: "an empty population must have null percentiles",
        path: ["sampleCount"],
      })
      return
    }
    if (percentiles.sampleCount > 0 && values.includes(null)) {
      context.addIssue({
        code: "custom",
        message: "a non-empty population must have all percentiles",
        path: ["sampleCount"],
      })
      return
    }
    const numeric = values.filter((value): value is number => value !== null)
    for (let index = 1; index < numeric.length; index += 1) {
      if ((numeric[index - 1] ?? 0) > (numeric[index] ?? 0)) {
        context.addIssue({
          code: "custom",
          message: "percentiles must be monotonic",
          path: ["p50Ms"],
        })
        return
      }
    }
  })

export type TrafficLatencyPercentiles = z.infer<
  typeof TrafficLatencyPercentilesSchema
>

export const TrafficLatencyOverviewSchema = z
  .object({
    queue: TrafficLatencyPercentilesSchema,
    timeToFirstResponse: TrafficLatencyPercentilesSchema,
    total: TrafficLatencyPercentilesSchema,
  })
  .strict()

export type TrafficLatencyOverview = z.infer<
  typeof TrafficLatencyOverviewSchema
>

export const TrafficFlowNodeKindSchema = z.enum([
  "client",
  "route",
  "provider",
  "model",
  "outcome",
])

export type TrafficFlowNodeKind = z.infer<typeof TrafficFlowNodeKindSchema>

export const TrafficFlowNodeSchema = z
  .object({
    id: z.string().trim().min(1).max(200),
    kind: TrafficFlowNodeKindSchema,
    label: z.string().trim().min(1).max(200),
    requestCount: TrafficCountSchema,
    totalTokens: TrafficCountSchema,
  })
  .strict()

export type TrafficFlowNode = z.infer<typeof TrafficFlowNodeSchema>

export const TrafficFlowEdgeSchema = z
  .object({
    source: z.string().trim().min(1).max(200),
    target: z.string().trim().min(1).max(200),
    requestCount: TrafficCountSchema,
    totalTokens: TrafficCountSchema,
    averageDurationMs: TrafficDurationMsSchema.nullable(),
  })
  .strict()

export type TrafficFlowEdge = z.infer<typeof TrafficFlowEdgeSchema>

export const TrafficFlowSchema = z
  .object({
    nodes: z.array(TrafficFlowNodeSchema).max(TRAFFIC_FLOW_NODES_MAX),
    edges: z.array(TrafficFlowEdgeSchema).max(TRAFFIC_FLOW_EDGES_MAX),
  })
  .strict()
  .superRefine(({ nodes, edges }, context) => {
    const nodeIds = new Set(nodes.map(({ id }) => id))
    if (nodeIds.size !== nodes.length) {
      context.addIssue({
        code: "custom",
        message: "flow node IDs must be unique",
        path: ["nodes"],
      })
      return
    }
    for (const [index, edge] of edges.entries()) {
      if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
        context.addIssue({
          code: "custom",
          message: "flow edges must reference declared nodes",
          path: ["edges", index],
        })
        return
      }
    }
  })

export type TrafficFlow = z.infer<typeof TrafficFlowSchema>

export const TrafficTokenSeriesPointSchema = z
  .object({
    start: TrafficTimestampSchema,
    end: TrafficTimestampSchema,
    requestCount: TrafficCountSchema,
    inputTokens: TrafficCountSchema,
    outputTokens: TrafficCountSchema,
    cacheReadInputTokens: TrafficCountSchema,
    cacheCreationInputTokens: TrafficCountSchema,
    totalTokens: TrafficCountSchema,
  })
  .strict()
  .superRefine(({ start, end }, context) => {
    if (Date.parse(start) >= Date.parse(end)) {
      context.addIssue({
        code: "custom",
        message: "series point end must be later than start",
        path: ["end"],
      })
    }
  })

export type TrafficTokenSeriesPoint = z.infer<
  typeof TrafficTokenSeriesPointSchema
>

export const TrafficTokenSeriesSchema = z
  .object({
    bucketMs: z.number().int().positive(),
    points: z
      .array(TrafficTokenSeriesPointSchema)
      .max(TRAFFIC_TOKEN_SERIES_POINTS_MAX),
  })
  .strict()
  .superRefine(({ points }, context) => {
    let previousEnd = Number.NEGATIVE_INFINITY
    for (const [index, point] of points.entries()) {
      const start = Date.parse(point.start)
      if (start < previousEnd) {
        context.addIssue({
          code: "custom",
          message: "token series points must be ordered and non-overlapping",
          path: ["points", index],
        })
        return
      }
      previousEnd = Date.parse(point.end)
    }
  })

export type TrafficTokenSeries = z.infer<typeof TrafficTokenSeriesSchema>

/** Complete overview snapshot for one resolved query range. */
export const TrafficOverviewSchema = z
  .object({
    contractVersion: TrafficContractVersionSchema,
    generatedAt: TrafficTimestampSchema,
    range: TrafficTimeRangeSchema,
    totals: TrafficOverviewTotalsSchema,
    latency: TrafficLatencyOverviewSchema,
    flow: TrafficFlowSchema,
    tokens: TrafficTokenSeriesSchema,
  })
  .strict()

export type TrafficOverview = z.infer<typeof TrafficOverviewSchema>
