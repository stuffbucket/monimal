import { createHash, randomUUID } from "node:crypto"
import { createReadStream } from "node:fs"
import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises"
import { dirname, isAbsolute, relative, resolve } from "node:path"

const SHA256 = /^[a-f\d]{64}$/u
const TARGET = /^[a-z\d][a-z\d._-]*$/u
const VERSION = /^\S+$/u

type UnknownRecord = Record<string, unknown>

export type RuntimeTarget = string

export interface RuntimeLockEntry {
  readonly version: string
  readonly url: string
  readonly artifactSha256: string
  readonly executableSha256: string
  readonly format: "executable" | "archive"
  readonly executablePath?: string
}

export interface RuntimeLock {
  readonly schemaVersion: 1
  readonly releases: Readonly<Record<string, RuntimeLockEntry>>
}

export interface AcquireRuntimeOptions {
  readonly destinationPath: string
  readonly entry: RuntimeLockEntry
  readonly fetch?: typeof fetch
  readonly signal?: AbortSignal
}

export interface PackageRuntimeOptions {
  readonly acquiredPath: string
  readonly destinationPath: string
  readonly entry: RuntimeLockEntry
  readonly extract?: (
    archivePath: string,
    executablePath: string,
    destinationPath: string,
  ) => Promise<void>
}

function lockError(message: string): Error {
  return new Error(`llama-server runtime lock: ${message}`)
}

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function string(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw lockError(`${field} must be a non-empty string`)
  }
  return value
}

function digest(value: unknown, field: string): string {
  const resolved = string(value, field).toLowerCase()
  if (!SHA256.test(resolved))
    throw lockError(`${field} must be a SHA-256 digest`)
  return resolved
}

function releaseUrl(value: unknown, field: string): string {
  const raw = string(value, field)
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw lockError(`${field} must be an HTTPS URL`)
  }
  if (
    url.protocol !== "https:"
    || url.username.length > 0
    || url.password.length > 0
  ) {
    throw lockError(`${field} must be an HTTPS URL without credentials`)
  }
  return url.href
}

function archiveMember(value: unknown, field: string): string {
  const member = string(value, field)
  const normalized = member.replaceAll("\\", "/")
  if (isAbsolute(member) || normalized.split("/").includes("..")) {
    throw lockError(`${field} must stay inside the archive`)
  }
  return member
}

function entry(value: unknown, field: string): RuntimeLockEntry {
  if (!isRecord(value)) throw lockError(`${field} must be an object`)
  const format = value.format
  if (format !== "executable" && format !== "archive") {
    throw lockError(`${field}.format must be executable or archive`)
  }
  if (format === "archive" && value.executablePath === undefined) {
    throw lockError(`${field}.executablePath is required for archives`)
  }
  if (format === "executable" && value.executablePath !== undefined) {
    throw lockError(`${field}.executablePath is only valid for archives`)
  }
  const version = string(value.version, `${field}.version`)
  if (!VERSION.test(version))
    throw lockError(`${field}.version must not contain whitespace`)
  return Object.freeze({
    version,
    url: releaseUrl(value.url, `${field}.url`),
    artifactSha256: digest(value.artifactSha256, `${field}.artifactSha256`),
    executableSha256: digest(
      value.executableSha256,
      `${field}.executableSha256`,
    ),
    format,
    ...(format === "archive" ?
      {
        executablePath: archiveMember(
          value.executablePath,
          `${field}.executablePath`,
        ),
      }
    : {}),
  })
}

export function validateRuntimeLock(value: unknown): RuntimeLock {
  if (!isRecord(value)) throw lockError("document must be an object")
  if (value.schemaVersion !== 1) throw lockError("schemaVersion must equal 1")
  if (!isRecord(value.releases)) throw lockError("releases must be an object")
  const releases: Record<string, RuntimeLockEntry> = {}
  for (const [target, valueEntry] of Object.entries(value.releases)) {
    if (!TARGET.test(target)) throw lockError(`invalid target "${target}"`)
    releases[target] = entry(valueEntry, `releases.${target}`)
  }
  return Object.freeze({ schemaVersion: 1, releases: Object.freeze(releases) })
}

export async function readRuntimeLock(path: string): Promise<RuntimeLock> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(path, "utf8")) as unknown
  } catch (error) {
    throw lockError(
      `could not read ${path}: ${error instanceof Error ? error.message : "unknown error"}`,
    )
  }
  return validateRuntimeLock(parsed)
}

export function runtimeTarget(
  platform: NodeJS.Platform = process.platform,
  architecture: NodeJS.Architecture = process.arch,
): RuntimeTarget {
  return `${platform}-${architecture}`
}

export function requireRuntimeEntry(
  lock: RuntimeLock,
  target: RuntimeTarget = runtimeTarget(),
): RuntimeLockEntry {
  const result = lock.releases[target]
  if (result === undefined) {
    throw lockError(
      `no authoritative llama.cpp release is populated for ${target}; supply an explicit locked entry before acquisition`,
    )
  }
  return result
}

async function sha256(path: string): Promise<string> {
  const hash = createHash("sha256")
  for await (const chunk of createReadStream(path) as AsyncIterable<Buffer>) {
    hash.update(chunk)
  }
  return hash.digest("hex")
}

export async function verifyLockedRuntime(
  path: string,
  expectedSha256: string,
): Promise<void> {
  const expected = digest(expectedSha256, "expectedSha256")
  const metadata = await stat(path)
  if (!metadata.isFile())
    throw lockError("runtime artifact must be a regular file")
  const actual = await sha256(path)
  if (actual !== expected) throw lockError("runtime artifact checksum mismatch")
}

/** Acquire a caller-supplied lock entry during build/packaging, never plugin runtime. */
export async function acquireLockedRuntime(
  options: AcquireRuntimeOptions,
): Promise<void> {
  const locked = entry(options.entry, "entry")
  const fetchImplementation = options.fetch ?? fetch
  const destination = resolve(options.destinationPath)
  const temporary = `${destination}.${randomUUID()}.tmp`
  await mkdir(dirname(destination), { recursive: true })
  try {
    const response = await fetchImplementation(locked.url, {
      method: "GET",
      redirect: "error",
      signal: options.signal,
    })
    if (!response.ok || response.body === null) {
      if (response.body !== null) void response.body.cancel()
      throw lockError(`acquisition failed with HTTP ${response.status}`)
    }
    const bytes = new Uint8Array(await response.arrayBuffer())
    await writeFile(temporary, bytes, { flag: "wx" })
    await verifyLockedRuntime(temporary, locked.artifactSha256)
    await rename(temporary, destination)
  } finally {
    await rm(temporary, { force: true })
  }
}

function assertDifferentPaths(source: string, destination: string): void {
  if (relative(resolve(source), resolve(destination)) === "") {
    throw lockError("acquired and packaged paths must differ")
  }
}

/** Verify an acquired artifact, extract/copy it, then verify the packaged executable. */
export async function packageLockedRuntime(
  options: PackageRuntimeOptions,
): Promise<void> {
  const locked = entry(options.entry, "entry")
  assertDifferentPaths(options.acquiredPath, options.destinationPath)
  await verifyLockedRuntime(options.acquiredPath, locked.artifactSha256)
  const destination = resolve(options.destinationPath)
  const temporary = `${destination}.${randomUUID()}.tmp`
  await mkdir(dirname(destination), { recursive: true })
  try {
    if (locked.format === "executable") {
      await copyFile(options.acquiredPath, temporary)
    } else {
      if (options.extract === undefined) {
        throw lockError("archive entries require an explicit extraction helper")
      }
      await options.extract(
        options.acquiredPath,
        locked.executablePath as string,
        temporary,
      )
    }
    await verifyLockedRuntime(temporary, locked.executableSha256)
    if (process.platform !== "win32") await chmod(temporary, 0o755)
    await rename(temporary, destination)
  } finally {
    await rm(temporary, { force: true })
  }
}
