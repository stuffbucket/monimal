import type { TrafficObservationHandle } from "@maximal/maximal-observability-contract"

import {
  TrafficProcessParentMessageSchema,
  type TrafficProcessChildMessage,
  type TrafficProcessObservationEvent,
  type TrafficProcessParentMessage,
  type TrafficProcessQuery,
} from "~/lib/observability/process-protocol"
import { SqliteTrafficObserver } from "~/lib/observability/store"
import {
  closeUsageStoreLocal,
  enqueueTokenUsageWriteLocal,
  flushTokenUsageEventsLocal,
  getTokenUsageEventsPageLocal,
  getTokenUsageSeriesLocal,
  getTokenUsageSummaryLocal,
  pruneTokenUsageEventsLocal,
  setTokenUsageDatabasePathLocal,
} from "~/lib/token-usage/store"

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function sendToParent(message: TrafficProcessChildMessage): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!process.send || !process.connected) {
      reject(new Error("Traffic observability parent IPC is unavailable"))
      return
    }
    process.send(message, (error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

async function executeQuery(
  observer: SqliteTrafficObserver,
  query: TrafficProcessQuery,
): Promise<unknown> {
  switch (query.method) {
    case "list-requests": {
      return observer.listRequests(query.query)
    }
    case "get-request": {
      return observer.getRequest(query.requestId)
    }
    case "get-overview": {
      return observer.getOverview(query.query)
    }
    case "get-token-usage-summary": {
      return getTokenUsageSummaryLocal(query.period)
    }
    case "get-token-usage-events": {
      return getTokenUsageEventsPageLocal(query)
    }
    case "get-token-usage-series": {
      return getTokenUsageSeriesLocal(query)
    }
    case "prune-token-usage": {
      return pruneTokenUsageEventsLocal(query.beforeMs)
    }
    case "flush-token-usage": {
      await flushTokenUsageEventsLocal()
      return null
    }
    default: {
      throw new Error("Unsupported traffic observability query")
    }
  }
}

function observe(
  observer: SqliteTrafficObserver,
  handles: Map<string, TrafficObservationHandle>,
  event: TrafficProcessObservationEvent,
): void {
  if (event.kind === "token-usage") {
    enqueueTokenUsageWriteLocal(event.event)
    return
  }
  if (event.kind === "begin") {
    handles.set(
      event.observation.identity.requestId,
      observer.beginRequest(event.observation),
    )
    return
  }

  const handle = handles.get(event.requestId)
  if (!handle) return

  switch (event.kind) {
    case "dispatch": {
      handle.recordDispatch(event.observation)
      break
    }
    case "first-response": {
      handle.recordFirstResponse(event.observation)
      break
    }
    case "context": {
      handle.recordContext?.(event.observation)
      break
    }
    case "session": {
      handle.recordSession?.(event.observation)
      break
    }
    case "tokens": {
      handle.recordTokens(event.observation)
      break
    }
    case "complete": {
      handle.complete(event.observation)
      handles.delete(event.requestId)
      break
    }
    default: {
      throw new Error("Unsupported traffic observation event")
    }
  }
}

function createObserver(
  databasePath: string,
  retentionDays: number,
  onDisconnect: () => void,
): SqliteTrafficObserver {
  setTokenUsageDatabasePathLocal(databasePath)
  return new SqliteTrafficObserver({
    dbPath: databasePath,
    retentionDays,
    onInvalidation: (invalidation) => {
      void sendToParent({ kind: "invalidation", invalidation }).catch(
        onDisconnect,
      )
    },
  })
}

export async function runTrafficObservabilityChild(): Promise<void> {
  if (!process.send) {
    throw new Error("Traffic observability child requires an IPC channel")
  }

  const state: { observer?: SqliteTrafficObserver } = {}
  const handles = new Map<string, TrafficObservationHandle>()
  let commandQueue = Promise.resolve()
  let stopped = false
  let settle: (() => void) | undefined
  const stoppedPromise = new Promise<void>((resolve) => {
    settle = resolve
  })

  const stop = async (): Promise<void> => {
    if (stopped) return
    stopped = true
    handles.clear()
    const observer = state.observer
    await observer?.close()
    await closeUsageStoreLocal()
    if (state.observer === observer) state.observer = undefined
    settle?.()
  }

  const handleMessage = async (
    message: TrafficProcessParentMessage,
  ): Promise<void> => {
    if (message.kind === "initialize") {
      if (state.observer)
        throw new Error("Traffic observability child initialized twice")
      const observer = createObserver(
        message.databasePath,
        message.retentionDays,
        () => {
          void stop()
        },
      )
      state.observer = observer
      await observer.initialize()
      await sendToParent({ kind: "ready" })
      return
    }

    const observer = state.observer
    if (!observer)
      throw new Error("Traffic observability child is not initialized")

    if (message.kind === "observe") {
      for (const event of message.events) observe(observer, handles, event)
      await flushTokenUsageEventsLocal()
      await observer.flushObservations()
      await sendToParent({ kind: "acknowledged", id: message.id })
      return
    }

    if (message.kind === "query") {
      try {
        const value = await executeQuery(observer, message.query)
        await sendToParent({ kind: "result", id: message.id, ok: true, value })
      } catch (error) {
        await sendToParent({
          kind: "result",
          id: message.id,
          ok: false,
          error: { message: errorMessage(error) },
        })
      }
      return
    }

    await observer.close()
    await closeUsageStoreLocal()
    if (state.observer === observer) state.observer = undefined
    await sendToParent({ kind: "acknowledged", id: message.id })
    if (process.connected) process.disconnect?.()
    await stop()
  }

  process.on("message", (value) => {
    commandQueue = commandQueue
      .then(async () => {
        const parsed = TrafficProcessParentMessageSchema.safeParse(value)
        if (!parsed.success) {
          throw new Error(
            `Invalid traffic observability IPC message: ${parsed.error.message}`,
          )
        }
        await handleMessage(parsed.data)
      })
      .catch(async (error: unknown) => {
        await sendToParent({
          kind: "fatal",
          error: { message: errorMessage(error) },
        }).catch(() => undefined)
        if (process.connected) process.disconnect?.()
        await stop()
      })
  })
  process.once("disconnect", () => {
    commandQueue = commandQueue.then(stop, stop)
  })

  await stoppedPromise
}
