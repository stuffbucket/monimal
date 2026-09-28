import { CONTROL_UPSTREAM_ERROR } from "@maximal/maximal-core-contract/control"
import { describe, expect, test } from "bun:test"
import { EventEmitter } from "node:events"

import { HTTPError } from "~/lib/errors/error"
import { RpcParamsError } from "~/lib/jsonrpc/errors"
import { ControlHub } from "~/lib/live/hub"
import { installDesktopIpc } from "~/lib/start/desktop-ipc"

// Node's inherited IPC channel uses EventEmitter's message/disconnect API.
// eslint-disable-next-line unicorn/prefer-event-target
class FakeChannel extends EventEmitter {
  connected = true
  failSend = false
  readonly sent: Array<unknown> = []
  send(message: unknown, callback?: (error: Error | null) => void): boolean {
    this.sent.push(message)
    callback?.(this.failSend ? new Error("closed channel") : null)
    return true
  }
  disconnect(): void {
    this.connected = false
    this.emit("disconnect")
  }
}

async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe("desktop control IPC", () => {
  test("routes results and JSON-RPC errors through the existing dispatcher", async () => {
    const methods = {
      echo: (params: unknown) => params,
      invalid: () => {
        throw new RpcParamsError("Bad params")
      },
      upstream: () => {
        throw new HTTPError(
          "upstream",
          new Response("upstream failed", { status: 502 }),
        )
      },
    }
    const hub = new ControlHub({ buildSnapshot: () => Promise.resolve({}) })
    const channel = new FakeChannel()
    const stop = await installDesktopIpc(
      methods,
      () => hub,
      channel as unknown as NodeJS.Process,
    )
    channel.emit("message", {
      kind: "rpc",
      id: 1,
      method: "echo",
      params: { value: 7 },
    })
    channel.emit("message", { kind: "rpc", id: 2, method: "missing" })
    channel.emit("message", {
      kind: "rpc",
      id: 3,
      method: "echo",
      params: null,
    })
    channel.emit("message", { kind: "rpc", id: 4, method: 42 })
    channel.emit("message", {
      kind: "rpc",
      id: 5,
      method: "subscriptions/listen",
    })
    channel.emit("message", { kind: "rpc", id: 6, method: "invalid" })
    channel.emit("message", { kind: "rpc", id: 7, method: "upstream" })
    await tick()
    expect(channel.sent).toContainEqual({
      kind: "rpc-result",
      id: 1,
      result: { value: 7 },
    })
    expect(channel.sent).toContainEqual({
      kind: "rpc-result",
      id: 2,
      error: { code: -32601, message: "Unknown method: missing" },
    })
    expect(channel.sent).toContainEqual({
      kind: "rpc-result",
      id: 3,
      result: null,
    })
    expect(channel.sent).toContainEqual({
      kind: "rpc-result",
      id: 4,
      error: { code: -32600, message: "Invalid desktop IPC request" },
    })
    expect(channel.sent).toContainEqual({
      kind: "rpc-result",
      id: 5,
      error: {
        code: -32600,
        message:
          "subscriptions/listen is an HTTP streaming method; IPC events are pushed automatically",
      },
    })
    expect(channel.sent).toContainEqual({
      kind: "rpc-result",
      id: 6,
      error: {
        code: -32602,
        message: "Bad params",
        data: { reason: "internal", retryable: false },
      },
    })
    expect(channel.sent).toContainEqual({
      kind: "rpc-result",
      id: 7,
      error: {
        code: CONTROL_UPSTREAM_ERROR,
        message: "upstream failed",
        data: { reason: "upstream_error", retryable: false },
      },
    })
    stop()
    hub.dispose()
  })

  test("a failed IPC send drops the hub subscription", async () => {
    const channel = new FakeChannel()
    const hub = new ControlHub({ buildSnapshot: () => Promise.resolve({}) })
    const stop = await installDesktopIpc(
      {},
      () => hub,
      channel as unknown as NodeJS.Process,
    )
    await tick()
    channel.failSend = true
    hub.emit("auth", { changed: true })
    await tick()
    expect(hub.stats.subscribers).toBe(0)
    expect(channel.connected).toBe(false)
    stop()
    hub.dispose()
  })

  test("pushes snapshot and notifications, then unsubscribes on disconnect", async () => {
    const channel = new FakeChannel()
    const hub = new ControlHub({
      buildSnapshot: () => Promise.resolve({ connected: true }),
    })
    const stop = await installDesktopIpc(
      {},
      () => hub,
      channel as unknown as NodeJS.Process,
    )
    await tick()
    expect(channel.sent).toContainEqual({
      kind: "control-event",
      frame: {
        jsonrpc: "2.0",
        method: "control/snapshot",
        params: { protocolVersion: 2, snapshot: { connected: true } },
      },
    })
    hub.emit("auth", { changed: true })
    await tick()
    expect(channel.sent).toContainEqual({
      kind: "control-event",
      frame: {
        jsonrpc: "2.0",
        method: "control/auth",
        params: { changed: true },
      },
    })
    channel.disconnect()
    expect(hub.stats.subscribers).toBe(0)
    stop()
    hub.dispose()
  })

  test("refuses channels without inherited IPC", async () => {
    const channel = new FakeChannel()
    channel.connected = false
    const failure = await installDesktopIpc(
      {},
      () => new ControlHub({ buildSnapshot: () => Promise.resolve({}) }),
      channel as unknown as NodeJS.Process,
    ).then(
      () => null,
      (error: unknown) => error,
    )
    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toContain("inherited Node IPC channel")
  })
})
