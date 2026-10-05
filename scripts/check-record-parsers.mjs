// Pure parsers for scripts/check-record.mjs. Inputs are ANSI-stripped log lines;
// outputs are plain rows so they can be tested without running any tool.
import { createHash } from "node:crypto";

const ansi = /\u001b\[[0-9;?]*[A-Za-z]|\u001b\][^\u0007]*\u0007/g;

export function stripAnsi(text) {
  return text.replace(ansi, "");
}

export function normalize(text, root) {
  let result = text;
  if (root) {
    result = result.replaceAll(`${root}/`, "").replaceAll(`${root}\\`, "").replaceAll(root, ".");
  }
  return result
    .replace(/\b\d{4}-\d\d-\d\dT[\d:.]+Z?\b/g, "<ts>")
    .replace(/\b\d{1,2}:\d\d:\d\d(\.\d+)?\b/g, "<time>")
    .replace(/\b\d+(\.\d+)?\s?(ms|s|m)\b/g, "<dur>")
    .replace(/\b[0-9a-f]{12,64}\b/g, "<hash>")
    .replace(/\s+$/, "");
}

// For tools that already emit a stable identity; numbers stay significant.
export function idFingerprint(...parts) {
  return createHash("sha1").update(parts.map((part) => String(part ?? "")).join("\0")).digest("hex").slice(0, 16);
}

// Numbers are masked so a fingerprint survives line moves and count changes.
export function fingerprint(...parts) {
  return idFingerprint(...parts.map((part) => String(part ?? "").replace(/\d+/g, "#")));
}

function joinPath(directory, file) {
  const joined = directory && directory !== "." ? `${directory}/${file}` : file;
  const parts = [];
  for (const part of joined.replaceAll("\\", "/").split("/")) {
    if (part === "..") parts.pop();
    else if (part && part !== ".") parts.push(part);
  }
  return parts.join("/");
}

// tsc emits `file(l,c): error TSn: msg` when piped and `file:l:c - error TSn: msg` when pretty.
const tscPatterns = [
  /^(?<file>[^\s(][^(]*?)\((?<line>\d+),(?<col>\d+)\): (?<severity>error|warning) (?<rule>TS\d+): (?<message>.*)$/,
  /^(?<file>[^\s:][^:]*?):(?<line>\d+):(?<col>\d+) - (?<severity>error|warning) (?<rule>TS\d+): (?<message>.*)$/,
];

export function parseTscDiagnostics(lines, directory) {
  const rows = [];
  const seen = new Set();
  for (const line of lines) {
    const match = tscPatterns.map((pattern) => pattern.exec(line.trim())).find(Boolean);
    if (!match) continue;
    const { file, line: row, col, severity, rule, message } = match.groups;
    const relative = joinPath(directory, file);
    const key = `${relative}:${row}:${col}:${rule}:${message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      tool: "tsc",
      file: relative,
      line: Number(row),
      col: Number(col),
      severity,
      rule,
      message,
      fingerprint: fingerprint("tsc", relative, rule, message),
    });
  }
  return rows;
}

const emptyCounts = () => ({
  filesPassed: null,
  filesFailed: null,
  passed: 0,
  failed: 0,
  skipped: 0,
  todo: 0,
  cancelled: 0,
  total: null,
});

function vitestCounts(text) {
  const counts = {};
  for (const [, value, label] of text.matchAll(/(\d+) (passed|failed|skipped|todo)/g)) {
    counts[label] = Number(value);
  }
  const total = /\((\d+)\)\s*$/.exec(text);
  return { counts, total: total ? Number(total[1]) : null };
}

// Vitest repaints its summary while running; the last block in a segment is final.
// A task may chain runners (vitest && bun test), so each runner start opens a segment.
export function parseTestSummaries(lines) {
  const summaries = [];
  let current = null;
  const open = (runner) => {
    current = { runner, ...emptyCounts(), found: false };
    summaries.push(current);
    return current;
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (/^RUN\s+v\d/.test(line)) {
      open("vitest");
      continue;
    }
    if (/^bun test v\d/.test(line)) {
      open("bun");
      continue;
    }
    const vitestFiles = /^Test Files\s+(.*)$/.exec(line);
    if (vitestFiles) {
      const segment = current?.runner === "vitest" ? current : open("vitest");
      const { counts, total } = vitestCounts(vitestFiles[1]);
      segment.filesPassed = counts.passed ?? 0;
      segment.filesFailed = counts.failed ?? 0;
      segment.fileTotal = total;
      segment.found = true;
      continue;
    }
    const vitestTests = /^Tests\s+(\d.*)$/.exec(line);
    if (vitestTests && current?.runner === "vitest") {
      const { counts, total } = vitestCounts(vitestTests[1]);
      Object.assign(current, {
        passed: counts.passed ?? 0,
        failed: counts.failed ?? 0,
        skipped: counts.skipped ?? 0,
        todo: counts.todo ?? 0,
        total,
        found: true,
      });
      continue;
    }
    const node = /^ℹ (tests|pass|fail|skipped|todo|cancelled) (\d+)$/.exec(line);
    if (node) {
      const [, label, value] = node;
      const segment = label === "tests" || current?.runner !== "node" ? open("node") : current;
      const key = { tests: "total", pass: "passed", fail: "failed" }[label] ?? label;
      segment[key] = Number(value);
      segment.found = true;
      continue;
    }
    const bun = /^(\d+) (pass|fail|skip|todo)$/.exec(line);
    if (bun && current?.runner === "bun") {
      const key = { pass: "passed", fail: "failed", skip: "skipped", todo: "todo" }[bun[2]];
      current[key] = Number(bun[1]);
      current.found = true;
      continue;
    }
    const bunTotal = /^Ran (\d+) tests? across/.exec(line);
    if (bunTotal && current?.runner === "bun") current.total = Number(bunTotal[1]);
  }
  return summaries
    .filter((summary) => summary.found)
    .map(({ found, fileTotal, ...summary }) => {
      if (summary.total === null && summary.runner !== "vitest") {
        summary.total = summary.passed + summary.failed + summary.skipped + summary.todo + summary.cancelled;
      }
      return summary;
    });
}

const duration = /\s*[([]\s*[\d.]+\s*m?s\s*[)\]]\s*$/;

export function parseTestFailures(lines) {
  const failures = [];
  const seen = new Set();
  const add = (runner, name, location = null) => {
    const clean = name.replace(duration, "").trim();
    const key = `${runner}\0${clean}`;
    if (!clean || seen.has(key)) return;
    seen.add(key);
    failures.push({ runner, name: clean, location, fingerprint: fingerprint(runner, clean) });
  };
  let nodeSection = false;
  let nodeLocation = null;
  for (const raw of lines) {
    const line = raw.trim();
    const vitest = /^FAIL\s+(.+)$/.exec(line);
    if (vitest) {
      add("vitest", vitest[1]);
      continue;
    }
    if (line === "✖ failing tests:") {
      nodeSection = true;
      continue;
    }
    if (nodeSection) {
      const location = /^test at (.+)$/.exec(line);
      if (location) {
        nodeLocation = location[1];
        continue;
      }
      const failed = /^✖ (.+)$/.exec(line);
      if (failed) {
        add("node", failed[1], nodeLocation);
        nodeLocation = null;
        continue;
      }
      if (/^ℹ |^\$ |^\[ELIFECYCLE\]|^RUN\s+v\d|^bun test v\d/.test(line)) nodeSection = false;
      continue;
    }
    const bun = /^(?:\(fail\)|✗)\s+(.+)$/.exec(line);
    if (bun) add("bun", bun[1]);
  }
  return failures;
}

export function parseEslintStylishTotals(lines) {
  let totals = null;
  for (const raw of lines) {
    const match = /✖ (\d+) problems? \((\d+) errors?, (\d+) warnings?\)/.exec(raw);
    if (match) totals = { problems: Number(match[1]), errors: Number(match[2]), warnings: Number(match[3]) };
  }
  return totals;
}

// Labels a worktree by its path from the main checkout's parent, e.g. `monimal` or
// `monimal.worktrees/feature`, so runs from sibling worktrees stay distinguishable.
export function worktreeLabel(commonDirectory, topLevel) {
  const normalized = (value) => value.replaceAll("\\", "/").replace(/\/+$/, "");
  const common = normalized(commonDirectory);
  const mainCheckout = common.endsWith("/.git") ? common.slice(0, -"/.git".length) : common;
  const parent = mainCheckout.slice(0, mainCheckout.lastIndexOf("/"));
  const top = normalized(topLevel);
  return top.startsWith(`${parent}/`) ? top.slice(parent.length + 1) : top;
}

// The baseline is the commit this work started from: the default branch measures
// against its remote copy, and every other branch (or a detached HEAD) against the
// local default branch it was cut from.
export function baselineRef({ branch, defaultBranch, upstream }) {
  if (branch && branch === defaultBranch) return upstream ?? null;
  return defaultBranch;
}

// Turbo writes no log file for `cache: false` tasks, so their output only exists in
// the run's stream as `pkg:task: text` lines (blank lines lose the trailing space).
export function taskOutput(lines, packageName, task) {
  const prefix = `${packageName}:${task}:`;
  const output = [];
  for (const line of lines) {
    if (line === prefix) output.push("");
    else if (line.startsWith(`${prefix} `)) output.push(line.slice(prefix.length + 1));
  }
  return output.length > 0 ? output : null;
}

// packages/maximal-design-system/scripts/check-inventory.mjs prints these ratchet totals.
const tokenRatchetPatterns = {
  known: /^Token inventory warning ratchet: (\d+) known issue/,
  added: /^New token inventory issues \((\d+)\):/,
  gone: /^Resolved token issues still recorded \((\d+)\)/,
};

export function parseTokenRatchet(lines) {
  const totals = { known: 0, added: 0, gone: 0 };
  let found = false;
  for (const line of lines) {
    for (const [key, pattern] of Object.entries(tokenRatchetPatterns)) {
      const match = pattern.exec(line.trim());
      if (!match) continue;
      totals[key] = Number(match[1]);
      found = true;
    }
  }
  return found ? totals : null;
}

const tokenIssueFile = /^((?:apps|packages)\/[^\s:]+)(?::(\d+))?/;

// Issues come from dist/issues.json and baseline ids from token-issues-baseline.json:
// recorded issues are warnings, new ones and resolved-but-recorded ids are errors.
export function tokenDiagnostics(issues, baseline) {
  const recorded = new Set(baseline.map((entry) => (typeof entry === "string" ? entry : entry.id)));
  const current = new Set(issues.map((issue) => issue.id));
  const row = (severity, rule, message, file = null, line = null, ...identity) => ({
    tool: "design-tokens", file, line, col: null, severity, rule, message,
    fingerprint: idFingerprint("design-tokens", ...identity),
  });
  const rows = issues.map((issue) => {
    const match = tokenIssueFile.exec(issue.detail);
    return row(recorded.has(issue.id) ? "warning" : "error", issue.kind, issue.detail,
      match?.[1] ?? null, match?.[2] ? Number(match[2]) : null, issue.id);
  });
  for (const id of recorded) {
    if (!current.has(id)) {
      rows.push(row("error", "stale-baseline", `${id} is resolved but still recorded; run token:check -- --update`, null, null, "stale", id));
    }
  }
  return rows;
}
