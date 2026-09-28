import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  balancedMutationShards,
  mergeMutationReports,
  parseMutationOptions,
  validateMutationTargets,
} from "../scripts/run-mutation.mjs";
import { staticTestFiles } from "../scripts/stryker-static.mjs";

test("mutation options distinguish changed, explicit, full, and sharded runs", () => {
  assert.deepEqual(parseMutationOptions([]), {
    all: false,
    concurrency: undefined,
    incremental: false,
    mergeShards: undefined,
    mutate: undefined,
    shard: undefined,
  });
  assert.deepEqual(
    parseMutationOptions([
      "--",
      "--all",
      "--incremental",
      "--concurrency=6",
      "--shard=2/4",
    ]),
    {
      all: true,
      concurrency: 6,
      incremental: true,
      mergeShards: undefined,
      mutate: undefined,
      shard: { index: 2, total: 4 },
    },
  );
  assert.throws(
    () => parseMutationOptions(["--all", "--mutate=src/a.ts"]),
    /mutually exclusive/,
  );
  assert.throws(() => parseMutationOptions(["--shard=1/4"]), /requires --all/);
  assert.throws(
    () => parseMutationOptions(["--merge-shards=4", "--incremental"]),
    /cannot be combined/,
  );
});

test("mutation shards greedily balance source lines without losing targets", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "monimal-shards-"));
  try {
    for (const [file, lines] of [
      ["a.ts", 10],
      ["b.ts", 8],
      ["c.ts", 3],
      ["d.ts", 2],
    ]) {
      fs.writeFileSync(path.join(root, file), "line\n".repeat(lines));
    }
    const shards = balancedMutationShards(
      ["a.ts", "b.ts", "c.ts", "d.ts"],
      2,
      root,
    );
    assert.deepEqual(shards.flat().sort(), ["a.ts", "b.ts", "c.ts", "d.ts"]);
    assert.deepEqual(shards, [
      ["a.ts", "d.ts"],
      ["b.ts", "c.ts"],
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("mutation targets stay inside the reviewed source scope", () => {
  assert.deepEqual(
    validateMutationTargets(
      ["src/a.ts:2-4", "scripts/check.mjs"],
      ["src/a.ts", "scripts/check.mjs"],
    ),
    ["src/a.ts:2-4", "scripts/check.mjs"],
  );
  assert.throws(
    () => validateMutationTargets(["tests/a.test.ts"], ["src/a.ts"]),
    /outside the reviewed scope/,
  );
  assert.throws(
    () => validateMutationTargets(["../src/a.ts"], ["src/a.ts"]),
    /Invalid mutation target/,
  );
});

test("mutation reports merge disjoint files and shared test metadata", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "monimal-reports-"));
  try {
    const files = ["one.json", "two.json"];
    files.forEach((file, index) =>
      fs.writeFileSync(
        path.join(root, file),
        JSON.stringify({
          schemaVersion: "2",
          files: { [`src/${index}.ts`]: { mutants: [{ id: String(index) }] } },
          testFiles: {
            "tests/example.test.ts": {
              tests: [{ id: "test", name: "example" }],
            },
          },
        }),
      ),
    );
    const merged = mergeMutationReports(
      files.map((file) => path.join(root, file)),
    );
    assert.deepEqual(Object.keys(merged.files).sort(), [
      "src/0.ts",
      "src/1.ts",
    ]);
    assert.deepEqual(Object.keys(merged.testFiles), ["tests/example.test.ts"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("static mutation runs use the files that covered selected static mutants", () => {
  assert.deepEqual(
    staticTestFiles({
      files: {
        "src/example.ts": {
          mutants: [
            { static: true, coveredBy: ["two", "one"] },
            { static: false, coveredBy: ["ignored"] },
          ],
        },
      },
      testFiles: {
        "tests/two.test.ts": { tests: [{ id: "two" }] },
        "tests/unused.test.ts": { tests: [{ id: "ignored" }] },
        "tests/one.test.ts": { tests: [{ id: "one" }] },
      },
    }),
    ["tests/one.test.ts", "tests/two.test.ts"],
  );
  assert.deepEqual(
    staticTestFiles({
      files: {
        "src/example.ts": {
          mutants: [{ static: true, coveredBy: [] }],
        },
      },
      testFiles: {},
    }),
    [],
  );
});
