import { createLogger } from "@stuffbucket/maximal-logging"
import consola from "consola"

import { redactForLog, scrubSecrets } from "~/lib/platform/log-redact"
import { type CoreLogger } from "~/lib/platform/log-types"

const terminalLogger = consola as unknown as CoreLogger
let persistentLogger: ReturnType<typeof createLogger> | undefined

const persistent = (): ReturnType<typeof createLogger> => {
  persistentLogger ??= createLogger("core", { level: "debug" })
  return persistentLogger
}

const log =
  (
    terminalLevel: keyof CoreLogger,
    persistentLevel: "info" | "warn" | "error" | "debug",
  ) =>
  (...args: Array<unknown>) => {
    const terminalArgs = args.map((arg) =>
      typeof arg === "string" ? scrubSecrets(arg) : arg,
    )
    const sanitized = args.map((arg) =>
      typeof arg === "string" ? scrubSecrets(arg) : redactForLog(arg),
    )
    terminalLogger[terminalLevel](...terminalArgs)

    const [first, ...rest] = sanitized
    const message = typeof first === "string" ? first : "Core runtime event"
    const fields =
      typeof first === "string" ? { args: rest } : { args: sanitized }
    persistent()[persistentLevel](fields, message)
  }

export const runtimeLogger: CoreLogger = {
  info: log("info", "info"),
  log: log("log", "info"),
  warn: log("warn", "warn"),
  error: log("error", "error"),
  debug: log("debug", "debug"),
  trace: log("trace", "debug"),
}
