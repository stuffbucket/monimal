import fs from "node:fs"
import path from "node:path"
import properLockfile from "proper-lockfile"

const baseLockOptions = Object.freeze({
  realpath: false,
  stale: 10_000,
  update: 2_000,
})
const asyncLockOptions = Object.freeze({
  ...baseLockOptions,
  retries: Object.freeze({
    retries: 5,
    factor: 1,
    minTimeout: 25,
    maxTimeout: 100,
    randomize: true,
  }),
})
const syncRetryDelayMs = 25
const syncRetryCount = 20
const syncWaitArray = new Int32Array(new SharedArrayBuffer(4))

export class HostConfigLockError extends Error {
  readonly target: string

  constructor(target: string, cause: unknown) {
    super(`Timed out waiting for the Maximal configuration lock: ${target}`, {
      cause,
    })
    this.name = "HostConfigLockError"
    this.target = target
  }
}

function ensureLockTarget(target: string): void {
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 })
  const descriptor = fs.openSync(
    target,
    fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_APPEND,
    0o600,
  )
  fs.closeSync(descriptor)
  try {
    fs.chmodSync(target, 0o600)
  } catch {
    // Windows and some shared filesystems do not implement POSIX mode bits.
  }
}

function acquireSync(target: string): () => void {
  let lastError: unknown
  for (let attempt = 0; attempt <= syncRetryCount; attempt += 1) {
    try {
      return properLockfile.lockSync(target, baseLockOptions)
    } catch (error: unknown) {
      lastError = error
      if (
        !(error instanceof Error)
        || !("code" in error)
        || error.code !== "ELOCKED"
        || attempt === syncRetryCount
      ) {
        break
      }
      Atomics.wait(syncWaitArray, 0, 0, syncRetryDelayMs)
    }
  }
  throw new HostConfigLockError(target, lastError)
}

export function withHostConfigLockSync<T>(target: string, action: () => T): T {
  ensureLockTarget(target)
  const release = acquireSync(target)
  try {
    return action()
  } finally {
    release()
  }
}

export async function withHostConfigLock<T>(
  target: string,
  action: () => Promise<T> | T,
): Promise<T> {
  ensureLockTarget(target)
  let release: (() => Promise<void>) | undefined
  try {
    release = await properLockfile.lock(target, asyncLockOptions)
  } catch (error: unknown) {
    throw new HostConfigLockError(target, error)
  }
  try {
    return await action()
  } finally {
    await release()
  }
}
