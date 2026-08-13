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
 * The wait the original fixed sleep allowed. Kept as a WARNING threshold, not a
 * failure: an intermittent `maximal-core#test` failure was never reproduced, and
 * this sleep was a suspect. Deleting it would have destroyed the evidence — if a
 * flush really does run long, the run now says so in the log instead of either
 * going red for an invisible reason or passing in silence.
 */
const FLUSH_WARN_AFTER_MS = 1300
/** Binary backoff. Doubles from here to the cap. */
const FLUSH_BACKOFF_START_MS = 256
const FLUSH_BACKOFF_CAP_MS = 4096
/** Hard stop. Only a writer that never flushes reaches this. */
const FLUSH_GIVE_UP_MS = 20_000
/** Per-test budget, above the give-up so our message wins over Bun's timeout. */
const FLUSH_TEST_TIMEOUT_MS = 30_000

/**
 * Wait for the tee writer to flush, then return the file body.
 *
 * The writer buffers and flushes on a 1s interval, so the file appears
 * asynchronously. Polling for the markers the assertions need — rather than
 * sleeping a fixed span and hoping — is what makes this robust; the markers
 * matter most for the NEGATIVE assertions, since `not.toContain` passes
 * trivially on a file that does not exist yet.
 *
 * The warning compares the LAST UNSUCCESSFUL check against the threshold, not
 * the elapsed total. With binary backoff the checks land at roughly 0, 256,
 * 768, 1792, 3840ms, so a normal ~1000ms flush is first seen at ~1792ms and
 * reporting raw elapsed would warn on every healthy run. Asking instead
 * "was the file still missing at a check taken after 1300ms?" only fires when
 * the flush genuinely outran what the fixed sleep permitted.
 */
async function readWhenFlushed(
  file: string,
  ...markers: Array<string>
): Promise<string> {
  const started = Date.now()
  let wait = FLUSH_BACKOFF_START_MS
  let lastMissAt = 0

  for (;;) {
    if (fs.existsSync(file)) {
      const body = fs.readFileSync(file, "utf8")
      if (markers.every((marker) => body.includes(marker))) {
        if (lastMissAt > FLUSH_WARN_AFTER_MS) {
          console.warn(
            `[tee-logger] SLOW FLUSH: ${path.basename(file)} was still`
              + ` incomplete ${lastMissAt}ms in, seen at ${Date.now() - started}ms.`
              + ` The fixed ${FLUSH_WARN_AFTER_MS}ms sleep this replaced would`
              + " have failed here.",
          )
        }
        return body
      }
    }

    lastMissAt = Date.now() - started
    if (lastMissAt > FLUSH_GIVE_UP_MS) {
      throw new Error(
        `tee log ${file} did not flush ${JSON.stringify(markers)} in`
          + ` ${lastMissAt}ms`,
      )
    }
    await new Promise((r) => setTimeout(r, wait))
    wait = Math.min(wait * 2, FLUSH_BACKOFF_CAP_MS)
  }
}

describe("createTeeLogger — redacted file write", () => {
  test(
    "writes a dated file, keeps string labels, redacts object args",
    async () => {
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
    },
    FLUSH_TEST_TIMEOUT_MS,
  )

  test(
    "scrubs a secret passed as a bare STRING arg (the leak surface)",
    async () => {
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
    },
    FLUSH_TEST_TIMEOUT_MS,
  )
})
