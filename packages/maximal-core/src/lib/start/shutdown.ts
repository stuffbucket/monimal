/**
 * Shutdown plumbing: SIGTERM / SIGINT handlers + an `exit`-event
 * safety net + optional parent-death watchdog. The desktop shell spawns
 * the sidecar with MAXIMAL_SIDECAR_PARENT_PID so the sidecar self-terminates
 * if the shell crashes without sending SIGTERM. Async configurator disposal
 * runs during the normal drain; abrupt exits leave liveness-checked claims for
 * the next Maximal process to recover.
 */

import type { serve } from "srvx"

import consola from "consola"

import { removePidfile } from "~/lib/platform/replace-running"

import { clearSessionRunning } from "./session-sentinel"

// Idempotency guard so SIGTERM racing with the parent-death watchdog
// (or being delivered twice) doesn't double-stop the server.
let shuttingDown = false

/** Test-only: reset the process-lifetime shutdown latch. @internal */
export function __resetShutdownStateForTests(): void {
  shuttingDown = false
}

export interface ShutdownHooks {
  /** Restore configured clients while the proxy is still reachable. */
  beforeClose?: () => Promise<void>
  /** Dispose providers after no new requests can enter. */
  afterClose?: () => Promise<void>
}

/** Restore configured clients, stop the HTTP servers, then exit 0. Capped at
 *  ~2.5s by an unref'd watchdog so a hung lifecycle step cannot keep the
 *  process alive. */
export async function initiateShutdown(
  servers: Array<ReturnType<typeof serve>>,
  reason: string,
  hooks: ShutdownHooks = {},
): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true

  consola.info(`shutdown: ${reason}, draining`)

  // Fail-safe: if close() hangs, hard-exit after 2.5s. .unref() so the
  // timer itself never holds the loop open in the happy path.
  const watchdog = setTimeout(() => {
    consola.warn("shutdown: watchdog tripped, forcing exit")
    process.exit(1)
  }, 2500)
  watchdog.unref()

  try {
    await hooks.beforeClose?.()
  } catch (error) {
    consola.warn("shutdown: pre-close disposal threw", error)
  }

  // Close every listener. Since maximal-core#10 there are two (public /v1 and
  // the private control plane); one left open would keep the port held and make
  // the next start fall back to a different one for no reason.
  for (const server of servers) {
    try {
      // srvx Server exposes close(); pass true to drop in-flight conns.
      await server.close(true)
    } catch (error) {
      consola.warn("shutdown: server.close() threw", error)
    }
  }

  try {
    await hooks.afterClose?.()
  } catch (error) {
    consola.warn("shutdown: post-close disposal threw", error)
  }

  // Pidfile is a hint, not a lock — best-effort cleanup.
  await removePidfile()

  // Drop the "session running" sentinel so the NEXT boot doesn't
  // misread a clean shutdown as a crash.
  clearSessionRunning()

  clearTimeout(watchdog)
  process.exit(0)
}

/** Wire SIGTERM + an `exit`-event safety net + optional parent-death
 *  watchdog. The watchdog only runs when MAXIMAL_SIDECAR_PARENT_PID
 *  is set (desktop shell spawn); bare CLI users own their own lifecycle.
 *
 *  The synchronous `exit` listener can clear only the diagnostic session
 *  marker. It deliberately leaves target claims intact: the next Maximal
 *  process verifies the recorded runtime identity and performs conditional
 *  stale-owner recovery. */
export function installShutdownHandlers(
  servers: Array<ReturnType<typeof serve>>,
  hooks: ShutdownHooks = {},
): void {
  process.on("SIGTERM", () => {
    void initiateShutdown(servers, "received SIGTERM", hooks)
  })
  process.on("SIGINT", () => {
    void initiateShutdown(servers, "received SIGINT", hooks)
  })

  // Exit handlers cannot await configurator disposal. Leave any target claim
  // intact so the next Maximal can verify liveness and recover it safely.
  process.on("exit", () => {
    try {
      clearSessionRunning()
    } catch {
      // Exit handlers cannot throw — and we're exiting anyway.
    }
  })

  const parentPidStr = process.env.MAXIMAL_SIDECAR_PARENT_PID
  const parentPid = parentPidStr ? Number(parentPidStr) : null

  if (parentPid && Number.isInteger(parentPid) && parentPid > 0) {
    consola.info(`shutdown: watching parent pid ${parentPid}`)
    const interval = setInterval(() => {
      try {
        // kill(pid, 0) is the POSIX "is this process alive" probe —
        // sends no signal, throws ESRCH if the parent is gone.
        process.kill(parentPid, 0)
      } catch {
        clearInterval(interval)
        consola.warn(`shutdown: parent ${parentPid} gone`)
        void initiateShutdown(servers, `parent ${parentPid} exited`, hooks)
      }
    }, 3000)
    interval.unref()
  }
}
