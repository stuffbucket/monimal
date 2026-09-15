/**
 * Crash-detection sentinel for configured client connections.
 *
 * The target owner sidecar is the authoritative recovery evidence. This marker
 * only distinguishes a graceful shutdown from an abrupt process or machine
 * exit so startup can explain why a configured client may have pointed at an
 * unavailable proxy between sessions.
 */

import fs from "node:fs"
import path from "node:path"

import { atomicWriteJson } from "~/lib/platform/atomic-json"
import { PATHS } from "~/lib/platform/paths"
import { state } from "~/lib/runtime-state/state"

const SENTINEL_FILENAME = "session-running"

function sentinelPath(): string {
  return path.join(PATHS.APP_DIR, SENTINEL_FILENAME)
}

export interface SessionMarker {
  pid: number
  instance_id: string
  started_at: string
}

/** Write the sentinel file. Idempotent (overwrites). Best-effort —
 *  a failed write here must not abort boot. */
export function markSessionRunning(): void {
  try {
    atomicWriteJson(
      sentinelPath(),
      {
        pid: process.pid,
        instance_id: state.instanceId,
        started_at: new Date(state.startedAtMs).toISOString(),
      } satisfies SessionMarker,
      { label: "Maximal session marker" },
    )
  } catch {
    /* best-effort */
  }
}

/** Read a marker written by this or an older version. Invalid evidence is null. */
export function readSessionMarker(): SessionMarker | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(sentinelPath(), "utf8"))
    if (
      typeof parsed !== "object"
      || parsed === null
      || !("pid" in parsed)
      || typeof parsed.pid !== "number"
      || !("instance_id" in parsed)
      || typeof parsed.instance_id !== "string"
      || !("started_at" in parsed)
      || typeof parsed.started_at !== "string"
    ) {
      return null
    }
    return {
      pid: parsed.pid,
      instance_id: parsed.instance_id,
      started_at: parsed.started_at,
    }
  } catch {
    return null
  }
}

/** Delete the sentinel file. Idempotent (no-op when absent). */
export function clearSessionRunning(): void {
  try {
    fs.rmSync(sentinelPath(), { force: true })
  } catch {
    /* best-effort */
  }
}

/** Returns true if a sentinel exists from a prior session (i.e. the
 *  previous run did NOT call clearSessionRunning before exiting). The
 *  caller then decides what to do — typically log a warning + invite
 *  recovery action. Doesn't delete the sentinel; that's the caller's
 *  job after acting on it. */
export function staleSessionMarkerPresent(): boolean {
  try {
    return fs.existsSync(sentinelPath())
  } catch {
    return false
  }
}
