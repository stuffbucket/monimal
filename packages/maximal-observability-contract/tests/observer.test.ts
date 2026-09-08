import assert from "node:assert/strict"
import test from "node:test"

import type {
  TrafficCompletionObservation,
  TrafficDispatchObservation,
  TrafficFirstResponseObservation,
  TrafficObservationHandle,
  TrafficObservationStart,
  TrafficObserver,
  TrafficTokenObservation,
} from "../src/index.ts"

import {
  TrafficCompletionObservationSchema,
  TrafficDispatchObservationSchema,
  TrafficFirstResponseObservationSchema,
  TrafficObservationStartSchema,
  TrafficTokenObservationSchema,
} from "../src/index.ts"
import { completedRequest, timestamp } from "./fixtures.ts"

class RecordingHandle implements TrafficObservationHandle {
  readonly events: Array<unknown> = []

  recordDispatch(observation: TrafficDispatchObservation): void {
    this.events.push(observation)
  }

  recordFirstResponse(observation: TrafficFirstResponseObservation): void {
    this.events.push(observation)
  }

  recordTokens(observation: TrafficTokenObservation): void {
    this.events.push(observation)
  }

  complete(observation: TrafficCompletionObservation): void {
    this.events.push(observation)
  }
}

class RecordingObserver implements TrafficObserver {
  readonly handles: Array<RecordingHandle> = []
  readonly starts: Array<TrafficObservationStart> = []

  beginRequest(observation: TrafficObservationStart): TrafficObservationHandle {
    this.starts.push(observation)
    const handle = new RecordingHandle()
    this.handles.push(handle)
    return handle
  }
}

void test("observer boundary uses synchronous passive notifications", () => {
  const request = completedRequest()
  const start = TrafficObservationStartSchema.parse({
    identity: request.identity,
    acceptedAt: request.timing.acceptedAt,
    route: request.route,
    attribution: request.attribution,
    context: request.context,
    size: { ...request.size, responseBytes: null, responseChunks: null },
  })
  const dispatch = TrafficDispatchObservationSchema.parse({
    at: request.timing.dispatchStartedAt,
    attribution: request.attribution,
    dispatch: { ...request.dispatch, statusCode: null, streamed: null },
  })
  const firstResponse = TrafficFirstResponseObservationSchema.parse({
    at: request.timing.firstResponseAt,
    statusCode: 200,
    streamed: true,
  })
  const tokenObservation = TrafficTokenObservationSchema.parse({
    at: request.timing.completedAt,
    tokens: request.tokens,
  })
  const completion = TrafficCompletionObservationSchema.parse({
    at: request.timing.completedAt,
    outcome: request.outcome,
    dispatch: request.dispatch,
    tokens: request.tokens,
    size: request.size,
    error: null,
  })

  const observer = new RecordingObserver()
  const handle = observer.beginRequest(start)
  handle.recordDispatch(dispatch)
  handle.recordFirstResponse(firstResponse)
  handle.recordTokens(tokenObservation)
  handle.complete(completion)

  assert.deepEqual(observer.starts, [start])
  assert.deepEqual(observer.handles[0]?.events, [
    dispatch,
    firstResponse,
    tokenObservation,
    completion,
  ])
})

void test("completion errors are only valid for failed outcomes", () => {
  const request = completedRequest()
  assert.throws(() =>
    TrafficCompletionObservationSchema.parse({
      at: timestamp,
      outcome: "succeeded",
      dispatch: request.dispatch,
      tokens: request.tokens,
      size: request.size,
      error: {
        category: "provider",
        code: "upstream-error",
        message: "upstream failed",
        retryable: true,
      },
    }),
  )
})
