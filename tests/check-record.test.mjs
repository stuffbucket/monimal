import assert from "node:assert/strict";
import test from "node:test";

import {
  baselineRef,
  fingerprint,
  idFingerprint,
  normalize,
  parseEslintStylishTotals,
  parseTestFailures,
  parseTestSummaries,
  parseTokenRatchet,
  parseTscDiagnostics,
  stripAnsi,
  taskOutput,
  tokenDiagnostics,
  worktreeLabel,
} from "../scripts/check-record-parsers.mjs";

test("stripAnsi removes color and hyperlink sequences", () => {
  assert.equal(stripAnsi("\u001b[31m✖\u001b[39m \u001b]8;;file://x\u0007link\u001b]8;;\u0007"), "✖ link");
});

test("normalize masks volatile values and relativizes the repository root", () => {
  assert.equal(
    normalize("/repo/packages/a/src/x.ts took 12.5ms at 13:57:23 hash 0baf0f97ccddce4a  ", "/repo"),
    "packages/a/src/x.ts took <dur> at <time> hash <hash>",
  );
});

test("fingerprint ignores numbers so line and count changes keep identity", () => {
  assert.equal(fingerprint("tsc", "a.ts", "TS2307", "line 3"), fingerprint("tsc", "a.ts", "TS2307", "line 40"));
  assert.notEqual(fingerprint("tsc", "a.ts", "TS2307", "x"), fingerprint("tsc", "b.ts", "TS2307", "x"));
});

test("parseTscDiagnostics reads piped and pretty tsc output relative to the package", () => {
  const rows = parseTscDiagnostics(
    [
      "src/renderer/index.ts(1,45): error TS2307: Cannot find module './components/Canvas.js' or its corresponding type declarations.",
      "src/renderer/index.ts:110:8 - error TS2307: Cannot find module './components/SpatialCanvas.js'.",
      "src/renderer/index.ts(1,45): error TS2307: Cannot find module './components/Canvas.js' or its corresponding type declarations.",
      "../shared/x.ts(2,1): error TS1005: ';' expected.",
      "Found 6 errors in the same file, starting at: src/renderer/index.ts:1",
    ],
    "packages/maximal-electron",
  );
  assert.deepEqual(
    rows.map(({ file, line, col, rule }) => [file, line, col, rule]),
    [
      ["packages/maximal-electron/src/renderer/index.ts", 1, 45, "TS2307"],
      ["packages/maximal-electron/src/renderer/index.ts", 110, 8, "TS2307"],
      ["packages/shared/x.ts", 2, 1, "TS1005"],
    ],
  );
});

test("parseTestSummaries keeps the final vitest block and separates chained runners", () => {
  const summaries = parseTestSummaries([
    " RUN  v5.0.1 /repo/apps/desktop",
    " Test Files 3 passed (39)",
    "      Tests 13 passed (72)",
    " Test Files  1 failed | 38 passed (39)",
    "      Tests  2 failed | 365 passed | 3 skipped (370)",
    "bun test v1.3.14 (0d9b296a)",
    " 8 pass",
    " 2 skip",
    " 0 fail",
    "Ran 10 tests across 2 files. [481.00ms]",
  ]);
  assert.deepEqual(summaries, [
    { runner: "vitest", filesPassed: 38, filesFailed: 1, passed: 365, failed: 2, skipped: 3, todo: 0, cancelled: 0, total: 370 },
    { runner: "bun", filesPassed: null, filesFailed: null, passed: 8, failed: 0, skipped: 2, todo: 0, cancelled: 0, total: 10 },
  ]);
});

test("parseTestSummaries reads node --test totals and repeated node runs", () => {
  const block = (tests, pass, cancelled) => [
    `ℹ tests ${tests}`,
    "ℹ suites 0",
    `ℹ pass ${pass}`,
    "ℹ fail 0",
    `ℹ cancelled ${cancelled}`,
    "ℹ skipped 0",
    "ℹ todo 0",
    "ℹ duration_ms 554.8",
  ];
  const summaries = parseTestSummaries([...block(72, 71, 1), ...block(1, 1, 0)]);
  assert.equal(summaries.length, 2);
  assert.deepEqual(summaries[0], { runner: "node", filesPassed: null, filesFailed: null, passed: 71, failed: 0, skipped: 0, todo: 0, cancelled: 1, total: 72 });
});

test("parseTestFailures names vitest, node, and bun failures once", () => {
  const failures = parseTestFailures([
    " FAIL  tests/a.test.ts > suite > breaks",
    " FAIL  tests/a.test.ts > suite > breaks",
    "✖ tests/mcp-stdio.test.ts (545.432333ms)",
    "✖ failing tests:",
    "",
    "test at tests/mcp-stdio.test.ts:1:1",
    "✖ tests/mcp-stdio.test.ts (545.432333ms)",
    "  'Promise resolution is still pending but the event loop has already resolved'",
    "[ELIFECYCLE] Test failed. See above for more details.",
    "✖ not a failure after the section",
    "(fail) provider composition > rejects [0.14ms]",
  ]);
  assert.deepEqual(
    failures.map(({ runner, name, location }) => [runner, name, location]),
    [
      ["vitest", "tests/a.test.ts > suite > breaks", null],
      ["node", "tests/mcp-stdio.test.ts", "tests/mcp-stdio.test.ts:1:1"],
      ["bun", "provider composition > rejects", null],
    ],
  );
});

test("parseEslintStylishTotals returns the final stylish summary", () => {
  assert.equal(parseEslintStylishTotals(["no problems"]), null);
  assert.deepEqual(parseEslintStylishTotals(["✖ 333 problems (0 errors, 333 warnings)"]), { problems: 333, errors: 0, warnings: 333 });
  assert.deepEqual(parseEslintStylishTotals(["✖ 1 problem (1 error, 0 warnings)"]), { problems: 1, errors: 1, warnings: 0 });
});

test("worktreeLabel names the main checkout and linked worktrees from their shared parent", () => {
  assert.equal(worktreeLabel("/src/monimal/.git", "/src/monimal"), "monimal");
  assert.equal(worktreeLabel("/src/monimal/.git", "/src/monimal.worktrees/feature"), "monimal.worktrees/feature");
  assert.equal(worktreeLabel("C:\\src\\monimal\\.git", "C:\\src\\monimal.worktrees\\x\\"), "monimal.worktrees/x");
  assert.equal(worktreeLabel("/src/monimal/.git", "/elsewhere/checkout"), "/elsewhere/checkout");
});

test("baselineRef compares the default branch with its remote and other branches with the default branch", () => {
  assert.equal(baselineRef({ branch: "main", defaultBranch: "main", upstream: "monimal/main" }), "monimal/main");
  assert.equal(baselineRef({ branch: "main", defaultBranch: "main", upstream: null }), null);
  assert.equal(baselineRef({ branch: "agents/x", defaultBranch: "main", upstream: "monimal/agents/x" }), "main");
  assert.equal(baselineRef({ branch: null, defaultBranch: "main", upstream: null }), "main");
});

test("taskOutput recovers uncached task lines from the prefixed run stream", () => {
  const stream = [
    "@maximal/maximal-logging:lint: $ eslint .",
    "@maximal/maximal-logging:lint:",
    "@maximal/maximal-logging:lint: ✖ 1 problem (0 errors, 1 warning)",
    "@maximal/maximal-logging:build: unrelated",
    "@maximal/maximal-logging:lint-extra: unrelated",
  ];
  assert.deepEqual(taskOutput(stream, "@maximal/maximal-logging", "lint"), ["$ eslint .", "", "✖ 1 problem (0 errors, 1 warning)"]);
  assert.equal(taskOutput(stream, "maximal-desktop", "build"), null);
});

test("parseTokenRatchet reads the known total and the ratchet change counts", () => {
  assert.deepEqual(
    parseTokenRatchet(["Token inventory warning ratchet: 312 known issue(s).", "  WARN tool-gap: 1"]),
    { known: 312, added: 0, gone: 0 },
  );
  assert.deepEqual(
    parseTokenRatchet(["New token inventory issues (2):", "  + [x] y", "Resolved token issues still recorded (1); run token:check -- --update:"]),
    { known: 0, added: 2, gone: 1 },
  );
  assert.equal(parseTokenRatchet(["inventory", "done"]), null);
});

test("tokenDiagnostics grades issues against the ratchet baseline", () => {
  const issues = [
    { id: "provisional-type:--space-2", kind: "provisional-type", detail: "--space-2 is inventoried as a string." },
    { id: "icon-size-outlier:apps/a/Icon.tsx:Icon:13", kind: "icon-size-outlier", detail: "apps/a/Icon.tsx:42 renders Icon at 13px." },
  ];
  const rows = tokenDiagnostics(issues, ["provisional-type:--space-2", "multiple-values:--gone"]);
  assert.deepEqual(rows.map(({ severity, rule, file, line }) => ({ severity, rule, file, line })), [
    { severity: "warning", rule: "provisional-type", file: null, line: null },
    { severity: "error", rule: "icon-size-outlier", file: "apps/a/Icon.tsx", line: 42 },
    { severity: "error", rule: "stale-baseline", file: null, line: null },
  ]);
  assert.match(rows[2].message, /^multiple-values:--gone is resolved/);
  assert.equal(rows[0].fingerprint, idFingerprint("design-tokens", "provisional-type:--space-2"));
  const [other] = tokenDiagnostics([{ ...issues[0], id: "provisional-type:--space-3" }], []);
  assert.notEqual(other.fingerprint, rows[0].fingerprint);
});
