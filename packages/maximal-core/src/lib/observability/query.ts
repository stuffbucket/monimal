import type {
  TrafficOverview,
  TrafficOverviewQuery,
  TrafficRequestFilters,
  TrafficRequestListQuery,
  TrafficRequestSummary,
} from "@stuffbucket/maximal-observability-contract"

import {
  TRAFFIC_FLOW_EDGES_MAX,
  TRAFFIC_FLOW_NODES_MAX,
  TRAFFIC_OBSERVABILITY_CONTRACT_VERSION,
  TRAFFIC_TOKEN_SERIES_POINTS_MAX,
} from "@stuffbucket/maximal-observability-contract"
import { createHash } from "node:crypto"

type Row = Record<string, unknown>

export function stringValue(value: unknown): string {
  return typeof value === "string" ? value : ""
}

export function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

export function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === "number" ? value !== 0 : null
}

function duration(end: number | null, start: number): number | null {
  return end === null ? null : Math.max(0, end - start)
}

// eslint-disable-next-line max-lines-per-function
export function rowToSummary(
  row: Row,
  activeAtMs: number,
): TrafficRequestSummary {
  const acceptedMs = numberValue(row.accepted_at_ms)
  const completedMs = nullableNumber(row.completed_at_ms)
  const state = stringValue(row.state) as TrafficRequestSummary["state"]
  let effectiveEnd = completedMs
  if (completedMs === null && state !== "completed") effectiveEnd = activeAtMs
  else if (completedMs !== null)
    effectiveEnd = Math.min(completedMs, activeAtMs)
  const tokens =
    numberValue(row.tokens_observed) === 1 ?
      {
        inputTokens: numberValue(row.input_tokens),
        outputTokens: numberValue(row.output_tokens),
        cacheReadInputTokens: numberValue(row.cache_read_input_tokens),
        cacheCreationInputTokens: numberValue(row.cache_creation_input_tokens),
        reasoningTokens: numberValue(row.reasoning_tokens),
        totalTokens: numberValue(row.total_tokens),
        totalNanoAiu: numberValue(row.total_nano_aiu),
      }
    : null
  const error =
    nullableString(row.error_category) ?
      {
        category: stringValue(row.error_category) as NonNullable<
          TrafficRequestSummary["error"]
        >["category"],
        code: stringValue(row.error_code),
        message: stringValue(row.error_message),
        retryable: numberValue(row.error_retryable) === 1,
      }
    : null
  return {
    identity: {
      requestId: stringValue(row.request_id),
      traceId: nullableString(row.trace_id),
      sessionId: nullableString(row.session_id),
      parentRequestId: nullableString(row.parent_request_id),
      clientRequestId: nullableString(row.client_request_id),
    },
    state,
    outcome: nullableString(row.outcome) as TrafficRequestSummary["outcome"],
    timing: {
      acceptedAt: stringValue(row.accepted_at_utc),
      dispatchStartedAt: nullableString(row.dispatch_started_at_utc),
      firstResponseAt: nullableString(row.first_response_at_utc),
      completedAt: nullableString(row.completed_at_utc),
      queueMs: duration(nullableNumber(row.dispatch_started_at_ms), acceptedMs),
      timeToFirstResponseMs: duration(
        nullableNumber(row.first_response_at_ms),
        acceptedMs,
      ),
      durationMs: duration(effectiveEnd, acceptedMs),
    },
    route: {
      method: stringValue(row.method),
      path: stringValue(row.path),
      operation: stringValue(row.operation),
    },
    attribution: {
      source: nullableString(row.source),
      client: nullableString(row.client),
      project: nullableString(row.project),
      provider: nullableString(row.provider),
      model: nullableString(row.model),
      parentSessionId: nullableString(row.parent_session_id),
      subagent: nullableBoolean(row.subagent),
      compactType: nullableString(row.compact_type),
    },
    dispatch: {
      attemptCount: numberValue(row.attempt_count),
      retryCount: numberValue(row.retry_count),
      statusCode: nullableNumber(row.status_code),
      streamed: nullableBoolean(row.streamed),
      upstreamRequestId: nullableString(row.upstream_request_id),
      requestedModel: nullableString(row.requested_model),
      resolvedModel: nullableString(row.resolved_model),
    },
    tokens,
    context: {
      messageCount: nullableNumber(row.message_count),
      toolDefinitionCount: nullableNumber(row.tool_definition_count),
      contextWindowTokens: nullableNumber(row.context_window_tokens),
      requestedMaxOutputTokens: nullableNumber(row.requested_max_output_tokens),
      usedTokens: nullableNumber(row.used_tokens),
      usedRatio: nullableNumber(row.used_ratio),
    },
    size: {
      requestBytes: nullableNumber(row.request_bytes),
      responseBytes: nullableNumber(row.response_bytes),
      responseChunks: nullableNumber(row.response_chunks),
    },
    response: {
      stopReason: nullableString(row.stop_reason),
      toolUseCount: nullableNumber(row.tool_use_count),
    },
    error,
  }
}

export interface CursorPayload {
  direction: TrafficRequestListQuery["direction"]
  filters: string
  lastId: number
  lastValue: number
  snapshotAtMs: number
  snapshotMaxId: number
  sort: TrafficRequestListQuery["sort"]
  version: 1
}

export function encodeCursor(cursor: CursorPayload): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url")
}

export function decodeCursor(value: string | null): CursorPayload | null {
  if (!value) return null
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString(),
    )
    if (typeof parsed !== "object" || parsed === null) return null
    const item = parsed as Partial<CursorPayload>
    if (
      item.version !== 1
      || (item.sort !== "acceptedAt" && item.sort !== "durationMs")
      || (item.direction !== "ascending" && item.direction !== "descending")
      || typeof item.filters !== "string"
      || !Number.isInteger(item.lastId)
      || !Number.isFinite(item.lastValue)
      || !Number.isInteger(item.snapshotMaxId)
      || !Number.isFinite(item.snapshotAtMs)
    )
      return null
    return item as CursorPayload
  } catch {
    return null
  }
}

// Each optional contract filter is an independent predicate.
// eslint-disable-next-line complexity
export function matchesFilters(
  item: TrafficRequestSummary,
  filters: TrafficRequestFilters,
): boolean {
  const accepted = Date.parse(item.timing.acceptedAt)
  if (
    filters.range
    && (accepted < Date.parse(filters.range.from)
      || accepted > Date.parse(filters.range.to))
  )
    return false
  if (filters.states.length > 0 && !filters.states.includes(item.state))
    return false
  if (
    filters.outcomes.length > 0
    && (item.outcome === null || !filters.outcomes.includes(item.outcome))
  )
    return false
  if (
    filters.operations.length > 0
    && !filters.operations.includes(item.route.operation)
  )
    return false
  if (
    filters.providers.length > 0
    && (item.attribution.provider === null
      || !filters.providers.includes(item.attribution.provider))
  )
    return false
  if (
    filters.models.length > 0
    && (item.attribution.model === null
      || !filters.models.includes(item.attribution.model))
  )
    return false
  if (
    filters.projects.length > 0
    && (item.attribution.project === null
      || !filters.projects.includes(item.attribution.project))
  )
    return false
  if (
    filters.streaming !== null
    && item.dispatch.streamed !== filters.streaming
  )
    return false
  if (
    filters.clients.length > 0
    && (item.attribution.client === null
      || !filters.clients.includes(item.attribution.client))
  )
    return false
  const durationMs = item.timing.durationMs
  if (
    filters.minimumDurationMs !== null
    && (durationMs === null || durationMs < filters.minimumDurationMs)
  )
    return false
  if (
    filters.maximumDurationMs !== null
    && (durationMs === null || durationMs > filters.maximumDurationMs)
  )
    return false
  if (filters.search) {
    const needle = filters.search.toLocaleLowerCase()
    const haystack = [
      item.identity.requestId,
      item.identity.traceId,
      item.identity.sessionId,
      item.route.operation,
      item.attribution.provider,
      item.attribution.model,
      item.attribution.client,
    ]
      .filter((value): value is string => value !== null)
      .join("\n")
      .toLocaleLowerCase()
    if (!haystack.includes(needle)) return false
  }
  return true
}

export function percentile(values: Array<number>) {
  const sorted = [...values].sort((a, b) => a - b)
  const read = (p: number): number | null =>
    sorted.length === 0 ?
      null
    : (sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] ?? null)
  return {
    sampleCount: sorted.length,
    p50Ms: read(0.5),
    p90Ms: read(0.9),
    p95Ms: read(0.95),
    p99Ms: read(0.99),
  }
}

export function buildTotals(
  items: Array<TrafficRequestSummary>,
): TrafficOverview["totals"] {
  return items.reduce<TrafficOverview["totals"]>(
    (totals, item) => {
      totals.requests += 1
      if (item.state !== "completed") totals.active += 1
      else if (item.outcome === "succeeded") totals.succeeded += 1
      else if (item.outcome === "failed") totals.failed += 1
      else totals.cancelled += 1
      totals.inputTokens += item.tokens?.inputTokens ?? 0
      totals.outputTokens += item.tokens?.outputTokens ?? 0
      totals.cacheReadInputTokens += item.tokens?.cacheReadInputTokens ?? 0
      totals.cacheCreationInputTokens +=
        item.tokens?.cacheCreationInputTokens ?? 0
      totals.totalTokens += item.tokens?.totalTokens ?? 0
      totals.requestBytes += item.size.requestBytes ?? 0
      totals.responseBytes += item.size.responseBytes ?? 0
      return totals
    },
    {
      requests: 0,
      active: 0,
      succeeded: 0,
      failed: 0,
      cancelled: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      totalTokens: 0,
      requestBytes: 0,
      responseBytes: 0,
    },
  )
}

function flowNodeId(
  kind: TrafficOverview["flow"]["nodes"][number]["kind"],
  label: string,
): string {
  const direct = `${kind}:${label}`
  if (direct.length <= 200) return direct
  const digest = createHash("sha256").update(label).digest("hex").slice(0, 16)
  const prefix = `${kind}:`
  const headLength = 200 - prefix.length - digest.length - 1
  return `${prefix}${label.slice(0, headLength)}:${digest}`
}

export function buildFlow(
  items: Array<TrafficRequestSummary>,
): TrafficOverview["flow"] {
  const nodes = new Map<string, TrafficOverview["flow"]["nodes"][number]>()
  const edges = new Map<string, TrafficOverview["flow"]["edges"][number]>()
  const addNode = (
    kind: TrafficOverview["flow"]["nodes"][number]["kind"],
    label: string,
    item: TrafficRequestSummary,
  ): string => {
    const id = flowNodeId(kind, label)
    const current = nodes.get(id) ?? {
      id,
      kind,
      label,
      requestCount: 0,
      totalTokens: 0,
    }
    current.requestCount += 1
    current.totalTokens += item.tokens?.totalTokens ?? 0
    if (nodes.size < TRAFFIC_FLOW_NODES_MAX || nodes.has(id))
      nodes.set(id, current)
    return id
  }
  const addEdge = (
    source: string,
    target: string,
    item: TrafficRequestSummary,
  ): void => {
    if (!nodes.has(source) || !nodes.has(target)) return
    const id = `${source} ${target}`
    const current = edges.get(id) ?? {
      source,
      target,
      requestCount: 0,
      totalTokens: 0,
      averageDurationMs: null,
    }
    const durationMs = item.timing.durationMs
    const priorTotal = (current.averageDurationMs ?? 0) * current.requestCount
    current.requestCount += 1
    current.totalTokens += item.tokens?.totalTokens ?? 0
    current.averageDurationMs =
      durationMs === null ?
        current.averageDurationMs
      : (priorTotal + durationMs) / current.requestCount
    if (edges.size < TRAFFIC_FLOW_EDGES_MAX || edges.has(id))
      edges.set(id, current)
  }
  for (const item of items) {
    const labels: Array<
      [TrafficOverview["flow"]["nodes"][number]["kind"], string]
    > = [
      ["client", item.attribution.client ?? "unknown"],
      ["route", item.route.operation],
      ["provider", item.attribution.provider ?? "unknown"],
      ["model", item.attribution.model ?? "unknown"],
      [
        "outcome",
        item.state === "completed" ? (item.outcome ?? "unknown") : "active",
      ],
    ]
    const ids = labels.map(([kind, label]) => addNode(kind, label, item))
    for (let index = 1; index < ids.length; index += 1)
      addEdge(ids[index - 1] ?? "", ids[index] ?? "", item)
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] }
}

export function buildTokenSeries(
  items: Array<TrafficRequestSummary>,
  range: TrafficOverview["range"],
  requested: number | null,
): TrafficOverview["tokens"] {
  const from = Date.parse(range.from)
  const to = Date.parse(range.to)
  const span = Math.max(1, to - from)
  const bucketMs = Math.max(
    1,
    requested ?? Math.ceil(span / 60),
    Math.ceil(span / TRAFFIC_TOKEN_SERIES_POINTS_MAX),
  )
  const buckets = new Map<number, TrafficOverview["tokens"]["points"][number]>()
  for (const item of items) {
    if (!item.tokens) continue
    const accepted = Date.parse(item.timing.acceptedAt)
    const start = Math.floor(accepted / bucketMs) * bucketMs
    const current = buckets.get(start) ?? {
      start: new Date(start).toISOString(),
      end: new Date(start + bucketMs).toISOString(),
      requestCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      totalTokens: 0,
    }
    current.requestCount += 1
    current.inputTokens += item.tokens.inputTokens
    current.outputTokens += item.tokens.outputTokens
    current.cacheReadInputTokens += item.tokens.cacheReadInputTokens
    current.cacheCreationInputTokens += item.tokens.cacheCreationInputTokens
    current.totalTokens += item.tokens.totalTokens
    buckets.set(start, current)
  }
  return {
    bucketMs,
    points: [...buckets.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, value]) => value)
      .slice(0, TRAFFIC_TOKEN_SERIES_POINTS_MAX),
  }
}

export function emptyOverview(
  now: Date,
  query: TrafficOverviewQuery,
): TrafficOverview {
  const at = now.toISOString()
  const range = query.filters.range ?? { from: at, to: at }
  return {
    contractVersion: TRAFFIC_OBSERVABILITY_CONTRACT_VERSION,
    generatedAt: at,
    range,
    totals: buildTotals([]),
    latency: {
      queue: percentile([]),
      timeToFirstResponse: percentile([]),
      total: percentile([]),
    },
    flow: { nodes: [], edges: [] },
    tokens: { bucketMs: query.tokenBucketMs ?? 60_000, points: [] },
  }
}
