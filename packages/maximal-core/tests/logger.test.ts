import { afterEach, expect, mock, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"

import { requestContext } from "../src/lib/http/request-context"
import {
  createHandlerLogger,
  debugJson,
  debugJsonTail,
} from "../src/lib/platform/logger"
import { PATHS } from "../src/lib/platform/paths"
import { state } from "../src/lib/runtime-state/state"

afterEach(() => {
  state.verbose = false
})

test("debugJson skips serialization when verbose logging is disabled", () => {
  state.verbose = false

  const logger = {
    debug: mock(() => {}),
  }
  const toJSON = mock(() => ({ ok: true }))

  debugJson(logger as never, "payload", { toJSON })

  expect(toJSON).not.toHaveBeenCalled()
  expect(logger.debug).not.toHaveBeenCalled()
})

test("debugJson logs the serialized payload when verbose logging is enabled", () => {
  state.verbose = true

  const logger = {
    debug: mock(() => {}),
  }
  const payload = { ok: true }

  debugJson(logger as never, "payload", payload)

  expect(logger.debug).toHaveBeenCalledWith("payload", JSON.stringify(payload))
})

test("debugJsonTail preserves tail truncation behavior", () => {
  state.verbose = true

  const logger = {
    debug: mock(() => {}),
  }
  // `text` is content → redacted before truncation. The tail is taken
  // of the redacted JSON, so truncation and redaction compose.
  const payload = { text: "abcdefghijklmnopqrstuvwxyz" }
  const redacted = { text: `[redacted ${payload.text.length} chars]` }
  const expected = JSON.stringify(redacted).slice(-10)

  debugJsonTail(logger as never, "payload", { value: payload, tailLength: 10 })

  expect(logger.debug).toHaveBeenCalledWith("payload", expected)
})

test("handler logger persists a structured record with its request trace", () => {
  const name = `handler-test-${Date.now()}`
  const logger = createHandlerLogger(name)
  requestContext.run(
    {
      traceId: "trace-logger-test",
      startTime: Date.now(),
      userAgent: "test",
      sessionAffinity: undefined,
      parentSessionId: undefined,
    },
    () => logger.warn("request failed"),
  )

  const dateKey = new Date().toLocaleDateString("sv-SE")
  const file = path.join(PATHS.APP_DIR, "logs", `${name}-${dateKey}.log`)
  const body = fs.readFileSync(file, "utf8")
  const record = JSON.parse(body.trim()) as {
    level: number
    name: string
    traceId: string
    msg: string
  }
  expect(record.level).toBe(40)
  expect(record.name).toBe(`${name}-${dateKey}`)
  expect(record.traceId).toBe("trace-logger-test")
  expect(record.msg).toContain("[warn]")
  expect(record.msg).toContain("[trace-logger-test]")
  expect(record.msg).toContain("request failed")
})

test("handler logger redacts direct object payloads and secret-shaped labels", () => {
  const name = `handler-redaction-${Date.now()}`
  const tokenBody = "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"
  const token = `ghu_${tokenBody}`
  const logger = createHandlerLogger(name)
  logger.warn(`request failed for ${token}`, {
    text: "private prompt",
    model: "test-model",
  })

  const dateKey = new Date().toLocaleDateString("sv-SE")
  const file = path.join(PATHS.APP_DIR, "logs", `${name}-${dateKey}.log`)
  const body = fs.readFileSync(file, "utf8")
  const record = JSON.parse(body.trim()) as { msg: string }
  expect(record.msg).toContain("test-model")
  expect(record.msg).toContain("[redacted 14 chars]")
  expect(body).toContain("[redacted github token]")
  expect(body).not.toContain("private prompt")
  expect(body).not.toContain(token)
})
