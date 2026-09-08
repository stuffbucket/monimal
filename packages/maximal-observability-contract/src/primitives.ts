import { z } from "zod"

/** Version carried by every serialized traffic-observability response. */
export const TRAFFIC_OBSERVABILITY_CONTRACT_VERSION = 1 as const

/** Maximum number of request records returned by one list query. */
export const TRAFFIC_REQUEST_PAGE_SIZE_MAX = 100

/** Maximum number of points returned by one token series. */
export const TRAFFIC_TOKEN_SERIES_POINTS_MAX = 1_000

/** Maximum number of nodes returned by one flow graph. */
export const TRAFFIC_FLOW_NODES_MAX = 500

/** Maximum number of edges returned by one flow graph. */
export const TRAFFIC_FLOW_EDGES_MAX = 2_000

/** Maximum request IDs carried by one live invalidation hint. */
export const TRAFFIC_INVALIDATION_REQUEST_IDS_MAX = 64

export const TrafficContractVersionSchema = z.literal(
  TRAFFIC_OBSERVABILITY_CONTRACT_VERSION,
)

export const TrafficRequestIdSchema = z.string().trim().min(1).max(200)
export const TrafficCursorSchema = z.string().min(1).max(4_096)
export const TrafficTimestampSchema = z.iso.datetime({ offset: true })
export const TrafficCountSchema = z.number().int().nonnegative()
export const TrafficDurationMsSchema = z.number().nonnegative()
export const TrafficByteCountSchema = z.number().int().nonnegative()

export const TrafficRequestStateSchema = z.enum([
  "accepted",
  "dispatching",
  "streaming",
  "completed",
])

export type TrafficRequestState = z.infer<typeof TrafficRequestStateSchema>

export const TrafficRequestOutcomeSchema = z.enum([
  "succeeded",
  "failed",
  "cancelled",
])

export type TrafficRequestOutcome = z.infer<typeof TrafficRequestOutcomeSchema>

export const TrafficTimeRangeSchema = z
  .object({
    from: TrafficTimestampSchema,
    to: TrafficTimestampSchema,
  })
  .strict()
  .superRefine(({ from, to }, context) => {
    if (Date.parse(from) > Date.parse(to)) {
      context.addIssue({
        code: "custom",
        message: "from must not be later than to",
        path: ["from"],
      })
    }
  })

export type TrafficTimeRange = z.infer<typeof TrafficTimeRangeSchema>
