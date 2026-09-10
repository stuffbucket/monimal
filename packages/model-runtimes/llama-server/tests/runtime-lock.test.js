import assert from "node:assert/strict"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { readRuntimeLock, requireRuntimeEntry } from "../src/index.ts"

test("fails packaging explicitly when authoritative runtime inventory is absent", async () => {
  const lock = await readRuntimeLock(
    fileURLToPath(new globalThis.URL("../runtime-lock.json", import.meta.url)),
  )
  assert.deepEqual(lock.releases, {})
  assert.throws(
    () => requireRuntimeEntry(lock, "darwin-arm64"),
    /no authoritative llama\.cpp release is populated for darwin-arm64/,
  )
})
