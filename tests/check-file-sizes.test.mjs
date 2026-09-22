import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  oversizedFiles,
  ratchetChanges,
  resolveScopePaths,
  withinScope,
  writeKnown,
} from "../scripts/check-file-sizes.mjs";

const root = path.resolve(import.meta.dirname, "..");
const scriptSource = fs.readFileSync(
  path.join(root, "scripts/check-file-sizes.mjs"),
  "utf8",
);

function gitFixture() {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "monimal-file-sizes-"));
  const git = (...arguments_) =>
    spawnSync("git", arguments_, { cwd: fixture, encoding: "utf8" });
  assert.equal(git("init", "--quiet").status, 0);
  assert.equal(git("config", "user.name", "Ratchet Test").status, 0);
  assert.equal(git("config", "user.email", "ratchet@example.invalid").status, 0);
  return fixture;
}

function writeLines(filePath, count) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${"line\n".repeat(count)}`);
}

function commitAll(fixture) {
  spawnSync("git", ["add", "-A"], { cwd: fixture, encoding: "utf8" });
  spawnSync("git", ["commit", "--quiet", "--no-gpg-sign", "-m", "fixture"], {
    cwd: fixture,
    encoding: "utf8",
  });
}

test("ratchetChanges reports only additions and disappearances", () => {
  assert.deepEqual(ratchetChanges(["a", "b"], ["b", "c"]), {
    added: ["a"],
    gone: ["c"],
  });
  assert.deepEqual(ratchetChanges(["a"], ["a"]), { added: [], gone: [] });
});

test("resolveScopePaths normalizes to repo-relative POSIX paths and fails closed on escape", () => {
  assert.deepEqual(
    resolveScopePaths(["packages/maximal-core/tests"], root, root),
    ["packages/maximal-core/tests"],
  );
  assert.deepEqual(resolveScopePaths([], root, root), []);
  assert.throws(
    () => resolveScopePaths(["../outside"], root, root),
    /outside the repository/,
  );
});

test("withinScope matches a path or anything nested under it, and is unscoped when empty", () => {
  assert.equal(withinScope([], "any/file.ts"), true);
  assert.equal(withinScope(["src"], "src/a.ts"), true);
  assert.equal(withinScope(["src"], "src/nested/a.ts"), true);
  assert.equal(withinScope(["src"], "srcish/a.ts"), false);
  assert.equal(withinScope(["src/a.ts"], "src/a.ts"), true);
});

test("oversizedFiles finds only tracked files over the line limit, scoped by path", () => {
  const fixture = gitFixture();
  try {
    writeLines(path.join(fixture, "small.ts"), 10);
    writeLines(path.join(fixture, "big.ts"), 50);
    writeLines(path.join(fixture, "nested/big.ts"), 50);
    commitAll(fixture);

    const all = oversizedFiles([], fixture, 20);
    assert.deepEqual(
      all.map((entry) => entry.path).sort(),
      ["big.ts", "nested/big.ts"],
    );

    const scoped = oversizedFiles(["nested"], fixture, 20);
    assert.deepEqual(scoped.map((entry) => entry.path), ["nested/big.ts"]);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test("writeKnown rewrites only the generated block, leaving the rest of the file untouched", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "monimal-file-sizes-write-"));
  try {
    const copyPath = path.join(fixture, "check-file-sizes.mjs");
    fs.writeFileSync(copyPath, scriptSource);

    writeKnown(["b/two.ts", "a/one.ts"], copyPath);
    const rewritten = fs.readFileSync(copyPath, "utf8");
    assert.match(
      rewritten,
      /const KNOWN_OVERSIZED_FILES = \[\n {2}"b\/two\.ts",\n {2}"a\/one\.ts",\n\];/,
    );
    assert.match(rewritten, /\nimport \{ execFileSync \}/);

    writeKnown([], copyPath);
    assert.match(
      fs.readFileSync(copyPath, "utf8"),
      /const KNOWN_OVERSIZED_FILES = \[\n\];/,
    );
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test("the CLI gates new violations, requires --update to shrink, and supports ripgrep-style targeting", () => {
  const fixture = gitFixture();
  const scriptPath = path.join(fixture, "scripts/check-file-sizes.mjs");
  fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
  fs.writeFileSync(scriptPath, scriptSource);

  const run = (...arguments_) =>
    spawnSync(process.execPath, [scriptPath, ...arguments_], {
      cwd: fixture,
      encoding: "utf8",
    });

  writeLines(path.join(fixture, "big.ts"), 900);
  writeLines(path.join(fixture, "small.ts"), 5);
  commitAll(fixture);

  const first = run();
  assert.notEqual(first.status, 0);
  assert.match(first.stdout + first.stderr, /newly oversized/);

  // The ratchet only releases downward: --update refuses a genuinely new
  // violation, and accepting one is a deliberate, reviewable source edit.
  const refused = run("--update");
  assert.notEqual(refused.status, 0);
  assert.match(refused.stdout + refused.stderr, /refuses to record/);

  writeKnown(["big.ts"], scriptPath);
  const clean = run();
  assert.equal(clean.status, 0, clean.stderr);
  assert.match(clean.stdout, /no new oversized files/);

  fs.rmSync(path.join(fixture, "big.ts"));
  commitAll(fixture);
  const stale = run();
  assert.notEqual(stale.status, 0);
  assert.match(stale.stdout + stale.stderr, /no longer exist or shrank/);

  const restaled = run("--update");
  assert.equal(restaled.status, 0, restaled.stderr);
  assert.doesNotMatch(fs.readFileSync(scriptPath, "utf8"), /"big\.ts"/);

  writeLines(path.join(fixture, "scoped/other.ts"), 900);
  commitAll(fixture);
  const scoped = run("small.ts");
  assert.equal(scoped.status, 0, scoped.stderr);

  fs.rmSync(fixture, { recursive: true, force: true });
});
