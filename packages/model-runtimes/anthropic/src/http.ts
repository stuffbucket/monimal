import {
  attributionHeaders,
  LlmError,
  type LlmDiscoveredModel,
} from "@deepseek-ai/dsh-llm"

import type { ResolvedInstanceConfig } from "./config.ts"

import { aborted, protocolError } from "./errors.ts"
import { isRecord } from "./validation.ts"

export interface RequestScope {
  cleanup(): void
  signal: AbortSignal
}

export function requestHeaders(
  instance: ResolvedInstanceConfig,
  accept: string,
): Record<string, string> {
  return {
    ...attributionHeaders(),
    accept,
    "anthropic-version": "2023-06-01",
    ...(instance.authType === "x-api-key" ?
      { "x-api-key": instance.apiKey }
    : { authorization: `Bearer ${instance.apiKey}` }),
  }
}

export function createRequestScope(
  lifecycleSignal: AbortSignal,
  callerSignal?: AbortSignal,
): RequestScope {
  const controller = new AbortController()
  const abort = (): void => controller.abort()
  lifecycleSignal.addEventListener("abort", abort, { once: true })
  callerSignal?.addEventListener("abort", abort, { once: true })
  if (lifecycleSignal.aborted || callerSignal?.aborted === true) abort()
  return {
    cleanup() {
      lifecycleSignal.removeEventListener("abort", abort)
      callerSignal?.removeEventListener("abort", abort)
      controller.abort()
    },
    signal: controller.signal,
  }
}

export async function checkedFetch(
  url: URL,
  init: RequestInit,
  scope: RequestScope,
): Promise<Response> {
  let response: Response
  try {
    response = await fetch(url, { ...init, signal: scope.signal })
  } catch (error) {
    if (scope.signal.aborted) aborted(error)
    throw new LlmError(
      `anthropic-provider: transport failed for ${url.origin}`,
      "TRANSPORT",
      { cause: error },
    )
  }
  if (!response.ok) throwHttpError(response)
  return response
}

export interface ModelPage {
  hasMore: boolean
  lastId?: string
  models: Array<LlmDiscoveredModel>
}

export async function readModelsPage(response: Response): Promise<ModelPage> {
  let body: unknown
  try {
    body = await response.json()
  } catch (error) {
    protocolError("models response is not valid JSON", error)
  }
  if (!isRecord(body) || !Array.isArray(body.data)) {
    protocolError("models response must contain a data array")
  }
  const result: Array<LlmDiscoveredModel> = []
  const seen = new Set<string>()
  for (const item of body.data) {
    if (
      !isRecord(item)
      || typeof item.id !== "string"
      || item.id.length === 0
    ) {
      protocolError("models response contains an invalid model")
    }
    if (seen.has(item.id)) continue
    seen.add(item.id)
    result.push({
      id: item.id,
      ...(typeof item.display_name === "string" ?
        { name: item.display_name }
      : {}),
      ...(isPositiveInteger(item.max_input_tokens) ?
        { contextWindow: item.max_input_tokens }
      : {}),
      ...(isPositiveInteger(item.max_tokens) ?
        { maxTokens: item.max_tokens }
      : {}),
    })
  }
  if (body.has_more !== undefined && typeof body.has_more !== "boolean") {
    protocolError("models response has an invalid has_more value")
  }
  const hasMore = body.has_more === true
  if (
    hasMore
    && (typeof body.last_id !== "string" || body.last_id.length === 0)
  ) {
    protocolError("paginated models response lacks last_id")
  }
  return {
    hasMore,
    models: result,
    ...(typeof body.last_id === "string" ? { lastId: body.last_id } : {}),
  }
}

function httpErrorCode(status: number): string {
  if (status === 401 || status === 403) return "AUTH"
  if (status === 429) return "RATE_LIMIT"
  if (status === 400 || status === 404 || status === 422) {
    return "INVALID_REQUEST"
  }
  if (status >= 500) return "SERVER"
  return `HTTP_${status}`
}

function throwHttpError(response: Response): never {
  const status = response.status
  throw new LlmError(
    `anthropic-provider: provider returned HTTP ${status}`,
    httpErrorCode(status),
    { status },
  )
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0
}
