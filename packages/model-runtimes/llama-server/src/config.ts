import z from "@deepseek-ai/schemastery"

export interface Config {
  executablePath: string
  assignments: Record<string, string>
  serverArguments?: Array<string>
  maxRestarts?: number
  startupTimeoutMs?: number
  shutdownTimeoutMs?: number
}

export interface ResolvedConfig {
  readonly executablePath: string
  readonly assignments: ReadonlyMap<string, string>
  readonly serverArguments: ReadonlyArray<string>
  readonly maxRestarts: number
  readonly startupTimeoutMs: number
  readonly shutdownTimeoutMs: number
}

const DEFAULT_MAX_RESTARTS = 2
const DEFAULT_STARTUP_TIMEOUT_MS = 30_000
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 5_000
const FORBIDDEN_SERVER_ARGUMENTS = new Set([
  "--api-key",
  "--api-key-file",
  "--host",
  "--model",
  "--port",
  "-m",
])

const assignment = z.string().required()

export const Config: z<Config> = z.object({
  executablePath: z.string().required(),
  assignments: z.dict(assignment).required(),
  serverArguments: z.array(z.string()),
  maxRestarts: z.number().step(1).min(0).max(100),
  startupTimeoutMs: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER),
  shutdownTimeoutMs: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER),
})

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function configError(message: string): Error {
  return new Error(`llama-server: ${message}`)
}

function nonEmptyString(value: unknown, field: string): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value !== value.trim()
  ) {
    throw configError(
      `${field} must be a non-empty string without surrounding whitespace`,
    )
  }
  if (value.includes("\0")) throw configError(`${field} must not contain NUL`)
  return value
}

function nonNegativeInteger(
  value: unknown,
  field: string,
  fallback: number,
): number {
  if (value === undefined) return fallback
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw configError(`${field} must be a non-negative safe integer`)
  }
  return value as number
}

function positiveInteger(
  value: unknown,
  field: string,
  fallback: number,
): number {
  const resolved = nonNegativeInteger(value, field, fallback)
  if (resolved === 0) throw configError(`${field} must be positive`)
  return resolved
}

function resolveArguments(value: unknown): ReadonlyArray<string> {
  if (value === undefined) return Object.freeze([])
  if (!Array.isArray(value)) {
    throw configError("serverArguments must be an array")
  }
  const result = value.map((argument, index) =>
    nonEmptyString(argument, `serverArguments[${index}]`),
  )
  for (const argument of result) {
    const equals = argument.indexOf("=")
    const flag = equals === -1 ? argument : argument.slice(0, equals)
    const forbidden =
      FORBIDDEN_SERVER_ARGUMENTS.has(flag)
      || (flag.startsWith("-m") && !flag.startsWith("--"))
    if (forbidden) {
      throw configError(
        `serverArguments must not override ${flag}; model, network binding, and authentication are runner-owned`,
      )
    }
  }
  return Object.freeze(result)
}

function resolveAssignments(value: unknown): ReadonlyMap<string, string> {
  if (!isRecord(value)) throw configError("assignments must be a record")
  const entries = Object.entries(value)
  if (entries.length === 0) {
    throw configError("at least one model assignment is required")
  }
  const assignments = new Map<string, string>()
  for (const [providerValue, modelKeyValue] of entries) {
    const provider = nonEmptyString(providerValue, "assignment provider")
    const modelKey = nonEmptyString(modelKeyValue, `assignments.${provider}`)
    assignments.set(provider, modelKey)
  }
  return assignments
}

export function resolveConfig(value: unknown): ResolvedConfig {
  if (!isRecord(value)) throw configError("config must be an object")
  return Object.freeze({
    executablePath: nonEmptyString(value.executablePath, "executablePath"),
    assignments: resolveAssignments(value.assignments),
    serverArguments: resolveArguments(value.serverArguments),
    maxRestarts: nonNegativeInteger(
      value.maxRestarts,
      "maxRestarts",
      DEFAULT_MAX_RESTARTS,
    ),
    startupTimeoutMs: positiveInteger(
      value.startupTimeoutMs,
      "startupTimeoutMs",
      DEFAULT_STARTUP_TIMEOUT_MS,
    ),
    shutdownTimeoutMs: positiveInteger(
      value.shutdownTimeoutMs,
      "shutdownTimeoutMs",
      DEFAULT_SHUTDOWN_TIMEOUT_MS,
    ),
  })
}
