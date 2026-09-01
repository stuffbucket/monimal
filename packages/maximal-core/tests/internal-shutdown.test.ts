/**
 * /_internal/shutdown — graceful-eviction endpoint.
 *
 * Loopback enforcement is the contract that matters here: a remote
 * caller with a valid API key must NOT be able to evict the running
 * proxy. The shutdown owner and response-flush scheduler are injected so
 * these tests never bind a socket, exit the runner, or park a real timer.
 */

import type { Context } from "hono"

import { describe, expect, mock, spyOn, test } from "bun:test"
import consola from "consola"
import { Hono } from "hono"

import { createInternalRoutes } from "~/routes/internal/route"

interface BuildAppOptions {
  requestShutdown?: (reason: string) => Promise<void> | void
  scheduleShutdown?: (
    callback: () => void,
    delayMs: number,
  ) => { unref(): void }
}

function buildApp(ip: string | null, options: BuildAppOptions = {}) {
  const routes = createInternalRoutes({
    getRequestIp: (_c: Context) => ip,
    ...options,
  })
  const app = new Hono()
  app.route("/_internal", routes)
  return app
}

const silentLog = Object.assign(
  (_message: unknown, ..._args: Array<unknown>) => undefined,
  { raw: (..._args: Array<unknown>) => undefined },
)

function createScheduleHarness() {
  const callbacks: Array<() => void> = []
  const unref = mock(() => undefined)
  const scheduleShutdown = mock((callback: () => void, _delayMs: number) => {
    callbacks.push(callback)
    return { unref }
  })
  return { callbacks, scheduleShutdown, unref }
}

describe("/_internal/shutdown", () => {
  test("non-loopback origin → 404, no drain scheduled", async () => {
    const requestShutdown = mock((_reason: string) => undefined)
    const scheduler = createScheduleHarness()
    const res = await buildApp("10.0.0.5", {
      requestShutdown,
      scheduleShutdown: scheduler.scheduleShutdown,
    }).request("/_internal/shutdown", { method: "POST" })

    expect(res.status).toBe(404)
    expect(scheduler.scheduleShutdown).not.toHaveBeenCalled()
    expect(requestShutdown).not.toHaveBeenCalled()
  })

  test("missing shutdown owner → 503 without scheduling or logging", async () => {
    const scheduler = createScheduleHarness()
    const warn = spyOn(consola, "warn").mockImplementation(silentLog)
    try {
      const res = await buildApp("127.0.0.1", {
        scheduleShutdown: scheduler.scheduleShutdown,
      }).request("/_internal/shutdown", { method: "POST" })

      expect(res.status).toBe(503)
      expect(await res.json()).toEqual({ ok: false, draining: false })
      expect(scheduler.scheduleShutdown).not.toHaveBeenCalled()
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  test("owned shutdown → 202 with an unref'ed response-flush delay", async () => {
    const requestShutdown = mock((_reason: string) => undefined)
    const scheduler = createScheduleHarness()
    const res = await buildApp("127.0.0.1", {
      requestShutdown,
      scheduleShutdown: scheduler.scheduleShutdown,
    }).request("/_internal/shutdown", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "replace" }),
    })

    expect(res.status).toBe(202)
    expect(await res.json()).toEqual({ ok: true, draining: true })
    expect(requestShutdown).not.toHaveBeenCalled()
    expect(scheduler.scheduleShutdown).toHaveBeenCalledTimes(1)
    expect(scheduler.scheduleShutdown.mock.calls[0]?.[1]).toBe(250)
    expect(scheduler.unref).toHaveBeenCalledTimes(1)

    scheduler.callbacks[0]?.()
    expect(requestShutdown).toHaveBeenCalledWith(
      "/_internal/shutdown (replace)",
    )
  })

  test("async shutdown-owner rejection is caught and reported", async () => {
    const rejection = new Error("drain failed")
    const requestShutdown = mock((_reason: string) => Promise.reject(rejection))
    const scheduler = createScheduleHarness()
    const error = spyOn(consola, "error").mockImplementation(silentLog)
    try {
      const res = await buildApp("::1", {
        requestShutdown,
        scheduleShutdown: scheduler.scheduleShutdown,
      }).request("/_internal/shutdown", { method: "POST" })
      expect(res.status).toBe(202)

      scheduler.callbacks[0]?.()
      await Promise.resolve()
      expect(error).toHaveBeenCalledWith("shutdown owner rejected", rejection)
    } finally {
      error.mockRestore()
    }
  })
})
