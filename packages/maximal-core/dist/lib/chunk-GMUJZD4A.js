import {
  generateTraceId,
  pricedModelIsPaid,
  registerProcessCleanup,
  requestContext
} from "./chunk-UQM4JUWE.js";
import {
  EventBus,
  PATHS,
  getTokenUsageRetentionDays,
  state
} from "./chunk-4JX7327A.js";
import {
  BUILD_GIT_BRANCH,
  BUILD_GIT_SHA
} from "./chunk-CXWZH3X6.js";

// src/lib/token-usage/retention.ts
import consola2 from "consola";

// src/lib/token-usage/store.ts
import consola from "consola";
import path2 from "path";

// src/lib/platform/sqlite.ts
import fs from "fs/promises";
import path from "path";
var MINIMUM_NODE_SQLITE_VERSION = "22.13.0";
var isBunRuntime = () => Boolean(globalThis.Bun);
function parseNodeVersion(version) {
  return version.split(".", 3).map((part) => {
    const parsed = Number.parseInt(part, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  });
}
function isNodeSqliteSupportedVersion(version) {
  const current = parseNodeVersion(version);
  const minimum = parseNodeVersion(MINIMUM_NODE_SQLITE_VERSION);
  for (const [index, minimumPart] of minimum.entries()) {
    const currentPart = current[index] ?? 0;
    if (currentPart > minimumPart) return true;
    if (currentPart < minimumPart) return false;
  }
  return true;
}
function isSqliteRuntimeSupported(input = {}) {
  if (input.isBun ?? isBunRuntime()) {
    return true;
  }
  return isNodeSqliteSupportedVersion(
    input.nodeVersion ?? process.versions.node
  );
}
function getUnsupportedNodeSqliteMessage(nodeVersion) {
  return `SQLite-backed token usage requires Bun or Node.js >= ${MINIMUM_NODE_SQLITE_VERSION}. Detected Node.js ${nodeVersion}. Upgrade Node.js or run the CLI with Bun, for example \`bunx --bun @stuffbucket/maximal@latest start\` or \`maximal start\`.`;
}
var UnsupportedNodeSqliteRuntimeError = class extends Error {
  constructor(nodeVersion, cause) {
    super(getUnsupportedNodeSqliteMessage(nodeVersion), { cause });
    this.name = "UnsupportedNodeSqliteRuntimeError";
  }
};
async function openBunDatabase(dbPath) {
  const specifier = ["bun", "sqlite"].join(":");
  const sqlite = await import(specifier);
  return new sqlite.Database(dbPath);
}
async function loadNodeSqliteModule() {
  const nodeVersion = process.versions.node;
  if (!isNodeSqliteSupportedVersion(nodeVersion)) {
    throw new UnsupportedNodeSqliteRuntimeError(nodeVersion);
  }
  const specifier = ["node", "sqlite"].join(":");
  try {
    return await import(specifier);
  } catch (error) {
    throw new UnsupportedNodeSqliteRuntimeError(nodeVersion, error);
  }
}
async function openNodeDatabase(dbPath) {
  const sqlite = await loadNodeSqliteModule();
  return new sqlite.DatabaseSync(dbPath);
}
async function openSqliteDatabase(dbPath) {
  const dir = path.dirname(dbPath);
  if (dbPath !== ":memory:" && dir !== ".") {
    await fs.mkdir(dir, { recursive: true });
  }
  return isBunRuntime() ? openBunDatabase(dbPath) : openNodeDatabase(dbPath);
}
var SqliteDbStore = class {
  dbPromise = null;
  options;
  constructor(options) {
    this.options = options;
  }
  getDb() {
    this.dbPromise ??= this.open();
    return this.dbPromise;
  }
  async close(input) {
    const currentDbPromise = this.dbPromise;
    this.dbPromise = null;
    if (!currentDbPromise) {
      return;
    }
    const db = await currentDbPromise;
    input?.beforeClose?.(db);
    db.close?.();
  }
  async open() {
    const openImpl = this.options.open ?? openSqliteDatabase;
    const db = await openImpl(this.options.getPath());
    try {
      this.options.initialize?.(db);
    } catch (error) {
      try {
        db.close?.();
      } catch {
      }
      throw error;
    }
    return db;
  }
};
function getUserVersion(db) {
  const row = db.prepare("PRAGMA user_version").get();
  return typeof row?.user_version === "number" ? row.user_version : 0;
}
function setUserVersion(db, version) {
  db.exec(`PRAGMA user_version = ${Math.floor(version)}`);
}
function runMigrations(db, migrations) {
  let current = getUserVersion(db);
  for (let target = current + 1; target <= migrations.length; target++) {
    const migration = migrations[target - 1];
    db.exec("BEGIN");
    try {
      migration.up(db);
      setUserVersion(db, target);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw new Error(
        `SQLite migration failed at step ${target} (${migration.name}): ` + (error instanceof Error ? error.message : String(error)),
        { cause: error }
      );
    }
    current = target;
  }
  return current;
}

// src/lib/token-usage/store.ts
var DB_PATH_ENV = "COPILOT_API_SQLITE_DB_PATH";
var DEFAULT_DB_FILENAME = "copilot-api.sqlite";
var writeQueue = Promise.resolve();
function getDbPath() {
  return process.env[DB_PATH_ENV] ?? path2.join(PATHS.APP_DIR, DEFAULT_DB_FILENAME);
}
var tokenUsageDbStore = new SqliteDbStore({
  getPath: getDbPath,
  initialize: initializeTokenUsageDb
});
function getDb() {
  return tokenUsageDbStore.getDb();
}
function isTokenUsageStorageEnabled() {
  return isSqliteRuntimeSupported();
}
function initializeTokenUsageDb(db) {
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS token_usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at_ms INTEGER NOT NULL,
      created_at_utc TEXT NOT NULL,
      trace_id TEXT NOT NULL,
      session_id TEXT NOT NULL DEFAULT '',
      user_id TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      provider_name TEXT,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_input_tokens INTEGER NOT NULL DEFAULT 0,
      cache_creation_input_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0
    )
  `);
  ensureColumn(db, "user_id", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "total_tokens", "INTEGER NOT NULL DEFAULT 0");
  runMigrations(db, TOKEN_USAGE_MIGRATIONS);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_token_usage_events_created_at_ms
    ON token_usage_events(created_at_ms)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_token_usage_events_model
    ON token_usage_events(model)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_token_usage_events_trace_id
    ON token_usage_events(trace_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_token_usage_events_session_id
    ON token_usage_events(session_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_token_usage_events_user_id
    ON token_usage_events(user_id)
  `);
}
var TOKEN_USAGE_MIGRATIONS = [
  {
    // Copilot returns per-request cost (`copilot_usage.total_nano_aiu`) and
    // each model advertises `billing.is_premium`. Capture both so usage can
    // be costed and split premium/included. Existing rows predate capture:
    // total_nano_aiu backfills to 0 (cost was never recorded and can't be
    // known retroactively), is_premium to NULL (genuinely unknown).
    name: "add total_nano_aiu + is_premium",
    up: (db) => {
      db.exec(
        "ALTER TABLE token_usage_events ADD COLUMN total_nano_aiu INTEGER NOT NULL DEFAULT 0"
      );
      db.exec("ALTER TABLE token_usage_events ADD COLUMN is_premium INTEGER");
    }
  },
  {
    // Forward-looking (spec §5): a nullable per-project attribution key so the
    // schema/filter/route exist BEFORE per-project tracking turns on. It will be
    // populated later — from `api_key_id` first, then a client-supplied
    // `workspace` header — never from the ephemeral, high-cardinality
    // `session_id` (which would flood the rail). Existing rows predate it and
    // stay NULL (unattributed), which is the correct "no project" reading.
    name: "add nullable project_id",
    up: (db) => {
      db.exec("ALTER TABLE token_usage_events ADD COLUMN project_id TEXT");
    }
  }
];
function ensureColumn(db, name, definition) {
  const rows = db.prepare("PRAGMA table_info(token_usage_events)").all();
  const hasColumn = rows.some((row) => row.name === name);
  if (!hasColumn) {
    db.exec(`ALTER TABLE token_usage_events ADD COLUMN ${name} ${definition}`);
  }
}
function normalizeToken(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}
function normalizeOptionalToken(value) {
  return value === null || value === void 0 ? void 0 : normalizeToken(value);
}
function hasAnyToken(tokens) {
  return normalizeToken(tokens.input_tokens) > 0 || normalizeToken(tokens.output_tokens) > 0 || normalizeToken(tokens.cache_read_input_tokens) > 0 || normalizeToken(tokens.cache_creation_input_tokens) > 0 || normalizeToken(tokens.total_tokens) > 0 || normalizeToken(tokens.total_nano_aiu) > 0;
}
function resolveTotalTokens(input) {
  const explicitTotal = normalizeOptionalToken(input.total_tokens);
  if (explicitTotal !== void 0) {
    return explicitTotal;
  }
  return normalizeToken(input.input_tokens) + normalizeToken(input.output_tokens) + normalizeToken(input.cache_read_input_tokens) + normalizeToken(input.cache_creation_input_tokens);
}
async function writeTokenUsageEvent(event) {
  const db = await getDb();
  db.prepare(
    `
      INSERT INTO token_usage_events (
        created_at_ms,
        created_at_utc,
        trace_id,
        session_id,
        user_id,
        source,
        endpoint,
        provider_name,
        model,
        input_tokens,
        output_tokens,
        cache_read_input_tokens,
        cache_creation_input_tokens,
        total_tokens,
        total_nano_aiu,
        is_premium
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    event.created_at_ms,
    event.created_at_utc,
    event.trace_id,
    event.session_id,
    event.user_id,
    event.source,
    event.endpoint,
    event.provider_name,
    event.model,
    event.input_tokens,
    event.output_tokens,
    event.cache_read_input_tokens,
    event.cache_creation_input_tokens,
    event.total_tokens,
    event.total_nano_aiu,
    event.is_premium
  );
}
function enqueueTokenUsageWrite(event) {
  if (!isTokenUsageStorageEnabled()) {
    return;
  }
  writeQueue = writeQueue.then(() => writeTokenUsageEvent(event)).catch((error) => {
    consola.warn("Failed to record token usage", error);
  });
}
async function flushTokenUsageEvents() {
  let currentQueue = writeQueue;
  while (true) {
    await currentQueue;
    if (currentQueue === writeQueue) {
      return;
    }
    currentQueue = writeQueue;
  }
}
async function pruneTokenUsageEvents(beforeMs) {
  if (!isTokenUsageStorageEnabled()) return 0;
  await flushTokenUsageEvents();
  const db = await getDb();
  const sql = "DELETE FROM token_usage_events WHERE created_at_ms < ?";
  return db.prepare(sql).run(beforeMs).changes;
}
function getPeriodRange(period, now = /* @__PURE__ */ new Date()) {
  if (period === "all") {
    return { endMs: now.getTime() + 1, startMs: 0 };
  }
  if (period === "week") {
    return { endMs: now.getTime() + 1, startMs: now.getTime() - 7 * 864e5 };
  }
  const start = new Date(now);
  switch (period) {
    case "day": {
      start.setHours(0, 0, 0, 0);
      break;
    }
    case "month": {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    }
    default: {
      break;
    }
  }
  const end = new Date(start);
  switch (period) {
    case "day": {
      end.setDate(end.getDate() + 1);
      break;
    }
    case "month": {
      end.setMonth(end.getMonth() + 1);
      break;
    }
    default: {
      break;
    }
  }
  return {
    endMs: end.getTime(),
    startMs: start.getTime()
  };
}
function createEmptyTotals() {
  return {
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    input_tokens: 0,
    output_tokens: 0,
    request_count: 0,
    total_tokens: 0,
    total_nano_aiu: 0
  };
}
function createEmptySummary(period) {
  const range = getPeriodRange(period);
  return {
    byModel: [],
    byProvider: [],
    period,
    range: {
      end_ms: range.endMs,
      end_utc: new Date(range.endMs).toISOString(),
      start_ms: range.startMs,
      start_utc: new Date(range.startMs).toISOString()
    },
    totals: createEmptyTotals()
  };
}
function createEmptyEventsPage(input) {
  const range = getPeriodRange(input.period);
  const page = Math.max(1, Math.floor(input.page));
  const pageSize = Math.min(100, Math.max(1, Math.floor(input.pageSize)));
  return {
    items: [],
    page,
    page_size: pageSize,
    period: input.period,
    range: {
      end_ms: range.endMs,
      end_utc: new Date(range.endMs).toISOString(),
      start_ms: range.startMs,
      start_utc: new Date(range.startMs).toISOString()
    },
    total: 0,
    total_pages: 1
  };
}
function numberFromRow(row, key) {
  const value = row?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function totalsFromRow(row) {
  return {
    cache_creation_input_tokens: numberFromRow(
      row,
      "cache_creation_input_tokens"
    ),
    cache_read_input_tokens: numberFromRow(row, "cache_read_input_tokens"),
    input_tokens: numberFromRow(row, "input_tokens"),
    output_tokens: numberFromRow(row, "output_tokens"),
    request_count: numberFromRow(row, "request_count"),
    total_tokens: numberFromRow(row, "total_tokens"),
    total_nano_aiu: numberFromRow(row, "total_nano_aiu")
  };
}
function premiumFromRow(row, key) {
  const value = row[key];
  return typeof value === "number" ? value === 1 : null;
}
function stringFromRow(row, key) {
  const value = row[key];
  return typeof value === "string" ? value : "";
}
function nullableStringFromRow(row, key) {
  const value = row[key];
  return typeof value === "string" ? value : null;
}
function providerKey(source, providerName) {
  if (source === "copilot") return "copilot";
  return providerName && providerName.trim() ? providerName : "provider";
}
function usageEventFromRow(row) {
  return {
    cache_creation_input_tokens: numberFromRow(
      row,
      "cache_creation_input_tokens"
    ),
    cache_read_input_tokens: numberFromRow(row, "cache_read_input_tokens"),
    created_at_ms: numberFromRow(row, "created_at_ms"),
    created_at_utc: stringFromRow(row, "created_at_utc"),
    endpoint: stringFromRow(row, "endpoint"),
    id: numberFromRow(row, "id"),
    input_tokens: numberFromRow(row, "input_tokens"),
    model: stringFromRow(row, "model") || "unknown",
    output_tokens: numberFromRow(row, "output_tokens"),
    provider_name: nullableStringFromRow(row, "provider_name"),
    session_id: stringFromRow(row, "session_id"),
    source: stringFromRow(row, "source"),
    total_tokens: numberFromRow(row, "total_tokens"),
    total_nano_aiu: numberFromRow(row, "total_nano_aiu"),
    is_premium: premiumFromRow(row, "is_premium"),
    trace_id: stringFromRow(row, "trace_id"),
    user_id: stringFromRow(row, "user_id")
  };
}
async function getTokenUsageSummary(period) {
  if (!isTokenUsageStorageEnabled()) {
    return createEmptySummary(period);
  }
  await flushTokenUsageEvents();
  const range = getPeriodRange(period);
  const db = await getDb();
  const totalsRow = db.prepare(
    `
    SELECT
      COUNT(*) AS request_count,
      COALESCE(SUM(input_tokens), 0) AS input_tokens,
      COALESCE(SUM(output_tokens), 0) AS output_tokens,
      COALESCE(SUM(cache_read_input_tokens), 0) AS cache_read_input_tokens,
      COALESCE(SUM(cache_creation_input_tokens), 0) AS cache_creation_input_tokens,
      COALESCE(SUM(total_tokens), 0) AS total_tokens,
      COALESCE(SUM(total_nano_aiu), 0) AS total_nano_aiu
    FROM token_usage_events
    WHERE created_at_ms >= ? AND created_at_ms < ?
  `
  ).get(range.startMs, range.endMs);
  const byModelRows = db.prepare(
    `
    SELECT
      model,
      COUNT(*) AS request_count,
      COALESCE(SUM(input_tokens), 0) AS input_tokens,
      COALESCE(SUM(output_tokens), 0) AS output_tokens,
      COALESCE(SUM(cache_read_input_tokens), 0) AS cache_read_input_tokens,
      COALESCE(SUM(cache_creation_input_tokens), 0) AS cache_creation_input_tokens,
      COALESCE(SUM(total_tokens), 0) AS total_tokens,
      COALESCE(SUM(total_nano_aiu), 0) AS total_nano_aiu,
      MAX(is_premium) AS is_premium
    FROM token_usage_events
    WHERE created_at_ms >= ? AND created_at_ms < ?
    GROUP BY model
    ORDER BY
      total_tokens DESC,
      model ASC
  `
  ).all(range.startMs, range.endMs);
  const byProviderRows = db.prepare(
    `
    SELECT
      source,
      provider_name,
      COUNT(*) AS request_count,
      COALESCE(SUM(input_tokens), 0) AS input_tokens,
      COALESCE(SUM(output_tokens), 0) AS output_tokens,
      COALESCE(SUM(cache_read_input_tokens), 0) AS cache_read_input_tokens,
      COALESCE(SUM(cache_creation_input_tokens), 0) AS cache_creation_input_tokens,
      COALESCE(SUM(total_tokens), 0) AS total_tokens,
      COALESCE(SUM(total_nano_aiu), 0) AS total_nano_aiu
    FROM token_usage_events
    WHERE created_at_ms >= ? AND created_at_ms < ?
    GROUP BY source, provider_name
    ORDER BY
      total_tokens DESC,
      source ASC
  `
  ).all(range.startMs, range.endMs);
  return {
    byModel: byModelRows.map((row) => ({
      ...totalsFromRow(row),
      model: typeof row.model === "string" ? row.model : "unknown",
      is_premium: premiumFromRow(row, "is_premium")
    })),
    byProvider: byProviderRows.map((row) => {
      const source = stringFromRow(row, "source");
      const providerName = nullableStringFromRow(row, "provider_name");
      return {
        ...totalsFromRow(row),
        source,
        provider_name: providerName,
        provider: providerKey(source, providerName)
      };
    }),
    period,
    range: {
      end_ms: range.endMs,
      end_utc: new Date(range.endMs).toISOString(),
      start_ms: range.startMs,
      start_utc: new Date(range.startMs).toISOString()
    },
    totals: totalsFromRow(totalsRow)
  };
}
async function getTokenUsageEventsPage(input) {
  if (!isTokenUsageStorageEnabled()) {
    return createEmptyEventsPage(input);
  }
  await flushTokenUsageEvents();
  const range = getPeriodRange(input.period);
  const page = Math.max(1, Math.floor(input.page));
  const pageSize = Math.min(100, Math.max(1, Math.floor(input.pageSize)));
  const offset = (page - 1) * pageSize;
  const db = await getDb();
  const totalRow = db.prepare(
    `
    SELECT COUNT(*) AS total
    FROM token_usage_events
    WHERE created_at_ms >= ? AND created_at_ms < ?
  `
  ).get(range.startMs, range.endMs);
  const rows = db.prepare(
    `
    SELECT
      id,
      created_at_ms,
      created_at_utc,
      trace_id,
      session_id,
      user_id,
      source,
      endpoint,
      provider_name,
      model,
      input_tokens,
      output_tokens,
      cache_read_input_tokens,
      cache_creation_input_tokens,
      total_tokens,
      total_nano_aiu,
      is_premium
    FROM token_usage_events
    WHERE created_at_ms >= ? AND created_at_ms < ?
    ORDER BY created_at_ms DESC, id DESC
    LIMIT ? OFFSET ?
  `
  ).all(range.startMs, range.endMs, pageSize, offset);
  const total = numberFromRow(totalRow, "total");
  return {
    items: rows.map((row) => usageEventFromRow(row)),
    page,
    page_size: pageSize,
    period: input.period,
    range: {
      end_ms: range.endMs,
      end_utc: new Date(range.endMs).toISOString(),
      start_ms: range.startMs,
      start_utc: new Date(range.startMs).toISOString()
    },
    total,
    total_pages: Math.max(1, Math.ceil(total / pageSize))
  };
}
var SERIES_TARGET_BUCKETS = 60;
var SERIES_MAX_BUCKETS = 500;
var MINUTE_MS = 6e4;
var HOUR_MS = 36e5;
var DAY_MS = 864e5;
function resolveBucketMs(input) {
  const { period, startMs, endMs, requestedMs } = input;
  const span = Math.max(1, endMs - startMs);
  let base;
  if (requestedMs !== void 0 && Number.isFinite(requestedMs) && requestedMs > 0) {
    base = Math.floor(requestedMs);
  } else {
    switch (period) {
      case "day": {
        base = HOUR_MS;
        break;
      }
      case "week":
      case "month": {
        base = DAY_MS;
        break;
      }
      default: {
        base = Math.max(DAY_MS, Math.ceil(span / SERIES_TARGET_BUCKETS));
        break;
      }
    }
  }
  const floor = Math.ceil(span / SERIES_MAX_BUCKETS);
  return Math.max(base, floor, MINUTE_MS);
}
function createEmptySeries(period) {
  const range = getPeriodRange(period);
  return {
    buckets: [],
    bucket_ms: resolveBucketMs({
      period,
      startMs: range.startMs,
      endMs: range.endMs
    }),
    period,
    range: {
      end_ms: range.endMs,
      end_utc: new Date(range.endMs).toISOString(),
      start_ms: range.startMs,
      start_utc: new Date(range.startMs).toISOString()
    }
  };
}
async function getTokenUsageSeries(input) {
  const period = input.period;
  if (!isTokenUsageStorageEnabled()) {
    return createEmptySeries(period);
  }
  await flushTokenUsageEvents();
  const db = await getDb();
  let { startMs, endMs } = getPeriodRange(period);
  if (period === "all") {
    const bounds = db.prepare(
      "SELECT MIN(created_at_ms) AS min_ms, MAX(created_at_ms) AS max_ms FROM token_usage_events"
    ).get();
    const maxMs = numberFromRow(bounds, "max_ms");
    if (maxMs > 0) {
      startMs = numberFromRow(bounds, "min_ms");
      endMs = maxMs + 1;
    } else {
      startMs = endMs - DAY_MS;
    }
  }
  const bucketMs = resolveBucketMs({
    period,
    startMs,
    endMs,
    requestedMs: input.bucketMs
  });
  const rows = db.prepare(
    `
    SELECT
      (CAST(created_at_ms / ? AS INTEGER)) * ? AS bucket_start_ms,
      COUNT(*) AS request_count,
      COALESCE(SUM(input_tokens), 0) AS input_tokens,
      COALESCE(SUM(output_tokens), 0) AS output_tokens,
      COALESCE(SUM(cache_read_input_tokens), 0) AS cache_read_input_tokens,
      COALESCE(SUM(cache_creation_input_tokens), 0) AS cache_creation_input_tokens,
      COALESCE(SUM(total_tokens), 0) AS total_tokens,
      COALESCE(SUM(total_nano_aiu), 0) AS total_nano_aiu
    FROM token_usage_events
    WHERE created_at_ms >= ? AND created_at_ms < ?
    GROUP BY bucket_start_ms
    ORDER BY bucket_start_ms ASC
  `
  ).all(bucketMs, bucketMs, startMs, endMs);
  const byBucket = /* @__PURE__ */ new Map();
  for (const row of rows) {
    byBucket.set(numberFromRow(row, "bucket_start_ms"), totalsFromRow(row));
  }
  const firstBucket = Math.floor(startMs / bucketMs) * bucketMs;
  const buckets = [];
  for (let t = firstBucket; t < endMs; t += bucketMs) {
    const totals = byBucket.get(t) ?? createEmptyTotals();
    buckets.push({ ...totals, bucket_start_ms: t });
  }
  return {
    buckets,
    bucket_ms: bucketMs,
    period,
    range: {
      end_ms: endMs,
      end_utc: new Date(endMs).toISOString(),
      start_ms: startMs,
      start_utc: new Date(startMs).toISOString()
    }
  };
}
async function closeUsageStore() {
  await flushTokenUsageEvents();
  await tokenUsageDbStore.close({
    beforeClose: (db) => {
      try {
        db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      } catch {
      }
    }
  });
  writeQueue = Promise.resolve();
}
registerProcessCleanup(closeUsageStore);

// src/lib/token-usage/retention.ts
var RETENTION_DAY_MS = 864e5;
var RETENTION_SWEEP_MS = RETENTION_DAY_MS;
function runRetentionSweep() {
  const days = getTokenUsageRetentionDays();
  if (days <= 0) return;
  const cutoff = Date.now() - days * RETENTION_DAY_MS;
  void pruneTokenUsageEvents(cutoff).then(
    (removed) => {
      if (removed > 0) {
        consola2.debug(
          `Pruned ${removed} token-usage event(s) older than ${days}d`
        );
      }
    },
    (error) => {
      consola2.warn("Token-usage retention sweep failed:", error);
    }
  );
}
function startTokenUsageRetention() {
  if (!isTokenUsageStorageEnabled()) {
    return () => {
    };
  }
  runRetentionSweep();
  const timer = setInterval(runRetentionSweep, RETENTION_SWEEP_MS);
  if (typeof timer === "object" && "unref" in timer) {
    ;
    timer.unref();
  }
  return () => clearInterval(timer);
}

// src/lib/token-usage/index.ts
var tokenUsageEventBus = new EventBus();
function resolveTraceId(traceId) {
  return traceId?.trim() || requestContext.getStore()?.traceId || generateTraceId();
}
function resolveTokenUsageSessionId(sessionId, fallbackSessionId) {
  return requestContext.getStore()?.sessionAffinity?.trim() || sessionId?.trim() || fallbackSessionId?.trim() || "";
}
function resolveUserId(input) {
  if (input.source === "provider") {
    return input.providerName?.trim() || "";
  }
  return state.userName?.trim() || "";
}
function toPersistedEvent(input) {
  if (!hasAnyToken(input)) {
    return null;
  }
  const now = /* @__PURE__ */ new Date();
  return {
    cache_creation_input_tokens: normalizeToken(
      input.cache_creation_input_tokens
    ),
    cache_read_input_tokens: normalizeToken(input.cache_read_input_tokens),
    created_at_ms: now.getTime(),
    created_at_utc: now.toISOString(),
    endpoint: input.endpoint,
    input_tokens: normalizeToken(input.input_tokens),
    model: input.model.trim() || "unknown",
    output_tokens: normalizeToken(input.output_tokens),
    provider_name: input.providerName?.trim() || null,
    session_id: resolveTokenUsageSessionId(
      input.sessionId,
      input.fallbackSessionId
    ),
    source: input.source,
    total_tokens: resolveTotalTokens(input),
    total_nano_aiu: normalizeToken(input.total_nano_aiu),
    is_premium: resolveIsPaid(input.model),
    trace_id: resolveTraceId(input.traceId),
    user_id: resolveUserId(input)
  };
}
function resolveIsPaid(model) {
  const id = model.trim();
  if (!id) return null;
  const entry = state.models?.data.find((m) => m.id === id);
  const billing = entry?.billing;
  if (!billing) return null;
  const pricedPaid = pricedModelIsPaid(billing.token_prices);
  if (pricedPaid !== null) return pricedPaid ? 1 : 0;
  if (typeof billing.is_premium !== "boolean") return null;
  return billing.is_premium ? 1 : 0;
}
tokenUsageEventBus.subscribe("token_usage.recorded", enqueueTokenUsageWrite);
function onTokenUsageRecorded(listener) {
  return tokenUsageEventBus.subscribe("token_usage.recorded", listener);
}
function recordTokenUsageEvent(input) {
  const event = toPersistedEvent(input);
  if (!event) {
    return;
  }
  tokenUsageEventBus.publish("token_usage.recorded", event);
}
function createTokenUsageRecorder(options) {
  return (usage) => {
    recordTokenUsageEvent({
      ...usage,
      ...options
    });
  };
}
function createCopilotTokenUsageRecorder(options) {
  return createTokenUsageRecorder({
    ...options,
    source: "copilot"
  });
}
function createProviderTokenUsageRecorder(options) {
  return createTokenUsageRecorder({
    ...options,
    source: "provider"
  });
}
function normalizeOpenAIUsage(usage) {
  const cachedTokens = normalizeToken(
    usage?.prompt_tokens_details?.cached_tokens
  );
  const promptTokens = normalizeToken(usage?.prompt_tokens);
  return {
    cache_read_input_tokens: cachedTokens,
    input_tokens: Math.max(0, promptTokens - cachedTokens),
    output_tokens: normalizeToken(usage?.completion_tokens),
    total_tokens: normalizeOptionalToken(usage?.total_tokens)
  };
}
function normalizeResponsesUsage(usage) {
  const cachedTokens = normalizeToken(
    usage?.input_tokens_details?.cached_tokens
  );
  const inputTokens = normalizeToken(usage?.input_tokens);
  return {
    cache_read_input_tokens: cachedTokens,
    input_tokens: Math.max(0, inputTokens - cachedTokens),
    output_tokens: normalizeToken(usage?.output_tokens),
    total_tokens: normalizeOptionalToken(usage?.total_tokens)
  };
}
function extractCopilotCost(copilotUsage) {
  const nano = copilotUsage?.total_nano_aiu;
  return typeof nano === "number" && Number.isFinite(nano) ? nano : void 0;
}
function withCopilotCost(base, copilotUsage) {
  return { ...base, total_nano_aiu: extractCopilotCost(copilotUsage) };
}
function normalizeAnthropicUsage(usage) {
  return {
    cache_creation_input_tokens: normalizeOptionalToken(
      usage?.cache_creation_input_tokens
    ),
    cache_read_input_tokens: normalizeOptionalToken(
      usage?.cache_read_input_tokens
    ),
    input_tokens: normalizeOptionalToken(usage?.input_tokens),
    output_tokens: normalizeOptionalToken(usage?.output_tokens),
    total_tokens: normalizeOptionalToken(usage?.total_tokens)
  };
}
function mergeAnthropicUsage(current, next) {
  return {
    cache_creation_input_tokens: next.cache_creation_input_tokens ?? current.cache_creation_input_tokens,
    cache_read_input_tokens: next.cache_read_input_tokens ?? current.cache_read_input_tokens,
    input_tokens: next.input_tokens ?? current.input_tokens,
    output_tokens: next.output_tokens ?? current.output_tokens,
    total_tokens: next.total_tokens ?? current.total_tokens
  };
}

// src/lib/update/version.ts
import fs2 from "fs";
import path3 from "path";
var SHA_RE = /^[0-9a-f]{40}$/u;
function resolveGitFile(candidate) {
  let pointer;
  try {
    pointer = fs2.readFileSync(candidate, "utf8").trim();
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "EISDIR") {
      return { worktree: candidate, common: candidate };
    }
    return void 0;
  }
  const match = pointer.match(/^gitdir: (\S.*)$/u);
  if (!match) return void 0;
  const worktreeDir = path3.isAbsolute(match[1]) ? match[1] : path3.resolve(path3.dirname(candidate), match[1]);
  let commonDir = worktreeDir;
  try {
    const rel = fs2.readFileSync(path3.join(worktreeDir, "commondir"), "utf8").trim();
    commonDir = path3.isAbsolute(rel) ? rel : path3.resolve(worktreeDir, rel);
  } catch {
  }
  return { worktree: worktreeDir, common: commonDir };
}
function findGitDirs() {
  const starts = [
    process.cwd(),
    PATHS.APP_DIR,
    path3.dirname(new URL(import.meta.url).pathname)
  ];
  const seen = /* @__PURE__ */ new Set();
  for (const start of starts) {
    let dir = start;
    while (dir && !seen.has(dir)) {
      seen.add(dir);
      const resolved = resolveGitFile(path3.join(dir, ".git"));
      if (resolved) return resolved;
      const parent = path3.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return void 0;
}
function resolveRefFromPackedRefs(gitDir, ref) {
  try {
    const packed = fs2.readFileSync(path3.join(gitDir, "packed-refs"), "utf8");
    for (const line of packed.split("\n")) {
      if (line.startsWith("#") || line.length === 0) continue;
      const [sha, name] = line.split(" ");
      if (name === ref && SHA_RE.test(sha)) return sha;
    }
  } catch {
    return void 0;
  }
  return void 0;
}
function readGitVersion() {
  const dirs = findGitDirs();
  if (!dirs) return { sha: void 0, branch: void 0 };
  let head;
  try {
    head = fs2.readFileSync(path3.join(dirs.worktree, "HEAD"), "utf8").trim();
  } catch {
    return { sha: void 0, branch: void 0 };
  }
  if (SHA_RE.test(head)) return { sha: head, branch: void 0 };
  const match = head.match(/^ref: (\S.*)$/u);
  if (!match) return { sha: void 0, branch: void 0 };
  const ref = match[1];
  const branch = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : void 0;
  let sha;
  for (const dir of [dirs.worktree, dirs.common]) {
    try {
      const looseRef = fs2.readFileSync(path3.join(dir, ref), "utf8").trim();
      if (SHA_RE.test(looseRef)) {
        sha = looseRef;
        break;
      }
    } catch {
    }
  }
  sha ??= resolveRefFromPackedRefs(dirs.common, ref);
  return { sha, branch };
}
var cached = readGitVersion();
function getGitVersion() {
  if (cached.sha) return cached;
  if (BUILD_GIT_SHA) {
    return { sha: BUILD_GIT_SHA, branch: BUILD_GIT_BRANCH };
  }
  return cached;
}
function shortSha(sha) {
  if (!sha) return "unknown";
  return sha.slice(0, 7);
}

// src/lib/auth/secrets.ts
import consola3 from "consola";
import fs3 from "fs";
import path4 from "path";
var SECRETS_DIR = path4.join(PATHS.APP_DIR, "secrets");
var SAFE_FILE_MODE = 384;
var SAFE_DIR_MODE = 448;
function modeIsOwnerOnly(mode) {
  if (process.platform === "win32") return true;
  return (mode & 511) === SAFE_FILE_MODE;
}
function readSecret(opts) {
  const env = opts.env ?? process.env;
  const envVal = env[opts.envVar];
  if (envVal !== void 0 && envVal.length > 0) {
    return { value: envVal, source: "env" };
  }
  const dir = opts.dir ?? SECRETS_DIR;
  const file = path4.join(dir, opts.fileName);
  let fd;
  try {
    fd = fs3.openSync(file, fs3.constants.O_RDONLY | fs3.constants.O_NOFOLLOW);
  } catch {
    return { value: void 0, source: "unset" };
  }
  try {
    const stats = fs3.fstatSync(fd);
    if (!stats.isFile()) {
      return {
        value: void 0,
        source: "unset",
        diagnostic: `${file} is not a regular file; ignored`
      };
    }
    const mode = stats.mode & 511;
    if (!modeIsOwnerOnly(mode)) {
      const msg = `${file} has insecure mode ${mode.toString(8).padStart(3, "0")} (expected 600); skipped`;
      consola3.warn(msg);
      return { value: void 0, source: "unset", diagnostic: msg };
    }
    let value;
    try {
      value = fs3.readFileSync(fd, "utf8").trim();
    } catch {
      return {
        value: void 0,
        source: "unset",
        diagnostic: `${file} could not be read`
      };
    }
    if (value.length === 0) {
      return { value: void 0, source: "unset" };
    }
    return { value, source: "file" };
  } finally {
    try {
      fs3.closeSync(fd);
    } catch {
    }
  }
}
function loadSecretIntoEnv(opts) {
  const r = readSecret(opts);
  if (r.source === "file" && r.value !== void 0) {
    process.env[opts.envVar] = r.value;
  }
  return r;
}
function ensureSecretsDir(dir = SECRETS_DIR) {
  try {
    fs3.mkdirSync(dir, { recursive: true, mode: SAFE_DIR_MODE });
  } catch {
  }
}
var SECRET_DEFS = [
  { name: "ollama_api_key", envVar: "OLLAMA_API_KEY", fileName: "ollama" },
  {
    name: "anthropic_api_key",
    envVar: "ANTHROPIC_API_KEY",
    fileName: "anthropic",
    readConfig: (c) => c.anthropicApiKey
  }
];
function secretIsFromFile(fileName, value) {
  const filePath = path4.join(SECRETS_DIR, fileName);
  let fd;
  try {
    fd = fs3.openSync(filePath, fs3.constants.O_RDONLY | fs3.constants.O_NOFOLLOW);
  } catch {
    return false;
  }
  try {
    const stats = fs3.fstatSync(fd);
    if (!stats.isFile()) return false;
    if (!modeIsOwnerOnly(stats.mode)) return false;
    return fs3.readFileSync(fd, "utf8").trim() === value;
  } catch {
    return false;
  } finally {
    try {
      fs3.closeSync(fd);
    } catch {
    }
  }
}

export {
  getTokenUsageSummary,
  getTokenUsageEventsPage,
  getTokenUsageSeries,
  startTokenUsageRetention,
  onTokenUsageRecorded,
  createCopilotTokenUsageRecorder,
  createProviderTokenUsageRecorder,
  normalizeOpenAIUsage,
  normalizeResponsesUsage,
  withCopilotCost,
  normalizeAnthropicUsage,
  mergeAnthropicUsage,
  getGitVersion,
  shortSha,
  loadSecretIntoEnv,
  ensureSecretsDir,
  SECRET_DEFS,
  secretIsFromFile
};
