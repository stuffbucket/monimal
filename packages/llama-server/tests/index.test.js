import assert from "node:assert/strict"
import test from "node:test"

import { llamaServerBackendDescriptor } from "../src/index.ts"

test("describes the llama.cpp HTTP server boundary", () => {
  assert.deepEqual(llamaServerBackendDescriptor, {
    id: "llama-server",
    modelFormat: "gguf",
    transport: "http",
  })
  assert.equal(Object.isFrozen(llamaServerBackendDescriptor), true)
})
