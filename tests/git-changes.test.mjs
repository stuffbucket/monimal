import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  affectedBase,
  coreMutationTargets,
  mergeLineRanges,
  parseCoreMutationDiff,
} from "../scripts/git-changes.mjs";

function git(root, ...arguments_) {
  const result = spawnSync("git", arguments_, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function createRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "monimal-changes-"));
  git(root, "init", "--quiet");
  git(root, "config", "user.name", "Change Test");
  git(root, "config", "user.email", "changes@example.invalid");
  return root;
}

function write(root, relativePath, contents) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

test("zero-context Core hunks use destination paths and merge adjacent ranges", () => {
  const diff = [
    "diff --git a/packages/maximal-core/src/old.ts b/packages/maximal-core/src/new.ts",
    "similarity index 90%",
    "rename from packages/maximal-core/src/old.ts",
    "rename to packages/maximal-core/src/new.ts",
    "--- a/packages/maximal-core/src/old.ts",
    "+++ b/packages/maximal-core/src/new.ts",
    "@@ -2,0 +3,2 @@",
    "+a",
    "+b",
    "@@ -4,0 +5 @@",
    "+c",
    "diff --git a/packages/maximal-core/src/deleted.ts b/packages/maximal-core/src/deleted.ts",
    "--- a/packages/maximal-core/src/deleted.ts",
    "+++ /dev/null",
    "@@ -1 +0,0 @@",
    "-gone",
    "diff --git a/packages/maximal-core/src/pure-delete.ts b/packages/maximal-core/src/pure-delete.ts",
    "--- a/packages/maximal-core/src/pure-delete.ts",
    "+++ b/packages/maximal-core/src/pure-delete.ts",
    "@@ -4,2 +3,0 @@",
    "-gone",
    "-too",
    "diff --git a/packages/other/src/outside.ts b/packages/other/src/outside.ts",
    "--- a/packages/other/src/outside.ts",
    "+++ b/packages/other/src/outside.ts",
    "@@ -0,0 +1 @@",
    "+outside",
  ].join("\n");

  assert.deepEqual(Object.fromEntries(parseCoreMutationDiff(diff)), {
    "src/new.ts": [
      { start: 3, end: 4 },
      { start: 5, end: 5 },
    ],
  });
  assert.deepEqual(
    mergeLineRanges([
      { start: 8, end: 9 },
      { start: 3, end: 4 },
      { start: 5, end: 8 },
    ]),
    [{ start: 3, end: 9 }],
  );
});

test("affected Core mutation targets include committed, staged, unstaged, renamed, and untracked lines", () => {
  const root = createRepository();
  const source = "packages/maximal-core/src";
  try {
    write(root, `${source}/committed.ts`, "one\n");
    write(root, `${source}/staged.ts`, "one\n");
    write(root, `${source}/unstaged.ts`, "one\n");
    write(root, `${source}/deletion.ts`, "one\ntwo\n");
    write(
      root,
      `${source}/old-name.ts`,
      Array.from({ length: 10 }, (_, index) => `line ${index + 1}`).join("\n") +
        "\n",
    );
    git(root, "add", ".");
    git(root, "commit", "--quiet", "--no-gpg-sign", "-m", "base");
    const base = git(root, "rev-parse", "HEAD");

    assert.throws(() => affectedBase(root), /git fetch origin main/);
    git(root, "update-ref", "refs/remotes/origin/main", base);
    assert.equal(affectedBase(root), base);

    fs.appendFileSync(path.join(root, `${source}/committed.ts`), "two\n");
    git(root, "add", `${source}/committed.ts`);
    git(root, "commit", "--quiet", "--no-gpg-sign", "-m", "committed change");
    fs.appendFileSync(path.join(root, `${source}/staged.ts`), "two\n");
    git(root, "add", `${source}/staged.ts`);
    fs.appendFileSync(path.join(root, `${source}/unstaged.ts`), "two\n");
    write(root, `${source}/deletion.ts`, "one\n");
    git(root, "mv", `${source}/old-name.ts`, `${source}/new-name.ts`);
    fs.appendFileSync(path.join(root, `${source}/new-name.ts`), "line 11\n");
    write(root, `${source}/untracked.ts`, "one\ntwo\n");
    write(root, `${source}/empty.ts`, "");

    assert.deepEqual(coreMutationTargets(root), [
      "src/committed.ts:2-2",
      "src/new-name.ts:11-11",
      "src/staged.ts:2-2",
      "src/unstaged.ts:2-2",
      "src/untracked.ts:1-2",
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("affected mutation fails closed when no mutable Core lines changed", () => {
  const root = createRepository();
  try {
    write(root, "packages/maximal-core/src/index.ts", "export {};\n");
    git(root, "add", ".");
    git(root, "commit", "--quiet", "--no-gpg-sign", "-m", "base");
    git(
      root,
      "update-ref",
      "refs/remotes/origin/main",
      git(root, "rev-parse", "HEAD"),
    );
    assert.throws(
      () => coreMutationTargets(root),
      /No mutable Core source lines changed.*--mutate.*--all/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
