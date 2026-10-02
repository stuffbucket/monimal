import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { test } from "node:test"

import { scanUnsafeTypeAssertions } from "../scripts/check-unsafe-type-assertions.mjs"

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "monimal-unsafe-scan-"))
  execFileSync("git", ["init", "--quiet"], { cwd: directory })
  return directory
}

test("scans existing source while excluding deleted tracked files", async () => {
  const directory = fixture()
  try {
    fs.writeFileSync(path.join(directory, "removed.ts"), "export const removed = 1\n")
    execFileSync("git", ["add", "removed.ts"], { cwd: directory })
    fs.unlinkSync(path.join(directory, "removed.ts"))
    fs.writeFileSync(path.join(directory, "current.ts"), 'const value = JSON.parse("{}") as { id: string }\n')
    assert.deepEqual(await scanUnsafeTypeAssertions(directory), [
      { path: "current.ts", kind: "unvalidated-json-parse", count: 1 },
    ])
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test("fails when no existing TypeScript files can be inspected", async () => {
  const directory = fixture()
  try {
    await assert.rejects(scanUnsafeTypeAssertions(directory), /No TypeScript source files/)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
