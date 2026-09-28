import assert from "node:assert/strict"
import { test } from "node:test"

import {
  codeForReason,
  CONTROL_ERROR_REASONS,
  errorResponse,
  jsonRpcRequestSchema,
  successResponse,
} from "../src/control.ts"
import { AuthStatus } from "../src/settings.ts"

void test("every control error reason has its own code", () => {
  const codes = CONTROL_ERROR_REASONS.map((reason) => codeForReason(reason))

  assert.equal(new Set(codes).size, CONTROL_ERROR_REASONS.length)
})

void test("a request parses and its responses echo the id", () => {
  const request = jsonRpcRequestSchema.parse({
    jsonrpc: "2.0",
    id: 7,
    method: "auth/status",
  })

  assert.equal(successResponse(request.id, null).id, 7)
  assert.deepEqual(
    errorResponse(request.id, { code: -32603, message: "boom" }),
    {
      jsonrpc: "2.0",
      id: 7,
      error: { code: -32603, message: "boom" },
    },
  )
})

void test("the auth status union rejects an unknown state", () => {
  assert.equal(AuthStatus.safeParse({ state: "unauthenticated" }).success, true)
  assert.equal(AuthStatus.safeParse({ state: "bogus" }).success, false)
})
