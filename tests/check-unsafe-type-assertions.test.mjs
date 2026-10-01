import assert from "node:assert/strict"
import { test } from "node:test"

import {
  isScannablePath,
  ratchetChanges,
  ratchetIncreases,
} from "../packages/eslint-config/scripts/check-unsafe-type-assertions.mjs"

test("isScannablePath covers TypeScript source but not generated trees", () => {
  assert.equal(isScannablePath("src/server.ts"), true)
  assert.equal(isScannablePath("src/component.tsx"), true)
  assert.equal(isScannablePath("dist/server.ts"), false)
  assert.equal(isScannablePath("src/server.js"), false)
})

test("ratchetChanges detects new, increased, removed, and reduced identities", () => {
  const known = [{ path: "a.ts", kind: "as-any", count: 2 }]
  assert.deepEqual(ratchetChanges(known, known), { added: [], gone: [] })
  assert.deepEqual(ratchetChanges([{ ...known[0], count: 3 }], known), {
    added: [{ path: "a.ts", kind: "as-any", count: 3 }],
    gone: known,
  })
})

test("ratchetIncreases permits only removals and lower occurrence counts", () => {
  const known = [{ path: "a.ts", kind: "as-any", count: 2 }]
  assert.deepEqual(
    ratchetIncreases([{ ...known[0], count: 1 }], known),
    [],
  )
  assert.deepEqual(
    ratchetIncreases([{ ...known[0], count: 3 }], known),
    [{ path: "a.ts", kind: "as-any", count: 3 }],
  )
  assert.deepEqual(
    ratchetIncreases([{ path: "b.ts", kind: "as-any", count: 1 }], known),
    [{ path: "b.ts", kind: "as-any", count: 1 }],
  )
})
