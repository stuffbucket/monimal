/**
 * createTeeLogger is what makes auth events observable after the fact: it
 * writes through the GLOBAL consola (dev console + any consola spy) AND tees a
 * redacted copy to a dated `<name>-YYYY-MM-DD.log`. These tests pin both halves
 * — console delegation (so existing consola-spy tests keep working) and the
 * redacted file write (so a logged token can't leak to disk).
 */

import { afterEach, describe, expect, test } from "bun:test"
import consolaDefault from "consola"
import fs from "node:fs"
import path from "node:path"

import { createTeeLogger } from "~/lib/platform/logger"
import { PATHS } from "~/lib/platform/paths"
import { state } from "~/lib/runtime-state/state"

const consola = consolaDefault

function logFileFor(name: string): string {
  const dateKey = new Date().toLocaleDateString("sv-SE")
  return path.join(PATHS.APP_DIR, "logs", `${name}-${dateKey}.log`)
}

afterEach(() => {
  state.verbose = false
})

describe("createTeeLogger — console delegation", () => {
  test("warn/error/info forward to the global consola (so spies still fire)", () => {
    const calls: Array<Array<unknown>> = []
    const original = consola.warn.bind(consola)
    consola.warn = ((...args: Array<unknown>) => {
      calls.push(args)
    }) as typeof consola.warn
    try {
      const log = createTeeLogger("tee-console")
      log.warn("hello", "world")
      expect(calls).toHaveLength(1)
      expect(calls[0]).toEqual(["hello", "world"])
    } finally {
      consola.warn = original
    }
  })

  test("scrubs a token interpolated into a console string arg", () => {
    // Regression guard for the half-redacted sink: `writeFile` scrubbed, the
    // console path did not, so an interpolated bearer reached stdout — which a
    // supervising host captures. Objects stay untouched here on purpose; the
    // file sink runs its own key-driven redactor over them.
    // Split so `scripts/secret-scan.sh` does not match a literal bearer here.
    const body = "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"
    const token = `ghu_${body}`
    const calls: Array<Array<unknown>> = []
    const original = consola.error.bind(consola)
    consola.error = ((...args: Array<unknown>) => {
      calls.push(args)
    }) as typeof consola.error
    try {
      const log = createTeeLogger("tee-console-scrub")
      log.error(`refresh failed for ${token}`)
    } finally {
      consola.error = original
    }

    expect(calls).toHaveLength(1)
    const printed = String(calls[0]?.[0])
    expect(printed).not.toContain(token)
    expect(printed).toContain("refresh failed for")
  })

  test("debug is suppressed unless verbose", () => {
    const calls: Array<Array<unknown>> = []
    const original = consola.debug.bind(consola)
    consola.debug = ((...args: Array<unknown>) => {
      calls.push(args)
    }) as typeof consola.debug
    try {
      const log = createTeeLogger("tee-debug")
      state.verbose = false
      log.debug("nope")
      expect(calls).toHaveLength(0)
      state.verbose = true
      log.debug("yep")
      expect(calls).toHaveLength(1)
    } finally {
      consola.debug = original
    }
  })
})

describe("createTeeLogger — redacted file write", () => {
  // A fresh logger name per run. `logStreams` in platform/logger.ts caches the
  // WriteStream by path for the life of the process, so a test that unlinks its
  // own log file strands that stream on the deleted inode and every later run
  // in the same process writes to a file that no longer has a name. That made
  // these tests pass once and then fail forever after — invisible under a
  // single `bun test`, fatal under `--rerun-each` and under Stryker, which
  // re-runs the suite per mutant.
  let runId = 0
  const uniqueName = (base: string) => `${base}-${Date.now()}-${++runId}`

  /**
   * Wait for the tee writer to flush, then return the file body.
   *
   * The writer buffers and flushes on a 1s interval, so the file appears
   * asynchronously. Sleeping a fixed 1300ms for that leaves 300ms of margin,
   * which a loaded machine can eat — the assertions then run against a file
   * that does not exist yet. Polling for the markers the assertions need is
   * robust and returns on the flush rather than after a fixed wait.
   *
   * The markers matter most for the NEGATIVE assertions: `not.toContain`
   * passes trivially on an empty or half-written file, so a timing slip would
   * quietly turn the leak guard into a test that cannot fail.
   *
   * The deadline sits under Bun's 5s per-test timeout so a real failure
   * surfaces as this message rather than an opaque timeout.
   */
  async function readWhenFlushed(
    file: string,
    ...markers: Array<string>
  ): Promise<string> {
    const deadline = Date.now() + 4000
    for (;;) {
      if (fs.existsSync(file)) {
        const body = fs.readFileSync(file, "utf8")
        if (markers.every((marker) => body.includes(marker))) return body
      }
      if (Date.now() > deadline) {
        throw new Error(
          `tee log ${file} did not flush ${JSON.stringify(markers)} within 4s`,
        )
      }
      await new Promise((r) => setTimeout(r, 25))
    }
  }

  test("writes a dated file, keeps string labels, redacts object args", async () => {
    const name = uniqueName("tee-file-test")
    const file = logFileFor(name)

    const log = createTeeLogger(name)
    log.warn("degraded for", "alice@github.com", {
      token: "ghu_supersecret_value_1234567890",
    })

    const body = await readWhenFlushed(file, `[${name}]`, "degraded for")

    expect(fs.existsSync(file)).toBe(true)
    // String labels survive; the line is tagged.
    expect(body).toContain("degraded for")
    expect(body).toContain("alice@github.com")
    expect(body).toContain("[warn]")
    expect(body).toContain(`[${name}]`)
    // The token inside the object arg is NEVER written raw.
    expect(body).not.toContain("ghu_supersecret_value_1234567890")
  })

  test("scrubs a secret passed as a bare STRING arg (the leak surface)", async () => {
    // Regression guard: createTeeLogger used to write string args verbatim, so
    // a token logged/interpolated as a string leaked to disk. It must be masked.
    const name = uniqueName("tee-string-secret")
    const file = logFileFor(name)

    const log = createTeeLogger(name)
    log.warn("GitHub token:", "ghu_AbCdEf0123456789AbCdEf0123456789")
    log.warn(
      "bearer tid=abc123def456ghi789;exp=1700000000;sku=z:deadbeefsignature",
    )

    // Both lines must be on disk before the negatives mean anything.
    const body = await readWhenFlushed(
      file,
      "[redacted github token]",
      "[redacted copilot token]",
    )

    expect(body).not.toContain("ghu_AbCdEf0123456789AbCdEf0123456789")
    expect(body).not.toContain("tid=abc123def456ghi789")
    expect(body).toContain("[redacted github token]")
    expect(body).toContain("[redacted copilot token]")
  })
})
