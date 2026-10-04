#!/usr/bin/env node
/**
 * Runs a root pnpm script (default: `check`) and prints only its warnings,
 * errors, and failures. The complete log is written to
 * reports/check-summary/<script>.log, and the exit code is the script's.
 *
 *   pnpm check:summary                 # pnpm check
 *   pnpm check:summary check:static    # any root script
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const root = path.resolve(import.meta.dirname, "..");
const [script = "check", ...rest] = process.argv.slice(2);
const logPath = path.join(root, "reports/check-summary", `${script.replaceAll(":", "-")}.log`);
fs.mkdirSync(path.dirname(logPath), { recursive: true });
const log =
  script === "--replay" ? { write() {}, end() {} } : fs.createWriteStream(logPath);

// Severity words count only as standalone tokens, so paths such as
// `device-code-error-body.test.ts` and summaries such as `0 errors` stay quiet.
const severity =
  /(?<![\w./-])(WARN|WARNING|warn|warning|Warning|ERROR|error|Error|FAIL|failed|Failed)(?![\w./-])|ERR_[A-Z_]+|\bnot ok\b|\(fail\)|⚠/;
// Deliberately broader than `severity`: lines that match this but are hidden
// are reported at the end so a missed diagnostic format is visible.
const suspicious = /warn|err|fail|fatal|panic|exception|abort|deprecat|⚠|✘|✗/i;
const zeroCounts =
  /\(0 errors?, 0 warnings?\)|\b0 (errors?|warnings?|failed)\b(?!,? *[1-9])|\b0 \w+ \((error|warning)\)/;
const passing = /^\s*(✔|✓|√|\(pass\)|ok \d)/;
const eslintSummary = /✖ \d+ problems? \((\d+) errors?, (\d+) warnings?\)/;
const eslintDiagnostic = /^\s*\d+:\d+\s+(warning|error)\s/;
const eslintFile = /^\s*(\/|[A-Za-z]:\\)\S+\.\w+\s*$/;
const taskFailed = /command finished with error|exited \(\d+\)|ERR_PNPM_RECURSIVE/;
// Turbo prefixes task output with `<package>:<task>: `.
const taskPrefix = /^(\S+?:[\w:@/-]+?): /;

const stripAnsi = (line) => line.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
const recent = new Map();
const pendingFile = new Map();
const eslintShown = new Map();
const hidden = [];
const notices = [];
const tail = 40;
let printed = 0;
let failureShown = false;

function emit(line) {
  process.stdout.write(`${line}\n`);
  printed += 1;
}

function handle(raw) {
  const line = stripAnsi(raw);
  log.write(`${line}\n`);
  const prefix = taskPrefix.exec(line)?.[1] ?? "";
  const body = prefix ? line.slice(prefix.length + 2) : line;

  const history = recent.get(prefix) ?? [];
  history.push(line);
  if (history.length > tail) history.shift();
  recent.set(prefix, history);

  if (eslintFile.test(body)) {
    pendingFile.set(prefix, line);
    return;
  }
  // pnpm echoes each script's command line; never treat it as a diagnostic.
  if (/^\s*(>|\$) /.test(body)) return;
  if (taskFailed.test(body)) {
    failureShown = true;
    // Turbo reports failures as `<package>#<task>:`, but prefixes task output
    // with `<package>:<task>:`; show the failing task's own recent output.
    const failed = /^(\S+?)#(\S+?):/.exec(line);
    const owner = failed ? `${failed[1]}:${failed[2]}` : prefix;
    const context = recent.get(owner) ?? history;
    emit(`--- last ${context.length} lines of ${owner || "output"} ---`);
    for (const previous of context) emit(previous);
    emit("---");
    return;
  }
  const summary = eslintSummary.exec(body);
  if (summary) {
    const expected = Number(summary[1]) + Number(summary[2]);
    const shown = eslintShown.get(prefix) ?? 0;
    eslintShown.delete(prefix);
    if (expected !== 0) emit(line);
    if (shown !== expected) {
      notices.push(`${prefix}: ESLint reported ${expected} problem(s) but ${shown} were shown.`);
    }
    return;
  }
  if (passing.test(body) || zeroCounts.test(body)) return;
  if (!severity.test(body)) {
    if (suspicious.test(body)) hidden.push(line);
    return;
  }

  const file = pendingFile.get(prefix);
  if (file) {
    emit(file);
    pendingFile.delete(prefix);
  }
  if (eslintDiagnostic.test(body)) eslintShown.set(prefix, (eslintShown.get(prefix) ?? 0) + 1);
  emit(line);
}

function report(status, signal) {
  if (status !== 0 && !failureShown) {
    notices.push("The script failed, but no task failure was recognized; read the full log.");
  }
  if (hidden.length > 0) {
    emit(`\n${hidden.length} hidden line(s) mention warn/error/fail-like words; check them for missed diagnostics:`);
    for (const line of hidden.slice(0, 20)) emit(`  ${line}`);
    if (hidden.length > 20) emit(`  … ${hidden.length - 20} more in the full log`);
  }
  for (const notice of notices) emit(`NOTICE ${notice}`);
  const outcome = status === 0 ? "passed" : `failed (${signal ?? `exit ${status}`})`;
  const source = script === "--replay" ? `Replayed ${rest[0]}` : `pnpm ${script} ${outcome}`;
  console.log(
    `\n${source}; ${printed} line(s) shown.${script === "--replay" ? "" : ` Full log: ${path.relative(root, logPath)}`}`,
  );
}

if (script === "--replay") {
  // Re-filter a saved log without rerunning the checks.
  const source = rest[0];
  if (!source) throw new Error("Usage: check-summary.mjs --replay <log>");
  for (const line of fs.readFileSync(source, "utf8").split("\n")) handle(line);
  log.end();
  report(0);
} else {
  const child = spawn("pnpm", ["run", script, ...rest], {
    cwd: root,
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
    stdio: ["inherit", "pipe", "pipe"],
  });
  for (const stream of [child.stdout, child.stderr]) {
    readline.createInterface({ input: stream, crlfDelay: Infinity }).on("line", handle);
  }
  child.on("close", (code, signal) => {
    log.end();
    const status = code ?? 1;
    report(status, signal);
    process.exitCode = status;
  });
}
