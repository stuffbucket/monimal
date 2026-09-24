import { lstatSync, mkdirSync, readdirSync } from "node:fs"
import { homedir, platform as hostPlatform } from "node:os"
import path, { posix, win32 } from "node:path"
import pino, { type Logger } from "pino"

const secretFields = [
  "password",
  "token",
  "secret",
  "authorization",
  "apiKey",
  "api_key",
  "accessToken",
  "refreshToken",
  "clientSecret",
  "credentials",
]

export interface LogPathOptions {
  readonly env?: Readonly<Record<string, string | undefined>>
  readonly homeDirectory?: string
  readonly platform?: NodeJS.Platform
  readonly directory?: string
}

/** State belongs under XDG_STATE_HOME on Unix, Library/Logs on macOS and LocalAppData on Windows. */
export function resolveLogDirectory(options: LogPathOptions = {}): string {
  const platform = options.platform ?? hostPlatform()
  const paths = platform === "win32" ? win32 : posix
  if (options.directory !== undefined) {
    if (!paths.isAbsolute(options.directory))
      throw new TypeError("Log directory must be absolute")
    return paths.normalize(options.directory)
  }
  const env = options.env ?? {
    LOCALAPPDATA: process.env.LOCALAPPDATA,
    XDG_STATE_HOME: process.env.XDG_STATE_HOME,
  }
  const home = options.homeDirectory ?? homedir()
  if (!paths.isAbsolute(home))
    throw new TypeError("Home directory must be absolute")
  if (platform === "win32") {
    const local = env.LOCALAPPDATA
    return paths.join(
      local && paths.isAbsolute(local) ?
        local
      : paths.join(home, "AppData", "Local"),
      "stuffbucket",
      "logs",
    )
  }
  if (platform === "darwin")
    return paths.join(home, "Library", "Logs", "stuffbucket")
  const state = env.XDG_STATE_HOME
  return paths.join(
    state && paths.isAbsolute(state) ?
      state
    : paths.join(home, ".local", "state"),
    "stuffbucket",
    "logs",
  )
}

export interface LogFile {
  readonly name: string
  readonly size: number
  readonly modifiedAt: number
}

/** Enumerate log files, not their contents; renderer callers never receive arbitrary log text. */
export function listLogFiles(options: LogPathOptions = {}): Array<LogFile> {
  const directory = resolveLogDirectory(options)
  let names: Array<string>
  try {
    names = readdirSync(directory)
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT")
      return []
    throw cause
  }
  return names
    .filter((name) => /^[a-z0-9][a-z0-9-]*\.log$/.test(name))
    .flatMap((name) => {
      const stats = lstatSync(path.join(directory, name))
      return stats.isFile() ?
          [{ name, size: stats.size, modifiedAt: stats.mtimeMs }]
        : []
    })
    .sort((a, b) => b.modifiedAt - a.modifiedAt || a.name.localeCompare(b.name))
}

export interface LoggerOptions extends LogPathOptions {
  readonly level?: "debug" | "info" | "warn" | "error"
}

export type PersistentLogger = Logger & { close(): void }

/** Synchronous writes preserve crash-adjacent events without a timer or async flush. */
export function createLogger(
  component: string,
  options: LoggerOptions = {},
): PersistentLogger {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(component)) {
    throw new TypeError("Logger component must be a lowercase kebab-case name")
  }
  const directory = resolveLogDirectory(options)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const destination = pino.destination({
    dest: path.join(directory, `${component}.log`),
    sync: true,
    mode: 0o600,
  })
  const logger = pino(
    {
      name: component,
      level: options.level ?? "info",
      redact: {
        paths: secretFields.flatMap((field) => [
          field,
          `*.${field}`,
          `*.*.${field}`,
        ]),
        censor: "[REDACTED]",
      },
    },
    destination,
  )
  return Object.assign(logger, { close: () => destination.end() })
}
