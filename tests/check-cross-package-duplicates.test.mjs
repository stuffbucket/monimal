import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  crossPackagePairs,
  crossPackagePairsFromClones,
  describeMatch,
  diffLines,
  mergePairs,
  packageForPath,
  packageRoots,
  ratchetChanges,
  readSnippet,
  resolveScopePaths,
  withinScope,
  writeKnown,
  writeReport,
} from "../scripts/check-cross-package-duplicates.mjs";

const root = path.resolve(import.meta.dirname, "..");
const scriptSource = fs.readFileSync(
  path.join(root, "scripts/check-cross-package-duplicates.mjs"),
  "utf8",
);

test("packageRoots reads every package from the architecture policy", () => {
  const packages = packageRoots(root);
  assert.ok(packages.length > 5);
  assert.ok(packages.some((pkg) => pkg.name === "@stuffbucket/maximal-core"));
  // Longest root first, so a nested package (maximal/client) is matched before its parent.
  for (let index = 1; index < packages.length; index += 1) {
    assert.ok(packages[index - 1].root.length >= packages[index].root.length);
  }
});

test("packageForPath resolves the most specific containing package", () => {
  const packages = packageRoots(root);
  assert.equal(
    packageForPath(packages, "packages/maximal-core/src/lib/x.ts"),
    "@stuffbucket/maximal-core",
  );
  assert.equal(
    packageForPath(packages, "packages/maximal/client/src/index.ts"),
    "maximal-client",
  );
  assert.equal(packageForPath(packages, "scripts/check-file-sizes.mjs"), undefined);
});

test("crossPackagePairs keeps every cross-file instance pair, same or different package, but never a file against itself", () => {
  const packages = [
    { name: "a", root: "packages/a" },
    { name: "b", root: "packages/b" },
  ];
  const matches = [
    {
      instances: [
        { path: "./packages/a/src/one.ts", lines: [1, 5] },
        { path: "./packages/a/src/two.ts", lines: [1, 5] },
        { path: "./packages/b/src/three.ts", lines: [1, 5] },
        { path: "./packages/a/src/one.ts", lines: [20, 25] },
      ],
    },
  ];
  const pairs = crossPackagePairs(matches, packages);
  assert.deepEqual(
    [...pairs.keys()].sort(),
    [
      "packages/a/src/one.ts <-> packages/a/src/two.ts",
      "packages/a/src/one.ts <-> packages/b/src/three.ts",
      "packages/a/src/two.ts <-> packages/b/src/three.ts",
    ].sort(),
  );
});

test("ratchetChanges reports only additions and disappearances", () => {
  assert.deepEqual(ratchetChanges(["a", "b"], ["b", "c"]), {
    added: ["a"],
    gone: ["c"],
  });
});

test("diffLines aligns shared lines and marks the rest left- or right-only, kdiff-style", () => {
  const ops = diffLines(
    ["a", "shared", "b"],
    ["shared", "c"],
  );
  assert.deepEqual(ops, [
    { type: "left", left: "a" },
    { type: "same", left: "shared", right: "shared" },
    { type: "left", left: "b" },
    { type: "right", right: "c" },
  ]);
  assert.deepEqual(diffLines(["x"], ["x"]), [{ type: "same", left: "x", right: "x" }]);
});

test("readSnippet returns the exact matched lines, and undefined when the file is gone", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "monimal-snippet-"));
  try {
    fs.writeFileSync(path.join(fixture, "a.ts"), "one\ntwo\nthree\nfour\n");
    assert.deepEqual(readSnippet(fixture, "a.ts", [2, 3]), ["two", "three"]);
    assert.equal(readSnippet(fixture, "missing.ts", [1, 1]), undefined);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test("writeReport also renders an HTML kdiff-style view with real snippet text", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "monimal-report-html-"));
  try {
    fs.mkdirSync(path.join(fixture, "a"), { recursive: true });
    fs.mkdirSync(path.join(fixture, "b"), { recursive: true });
    fs.writeFileSync(path.join(fixture, "a/one.ts"), "const x = 1\nconst y = 2\n");
    fs.writeFileSync(path.join(fixture, "b/two.ts"), "const x = 1\nconst z = 3\n");
    const pairs = new Map([
      [
        "a/one.ts <-> b/two.ts",
        [[{ path: "a/one.ts", lines: [1, 2] }, { path: "b/two.ts", lines: [1, 2] }]],
      ],
    ]);
    const reportDir = path.join(fixture, "out");
    const { htmlPath } = writeReport(pairs, [], reportDir, fixture);
    const html = fs.readFileSync(htmlPath, "utf8");
    assert.match(html, /<h1>Cross-package duplicates<\/h1>/);
    assert.match(html, /class="same">const x = 1</);
    assert.match(html, /class="removed">const y = 2</);
    assert.match(html, /class="added">const z = 3</);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test("crossPackagePairsFromClones keeps intra-package clones too, but never a file against itself", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "monimal-jscpd-clones-"));
  try {
    const packages = [
      { name: "a", root: "packages/a" },
      { name: "b", root: "packages/b" },
    ];
    for (const relative of [
      "packages/a/src/styles.css",
      "packages/b/src/styles.css",
      "packages/a/src/one.css",
      "packages/a/src/two.css",
    ]) {
      fs.mkdirSync(path.dirname(path.join(fixture, relative)), { recursive: true });
      fs.writeFileSync(path.join(fixture, relative), "");
    }
    const clones = [
      {
        firstFile: { name: path.join(fixture, "packages/a/src/styles.css"), start: 1, end: 5 },
        secondFile: { name: path.join(fixture, "packages/b/src/styles.css"), start: 10, end: 14 },
      },
      {
        firstFile: { name: path.join(fixture, "packages/a/src/one.css"), start: 1, end: 5 },
        secondFile: { name: path.join(fixture, "packages/a/src/two.css"), start: 1, end: 5 },
      },
      {
        firstFile: { name: path.join(fixture, "packages/a/src/one.css"), start: 1, end: 5 },
        secondFile: { name: path.join(fixture, "packages/a/src/one.css"), start: 20, end: 25 },
      },
    ];
    const pairs = crossPackagePairsFromClones(clones, packages, fixture);
    assert.deepEqual(
      [...pairs.keys()].sort(),
      [
        "packages/a/src/styles.css <-> packages/b/src/styles.css",
        "packages/a/src/one.css <-> packages/a/src/two.css",
      ].sort(),
    );
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test("mergePairs combines both engines' instances under one pair id", () => {
  const merged = mergePairs(
    new Map([["a <-> b", [["x"]]]]),
    new Map([["a <-> b", [["y"]]], ["c <-> d", [["z"]]]]),
  );
  assert.deepEqual([...merged.entries()], [
    ["a <-> b", [["x"], ["y"]]],
    ["c <-> d", [["z"]]],
  ]);
});

test("resolveScopePaths and withinScope normalize and scope like check-file-sizes.mjs", () => {
  assert.deepEqual(
    resolveScopePaths(["packages/maximal-core/src"], root, root),
    ["packages/maximal-core/src"],
  );
  assert.throws(
    () => resolveScopePaths(["../outside"], root, root),
    /outside the repository/,
  );
  assert.equal(withinScope([], "any/file.ts"), true);
  assert.equal(withinScope(["packages/a"], "packages/a/src/x.ts"), true);
  assert.equal(withinScope(["packages/a"], "packages/ab/src/x.ts"), false);
});

test("describeMatch renders both instance locations", () => {
  const rendered = describeMatch([
    { path: "a.ts", lines: [1, 2] },
    { path: "b.ts", lines: [3, 4] },
  ]);
  assert.equal(rendered, "a.ts:1-2 <-> b.ts:3-4");
});

test("writeReport persists a JSON and text snapshot of the current findings", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "monimal-report-"));
  try {
    const pairs = new Map([
      [
        "a/one.ts <-> b/two.ts",
        [[{ path: "a/one.ts", lines: [1, 5] }, { path: "b/two.ts", lines: [10, 14] }]],
      ],
      ["a/three.ts <-> b/four.ts", [[{ path: "a/three.ts", lines: [1, 2] }, { path: "b/four.ts", lines: [3, 4] }]]],
    ]);
    const { jsonPath, textPath } = writeReport(pairs, ["a/one.ts <-> b/two.ts"], fixture);

    const report = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    assert.equal(report.summary.total, 2);
    assert.equal(report.summary.known, 1);
    assert.equal(report.summary.new, 1);
    assert.deepEqual(
      report.pairs.map((entry) => [entry.id, entry.known]),
      [
        ["a/one.ts <-> b/two.ts", true],
        ["a/three.ts <-> b/four.ts", false],
      ],
    );

    const text = fs.readFileSync(textPath, "utf8");
    assert.match(text, /^2 duplicate pair\(s\), generated/);
    assert.match(text, /GATE {2}a\/one\.ts <-> b\/two\.ts/);
    assert.match(text, /new {3}a\/three\.ts <-> b\/four\.ts/);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test("writeKnown rewrites only the generated block", () => {
  const fixture = fs.mkdtempSync(
    path.join(os.tmpdir(), "monimal-cross-package-write-"),
  );
  try {
    const copyPath = path.join(fixture, "check-cross-package-duplicates.mjs");
    fs.writeFileSync(copyPath, scriptSource);

    writeKnown(["b/two.ts <-> c/three.ts", "a/one.ts <-> c/three.ts"], copyPath);
    const rewritten = fs.readFileSync(copyPath, "utf8");
    assert.match(
      rewritten,
      /const KNOWN_CROSS_PACKAGE_DUPLICATE_PAIRS = \[\n {2}"b\/two\.ts <-> c\/three\.ts",\n {2}"a\/one\.ts <-> c\/three\.ts",\n\];/,
    );
    assert.match(rewritten, /\nimport { spawnSync }/);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
