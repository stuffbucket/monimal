import {
  compareSettingsReaders,
  scanSettingsReaders,
} from "@stuffbucket/maximal-settings/migration"
import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

void test("migration ratchet recognizes runtime readers, ignores comments/tests, and exposes additions and removals", () => {
  const root = mkdtempSync(join(tmpdir(), "settings-ratchet-"))
  try {
    assert.throws(
      () => scanSettingsReaders({ root }),
      /matched no runtime files/,
    )
    const directory = join(root, "packages", "sample", "src")
    mkdirSync(directory, { recursive: true })
    const source = join(directory, "settings.ts")
    writeFileSync(
      source,
      `
      import runtime from "node:process";
      const first = process.env.EXAMPLE_ONE;
      const second = runtime["env"]["EXAMPLE_TWO"];
      const third = process.env[name];
      const { env } = process;
      const filename = "settings.json";
      // process.env.NOT_A_READER
    `,
    )
    writeFileSync(join(directory, "settings.test.ts"), "process.env.TEST_ONLY")
    const current = scanSettingsReaders({ root })
    assert.deepEqual(current, {
      "packages/sample/src/settings.ts::environment:*": 2,
      "packages/sample/src/settings.ts::environment:EXAMPLE_ONE": 1,
      "packages/sample/src/settings.ts::environment:EXAMPLE_TWO": 1,
      "packages/sample/src/settings.ts::settings-file": 1,
    })
    assert.deepEqual(compareSettingsReaders(current, current), {
      added: [],
      removed: [],
    })
    assert.equal(compareSettingsReaders(current, {}).added.length, 4)
    writeFileSync(source, "export const migrated = true")
    const reduced = scanSettingsReaders({ root })
    assert.deepEqual(reduced, {})
    assert.equal(compareSettingsReaders(reduced, current).removed.length, 4)
    assert.equal(
      compareSettingsReaders({ ...current, "new-reader": 1 }, current).added
        .length,
      1,
    )
    assert.equal(
      compareSettingsReaders(
        { ...current, "packages/sample/src/settings.ts::environment:*": 3 },
        current,
      ).added.length,
      1,
    )
    const loggingDirectory = join(root, "packages", "maximal-logging", "src")
    mkdirSync(loggingDirectory, { recursive: true })
    writeFileSync(
      join(loggingDirectory, "index.ts"),
      `
      const state = process.env.XDG_STATE_HOME;
      const local = process.env.LOCALAPPDATA;
      const duplicate = process.env.XDG_STATE_HOME;
      const setting = process.env.MAXIMAL_DEBUG;
    `,
    )
    assert.deepEqual(scanSettingsReaders({ root }), {
      "packages/maximal-logging/src/index.ts::environment:MAXIMAL_DEBUG": 1,
      "packages/maximal-logging/src/index.ts::environment:XDG_STATE_HOME": 1,
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
