import { createLogger, resolveLogDirectory } from "@stuffbucket/maximal-logging"
import consola, { type ConsolaInstance } from "consola"
import fs from "node:fs"
import path from "node:path"
import util from "node:util"

import { getLogRetentionDays } from "~/lib/config/config"
import { requestContext } from "~/lib/http/request-context"
import { redactForLog, scrubSecrets } from "~/lib/platform/log-redact"
import { PATHS } from "~/lib/platform/paths"
import { registerProcessCleanup } from "~/lib/platform/process-cleanup"
import { state } from "~/lib/runtime-state/state"

const ONE_DAY_MS = 24 * 60 * 60 * 1000
const CLEANUP_INTERVAL_MS = ONE_DAY_MS
// Keep Core's per-home log location while the shared package owns persistence.
const LOG_DIR = resolveLogDirectory({
  directory: path.resolve(PATHS.APP_DIR, "logs"),
})

const loggers = new Map<string, ReturnType<typeof createLogger>>()

let runtimeInitialized = false
let cleanupInterval: ReturnType<typeof setInterval> | undefined

const cleanupOldLogs = () => {
  if (!fs.existsSync(LOG_DIR)) {
    return
  }

  const retentionMs = getLogRetentionDays() * ONE_DAY_MS
  const now = Date.now()

  for (const entry of fs.readdirSync(LOG_DIR)) {
    const filePath = path.join(LOG_DIR, entry)

    let stats: fs.Stats
    try {
      stats = fs.statSync(filePath)
    } catch {
      continue
    }

    if (!stats.isFile()) {
      continue
    }

    // retentionMs === 0 → delete every file unconditionally
    // (ephemeral / container deployments).
    if (retentionMs === 0 || now - stats.mtimeMs > retentionMs) {
      try {
        fs.rmSync(filePath)
      } catch {
        continue
      }
    }
  }
}

const formatArgs = (args: Array<unknown>) =>
  args
    .map((arg) =>
      typeof arg === "string" ? arg : (
        util.inspect(arg, { depth: null, colors: false })
      ),
    )
    .join(" ")

const sanitizeName = (name: string) => {
  const normalized = name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")

  return normalized === "" ? "handler" : normalized
}

const maybeUnref = (timer: ReturnType<typeof setInterval>) => {
  timer.unref()
}

const cleanup = () => {
  if (cleanupInterval) {
    clearInterval(cleanupInterval)
    cleanupInterval = undefined
  }
  for (const logger of loggers.values()) {
    logger.close()
  }
  loggers.clear()
}

const initializeLoggerRuntime = () => {
  if (runtimeInitialized) {
    return
  }

  fs.mkdirSync(LOG_DIR, { recursive: true })
  cleanupOldLogs()

  cleanupInterval = setInterval(cleanupOldLogs, CLEANUP_INTERVAL_MS)
  maybeUnref(cleanupInterval)

  registerProcessCleanup(cleanup)
  runtimeInitialized = true
}

const writeLine = (
  name: string,
  event: {
    date: Date
    type: string
    tag: string
    args: Array<unknown>
  },
) => {
  initializeLoggerRuntime()

  const { date, type, tag, args } = event
  const dateKey = date.toLocaleDateString("sv-SE")
  const component = `${sanitizeName(name)}-${dateKey}`
  let logger = loggers.get(component)
  if (!logger) {
    logger = createLogger(component, { directory: LOG_DIR, level: "debug" })
    loggers.set(component, logger)
  }
  const traceId = requestContext.getStore()?.traceId
  const timestamp = date.toLocaleString("sv-SE", { hour12: false })
  const message = formatArgs(args)
  const line = `[${timestamp}] [${type}] [${tag}]${traceId ? ` [${traceId}]` : ""}${
    message ? ` ${message}` : ""
  }`
  const fields = traceId ? { traceId } : {}
  switch (type) {
    case "error": {
      logger.error(fields, line)
      break
    }
    case "warn": {
      logger.warn(fields, line)
      break
    }
    case "debug":
    case "trace": {
      logger.debug(fields, line)
      break
    }
    default: {
      logger.info(fields, line)
    }
  }
}

type DebugLogger = Pick<ConsolaInstance, "debug">

/**
 * Redact every non-string argument before it reaches the log reporter.
 * String args are treated as caller-supplied labels (e.g. "Request
 * payload:") and kept; objects/arrays are payloads and run through the
 * fail-closed redactor so message content never lands on disk. This is
 * the single chokepoint — all handler payload logging flows through
 * `debugLazy`, so redaction here covers every current and future call
 * site without per-handler discipline.
 */
const redactArgs = (
  args: [unknown, ...Array<unknown>],
): [unknown, ...Array<unknown>] => {
  return args.map((arg) =>
    typeof arg === "string" ? arg : redactForLog(arg),
  ) as [unknown, ...Array<unknown>]
}

export const debugLazy = (
  logger: DebugLogger,
  factory: () => [unknown, ...Array<unknown>],
): void => {
  if (!state.verbose) {
    return
  }

  logger.debug(...redactArgs(factory()))
}

export const debugJson = (
  logger: DebugLogger,
  label: string,
  value: unknown,
): void => {
  debugLazy(logger, () => [label, JSON.stringify(redactForLog(value))])
}

export const debugJsonTail = (
  logger: DebugLogger,
  label: string,
  { value, tailLength = 400 }: { value: unknown; tailLength?: number },
): void => {
  debugLazy(logger, () => [
    label,
    JSON.stringify(redactForLog(value)).slice(-tailLength),
  ])
}

/** The subset of consola's surface our runtime call sites use. */
export interface TeeLogger {
  info: (...args: Array<unknown>) => void
  warn: (...args: Array<unknown>) => void
  error: (...args: Array<unknown>) => void
  debug: (...args: Array<unknown>) => void
}

/**
 * A logger that writes through the GLOBAL `consola` (so the dev console — and
 * any test that spies on `consola.warn`/`.error` — still sees every line) AND
 * tees a redacted copy to a dated `<name>-YYYY-MM-DD.log` in the Core logs dir. This
 * is the seam that makes runtime events (especially auth: sign-in, degrade,
 * refresh retries, sign-out) OBSERVABLE AFTER THE FACT instead of vanishing
 * into stderr / the shell dev terminal where they can't be inspected later.
 *
 * The file copy redacts non-string args (matching the handler-logger
 * discipline) so a logged error object can't leak a token to disk; string args
 * are caller labels and kept. `debug` only writes (console + file) when verbose.
 */
export const createTeeLogger = (name: string): TeeLogger => {
  // consola's typed signature won't accept a spread of `unknown[]`; alias to a
  // permissive shape so we can forward variadic args straight through.
  const c = consola as unknown as TeeLogger

  const writeFile = (type: string, args: Array<unknown>) => {
    // Object args run through the key-driven redactor; string args (labels,
    // interpolated messages) through the secret-pattern scrubber so a token
    // passed/interpolated as a bare string can't land on disk unmasked.
    const redacted = args.map((arg) =>
      typeof arg === "string" ? scrubSecrets(arg) : redactForLog(arg),
    )
    writeLine(name, { date: new Date(), type, tag: name, args: redacted })
  }

  // Each level forwards to console then tees the same args to the file sink.
  // `c[type]` is looked up at call time (not captured) so tests that swap
  // `consola.warn`/`.error` for a spy after construction still intercept it.
  //
  // String args are scrubbed on the CONSOLE path too, not only in `writeFile`.
  // Redacting one sink and not the other is not a defensible split: this engine
  // runs as a supervised sidecar whose stdout the host captures, so an
  // interpolated `${token}` reaching stdout is a leak by the same argument that
  // makes one on disk a leak. Objects are left alone here (the file sink runs
  // its own key-driven redactor over them) so a dev console keeps showing real
  // error objects. `--show-token` is unaffected: it prints through plain
  // `consola`, deliberately never through this logger.
  const tee =
    (type: "info" | "warn" | "error" | "debug") =>
    (...args: Array<unknown>) => {
      c[type](
        ...args.map((arg) =>
          typeof arg === "string" ? scrubSecrets(arg) : arg,
        ),
      )
      writeFile(type, args)
    }

  return {
    info: tee("info"),
    warn: tee("warn"),
    error: tee("error"),
    debug: (...args) => {
      if (!state.verbose) return
      tee("debug")(...args)
    },
  }
}

export const createHandlerLogger = (name: string): ConsolaInstance => {
  const instance = consola.withTag(name)

  if (state.verbose) {
    instance.level = 5
  }
  instance.setReporters([])

  instance.addReporter({
    log(logObj) {
      writeLine(name, {
        date: logObj.date,
        type: logObj.type,
        tag: logObj.tag || name,
        args: (logObj.args as Array<unknown>).map((arg) =>
          typeof arg === "string" ? scrubSecrets(arg) : redactForLog(arg),
        ),
      })
    },
  })

  return instance
}
