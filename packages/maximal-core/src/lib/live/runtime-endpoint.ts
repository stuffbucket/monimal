import fs from "node:fs"
import path from "node:path"

import type { RuntimeIdentity } from "~/lib/host-config/types"

import {
  probeRuntimeIdentity,
  sameRuntimeIdentity,
} from "~/lib/host-config/runtime-identity"
import { ControlClient } from "~/lib/live/client"
import { atomicWriteJson } from "~/lib/platform/atomic-json"
import { PATHS } from "~/lib/platform/paths"

export const RUNTIME_ENDPOINT_PATH = path.join(PATHS.APP_DIR, "runtime.json")

function isValidPort(value: unknown): value is number {
  return (
    typeof value === "number"
    && Number.isInteger(value)
    && value > 0
    && value <= 65_535
  )
}

function isRuntimeIdentity(value: unknown): value is RuntimeIdentity {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as Partial<RuntimeIdentity>
  return (
    typeof candidate.nonce === "string"
    && candidate.nonce.length > 0
    && typeof candidate.pid === "number"
    && Number.isInteger(candidate.pid)
    && candidate.pid > 0
    && isValidPort(candidate.proxyPort)
    && isValidPort(candidate.controlPort)
    && typeof candidate.startedAt === "string"
    && !Number.isNaN(Date.parse(candidate.startedAt))
  )
}

/** Publish the exact live control endpoint for short-lived local CLI clients. */
export function writeRuntimeEndpoint(
  identity: RuntimeIdentity,
  filePath: string = RUNTIME_ENDPOINT_PATH,
): void {
  if (!isRuntimeIdentity(identity)) {
    throw new Error("Cannot publish an incomplete Maximal runtime identity")
  }
  atomicWriteJson(filePath, identity, {
    label: "Maximal runtime endpoint",
  })
}

/** Invalid or partial crash evidence is treated as absent. */
export function readRuntimeEndpoint(
  filePath: string = RUNTIME_ENDPOINT_PATH,
): RuntimeIdentity | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(filePath, "utf8"))
    return isRuntimeIdentity(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** Remove only this runtime's descriptor, never one written by its successor. */
export function clearRuntimeEndpoint(
  expected: RuntimeIdentity,
  filePath: string = RUNTIME_ENDPOINT_PATH,
): void {
  const current = readRuntimeEndpoint(filePath)
  if (!current || !sameRuntimeIdentity(current, expected)) return
  try {
    fs.rmSync(filePath, { force: true })
  } catch {
    // Best-effort cleanup. A stale descriptor fails the exact identity probe.
  }
}

export interface LiveControlClientDependencies {
  readRuntime(): RuntimeIdentity | null
  probeRuntime(identity: RuntimeIdentity): Promise<boolean>
  createClient(identity: RuntimeIdentity): ControlClient
}

const defaultDependencies: LiveControlClientDependencies = {
  readRuntime: readRuntimeEndpoint,
  probeRuntime: probeRuntimeIdentity,
  createClient: (identity) =>
    new ControlClient({
      baseUrl: `http://127.0.0.1:${identity.controlPort}`,
    }),
}

/**
 * Return a client only after proving that the descriptor still names the exact
 * process answering on its recorded control port. A reused PID or port is not
 * sufficient evidence.
 */
export async function connectToLiveControl(
  overrides: Partial<LiveControlClientDependencies> = {},
): Promise<ControlClient | null> {
  const dependencies = { ...defaultDependencies, ...overrides }
  const identity = dependencies.readRuntime()
  if (!identity || !(await dependencies.probeRuntime(identity))) return null
  return dependencies.createClient(identity)
}
