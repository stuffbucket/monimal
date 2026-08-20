import assert from "node:assert/strict"
import test from "node:test"

import { omlxBackendDescriptor } from "../src/index.ts"

test("describes the oMLX HTTP boundary", () => {
  assert.deepEqual(omlxBackendDescriptor, {
    id: "omlx",
    modelFormat: "mlx",
    transport: "http",
  })
  assert.equal(Object.isFrozen(omlxBackendDescriptor), true)
})
