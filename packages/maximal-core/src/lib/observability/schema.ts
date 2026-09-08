import type { SqliteDatabase } from "~/lib/platform/sqlite"

import { initializeTokenUsageDb } from "~/lib/token-usage/store"

import { numberValue, stringValue } from "./query"

const TRAFFIC_SCHEMA_VERSION = 1
const DAY_MS = 86_400_000

type Row = Record<string, unknown>

// The schema is kept in one atomic, auditable bootstrap.
// eslint-disable-next-line max-lines-per-function
export function initializeTrafficDb(
  db: SqliteDatabase,
  nowMs: number,
  retentionDays: number,
): void {
  initializeTokenUsageDb(db)
  db.exec("PRAGMA journal_mode = WAL")
  db.exec("PRAGMA busy_timeout = 5000")
  db.exec("PRAGMA foreign_keys = ON")
  db.exec(`
    CREATE TABLE IF NOT EXISTS traffic_schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at_ms INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS traffic_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT NOT NULL UNIQUE,
      legacy_usage_id INTEGER UNIQUE,
      trace_id TEXT,
      session_id TEXT,
      parent_request_id TEXT,
      client_request_id TEXT,
      accepted_at_ms INTEGER NOT NULL,
      accepted_at_utc TEXT NOT NULL,
      dispatch_started_at_ms INTEGER,
      dispatch_started_at_utc TEXT,
      first_response_at_ms INTEGER,
      first_response_at_utc TEXT,
      completed_at_ms INTEGER,
      completed_at_utc TEXT,
      state TEXT NOT NULL,
      outcome TEXT,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      operation TEXT NOT NULL,
      source TEXT,
      client TEXT,
      project TEXT,
      provider TEXT,
      model TEXT,
      parent_session_id TEXT,
      subagent INTEGER,
      compact_type TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      retry_count INTEGER NOT NULL DEFAULT 0,
      status_code INTEGER,
      streamed INTEGER,
      upstream_request_id TEXT,
      requested_model TEXT,
      resolved_model TEXT,
      tokens_observed INTEGER NOT NULL DEFAULT 0,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_input_tokens INTEGER NOT NULL DEFAULT 0,
      cache_creation_input_tokens INTEGER NOT NULL DEFAULT 0,
      reasoning_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      total_nano_aiu INTEGER NOT NULL DEFAULT 0,
      message_count INTEGER,
      tool_definition_count INTEGER,
      context_window_tokens INTEGER,
      requested_max_output_tokens INTEGER,
      used_tokens INTEGER,
      used_ratio REAL,
      request_bytes INTEGER,
      response_bytes INTEGER,
      response_chunks INTEGER,
      stop_reason TEXT,
      tool_use_count INTEGER,
      error_category TEXT,
      error_code TEXT,
      error_message TEXT,
      error_retryable INTEGER
    );
    CREATE TABLE IF NOT EXISTS traffic_request_lifecycle (
      request_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      at_ms INTEGER NOT NULL,
      at_utc TEXT NOT NULL,
      kind TEXT NOT NULL,
      state TEXT NOT NULL,
      outcome TEXT,
      PRIMARY KEY (request_id, sequence),
      FOREIGN KEY (request_id) REFERENCES traffic_requests(request_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_traffic_requests_accepted
      ON traffic_requests(accepted_at_ms, id);
    CREATE INDEX IF NOT EXISTS idx_traffic_requests_duration
      ON traffic_requests(completed_at_ms, accepted_at_ms, id);
    CREATE INDEX IF NOT EXISTS idx_traffic_requests_state
      ON traffic_requests(state);
    CREATE INDEX IF NOT EXISTS idx_traffic_requests_dimensions
      ON traffic_requests(operation, provider, model, client);
  `)
  const migration = db
    .prepare("SELECT version FROM traffic_schema_migrations WHERE version = ?")
    .get(TRAFFIC_SCHEMA_VERSION)
  if (!migration) {
    db.prepare(
      "INSERT INTO traffic_schema_migrations (version, applied_at_ms) VALUES (?, ?)",
    ).run(TRAFFIC_SCHEMA_VERSION, nowMs)
  }
  recoverActiveRows(db, nowMs)
  backfillLegacyUsageRows(db)
  const cutoff = nowMs - Math.max(1, Math.floor(retentionDays)) * DAY_MS
  db.exec(`
    DELETE FROM traffic_request_lifecycle
    WHERE request_id NOT IN (SELECT request_id FROM traffic_requests)
  `)
  db.prepare(
    "DELETE FROM traffic_requests WHERE state = 'completed' AND accepted_at_ms < ?",
  ).run(cutoff)
}

function recoverActiveRows(db: SqliteDatabase, nowMs: number): void {
  const now = new Date(nowMs).toISOString()
  const active = db
    .prepare(
      "SELECT request_id FROM traffic_requests WHERE state != 'completed'",
    )
    .all() as Array<Row>
  for (const row of active) {
    const requestId = stringValue(row.request_id)
    if (!requestId) continue
    const sequence = nextSequence(db, requestId)
    db.prepare(
      `
      UPDATE traffic_requests
      SET state = 'completed', outcome = 'cancelled', completed_at_ms = ?,
          completed_at_utc = ?, response_bytes = COALESCE(response_bytes, 0),
          response_chunks = COALESCE(response_chunks, 0)
      WHERE request_id = ?
    `,
    ).run(nowMs, now, requestId)
    insertLifecycle(
      db,
      requestId,
      sequence,
      nowMs,
      now,
      "completed",
      "completed",
      "cancelled",
    )
  }
}

export function backfillLegacyUsageRows(db: SqliteDatabase): void {
  db.exec(`
    INSERT OR IGNORE INTO traffic_requests (
      request_id, legacy_usage_id, trace_id, session_id,
      accepted_at_ms, accepted_at_utc, completed_at_ms, completed_at_utc,
      state, outcome, method, path, operation, source, provider, model,
      attempt_count, retry_count, tokens_observed, input_tokens, output_tokens,
      cache_read_input_tokens, cache_creation_input_tokens, total_tokens,
      total_nano_aiu, used_tokens
    )
    SELECT
      'legacy-token-usage-' || id, id,
      NULLIF(substr(trim(trace_id), 1, 200), ''),
      NULLIF(substr(trim(session_id), 1, 200), ''),
      created_at_ms, created_at_utc, created_at_ms, created_at_utc,
      'completed', 'succeeded', 'POST', '/legacy/token-usage', endpoint,
      source,
      CASE WHEN source = 'provider'
        THEN NULLIF(substr(trim(provider_name), 1, 200), '') ELSE 'copilot' END,
      NULLIF(substr(trim(model), 1, 200), ''), 1, 0, 1, input_tokens, output_tokens,
      cache_read_input_tokens, cache_creation_input_tokens, total_tokens,
      total_nano_aiu,
      input_tokens + cache_read_input_tokens + cache_creation_input_tokens
    FROM token_usage_events
    WHERE traffic_request_id IS NULL
  `)
  db.exec(`
    UPDATE traffic_requests SET
      trace_id = NULLIF(substr(trim(trace_id), 1, 200), ''),
      session_id = NULLIF(substr(trim(session_id), 1, 200), ''),
      provider = NULLIF(substr(trim(provider), 1, 200), ''),
      model = NULLIF(substr(trim(model), 1, 200), '')
    WHERE legacy_usage_id IS NOT NULL
  `)
  db.exec(`
    INSERT OR IGNORE INTO traffic_request_lifecycle
      (request_id, sequence, at_ms, at_utc, kind, state, outcome)
    SELECT request_id, 0, accepted_at_ms, accepted_at_utc,
      'accepted', 'accepted', NULL
    FROM traffic_requests WHERE legacy_usage_id IS NOT NULL;
    INSERT OR IGNORE INTO traffic_request_lifecycle
      (request_id, sequence, at_ms, at_utc, kind, state, outcome)
    SELECT request_id, 1, completed_at_ms, completed_at_utc,
      'completed', 'completed', outcome
    FROM traffic_requests WHERE legacy_usage_id IS NOT NULL;
  `)
}

// Mirrors the seven persisted lifecycle fields without a lossy intermediate.
// eslint-disable-next-line max-params
export function insertLifecycle(
  db: SqliteDatabase,
  requestId: string,
  sequence: number,
  atMs: number,
  at: string,
  kind: string,
  state: string,
  outcome: string | null,
): void {
  db.prepare(
    `
    INSERT OR IGNORE INTO traffic_request_lifecycle
      (request_id, sequence, at_ms, at_utc, kind, state, outcome)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(requestId, sequence, atMs, at, kind, state, outcome)
}

export function nextSequence(db: SqliteDatabase, requestId: string): number {
  const row = db
    .prepare(
      "SELECT COALESCE(MAX(sequence), -1) + 1 AS sequence FROM traffic_request_lifecycle WHERE request_id = ?",
    )
    .get(requestId) as Row | undefined
  return numberValue(row?.sequence)
}
