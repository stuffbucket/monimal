/**
 * Atomic JSON replacement shared by Core and client configurators.
 *
 * Each writer uses its own O_EXCL temporary file. Concurrent writers can never
 * unlink, overwrite, or rename one another's in-flight temporary file. The
 * destination's mode is preserved when it is a regular file; new files are
 * owner-only. The file and containing directory are synced around the rename so
 * a successful return means the replacement is durable on supported filesystems.
 */

import { randomUUID } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

export interface AtomicWriteJsonOptions {
  /** Human-readable context for filesystem errors, e.g. Claude Code settings. */
  label?: string
}

function existingFileMode(filePath: string): number {
  try {
    const stat = fs.lstatSync(filePath)
    return stat.isFile() ? stat.mode & 0o777 : 0o600
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return 0o600
    }
    throw error
  }
}

function syncDirectory(directory: string): void {
  let descriptor: number | undefined
  try {
    descriptor = fs.openSync(directory, fs.constants.O_RDONLY)
    fs.fsyncSync(descriptor)
  } catch (error: unknown) {
    if (
      process.platform === "win32"
      && error instanceof Error
      && "code" in error
      && (error.code === "EINVAL" || error.code === "EPERM")
    ) {
      return
    }
    throw error
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor)
  }
}

/**
 * Atomically write `value` as pretty-printed JSON with a trailing newline.
 */
export function atomicWriteJson(
  filePath: string,
  value: unknown,
  opts: AtomicWriteJsonOptions = {},
): void {
  const label = opts.label ?? "file"
  const directory = path.dirname(filePath)
  fs.mkdirSync(directory, { recursive: true })

  const mode = existingFileMode(filePath)
  const temporaryPath = `${filePath}.tmp-${process.pid}-${randomUUID()}`
  const json = `${JSON.stringify(value, null, 2)}\n`
  let descriptor: number | undefined

  try {
    descriptor = fs.openSync(
      temporaryPath,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL,
      mode,
    )
    fs.fchmodSync(descriptor, mode)
    fs.writeFileSync(descriptor, json)
    fs.fsyncSync(descriptor)
    fs.closeSync(descriptor)
    descriptor = undefined
    fs.renameSync(temporaryPath, filePath)
    syncDirectory(directory)
  } catch (error: unknown) {
    if (descriptor !== undefined) fs.closeSync(descriptor)
    try {
      fs.unlinkSync(temporaryPath)
    } catch (cleanupError: unknown) {
      if (
        !(cleanupError instanceof Error)
        || !("code" in cleanupError)
        || cleanupError.code !== "ENOENT"
      ) {
        throw new Error(`failed to clean up ${label} temporary file`, {
          cause: cleanupError,
        })
      }
    }
    throw error
  }
}
