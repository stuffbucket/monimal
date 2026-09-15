import type {
  TrafficAttributionMetadata,
  TrafficCompletionObservation,
  TrafficContextMetadata,
  TrafficDispatchMetadata,
  TrafficErrorMetadata,
  TrafficObservationHandle,
  TrafficObserver,
} from "@stuffbucket/maximal-observability-contract"
import type { Context, MiddlewareHandler } from "hono"

import { requestContext } from "~/lib/http/request-context"
import { asRecord } from "~/lib/http/untrusted-frame"

const OBSERVED_PATHS = [
  "/chat/completions",
  "/embeddings",
  "/responses",
  "/v1/chat/completions",
  "/v1/embeddings",
  "/v1/messages",
  "/v1/messages/count_tokens",
  "/v1/responses",
] as const

const BODY_LIMIT_BYTES = 16 * 1024 * 1024

export function observedInferencePaths(): Array<string> {
  return [
    ...OBSERVED_PATHS,
    ...OBSERVED_PATHS.map((path) => `${path}/*`),
    "/:provider/v1/messages",
    "/:provider/v1/messages/*",
  ]
}

/** Persist bounded route templates, never user-controlled wildcard suffixes. */
function normalizedRoutePath(path: string): string {
  if (/^\/[^/]+\/v1\/messages\/count_tokens(?:\/|$)/u.test(path)) {
    return "/:provider/v1/messages/count_tokens"
  }
  if (/^\/[^/]+\/v1\/messages(?:\/|$)/u.test(path)) {
    return "/:provider/v1/messages"
  }
  for (const candidate of [...OBSERVED_PATHS].sort(
    (left, right) => right.length - left.length,
  )) {
    if (path === candidate || path.startsWith(`${candidate}/`)) return candidate
  }
  return "/inference"
}

function operationForPath(path: string): string {
  if (path.includes("/count_tokens")) return "count-tokens"
  if (path.includes("/chat/completions")) return "chat-completions"
  if (path.includes("/embeddings")) return "embeddings"
  if (path.includes("/responses")) return "responses"
  return "messages"
}

function boundedIdentifier(value: string | null | undefined): string | null {
  const normalized = value?.trim().slice(0, 200)
  return normalized || null
}

function providerForPath(path: string): string {
  const match = /^\/([^/]+)\/v1\/messages(?:\/|$)/u.exec(path)
  return boundedIdentifier(match?.[1]) ?? "copilot"
}

/** Known, fixed client labels only. The raw user-agent is never returned. */
function normalizedClient(userAgent: string): string | null {
  const lower = userAgent.toLocaleLowerCase()
  if (lower.includes("claude-code")) return "claude-code"
  if (lower.includes("cursor")) return "cursor"
  if (lower.includes("vscode")) return "vscode"
  if (lower.includes("openai")) return "openai-sdk"
  if (lower.includes("anthropic")) return "anthropic-sdk"
  return null
}

function countArray(
  record: Record<string, unknown>,
  key: string,
): number | null {
  const value = record[key]
  return Array.isArray(value) ? value.length : null
}

function nonnegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ?
      value
    : null
}

function normalizedRequest(
  c: Context,
  body: Record<string, unknown>,
): {
  attribution: TrafficAttributionMetadata
  context: TrafficContextMetadata
} {
  const store = requestContext.getStore()
  const provider = providerForPath(c.req.path)
  const model = boundedIdentifier(
    typeof body.model === "string" ? body.model : null,
  )
  const contextWindow =
    nonnegativeInteger(body.context_window)
    ?? nonnegativeInteger(body.context_window_tokens)
  const requestedMax =
    nonnegativeInteger(body.max_tokens)
    ?? nonnegativeInteger(body.max_output_tokens)
  const parentSessionId = boundedIdentifier(store?.parentSessionId)
  return {
    attribution: {
      source: provider === "copilot" ? "copilot" : "provider",
      client:
        boundedIdentifier(store?.apiKeyLabel)
        ?? normalizedClient(store?.userAgent ?? ""),
      project: null,
      provider,
      model,
      parentSessionId,
      subagent: parentSessionId === null ? null : true,
      compactType: null,
    },
    context: {
      messageCount: countArray(body, "messages") ?? countArray(body, "input"),
      toolDefinitionCount: countArray(body, "tools"),
      contextWindowTokens: contextWindow,
      requestedMaxOutputTokens: requestedMax,
      usedTokens: null,
      usedRatio: null,
    },
  }
}

async function readNormalizedRequest(c: Context): Promise<{
  attribution: TrafficAttributionMetadata
  context: TrafficContextMetadata
}> {
  const body =
    asRecord(
      await c.req.raw
        .clone()
        .json()
        .catch(() => null),
    ) ?? {}
  return normalizedRequest(c, body)
}

function requestBytes(c: Context): number | null {
  const value = c.req.header("content-length")
  if (!value || !/^\d+$/u.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed <= BODY_LIMIT_BYTES ?
      parsed
    : null
}

function dispatchMetadata(
  statusCode: number | null,
  streamed: boolean | null,
  requestedModel: string | null = null,
): TrafficDispatchMetadata {
  return {
    attemptCount: 1,
    retryCount: 0,
    statusCode,
    streamed,
    upstreamRequestId: null,
    requestedModel,
    resolvedModel: null,
  }
}

function safeFailure(status: number): TrafficErrorMetadata | null {
  if (status < 400) return null
  return {
    category: status < 500 ? "client" : "internal",
    code: `http_${status}`,
    message: `Inference request returned HTTP ${status}`,
    retryable: status === 408 || status === 429 || status >= 500,
  }
}

interface StreamState {
  bytes: number
  chunks: number
  firstResponse: boolean
  frameBuffer: string
  terminal: boolean
}

function hasSemanticFrame(state: StreamState, chunk: Uint8Array): boolean {
  state.frameBuffer =
    `${state.frameBuffer}${new TextDecoder().decode(chunk)}`.slice(-16_384)
  const frames = state.frameBuffer.split(/\r?\n\r?\n/u)
  state.frameBuffer = frames.pop() ?? ""
  return frames.some((frame) => {
    const data = frame
      .split(/\r?\n/u)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n")
    if (!data || data === "[DONE]") return false
    try {
      const value = asRecord(JSON.parse(data))
      const type = typeof value?.type === "string" ? value.type : ""
      if (type.includes("delta") || type.includes("output_item")) return true
      const choices = value?.choices
      return Array.isArray(choices) && choices.length > 0
    } catch {
      return data.length > 0
    }
  })
}

interface CompletionInput {
  error: TrafficErrorMetadata | null
  outcome: TrafficCompletionObservation["outcome"]
  state: StreamState
  status: number
  streamed: boolean
}

function completion(input: CompletionInput): TrafficCompletionObservation {
  return {
    at: new Date().toISOString(),
    outcome: input.outcome,
    dispatch: dispatchMetadata(input.status, input.streamed),
    tokens: null,
    size: {
      requestBytes: null,
      responseBytes: input.state.bytes,
      responseChunks: input.state.chunks,
    },
    response: { stopReason: null, toolUseCount: null },
    error: input.error,
  }
}

interface ResponseStreamInput {
  body: ReadableStream<Uint8Array>
  handle: ReturnType<TrafficObserver["beginRequest"]>
  status: number
  streamed: boolean
}

function passiveHandle(
  observer: TrafficObserver,
  observation: Parameters<TrafficObserver["beginRequest"]>[0],
): TrafficObservationHandle {
  let handle: TrafficObservationHandle | null = null
  try {
    handle = observer.beginRequest(observation)
  } catch {
    // Observability is passive: a broken sink cannot affect request delivery.
  }
  return {
    recordDispatch(value) {
      try {
        handle?.recordDispatch(value)
      } catch {
        // Best-effort telemetry only.
      }
    },
    recordFirstResponse(value) {
      try {
        handle?.recordFirstResponse(value)
      } catch {
        // Best-effort telemetry only.
      }
    },
    recordContext(value) {
      try {
        handle?.recordContext?.(value)
      } catch {
        // Best-effort telemetry only.
      }
    },
    recordTokens(value) {
      try {
        handle?.recordTokens(value)
      } catch {
        // Best-effort telemetry only.
      }
    },
    complete(value) {
      try {
        handle?.complete(value)
      } catch {
        // Best-effort telemetry only.
      }
    },
  }
}

function wrapResponseBody(
  input: ResponseStreamInput,
): ReadableStream<Uint8Array> {
  const { handle, status, streamed } = input
  const reader = input.body.getReader()
  const state: StreamState = {
    bytes: 0,
    chunks: 0,
    firstResponse: false,
    frameBuffer: "",
    terminal: false,
  }

  const observeFirst = (): void => {
    if (state.firstResponse) return
    state.firstResponse = true
    handle.recordFirstResponse({
      at: new Date().toISOString(),
      statusCode: status,
      streamed,
    })
  }
  const finish = (
    outcome: TrafficCompletionObservation["outcome"],
    error: TrafficErrorMetadata | null,
  ): void => {
    if (state.terminal) return
    state.terminal = true
    handle.complete(completion({ status, streamed, state, outcome, error }))
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = await reader.read()
        if (result.done) {
          if (!state.firstResponse) observeFirst()
          finish(status < 400 ? "succeeded" : "failed", safeFailure(status))
          controller.close()
          return
        }
        if (!streamed || hasSemanticFrame(state, result.value)) observeFirst()
        state.bytes += result.value.byteLength
        state.chunks += 1
        controller.enqueue(result.value)
      } catch (error) {
        finish("failed", {
          category: "transport",
          code: "response_stream_error",
          message: "Inference response stream failed",
          retryable: true,
        })
        controller.error(error)
      }
    },
    async cancel(reason) {
      finish("cancelled", null)
      await reader.cancel(reason)
    },
  })
}

// Lifecycle setup and terminal response wrapping stay adjacent for auditability.
// eslint-disable-next-line max-lines-per-function
export function createTrafficObservationMiddleware(
  observer: TrafficObserver,
): MiddlewareHandler {
  // Kept as one audit-friendly lifecycle boundary from ingress through response.
  // eslint-disable-next-line max-lines-per-function
  return async (c, next) => {
    const store = requestContext.getStore()
    if (store?.trafficObservation) {
      await next()
      return
    }

    const requestId = crypto.randomUUID()
    const acceptedAt = new Date().toISOString()
    const normalized = normalizedRequest(c, {})
    const requestMetadata = readNormalizedRequest(c)
    const handle = passiveHandle(observer, {
      identity: {
        requestId,
        traceId: store?.traceId ?? null,
        sessionId: boundedIdentifier(store?.sessionAffinity),
        parentRequestId: null,
        clientRequestId: null,
      },
      acceptedAt,
      route: {
        method: c.req.method.toUpperCase(),
        path: normalizedRoutePath(c.req.path),
        operation: operationForPath(c.req.path),
      },
      attribution: normalized.attribution,
      context: normalized.context,
      size: {
        requestBytes: requestBytes(c),
        responseBytes: null,
        responseChunks: null,
      },
    })
    if (store) {
      store.trafficObservation = handle
      store.trafficRequestId = requestId
    }
    handle.recordDispatch({
      at: new Date().toISOString(),
      attribution: normalized.attribution,
      dispatch: dispatchMetadata(null, null, normalized.attribution.model),
    })
    const annotateRequest = requestMetadata
      .then((metadata) => {
        const at = new Date().toISOString()
        handle.recordDispatch({
          at,
          attribution: metadata.attribution,
          dispatch: dispatchMetadata(null, null, metadata.attribution.model),
        })
        handle.recordContext?.({ at, context: metadata.context })
      })
      .catch(() => {
        // Metadata extraction is passive and cannot affect request delivery.
      })

    try {
      await Promise.all([next(), annotateRequest])
    } catch (error) {
      handle.complete({
        ...completion({
          status: 500,
          streamed: false,
          state: {
            bytes: 0,
            chunks: 0,
            firstResponse: false,
            frameBuffer: "",
            terminal: false,
          },
          outcome: "failed",
          error: {
            category: "internal",
            code: "request_handler_error",
            message: "Inference request handler failed",
            retryable: false,
          },
        }),
        size: {
          requestBytes: requestBytes(c),
          responseBytes: 0,
          responseChunks: 0,
        },
      })
      throw error
    }

    const response = c.res
    const contentType = response.headers.get("content-type") ?? ""
    const streamed = contentType.includes("text/event-stream")
    if (!response.body) {
      handle.recordFirstResponse({
        at: new Date().toISOString(),
        statusCode: response.status,
        streamed,
      })
      handle.complete({
        ...completion({
          status: response.status,
          streamed,
          state: {
            bytes: 0,
            chunks: 0,
            firstResponse: true,
            frameBuffer: "",
            terminal: false,
          },
          outcome: response.status < 400 ? "succeeded" : "failed",
          error: safeFailure(response.status),
        }),
        size: {
          requestBytes: requestBytes(c),
          responseBytes: 0,
          responseChunks: 0,
        },
      })
      return
    }
    const wrapped = wrapResponseBody({
      body: response.body,
      status: response.status,
      streamed,
      handle,
    })
    c.res = new Response(wrapped, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  }
}
