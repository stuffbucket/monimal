/**
 * /_internal/* — process-control endpoints meant for the local machine
 * only.
 *
 * Currently this exposes a single endpoint: `POST /_internal/shutdown`.
 * It's the graceful-eviction hook that a *second* `maximal start
 * --replace` invocation calls to ask the running instance to release
 * `:4141` cleanly.
 *
 * Loopback enforcement is non-negotiable here. The auth middleware in
 * `server.ts` already exempts loopback callers from API-key checks (via
 * `loopbackOnlyPaths`), but that only relaxes auth — it doesn't *block*
 * remote callers with a valid key. So this handler does the strict
 * check itself: non-loopback requests get a 404 (indistinguishable from
 * a missing route to a remote scanner).
 */

import type { Context } from "hono"

import consola from "consola"
import { Hono } from "hono"

import { defaultGetRequestIp, isLoopbackAddress } from "~/lib/auth/request-auth"
import { requestContext } from "~/lib/http/request-context"

interface ShutdownTimer {
  unref(): void
}

type ScheduleShutdown = (callback: () => void, delayMs: number) => ShutdownTimer

interface InternalRoutesOptions {
  /** Injectable so tests can simulate non-loopback requests. */
  getRequestIp?: (c: Context) => string | null
  /** Owned by runServer so disposal completes before the process exits. */
  requestShutdown?: (reason: string) => Promise<void> | void
  /** Injectable response-flush delay; the returned timer is always unref'ed. */
  scheduleShutdown?: ScheduleShutdown
}

export function createInternalRoutes(
  options: InternalRoutesOptions = {},
): Hono {
  const getRequestIp = options.getRequestIp ?? defaultGetRequestIp
  const requestShutdown = options.requestShutdown
  const scheduleShutdown =
    options.scheduleShutdown
    ?? ((callback: () => void, delayMs: number) =>
      setTimeout(callback, delayMs))

  const app = new Hono()

  app.post("/shutdown", async (c) => {
    if (!isLoopbackAddress(getRequestIp(c))) {
      return c.notFound()
    }
    if (!requestShutdown) {
      return c.json({ ok: false, draining: false }, 503)
    }

    let reason: string | undefined
    try {
      const body: { reason?: unknown } | null = await c.req.json()
      if (body && typeof body.reason === "string") {
        reason = body.reason
      }
    } catch {
      // Empty body is valid; ignore parse errors.
    }

    const traceId = requestContext.getStore()?.traceId
    consola.warn(
      `shutting down due to /_internal/shutdown${reason ? ` (reason: ${reason})` : ""}${traceId ? ` [trace ${traceId}]` : ""}`,
    )

    // Schedule the owned asynchronous drain *after* Hono has had a chance to
    // flush the 202 response. The shutdown owner closes both listeners, disposes
    // the provider boundary, and only then exits; this route never exits directly.
    const timer = scheduleShutdown(() => {
      try {
        void Promise.resolve(
          requestShutdown(`/_internal/shutdown${reason ? ` (${reason})` : ""}`),
        ).catch((error: unknown) => {
          consola.error("shutdown owner rejected", error)
        })
      } catch (error) {
        consola.error("shutdown owner threw", error)
      }
    }, 250)
    timer.unref()

    return c.json({ ok: true, draining: true }, 202)
  })

  return app
}
