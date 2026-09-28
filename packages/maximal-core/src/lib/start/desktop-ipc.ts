import {
  JSON_RPC_INTERNAL_ERROR,
  JSON_RPC_INVALID_REQUEST,
} from "@maximal/maximal-core-contract/control"
import { z } from "zod"

import type { RpcRegistry } from "~/lib/jsonrpc/dispatch"
import type { FrameEnvelope } from "~/lib/live/contract"
import type { ControlHub, ControlNotificationSink } from "~/lib/live/hub"

import { invokeRpcMethod } from "~/lib/jsonrpc/dispatch"
import { runtimeLogger } from "~/lib/platform/runtime-logger"

const requestSchema = z.object({
  kind: z.literal("rpc"),
  id: z.number().int().nonnegative(),
  method: z.string().min(1),
  params: z.unknown().optional(),
})

type ChildMessage =
  | {
      kind: "rpc-result"
      id: number
      result?: unknown
      error?: {
        code: number
        message: string
        data?: unknown
      }
    }
  | { kind: "control-event"; frame: FrameEnvelope }

async function dispatchDesktopRpc(
  methods: RpcRegistry,
  request: z.infer<typeof requestSchema>,
): Promise<ChildMessage> {
  const { id, method, params } = request
  if (method === "subscriptions/listen") {
    return {
      kind: "rpc-result",
      id,
      error: {
        code: JSON_RPC_INVALID_REQUEST,
        message:
          "subscriptions/listen is an HTTP streaming method; IPC events are pushed automatically",
      },
    }
  }
  const invocation = await invokeRpcMethod(methods, { method, params })
  if (invocation.kind === "response") {
    throw new Error("HTTP streaming responses cannot be sent over desktop IPC")
  }
  return invocation.kind === "error" ?
      { kind: "rpc-result", id, error: invocation.error }
    : { kind: "rpc-result", id, result: invocation.result }
}

function desktopSink(
  send: (message: ChildMessage) => Promise<void>,
  close: () => void,
): ControlNotificationSink {
  return {
    write: (frame) => {
      return send({ kind: "control-event", frame }).catch((error: unknown) => {
        runtimeLogger.error("Desktop IPC event delivery failed", error)
        throw error
      })
    },
    close: (reason) => {
      if (reason === "client_close") return
      runtimeLogger.warn(`Desktop IPC control subscription closed: ${reason}`)
      close()
    },
  }
}

function sendIpc(
  channel: NodeJS.Process,
  message: ChildMessage,
  close: () => void,
): Promise<void> {
  const send = channel.send?.bind(channel)
  if (!channel.connected || !send) {
    close()
    return Promise.reject(new Error("Desktop IPC channel disconnected"))
  }
  const fail = (): void => {
    close()
    if (channel.connected) channel.disconnect?.()
  }
  return new Promise((resolve, reject) => {
    try {
      send(message, (error) => {
        if (error) {
          fail()
          reject(error)
        } else {
          resolve()
        }
      })
    } catch (error) {
      fail()
      reject(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

function channelDisconnected(channel: NodeJS.Process): boolean {
  return !channel.connected
}

/**
 * The inherited channel is a trusted transport, not a bound localhost socket.
 * Invoke the control registry directly; no HTTP request or SSE parsing occurs.
 */
export async function installDesktopIpc(
  methods: RpcRegistry,
  hub: () => ControlHub,
  channel: NodeJS.Process = process,
): Promise<() => void> {
  if (typeof channel.send !== "function" || !channel.connected) {
    throw new Error("Desktop IPC requires an inherited Node IPC channel")
  }

  let closed = false
  let unsubscribe: (() => void) | undefined
  const close = (): void => {
    if (closed) return
    closed = true
    channel.off("message", onMessage)
    channel.off("disconnect", close)
    unsubscribe?.()
  }
  const sendResult = (message: ChildMessage): void => {
    if (closed) return
    void sendIpc(channel, message, close).catch((error: unknown) => {
      runtimeLogger.error("Desktop IPC result delivery failed", error)
    })
  }
  const onMessage = (raw: unknown): void => {
    const parsed = requestSchema.safeParse(raw)
    if (!parsed.success) {
      const id =
        (
          typeof raw === "object"
          && raw !== null
          && "id" in raw
          && typeof raw.id === "number"
          && Number.isInteger(raw.id)
        ) ?
          raw.id
        : undefined
      runtimeLogger.warn("Invalid desktop IPC request", parsed.error)
      if (id !== undefined) {
        sendResult({
          kind: "rpc-result",
          id,
          error: {
            code: JSON_RPC_INVALID_REQUEST,
            message: "Invalid desktop IPC request",
          },
        })
      }
      return
    }
    void (async () => {
      const { id } = parsed.data
      try {
        sendResult(await dispatchDesktopRpc(methods, parsed.data))
      } catch (error) {
        runtimeLogger.error("Desktop IPC RPC failed", error)
        sendResult({
          kind: "rpc-result",
          id,
          error: {
            code: JSON_RPC_INTERNAL_ERROR,
            message: error instanceof Error ? error.message : "Internal error",
          },
        })
      }
    })()
  }

  channel.on("message", onMessage)
  channel.on("disconnect", close)
  try {
    unsubscribe = await hub().subscribeNotifications(
      desktopSink(
        (message) =>
          closed ? Promise.resolve() : sendIpc(channel, message, close),
        close,
      ),
    )
    if (channelDisconnected(channel)) {
      unsubscribe()
      close()
    }
  } catch (error) {
    close()
    throw error
  }
  return close
}
