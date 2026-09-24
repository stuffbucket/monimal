import {
  createLogger,
  listLogFiles,
  resolveLogDirectory,
} from "@stuffbucket/maximal-logging"
import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

void test("platform paths and XDG precedence", () => {
  assert.equal(
    resolveLogDirectory({
      platform: "linux",
      homeDirectory: "/home/dev",
      env: { XDG_STATE_HOME: "/state" },
    }),
    "/state/stuffbucket/logs",
  )
  assert.equal(
    resolveLogDirectory({
      platform: "linux",
      homeDirectory: "/home/dev",
      env: { XDG_STATE_HOME: "relative" },
    }),
    "/home/dev/.local/state/stuffbucket/logs",
  )
  assert.equal(
    resolveLogDirectory({
      platform: "darwin",
      homeDirectory: "/Users/dev",
      env: {},
    }),
    "/Users/dev/Library/Logs/stuffbucket",
  )
  assert.equal(
    resolveLogDirectory({
      platform: "win32",
      homeDirectory: String.raw`C:\Users\dev`,
      env: { LOCALAPPDATA: String.raw`D:\Local` },
    }),
    String.raw`D:\Local\stuffbucket\logs`,
  )
  assert.equal(
    resolveLogDirectory({
      platform: "win32",
      homeDirectory: String.raw`C:\Users\dev`,
      env: { LOCALAPPDATA: "relative" },
    }),
    String.raw`C:\Users\dev\AppData\Local\stuffbucket\logs`,
  )
  assert.throws(
    () => resolveLogDirectory({ platform: "linux", directory: "relative" }),
    /absolute/,
  )
})

void test("logger persists structured events synchronously, redacts fields and lists files", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "maximal-logging-"))
  let logger: ReturnType<typeof createLogger> | undefined
  try {
    assert.deepEqual(
      listLogFiles({ directory: path.join(directory, "missing") }),
      [],
    )
    assert.deepEqual(listLogFiles({ directory }), [])
    logger = createLogger("sidecar", { directory })
    logger.info(
      {
        phase: "crashed",
        token: "do-not-log",
        nested: { password: "secret", api_key: "also-secret" },
      },
      "sidecar lifecycle",
    )
    const line = readFileSync(path.join(directory, "sidecar.log"), "utf8")
    assert.match(line, /"phase":"crashed"/)
    assert.match(line, /"token":"\[REDACTED\]"/)
    assert.doesNotMatch(line, /do-not-log|also-secret|"password":"secret"/)
    writeFileSync(path.join(directory, "not-a-log.txt"), "ignored")
    assert.equal(listLogFiles({ directory })[0]?.name, "sidecar.log")
    assert.equal(listLogFiles({ directory }).length, 1)
    assert.throws(() => createLogger("../escape", { directory }), /component/)
  } finally {
    logger?.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
