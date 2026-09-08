import type {
  TrafficCompletionObservation,
  TrafficContextObservation,
  TrafficDispatchObservation,
  TrafficFirstResponseObservation,
  TrafficInvalidationListener,
  TrafficObservationHandle,
  TrafficObservationStart,
  TrafficObserver,
  TrafficOverview,
  TrafficOverviewQuery,
  TrafficRequestDetail,
  TrafficRequestList,
  TrafficRequestListQuery,
  TrafficTokenObservation,
} from "@stuffbucket/maximal-observability-contract"

import {
  TRAFFIC_INVALIDATION_REQUEST_IDS_MAX,
  TRAFFIC_OBSERVABILITY_CONTRACT_VERSION,
} from "@stuffbucket/maximal-observability-contract"
import consola from "consola"
import path from "node:path"

import { PATHS } from "~/lib/platform/paths"
import { registerProcessCleanup } from "~/lib/platform/process-cleanup"
import {
  isSqliteRuntimeSupported,
  SqliteDbStore,
  type SqliteDatabase,
} from "~/lib/platform/sqlite"
import { flushTokenUsageEvents } from "~/lib/token-usage/store"

import {
  buildFlow,
  buildTokenSeries,
  buildTotals,
  decodeCursor,
  emptyOverview,
  encodeCursor,
  matchesFilters,
  nullableString,
  numberValue,
  percentile,
  rowToSummary,
  stringValue,
} from "./query"
import {
  backfillLegacyUsageRows,
  initializeTrafficDb,
  insertLifecycle,
  nextSequence,
} from "./schema"

const DB_PATH_ENV = "COPILOT_API_SQLITE_DB_PATH"
const DEFAULT_DB_FILENAME = "copilot-api.sqlite"
const DEFAULT_RETENTION_DAYS = 365
const RETENTION_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1_000

type Row = Record<string, unknown>

export interface TrafficQueryStore {
  getOverview(query: TrafficOverviewQuery): Promise<TrafficOverview>
  getRequest(requestId: string): Promise<TrafficRequestDetail | null>
  listRequests(query: TrafficRequestListQuery): Promise<TrafficRequestList>
}

export interface SqliteTrafficObserverOptions {
  dbPath?: string
  now?: () => Date
  onInvalidation?: TrafficInvalidationListener
  open?: (dbPath: string) => Promise<SqliteDatabase>
  retentionDays?: number
}

function timestampMs(value: string): number {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : Date.now()
}

function sqliteBoolean(value: boolean | null): number | null {
  if (value === null) return null
  return value ? 1 : 0
}

export class SqliteTrafficObserver
  implements TrafficObserver, TrafficQueryStore
{
  private queue: Promise<void> = Promise.resolve()
  private revision = 0
  private nextRetentionCheckMs: number
  private readonly now: () => Date
  private readonly onInvalidation?: TrafficInvalidationListener
  private readonly retentionMs: number
  private readonly store: SqliteDbStore

  constructor(options: SqliteTrafficObserverOptions = {}) {
    this.now = options.now ?? (() => new Date())
    this.onInvalidation = options.onInvalidation
    const dbPath =
      options.dbPath
      ?? process.env[DB_PATH_ENV]
      ?? path.join(PATHS.APP_DIR, DEFAULT_DB_FILENAME)
    const retentionDays = Math.max(
      1,
      Math.floor(options.retentionDays ?? DEFAULT_RETENTION_DAYS),
    )
    this.retentionMs = retentionDays * RETENTION_CHECK_INTERVAL_MS
    this.nextRetentionCheckMs =
      this.now().getTime() + RETENTION_CHECK_INTERVAL_MS
    this.store = new SqliteDbStore({
      getPath: () => dbPath,
      initialize: (db) =>
        initializeTrafficDb(db, this.now().getTime(), retentionDays),
      open: options.open,
    })
  }

  beginRequest(start: TrafficObservationStart): TrafficObservationHandle {
    this.enqueue((db) => {
      const acceptedMs = timestampMs(start.acceptedAt)
      db.prepare(
        `
        INSERT OR IGNORE INTO traffic_requests (
          request_id, trace_id, session_id, parent_request_id, client_request_id,
          accepted_at_ms, accepted_at_utc, state, method, path, operation,
          source, client, project, provider, model, parent_session_id,
          subagent, compact_type, message_count, tool_definition_count,
          context_window_tokens, requested_max_output_tokens, used_tokens,
          used_ratio, request_bytes, response_bytes, response_chunks
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'accepted', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      ).run(
        start.identity.requestId,
        start.identity.traceId,
        start.identity.sessionId,
        start.identity.parentRequestId,
        start.identity.clientRequestId,
        acceptedMs,
        start.acceptedAt,
        start.route.method,
        start.route.path,
        start.route.operation,
        start.attribution.source,
        start.attribution.client,
        start.attribution.project,
        start.attribution.provider,
        start.attribution.model,
        start.attribution.parentSessionId,
        sqliteBoolean(start.attribution.subagent),
        start.attribution.compactType,
        start.context.messageCount,
        start.context.toolDefinitionCount,
        start.context.contextWindowTokens,
        start.context.requestedMaxOutputTokens,
        start.context.usedTokens,
        start.context.usedRatio,
        start.size.requestBytes,
        start.size.responseBytes,
        start.size.responseChunks,
      )
      insertLifecycle(
        db,
        start.identity.requestId,
        0,
        acceptedMs,
        start.acceptedAt,
        "accepted",
        "accepted",
        null,
      )
    }, start.identity.requestId)
    return new SqliteTrafficObservationHandle(this, start.identity.requestId)
  }

  recordDispatch(
    requestId: string,
    observation: TrafficDispatchObservation,
  ): void {
    this.enqueue((db) => {
      const atMs = timestampMs(observation.at)
      const existing = db
        .prepare(
          "SELECT dispatch_started_at_ms FROM traffic_requests WHERE request_id = ?",
        )
        .get(requestId) as Row | undefined
      db.prepare(
        `
        UPDATE traffic_requests SET
          state = CASE WHEN state = 'accepted' THEN 'dispatching' ELSE state END,
          dispatch_started_at_ms = COALESCE(dispatch_started_at_ms, ?),
          dispatch_started_at_utc = COALESCE(dispatch_started_at_utc, ?),
          source = COALESCE(?, source), client = COALESCE(?, client),
          project = COALESCE(?, project), provider = COALESCE(?, provider),
          model = COALESCE(?, model), parent_session_id = COALESCE(?, parent_session_id),
          subagent = COALESCE(?, subagent), compact_type = COALESCE(?, compact_type),
          attempt_count = MAX(attempt_count, ?), retry_count = MAX(retry_count, ?),
          status_code = COALESCE(?, status_code), streamed = COALESCE(?, streamed),
          upstream_request_id = COALESCE(?, upstream_request_id),
          requested_model = COALESCE(?, requested_model),
          resolved_model = COALESCE(?, resolved_model)
        WHERE request_id = ? AND state != 'completed'
      `,
      ).run(
        atMs,
        observation.at,
        observation.attribution.source,
        observation.attribution.client,
        observation.attribution.project,
        observation.attribution.provider,
        observation.attribution.model,
        observation.attribution.parentSessionId,
        sqliteBoolean(observation.attribution.subagent),
        observation.attribution.compactType,
        observation.dispatch.attemptCount,
        observation.dispatch.retryCount,
        observation.dispatch.statusCode,
        sqliteBoolean(observation.dispatch.streamed),
        observation.dispatch.upstreamRequestId,
        observation.dispatch.requestedModel,
        observation.dispatch.resolvedModel,
        requestId,
      )
      if (existing && existing.dispatch_started_at_ms === null) {
        insertLifecycle(
          db,
          requestId,
          nextSequence(db, requestId),
          atMs,
          observation.at,
          "dispatch-started",
          "dispatching",
          null,
        )
      }
    }, requestId)
  }

  recordContext(
    requestId: string,
    observation: TrafficContextObservation,
  ): void {
    this.enqueue((db) => {
      const context = observation.context
      db.prepare(
        `
        UPDATE traffic_requests SET
          message_count = COALESCE(?, message_count),
          tool_definition_count = COALESCE(?, tool_definition_count),
          context_window_tokens = COALESCE(?, context_window_tokens),
          requested_max_output_tokens = COALESCE(?, requested_max_output_tokens),
          used_tokens = COALESCE(?, used_tokens),
          used_ratio = COALESCE(?, used_ratio)
        WHERE request_id = ? AND state != 'completed'
      `,
      ).run(
        context.messageCount,
        context.toolDefinitionCount,
        context.contextWindowTokens,
        context.requestedMaxOutputTokens,
        context.usedTokens,
        context.usedRatio,
        requestId,
      )
    }, requestId)
  }

  recordFirstResponse(
    requestId: string,
    observation: TrafficFirstResponseObservation,
  ): void {
    this.enqueue((db) => {
      const atMs = timestampMs(observation.at)
      const existing = db
        .prepare(
          "SELECT first_response_at_ms FROM traffic_requests WHERE request_id = ?",
        )
        .get(requestId) as Row | undefined
      db.prepare(
        `
        UPDATE traffic_requests SET state = 'streaming',
          first_response_at_ms = COALESCE(first_response_at_ms, ?),
          first_response_at_utc = COALESCE(first_response_at_utc, ?),
          status_code = ?, streamed = ?
        WHERE request_id = ? AND state != 'completed'
      `,
      ).run(
        atMs,
        observation.at,
        observation.statusCode,
        observation.streamed ? 1 : 0,
        requestId,
      )
      if (existing && existing.first_response_at_ms === null) {
        insertLifecycle(
          db,
          requestId,
          nextSequence(db, requestId),
          atMs,
          observation.at,
          "response-started",
          "streaming",
          null,
        )
      }
    }, requestId)
  }

  recordTokens(requestId: string, observation: TrafficTokenObservation): void {
    this.enqueue((db) => {
      const t = observation.tokens
      const usedTokens =
        t.inputTokens + t.cacheReadInputTokens + t.cacheCreationInputTokens
      db.prepare(
        `
        UPDATE traffic_requests SET tokens_observed = 1, input_tokens = ?,
          output_tokens = ?, cache_read_input_tokens = ?,
          cache_creation_input_tokens = ?, reasoning_tokens = ?, total_tokens = ?,
          total_nano_aiu = ?, used_tokens = ?,
          used_ratio = CASE WHEN context_window_tokens > 0
            THEN CAST(? AS REAL) / context_window_tokens ELSE used_ratio END
        WHERE request_id = ? AND state != 'completed'
      `,
      ).run(
        t.inputTokens,
        t.outputTokens,
        t.cacheReadInputTokens,
        t.cacheCreationInputTokens,
        t.reasoningTokens,
        t.totalTokens,
        t.totalNanoAiu,
        usedTokens,
        usedTokens,
        requestId,
      )
    }, requestId)
  }

  complete(requestId: string, observation: TrafficCompletionObservation): void {
    // The terminal snapshot deliberately maps every nullable contract field.
    // eslint-disable-next-line complexity
    this.enqueue((db) => {
      db.exec("BEGIN IMMEDIATE")
      try {
        const atMs = timestampMs(observation.at)
        const t = observation.tokens
        const usedTokens =
          t === null ? null : (
            t.inputTokens + t.cacheReadInputTokens + t.cacheCreationInputTokens
          )
        const error = observation.error
        const result = db
          .prepare(
            `
          UPDATE traffic_requests SET state = 'completed', outcome = ?,
            completed_at_ms = ?, completed_at_utc = ?,
            attempt_count = MAX(attempt_count, ?), retry_count = MAX(retry_count, ?),
            status_code = COALESCE(?, status_code), streamed = COALESCE(?, streamed),
            upstream_request_id = COALESCE(?, upstream_request_id),
            requested_model = COALESCE(?, requested_model),
            resolved_model = COALESCE(?, resolved_model),
            tokens_observed = CASE WHEN ? IS NULL THEN tokens_observed ELSE 1 END,
            input_tokens = COALESCE(?, input_tokens), output_tokens = COALESCE(?, output_tokens),
            cache_read_input_tokens = COALESCE(?, cache_read_input_tokens),
            cache_creation_input_tokens = COALESCE(?, cache_creation_input_tokens),
            reasoning_tokens = COALESCE(?, reasoning_tokens), total_tokens = COALESCE(?, total_tokens),
            total_nano_aiu = COALESCE(?, total_nano_aiu),
            used_tokens = COALESCE(?, used_tokens),
            used_ratio = CASE WHEN context_window_tokens > 0 AND ? IS NOT NULL
              THEN CAST(? AS REAL) / context_window_tokens ELSE used_ratio END,
            request_bytes = COALESCE(?, request_bytes), response_bytes = COALESCE(?, response_bytes),
            response_chunks = COALESCE(?, response_chunks), stop_reason = ?, tool_use_count = ?,
            error_category = ?, error_code = ?,
            error_message = ?, error_retryable = ?
          WHERE request_id = ? AND state != 'completed'
        `,
          )
          .run(
            observation.outcome,
            atMs,
            observation.at,
            observation.dispatch.attemptCount,
            observation.dispatch.retryCount,
            observation.dispatch.statusCode,
            sqliteBoolean(observation.dispatch.streamed),
            observation.dispatch.upstreamRequestId,
            observation.dispatch.requestedModel,
            observation.dispatch.resolvedModel,
            t === null ? null : 1,
            t?.inputTokens ?? null,
            t?.outputTokens ?? null,
            t?.cacheReadInputTokens ?? null,
            t?.cacheCreationInputTokens ?? null,
            t?.reasoningTokens ?? null,
            t?.totalTokens ?? null,
            t?.totalNanoAiu ?? null,
            usedTokens,
            usedTokens,
            usedTokens,
            observation.size.requestBytes,
            observation.size.responseBytes,
            observation.size.responseChunks,
            observation.response.stopReason,
            observation.response.toolUseCount,
            error?.category ?? null,
            error?.code ?? null,
            error?.message ?? null,
            error === null ? null : sqliteBoolean(error.retryable),
            requestId,
          )
        const changes = numberValue((result as { changes?: unknown }).changes)
        if (changes > 0) {
          insertLifecycle(
            db,
            requestId,
            nextSequence(db, requestId),
            atMs,
            observation.at,
            "completed",
            "completed",
            observation.outcome,
          )
        }
        db.exec("COMMIT")
      } catch (error) {
        db.exec("ROLLBACK")
        throw error
      }
    }, requestId)
  }

  // eslint-disable-next-line complexity
  async listRequests(
    query: TrafficRequestListQuery,
  ): Promise<TrafficRequestList> {
    if (!isSqliteRuntimeSupported())
      return {
        contractVersion: TRAFFIC_OBSERVABILITY_CONTRACT_VERSION,
        items: [],
        nextCursor: null,
        hasMore: false,
      }
    await this.synchronize()
    const db = await this.store.getDb()
    const filtersKey = JSON.stringify(query.filters)
    const cursor = decodeCursor(query.cursor)
    if (
      query.cursor
      && (!cursor
        || cursor.filters !== filtersKey
        || cursor.sort !== query.sort
        || cursor.direction !== query.direction)
    ) {
      throw new Error("Invalid or mismatched traffic cursor")
    }
    const maxRow = db
      .prepare("SELECT COALESCE(MAX(id), 0) AS id FROM traffic_requests")
      .get() as Row | undefined
    const snapshotMaxId = cursor?.snapshotMaxId ?? numberValue(maxRow?.id)
    const snapshotAtMs = cursor?.snapshotAtMs ?? this.now().getTime()
    const range = query.filters.range
    const rows = db
      .prepare(
        `SELECT * FROM traffic_requests
         WHERE id <= ?
           AND (? IS NULL OR accepted_at_ms >= ?)
           AND (? IS NULL OR accepted_at_ms <= ?)`,
      )
      .all(
        snapshotMaxId,
        range?.from ?? null,
        range ? Date.parse(range.from) : null,
        range?.to ?? null,
        range ? Date.parse(range.to) : null,
      ) as Array<Row>
    const candidates = rows
      .map((row) => ({
        id: numberValue(row.id),
        item: rowToSummary(row, snapshotAtMs),
      }))
      .filter(({ item }) => matchesFilters(item, query.filters))
      .map((entry) => ({
        ...entry,
        value:
          query.sort === "acceptedAt" ?
            Date.parse(entry.item.timing.acceptedAt)
          : (entry.item.timing.durationMs ?? -1),
      }))
      .sort((a, b) => {
        const order = a.value === b.value ? a.id - b.id : a.value - b.value
        return query.direction === "ascending" ? order : -order
      })
      .filter((entry) => {
        if (!cursor) return true
        if (query.direction === "ascending")
          return (
            entry.value > cursor.lastValue
            || (entry.value === cursor.lastValue && entry.id > cursor.lastId)
          )
        return (
          entry.value < cursor.lastValue
          || (entry.value === cursor.lastValue && entry.id < cursor.lastId)
        )
      })
    const page = candidates.slice(0, query.limit)
    const hasMore = candidates.length > query.limit
    const last = page.at(-1)
    return {
      contractVersion: TRAFFIC_OBSERVABILITY_CONTRACT_VERSION,
      items: page.map(({ item }) => item),
      hasMore,
      nextCursor:
        hasMore && last ?
          encodeCursor({
            version: 1,
            filters: filtersKey,
            sort: query.sort,
            direction: query.direction,
            snapshotMaxId,
            snapshotAtMs,
            lastId: last.id,
            lastValue: last.value,
          })
        : null,
    }
  }

  async getRequest(requestId: string): Promise<TrafficRequestDetail | null> {
    if (!isSqliteRuntimeSupported()) return null
    await this.synchronize()
    const db = await this.store.getDb()
    const row = db
      .prepare("SELECT * FROM traffic_requests WHERE request_id = ?")
      .get(requestId) as Row | undefined
    if (!row) return null
    const lifecycleRows = db
      .prepare(
        "SELECT * FROM traffic_request_lifecycle WHERE request_id = ? ORDER BY sequence ASC",
      )
      .all(requestId) as Array<Row>
    return {
      contractVersion: TRAFFIC_OBSERVABILITY_CONTRACT_VERSION,
      request: rowToSummary(row, this.now().getTime()),
      lifecycle: lifecycleRows.map((event) => ({
        sequence: numberValue(event.sequence),
        at: stringValue(event.at_utc),
        kind: stringValue(
          event.kind,
        ) as TrafficRequestDetail["lifecycle"][number]["kind"],
        state: stringValue(
          event.state,
        ) as TrafficRequestDetail["lifecycle"][number]["state"],
        outcome: nullableString(
          event.outcome,
        ) as TrafficRequestDetail["lifecycle"][number]["outcome"],
      })),
    }
  }

  async getOverview(query: TrafficOverviewQuery): Promise<TrafficOverview> {
    if (!isSqliteRuntimeSupported()) return emptyOverview(this.now(), query)
    await this.synchronize()
    const db = await this.store.getDb()
    const generated = this.now()
    const filterRange = query.filters.range ?? {
      from: new Date(generated.getTime() - this.retentionMs).toISOString(),
      to: generated.toISOString(),
    }
    const rows = db
      .prepare(
        `SELECT * FROM traffic_requests
         WHERE accepted_at_ms >= ? AND accepted_at_ms <= ?`,
      )
      .all(
        Date.parse(filterRange.from),
        Date.parse(filterRange.to),
      ) as Array<Row>
    const items = rows
      .map((row) => rowToSummary(row, generated.getTime()))
      .filter((item) => matchesFilters(item, query.filters))
    const range = filterRange
    return {
      contractVersion: TRAFFIC_OBSERVABILITY_CONTRACT_VERSION,
      generatedAt: generated.toISOString(),
      range,
      totals: buildTotals(items),
      latency: {
        queue: percentile(
          items.flatMap((item) =>
            item.timing.queueMs === null ? [] : [item.timing.queueMs],
          ),
        ),
        timeToFirstResponse: percentile(
          items.flatMap((item) =>
            item.timing.timeToFirstResponseMs === null ?
              []
            : [item.timing.timeToFirstResponseMs],
          ),
        ),
        total: percentile(
          items.flatMap((item) =>
            item.timing.durationMs === null ? [] : [item.timing.durationMs],
          ),
        ),
      },
      flow: buildFlow(items),
      tokens: buildTokenSeries(items, range, query.tokenBucketMs),
    }
  }

  async prune(beforeMs: number): Promise<number> {
    if (!isSqliteRuntimeSupported()) return 0
    await this.flush()
    const db = await this.store.getDb()
    return numberValue(
      (
        db
          .prepare(
            "DELETE FROM traffic_requests WHERE state = 'completed' AND accepted_at_ms < ?",
          )
          .run(beforeMs) as { changes?: number }
      ).changes,
    )
  }

  async close(): Promise<void> {
    await this.flush()
    await this.store.close({
      beforeClose: (db) => {
        try {
          db.exec("PRAGMA wal_checkpoint(TRUNCATE)")
        } catch {
          /* best effort */
        }
      },
    })
    this.queue = Promise.resolve()
  }

  private enqueue(
    action: (db: SqliteDatabase) => Promise<void> | void,
    requestId: string,
  ): void {
    if (!isSqliteRuntimeSupported()) return
    this.queue = this.queue
      .then(async () => {
        const db = await this.store.getDb()
        await action(db)
        this.pruneExpired(db)
        this.invalidate(db, requestId)
      })
      .catch((error: unknown) => {
        consola.warn("Failed to persist traffic observation", error)
      })
  }

  private pruneExpired(db: SqliteDatabase): void {
    const nowMs = this.now().getTime()
    if (nowMs < this.nextRetentionCheckMs) return
    this.nextRetentionCheckMs = nowMs + RETENTION_CHECK_INTERVAL_MS
    db.prepare(
      "DELETE FROM traffic_requests WHERE state = 'completed' AND accepted_at_ms < ?",
    ).run(nowMs - this.retentionMs)
  }

  private invalidate(db: SqliteDatabase, requestId: string): void {
    if (!this.onInvalidation) return
    const row = db
      .prepare(
        "SELECT COUNT(*) AS count FROM traffic_requests WHERE state != 'completed'",
      )
      .get() as Row | undefined
    this.revision += 1
    try {
      this.onInvalidation({
        contractVersion: TRAFFIC_OBSERVABILITY_CONTRACT_VERSION,
        revision: this.revision,
        emittedAt: this.now().toISOString(),
        activeCount: numberValue(row?.count),
        overflow: false,
        scopes: ["requests", "request-detail", "overview"],
        requestIds: [requestId].slice(0, TRAFFIC_INVALIDATION_REQUEST_IDS_MAX),
      })
    } catch (error) {
      consola.warn("Traffic invalidation listener failed", error)
    }
  }

  private async flush(): Promise<void> {
    let current = this.queue
    while (true) {
      await current
      if (current === this.queue) return
      current = this.queue
    }
  }

  private async synchronize(): Promise<void> {
    await flushTokenUsageEvents()
    await this.flush()
    const db = await this.store.getDb()
    backfillLegacyUsageRows(db)
  }
}

class SqliteTrafficObservationHandle implements TrafficObservationHandle {
  private terminal = false
  private readonly observer: SqliteTrafficObserver
  private readonly requestId: string

  constructor(observer: SqliteTrafficObserver, requestId: string) {
    this.observer = observer
    this.requestId = requestId
  }
  recordDispatch(observation: TrafficDispatchObservation): void {
    if (!this.terminal)
      this.observer.recordDispatch(this.requestId, observation)
  }
  recordFirstResponse(observation: TrafficFirstResponseObservation): void {
    if (!this.terminal)
      this.observer.recordFirstResponse(this.requestId, observation)
  }
  recordContext(observation: TrafficContextObservation): void {
    if (!this.terminal) this.observer.recordContext(this.requestId, observation)
  }
  recordTokens(observation: TrafficTokenObservation): void {
    if (!this.terminal) this.observer.recordTokens(this.requestId, observation)
  }
  complete(observation: TrafficCompletionObservation): void {
    if (this.terminal) return
    this.terminal = true
    this.observer.complete(this.requestId, observation)
  }
}

let defaultObserver: SqliteTrafficObserver | null = null
let invalidationListener: TrafficInvalidationListener | undefined

export function setDefaultTrafficInvalidationListener(
  listener: TrafficInvalidationListener | undefined,
): void {
  invalidationListener = listener
}

export function getDefaultTrafficObserver(): SqliteTrafficObserver {
  defaultObserver ??= new SqliteTrafficObserver({
    onInvalidation: (invalidation) => invalidationListener?.(invalidation),
  })
  return defaultObserver
}

export async function closeTrafficStore(): Promise<void> {
  const observer = defaultObserver
  defaultObserver = null
  await observer?.close()
}

registerProcessCleanup(closeTrafficStore)
