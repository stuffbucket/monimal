import type { RuntimeIdentity } from "~/lib/host-config/types"

import { state } from "~/lib/runtime-state/state"

type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

interface DiscoveryResponse {
  jsonrpc?: unknown
  result?: {
    identity?: {
      instanceId?: unknown
      pid?: unknown
      startedAt?: unknown
    }
    ports?: {
      control?: unknown
      proxy?: unknown
    }
  }
}

export function currentRuntimeIdentity(): RuntimeIdentity {
  return {
    nonce: state.instanceId,
    pid: process.pid,
    proxyPort: state.proxyPort,
    controlPort: state.controlPort,
    startedAt: new Date(state.startedAtMs).toISOString(),
  }
}

export function sameRuntimeIdentity(
  left: RuntimeIdentity,
  right: RuntimeIdentity,
): boolean {
  return (
    left.nonce === right.nonce
    && left.pid === right.pid
    && left.proxyPort === right.proxyPort
    && left.controlPort === right.controlPort
    && left.startedAt === right.startedAt
  )
}

/**
 * Prove that the exact runtime recorded by a claim still answers on its control
 * port. A PID or listening port alone is never treated as ownership evidence.
 */
export async function probeRuntimeIdentity(
  expected: RuntimeIdentity,
  fetcher: Fetcher = fetch,
): Promise<boolean> {
  if (expected.controlPort <= 0 || expected.controlPort > 65_535) return false
  try {
    const response = await fetcher(
      `http://127.0.0.1:${expected.controlPort}/control/rpc`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "maximal-configurator-owner-probe",
          method: "server/discover",
        }),
        signal: AbortSignal.timeout(750),
      },
    )
    if (!response.ok) return false
    const body = (await response.json()) as DiscoveryResponse
    const identity = body.result?.identity
    const ports = body.result?.ports
    return (
      body.jsonrpc === "2.0"
      && identity?.instanceId === expected.nonce
      && identity.pid === expected.pid
      && identity.startedAt === expected.startedAt
      && ports?.control === expected.controlPort
      && ports.proxy === expected.proxyPort
    )
  } catch {
    return false
  }
}
