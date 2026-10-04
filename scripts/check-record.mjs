#!/usr/bin/env node
// Records a root check script into reports/check-runs/runs.sqlite.
//   pnpm check:record [script] [--no-eslint]   run and record (default: check:static)
//   pnpm check:record --diff [base] [head]      compare two recorded runs (default: last two)
// Sources, most structured first:
//   - turbo run summaries (TURBO_RUN_SUMMARY reaches nested turbo calls) → tasks
//   - ESLint JSON from a separate pass, so the human `lint` scripts stay unchanged → diagnostics
//   - design-tokens dist/issues.json against token-issues-baseline.json → diagnostics
//   - tsc, vitest, node --test and bun test text parsed from task logs → diagnostics, tests
//   - every task log and the script's own output, normalized → raw_lines
// Counts that two sources both report are reconciled into `notices`.
// The script's exit code stays authoritative and is passed through.
//
// The database is local-only: `reports/` is gitignored because raw_lines holds full
// task output, which can include machine paths and anything a tool prints.
//
// Tables (all keyed by run_id; task_id is turbo's `pkg#task`, or `//:<script>` for
// output outside turbo tasks):
//   runs            script, timing, exit code, eslint (0 if --no-eslint), worktree (path from the
//                   main checkout's parent, e.g. monimal.worktrees/x), git_branch, git_sha, dirty,
//                   base_ref/base_sha (merge-base with the default branch's remote copy when on
//                   it, otherwise with the local default branch), commits_ahead/commits_behind
//   turbo_runs      one row per turbo invocation with attempted/cached/failed counts
//   tasks           cache_status HIT|MISS|NOT_RUN, exit_code, duration_ms, log_file
//   diagnostics     tool eslint|tsc|design-tokens, file, line, col, severity, rule, message,
//                   fingerprint; design-tokens rows are warnings when in the ratchet baseline,
//                   errors when new, and rule stale-baseline when resolved but still recorded
//   test_summaries  runner vitest|node|bun with passed/failed/skipped/todo/cancelled/total
//   test_failures   runner, name, location, fingerprint
//   notices         kinds: unexplained-failure, no-test-summary, unnamed-failures,
//                   eslint-mismatch, eslint-json, token-mismatch, token-json, missing-log, unplanned
//   raw_lines       source, seq, text (ANSI stripped), normalized (paths, times, hashes masked)
// Fingerprints mask numbers and omit line numbers, so moved code keeps its identity;
// design-tokens fingerprints hash the tool's own issue id unmasked.
//
// Example: sqlite3 -header -column reports/check-runs/runs.sqlite \
//   "SELECT tool, rule, count(*) FROM diagnostics
//    WHERE run_id = (SELECT max(id) FROM runs) GROUP BY 1, 2 ORDER BY 3 DESC"
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  fingerprint,
  normalize,
  parseEslintStylishTotals,
  parseTestFailures,
  parseTestSummaries,
  parseTscDiagnostics,
  baselineRef,
  parseTokenRatchet,
  stripAnsi,
  taskOutput,
  tokenDiagnostics,
  worktreeLabel,
} from "./check-record-parsers.mjs";

const root = path.resolve(import.meta.dirname, "..");
const outDir = path.join(root, "reports", "check-runs");
const dbPath = path.join(outDir, "runs.sqlite");
const eslintDir = path.join(outDir, "eslint");
const summaryDir = path.join(root, ".turbo", "runs");
const schemaVersion = 4;

const schema = `
CREATE TABLE runs (
  id INTEGER PRIMARY KEY, script TEXT, started_at TEXT, ended_at TEXT,
  exit_code INTEGER, eslint INTEGER, worktree TEXT, git_branch TEXT, git_sha TEXT, dirty INTEGER,
  base_ref TEXT, base_sha TEXT, commits_ahead INTEGER, commits_behind INTEGER);
CREATE TABLE turbo_runs (
  run_id INTEGER, summary_id TEXT, command TEXT, exit_code INTEGER,
  attempted INTEGER, cached INTEGER, failed INTEGER, duration_ms INTEGER);
CREATE TABLE tasks (
  run_id INTEGER, summary_id TEXT, task_id TEXT, package TEXT, task TEXT,
  directory TEXT, command TEXT, hash TEXT, cache_status TEXT, exit_code INTEGER,
  duration_ms INTEGER, log_file TEXT);
CREATE TABLE diagnostics (
  run_id INTEGER, task_id TEXT, tool TEXT, package TEXT, file TEXT, line INTEGER,
  col INTEGER, severity TEXT, rule TEXT, message TEXT, fingerprint TEXT);
CREATE TABLE test_summaries (
  run_id INTEGER, task_id TEXT, runner TEXT, files_passed INTEGER, files_failed INTEGER,
  passed INTEGER, failed INTEGER, skipped INTEGER, todo INTEGER, cancelled INTEGER, total INTEGER);
CREATE TABLE test_failures (
  run_id INTEGER, task_id TEXT, runner TEXT, name TEXT, location TEXT, fingerprint TEXT);
CREATE TABLE notices (run_id INTEGER, kind TEXT, subject TEXT, message TEXT);
CREATE TABLE raw_lines (run_id INTEGER, source TEXT, seq INTEGER, text TEXT, normalized TEXT);
CREATE INDEX diagnostics_run ON diagnostics (run_id, fingerprint);
CREATE INDEX test_failures_run ON test_failures (run_id, fingerprint);
CREATE INDEX raw_lines_run ON raw_lines (run_id, source);
`;

function git(...args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function defaultBranch() {
  const remotes = [git("config", "--get", `branch.${git("branch", "--show-current")}.remote`), "origin", ...(git("remote") ?? "").split("\n")];
  for (const remote of remotes.filter(Boolean)) {
    const head = git("symbolic-ref", "--short", `refs/remotes/${remote}/HEAD`);
    if (head) return head.slice(remote.length + 1);
  }
  return git("rev-parse", "--verify", "-q", "refs/heads/main") ? "main" : null;
}

// Captured before the script runs so a commit made mid-run cannot skew the record.
function gitContext() {
  const branch = git("branch", "--show-current") || null;
  const commonDirectory = git("rev-parse", "--path-format=absolute", "--git-common-dir");
  const topLevel = git("rev-parse", "--show-toplevel");
  const baseRef = baselineRef({
    branch,
    defaultBranch: defaultBranch(),
    upstream: branch ? git("rev-parse", "--abbrev-ref", `${branch}@{upstream}`) : null,
  });
  const baseSha = baseRef ? git("merge-base", "HEAD", baseRef) : null;
  const counts = baseSha ? git("rev-list", "--left-right", "--count", `HEAD...${baseRef}`)?.split(/\s+/).map(Number) : null;
  return {
    worktree: commonDirectory && topLevel ? worktreeLabel(commonDirectory, topLevel) : null,
    branch,
    sha: git("rev-parse", "HEAD"),
    dirty: git("status", "--porcelain") ? 1 : 0,
    baseRef,
    baseSha,
    ahead: counts?.[0] ?? null,
    behind: counts?.[1] ?? null,
  };
}

function describeRun(run) {
  const short = (sha) => (sha ? sha.slice(0, 9) : "?");
  const head = `${run.worktree ?? "?"} ${run.git_branch ?? "(detached)"}@${short(run.git_sha)}${run.dirty ? "+dirty" : ""}`;
  if (!run.base_ref) return `${head}, no baseline`;
  return `${head}, base ${run.base_ref}@${short(run.base_sha)} (+${run.commits_ahead ?? "?"}/-${run.commits_behind ?? "?"})`;
}

function openDatabase() {
  fs.mkdirSync(outDir, { recursive: true });
  let db = new DatabaseSync(dbPath);
  const { user_version: version } = db.prepare("PRAGMA user_version").get();
  if (version !== schemaVersion) {
    const hasTables = db.prepare("SELECT count(*) n FROM sqlite_master WHERE type = 'table'").get().n > 0;
    if (hasTables) {
      db.close();
      const archived = `${dbPath}.v${version}-${Date.now()}`;
      fs.renameSync(dbPath, archived);
      console.error(`check-record: schema changed; previous database moved to ${path.relative(root, archived)}`);
      db = new DatabaseSync(dbPath);
    }
    db.exec(schema);
    db.exec(`PRAGMA user_version = ${schemaVersion}`);
  }
  return db;
}

function runScript(script) {
  return new Promise((resolve) => {
    const lines = [];
    const pending = { stdout: "", stderr: "" };
    const child = spawn("pnpm", ["run", script], {
      cwd: root,
      env: { ...process.env, TURBO_RUN_SUMMARY: "true", FORCE_COLOR: process.env.FORCE_COLOR ?? "1" },
      shell: process.platform === "win32",
      stdio: ["inherit", "pipe", "pipe"],
    });
    const collect = (name, sink) => {
      child[name].on("data", (chunk) => {
        sink.write(chunk);
        const parts = (pending[name] + chunk.toString("utf8")).split(/\r?\n/);
        pending[name] = parts.pop();
        lines.push(...parts);
      });
    };
    collect("stdout", process.stdout);
    collect("stderr", process.stderr);
    child.on("close", (code) => {
      for (const rest of Object.values(pending)) if (rest) lines.push(rest);
      resolve({ code: code ?? 1, lines });
    });
  });
}

function eslintPatterns(packageDirectory) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, packageDirectory, "package.json"), "utf8"));
  const scripts = manifest.scripts ?? {};
  const script = scripts.lint?.includes("run-workspace-task.mjs") ? scripts["lint:inner"] : scripts.lint;
  const segment = script?.split("&&").map((part) => part.trim()).find((part) => /^eslint(\s|$)/.test(part));
  if (!segment) return null;
  const patterns = segment.split(/\s+/).slice(1).filter((token) => !token.startsWith("-"));
  return patterns.length > 0 ? patterns : ["."];
}

function runEslint(task) {
  const patterns = eslintPatterns(task.directory);
  if (!patterns) return Promise.resolve({ task, results: null, error: "lint script has no eslint command" });
  const output = path.join(eslintDir, `${task.package.replace(/[@/]/g, "_")}.json`);
  fs.rmSync(output, { force: true });
  return new Promise((resolve) => {
    const child = spawn("pnpm", ["exec", "eslint", "--format", "json", "--output-file", output, ...patterns], {
      cwd: path.join(root, task.directory),
      shell: process.platform === "win32",
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (code) => {
      if (!fs.existsSync(output)) {
        resolve({ task, results: null, error: `eslint exited ${code} without JSON: ${stripAnsi(stderr).trim().split("\n")[0]}` });
        return;
      }
      resolve({ task, results: JSON.parse(fs.readFileSync(output, "utf8")) });
    });
  });
}

async function mapLimit(items, limit, fn) {
  const results = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index]);
      }
    }),
  );
  return results;
}

function readSummaries(startedMs) {
  if (!fs.existsSync(summaryDir)) return [];
  return fs
    .readdirSync(summaryDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => path.join(summaryDir, name))
    .map((file) => ({ file, summary: JSON.parse(fs.readFileSync(file, "utf8")) }))
    .filter(({ summary }) => summary.execution?.startTime >= startedMs)
    .sort((a, b) => a.summary.execution.startTime - b.summary.execution.startTime);
}

// Turbo summaries omit tasks that were never scheduled (e.g. after a failure without
// --continue), so the planned graph comes from replaying the command with --dry=json.
function plannedTasks(command) {
  const args = command.split(/\s+/).slice(1).filter((arg) => arg !== "--summarize");
  const result = spawnSync("pnpm", ["exec", "turbo", ...args, "--dry=json"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    shell: process.platform === "win32",
  });
  try {
    return JSON.parse(result.stdout).tasks;
  } catch {
    return null;
  }
}

function readLog(logFile) {
  const logPath = logFile && path.join(root, logFile);
  if (!logPath || !fs.existsSync(logPath)) return null;
  const lines = fs.readFileSync(logPath, "utf8").split(/\r?\n/).map(stripAnsi);
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

function createWriter(db, runId) {
  const statement = (table, columns) =>
    db.prepare(`INSERT INTO ${table} (run_id, ${columns.join(", ")}) VALUES (?${", ?".repeat(columns.length)})`);
  const insert = {
    line: statement("raw_lines", ["source", "seq", "text", "normalized"]),
    turboRun: statement("turbo_runs", ["summary_id", "command", "exit_code", "attempted", "cached", "failed", "duration_ms"]),
    task: statement("tasks", ["summary_id", "task_id", "package", "task", "directory", "command", "hash", "cache_status", "exit_code", "duration_ms", "log_file"]),
    diagnostic: statement("diagnostics", ["task_id", "tool", "package", "file", "line", "col", "severity", "rule", "message", "fingerprint"]),
    summary: statement("test_summaries", ["task_id", "runner", "files_passed", "files_failed", "passed", "failed", "skipped", "todo", "cancelled", "total"]),
    failure: statement("test_failures", ["task_id", "runner", "name", "location", "fingerprint"]),
    notice: statement("notices", ["kind", "subject", "message"]),
  };
  return {
    lines(source, lines) {
      lines.forEach((text, seq) => insert.line.run(runId, source, seq, text, normalize(text, root)));
    },
    turboRun(summary) {
      const { execution } = summary;
      insert.turboRun.run(runId, summary.id, execution.command, execution.exitCode, execution.attempted, execution.cached, execution.failed, execution.endTime - execution.startTime);
    },
    task(summaryId, task, cacheStatus) {
      const ran = task.execution ?? null;
      insert.task.run(runId, summaryId, task.taskId, task.package, task.task, task.directory, task.command, task.hash, cacheStatus, ran?.exitCode ?? null, ran ? ran.endTime - ran.startTime : null, task.logFile ?? null);
    },
    diagnostic(taskId, packageName, row) {
      insert.diagnostic.run(runId, taskId, row.tool, packageName, row.file, row.line, row.col, row.severity, row.rule, row.message, row.fingerprint);
    },
    // Parses one output source; returns what it found so failures can be explained.
    parsed(taskId, packageName, directory, lines) {
      const tsc = parseTscDiagnostics(lines, directory);
      for (const row of tsc) this.diagnostic(taskId, packageName, row);
      const summaries = parseTestSummaries(lines);
      for (const s of summaries) {
        insert.summary.run(runId, taskId, s.runner, s.filesPassed, s.filesFailed, s.passed, s.failed, s.skipped, s.todo, s.cancelled, s.total);
      }
      const failures = parseTestFailures(lines);
      for (const f of failures) insert.failure.run(runId, taskId, f.runner, f.name, f.location, f.fingerprint);
      return { tsc, summaries, failures };
    },
    notice(kind, subject, message) {
      insert.notice.run(runId, kind, subject, message);
    },
  };
}

function hasCause({ tsc, summaries, failures }) {
  return (
    tsc.some((row) => row.severity === "error") ||
    failures.length > 0 ||
    summaries.some((s) => s.failed > 0 || s.filesFailed > 0 || s.cancelled > 0)
  );
}

function recordTurbo(write, summaries, scriptLines) {
  const tasks = [];
  for (const { file, summary } of summaries) {
    write.turboRun(summary);
    const recorded = new Set();
    for (const task of summary.tasks) {
      recorded.add(task.taskId);
      if (task.command === "<NONEXISTENT>") continue;
      write.task(summary.id, task, task.cache?.status ?? null);
      // Turbo rewrites each log when a task runs or replays, so only those logs are current.
      const lines = task.execution
        ? ((task.logFile ? readLog(task.logFile) : null) ?? taskOutput(scriptLines, task.package, task.task))
        : null;
      if (lines) write.lines(task.taskId, lines);
      if (task.execution && !lines) {
        const source = task.logFile ? `no log at ${task.logFile}` : "no log file (uncached task)";
        write.notice("missing-log", task.taskId, `${source} and no prefixed output`);
      }
      tasks.push({ task, lines });
    }
    const planned = plannedTasks(summary.execution.command);
    if (!planned) write.notice("unplanned", summary.execution.command, "turbo --dry=json failed; unscheduled tasks are not recorded");
    for (const task of planned ?? []) {
      if (recorded.has(task.taskId) || task.command === "<NONEXISTENT>") continue;
      write.task(summary.id, task, "NOT_RUN");
      tasks.push({ task, lines: null });
    }
    fs.rmSync(file, { force: true });
  }
  return tasks;
}

function recordEslint(write, report) {
  const totals = { errors: 0, warnings: 0 };
  for (const result of report.results) {
    const file = path.relative(root, result.filePath).split(path.sep).join("/");
    for (const message of result.messages) {
      const severity = message.severity === 2 ? "error" : "warning";
      const rule = message.ruleId ?? (message.fatal ? "fatal" : null);
      totals[`${severity}s`] += 1;
      write.diagnostic(report.task.taskId, report.task.package, {
        tool: "eslint",
        file,
        line: message.line ?? null,
        col: message.column ?? null,
        severity,
        rule,
        message: message.message,
        fingerprint: fingerprint("eslint", file, rule, message.message),
      });
    }
  }
  return totals;
}

const tokensPackage = "@maximal/design-tokens";
const tokenRatchetTasks = ["token:check", "build"];

// Records the design-token ratchet once per run from the JSON the ratchet tasks write;
// returns error counts per ratchet task so their failures count as explained.
function recordTokens(write, tasks, startedMs) {
  const ran = tasks.filter(({ task, lines }) => task.package === tokensPackage && tokenRatchetTasks.includes(task.task) && lines);
  const errors = new Map();
  if (ran.length === 0) return errors;
  const owner = tokenRatchetTasks.map((name) => ran.find(({ task }) => task.task === name)).find(Boolean).task;
  const issuesPath = path.join(root, owner.directory, "dist", "issues.json");
  const baselinePath = path.join(root, owner.directory, "token-issues-baseline.json");
  let rows;
  try {
    if (fs.statSync(issuesPath).mtimeMs < startedMs) throw new Error(`${path.relative(root, issuesPath)} predates this run`);
    rows = tokenDiagnostics(JSON.parse(fs.readFileSync(issuesPath, "utf8")).issues, JSON.parse(fs.readFileSync(baselinePath, "utf8")));
  } catch (error) {
    write.notice("token-json", owner.taskId, error.message);
    return errors;
  }
  for (const row of rows) write.diagnostic(owner.taskId, owner.package, row);
  const json = {
    known: rows.filter((row) => row.severity === "warning").length,
    added: rows.filter((row) => row.severity === "error" && row.rule !== "stale-baseline").length,
    gone: rows.filter((row) => row.rule === "stale-baseline").length,
  };
  for (const { task, lines } of ran) {
    const printed = parseTokenRatchet(lines);
    errors.set(task.taskId, json.added + json.gone);
    // The ratchet prints its known total only when nothing was added or resolved.
    const expected = json.added + json.gone > 0 ? { ...json, known: 0 } : json;
    if (!printed || Object.keys(expected).some((key) => printed[key] !== expected[key])) {
      const shown = printed ? `${printed.known} known/${printed.added} new/${printed.gone} resolved` : "no ratchet totals";
      write.notice("token-mismatch", task.taskId, `output reports ${shown}; issues.json gives ${expected.known}/${expected.added}/${expected.gone}`);
    }
  }
  return errors;
}

async function record(script, { eslint }) {
  const startedMs = Date.now();
  const startedAt = new Date(startedMs).toISOString();
  const context = gitContext();
  const { code, lines } = await runScript(script);

  const db = openDatabase();
  const runId = Number(
    db
      .prepare("INSERT INTO runs (script, started_at, ended_at, exit_code, eslint, worktree, git_branch, git_sha, dirty, base_ref, base_sha, commits_ahead, commits_behind) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(script, startedAt, new Date().toISOString(), code, eslint ? 1 : 0, context.worktree, context.branch, context.sha, context.dirty, context.baseRef, context.baseSha, context.ahead, context.behind)
      .lastInsertRowid,
  );
  const write = createWriter(db, runId);

  db.exec("BEGIN");
  const scriptLines = lines.map(stripAnsi);
  write.lines(`//:${script}`, scriptLines);
  const tasks = recordTurbo(write, readSummaries(startedMs), scriptLines);
  const parsedByTask = new Map();
  for (const { task, lines: taskLines } of tasks) {
    if (taskLines) parsedByTask.set(task.taskId, write.parsed(task.taskId, task.package, task.directory, taskLines));
  }
  // Script-level output not owned by a turbo task (e.g. `node --test` or `node scripts/…` steps).
  const prefixes = tasks.map(({ task }) => `${task.package}:${task.task}: `);
  const ownLines = scriptLines.filter((line) => !prefixes.some((prefix) => line.startsWith(prefix)));
  const scriptParsed = write.parsed(`//:${script}`, "//", ".", ownLines);
  db.exec("COMMIT");

  const lintTasks = tasks.filter(({ task }) => task.task === "lint").map(({ task, lines: taskLines }) => ({ task, lines: taskLines }));
  const eslintTotals = new Map();
  if (eslint && lintTasks.length > 0) {
    fs.mkdirSync(eslintDir, { recursive: true });
    console.error(`\ncheck-record: collecting ESLint JSON for ${lintTasks.length} packages…`);
    const reports = await mapLimit(lintTasks.map(({ task }) => task), 4, runEslint);
    db.exec("BEGIN");
    for (const report of reports) {
      if (report.results) eslintTotals.set(report.task.taskId, recordEslint(write, report));
      else write.notice("eslint-json", report.task.taskId, report.error);
    }
    db.exec("COMMIT");
  }

  db.exec("BEGIN");
  const tokenErrors = recordTokens(write, tasks, startedMs);
  for (const { task, lines: taskLines } of lintTasks) {
    const json = eslintTotals.get(task.taskId);
    if (!taskLines || !json) continue;
    const stylish = parseEslintStylishTotals(taskLines) ?? { errors: 0, warnings: 0 };
    if (stylish.errors !== json.errors || stylish.warnings !== json.warnings) {
      write.notice("eslint-mismatch", task.taskId, `lint output reports ${stylish.errors} errors/${stylish.warnings} warnings; JSON pass found ${json.errors}/${json.warnings}`);
    }
  }
  for (const { task, lines: taskLines } of tasks) {
    const parsed = parsedByTask.get(task.taskId);
    const exitCode = task.execution?.exitCode;
    if (task.task === "test" && taskLines && parsed.summaries.length === 0) {
      write.notice("no-test-summary", task.taskId, "test task ran but no runner summary was recognized");
    }
    for (const summary of parsed?.summaries ?? []) {
      if (summary.failed > 0 && !parsed.failures.some((f) => f.runner === summary.runner)) {
        write.notice("unnamed-failures", task.taskId, `${summary.runner} reports ${summary.failed} failed tests but none were named`);
      }
    }
    if (exitCode && parsed && !hasCause(parsed) && !(eslintTotals.get(task.taskId)?.errors > 0) && !(tokenErrors.get(task.taskId) > 0)) {
      write.notice("unexplained-failure", task.taskId, `exit ${exitCode} with no recognized errors or test failures; see raw_lines`);
    }
  }
  const failedTasks = tasks.filter(({ task }) => task.execution?.exitCode);
  if (code !== 0 && failedTasks.length === 0 && !hasCause(scriptParsed)) {
    write.notice("unexplained-failure", `//:${script}`, `script exit ${code} with no failed task or recognized cause; see raw_lines`);
  }
  db.exec("COMMIT");

  report(db, runId, script, code);
  db.close();
  return code;
}

function report(db, runId, script, code) {
  const one = (sql) => db.prepare(sql).get(runId);
  const tasks = one("SELECT count(*) total, coalesce(sum(exit_code <> 0), 0) failed, coalesce(sum(cache_status = 'NOT_RUN'), 0) skipped, coalesce(sum(cache_status = 'HIT'), 0) hits FROM tasks WHERE run_id = ?");
  const diag = db.prepare("SELECT tool, sum(severity = 'error') errors, sum(severity = 'warning') warnings FROM diagnostics WHERE run_id = ? GROUP BY tool ORDER BY tool").all(runId);
  const tests = one("SELECT coalesce(sum(passed), 0) passed, coalesce(sum(failed), 0) failed, coalesce(sum(skipped), 0) skipped, count(*) summaries FROM test_summaries WHERE run_id = ?");
  const notices = db.prepare("SELECT kind, subject, message FROM notices WHERE run_id = ? ORDER BY kind, subject").all(runId);
  console.error(`\ncheck-record: run ${runId} (${script}) exit ${code} → ${path.relative(root, dbPath)}`);
  console.error(`  git: ${describeRun(db.prepare("SELECT * FROM runs WHERE id = ?").get(runId))}`);
  console.error(`  tasks: ${tasks.total} (${tasks.failed} failed, ${tasks.skipped} not run, ${tasks.hits} cache hits)`);
  for (const row of diag) console.error(`  ${row.tool}: ${row.errors} errors, ${row.warnings} warnings`);
  if (tests.summaries > 0) console.error(`  tests: ${tests.passed} passed, ${tests.failed} failed, ${tests.skipped} skipped (${tests.summaries} runner summaries)`);
  for (const notice of notices) console.error(`  notice ${notice.kind} ${notice.subject}: ${notice.message}`);
}

function diff(baseArg, headArg) {
  const db = openDatabase();
  const ids = db.prepare("SELECT id FROM runs ORDER BY id DESC LIMIT 2").all().map((row) => row.id);
  const head = Number(headArg ?? ids[0]);
  const base = Number(baseArg ?? ids[1]);
  const run = (id) => db.prepare("SELECT * FROM runs WHERE id = ?").get(id);
  if (!head || !base || !run(head) || !run(base)) {
    console.error("check-record: need two recorded runs to diff");
    db.close();
    return 2;
  }
  // A run recorded with --no-eslint has no ESLint rows, which is not the same as zero problems.
  const compareEslint = run(base).eslint === 1 && run(head).eslint === 1;
  const delta = (table, keys, columns, where = "") =>
    db
      .prepare(
        `WITH b AS (SELECT ${keys}, ${columns}, count(*) n FROM ${table} WHERE run_id = ?${where} GROUP BY ${keys}),
              h AS (SELECT ${keys}, ${columns}, count(*) n FROM ${table} WHERE run_id = ?${where} GROUP BY ${keys})
         SELECT 'new' change, h.*, h.n - coalesce(b.n, 0) delta FROM h LEFT JOIN b USING (${keys}) WHERE h.n > coalesce(b.n, 0)
         UNION ALL
         SELECT 'fixed', b.*, b.n - coalesce(h.n, 0) FROM b LEFT JOIN h USING (${keys}) WHERE b.n > coalesce(h.n, 0)
         ORDER BY 1`,
      )
      .all(base, head);
  const tasks = db
    .prepare(
      `SELECT coalesce(h.task_id, b.task_id) task_id, b.status base, h.status head
       FROM (SELECT task_id, coalesce(exit_code, cache_status) status FROM tasks WHERE run_id = ?) b
       FULL OUTER JOIN (SELECT task_id, coalesce(exit_code, cache_status) status FROM tasks WHERE run_id = ?) h USING (task_id)
       WHERE b.status IS NOT h.status ORDER BY 1`,
    )
    .all(base, head);
  const counts = db
    .prepare(
      `SELECT coalesce(h.task_id, b.task_id) task_id, coalesce(h.runner, b.runner) runner,
              b.passed bp, b.failed bf, b.skipped bs, h.passed hp, h.failed hf, h.skipped hs
       FROM (SELECT task_id, runner, sum(passed) passed, sum(failed) failed, sum(skipped) skipped FROM test_summaries WHERE run_id = ? GROUP BY 1, 2) b
       FULL OUTER JOIN (SELECT task_id, runner, sum(passed) passed, sum(failed) failed, sum(skipped) skipped FROM test_summaries WHERE run_id = ? GROUP BY 1, 2) h
         USING (task_id, runner)
       WHERE b.passed IS NOT h.passed OR b.failed IS NOT h.failed OR b.skipped IS NOT h.skipped ORDER BY 1, 2`,
    )
    .all(base, head);
  // Severity is part of the key so a warning that becomes an error (e.g. a ratchet regression) shows.
  const diagnostics = delta("diagnostics", "fingerprint, severity", "tool, file, rule, message", compareEslint ? "" : " AND tool <> 'eslint'");
  const failures = delta("test_failures", "task_id, fingerprint", "runner, name");
  const status = (value) => (value === null ? "-" : typeof value === "number" ? `exit ${value}` : value);
  const triple = (p, f, s) => (p === null ? "-" : `${p}/${f}/${s}`);
  console.log(`check-record diff: run ${base} → run ${head}`);
  console.log(`  base run ${base}: ${run(base).script}, ${describeRun(run(base))}`);
  console.log(`  head run ${head}: ${run(head).script}, ${describeRun(run(head))}`);
  if (run(base).base_sha !== run(head).base_sha) console.log("  note: runs have different baselines");
  if (run(base).script !== run(head).script) console.log("  note: runs recorded different scripts");
  if (!compareEslint) console.log("eslint not compared: a run was recorded with --no-eslint");
  for (const row of tasks) console.log(`task   ${row.task_id}: ${status(row.base)} → ${status(row.head)}`);
  for (const row of counts) console.log(`tests  ${row.task_id} (${row.runner}) pass/fail/skip: ${triple(row.bp, row.bf, row.bs)} → ${triple(row.hp, row.hf, row.hs)}`);
  for (const row of failures) console.log(`${row.change.padEnd(6)} test ${row.task_id} ×${row.delta}: ${row.name}`);
  for (const row of diagnostics) console.log(`${row.change.padEnd(6)} ${row.tool} ${row.severity} ${row.file} ${row.rule ?? ""} ×${row.delta}: ${row.message}`);
  const changed = tasks.length + counts.length + failures.length + diagnostics.length;
  if (changed === 0) console.log("no task, test, or diagnostic changes");
  db.close();
  return changed === 0 ? 0 : 1;
}

const args = process.argv.slice(2);
if (args[0] === "--diff") {
  process.exitCode = diff(args[1], args[2]);
} else {
  const unknown = args.filter((arg) => arg.startsWith("--") && arg !== "--no-eslint");
  const scripts = args.filter((arg) => !arg.startsWith("--"));
  if (unknown.length > 0 || scripts.length > 1) {
    console.error("Usage: pnpm check:record [script] [--no-eslint]\n       pnpm check:record --diff [base] [head]");
    process.exitCode = 2;
  } else {
    process.exitCode = await record(scripts[0] ?? "check:static", { eslint: !args.includes("--no-eslint") });
  }
}
