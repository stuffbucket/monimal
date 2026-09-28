import type {
  ControlErrorData,
  ControlErrorReason,
  JsonRpcErrorObject,
} from "@maximal/maximal-core-contract/control"
/**
 * Producer-side error mapping for the control RPC surface.
 *
 * This module imports the engine (`forwardError` reaches the auth controller and
 * runtime state), so it is the **impure half** of the JSON-RPC layer and must
 * never be imported by a consumer. The pure half — codes, discriminants, and the
 * `data` shape a client switches on — lives in `@maximal/maximal-core-contract/control` (maximal-core#4).
 */
import type { Context } from "hono"

import {
  codeForReason,
  JSON_RPC_INVALID_PARAMS,
} from "@maximal/maximal-core-contract/control"

import { describeForwardedError } from "~/lib/errors/error"

/** Thrown by a method whose params are unusable. Distinct from an upstream
 *  failure: the caller sent something wrong, so `-32602` is the honest code and
 *  there is nothing to retry. */
export class RpcParamsError extends Error {}

export function jsonRpcError(
  code: number,
  message: string,
  data?: unknown,
): JsonRpcErrorObject {
  return data === undefined ? { code, message } : { code, message, data }
}

/** Build an error object whose numeric code and string discriminant agree by
 *  construction — they are derived from one input, not written twice. */
export function controlError(
  reason: ControlErrorReason,
  message: string,
  extra: Omit<ControlErrorData, "reason" | "retryable"> & {
    retryable?: boolean
  } = {},
): JsonRpcErrorObject {
  const { retryable, ...rest } = extra
  const data: ControlErrorData = {
    reason,
    // Only a re-mintable auth blip is worth re-issuing unprompted; everything
    // else needs a human or a different request.
    retryable: retryable ?? reason === "auth_retry",
    ...rest,
  }
  return jsonRpcError(codeForReason(reason), message, data)
}

/** Maps the `type` discriminator `forwardError` already emits onto our reason. */
function reasonForErrorType(type: unknown, status: number): ControlErrorReason {
  if (type === "auth_fatal") return "auth_fatal"
  if (type === "server_error" && status === 503) return "auth_retry"
  return "upstream_error"
}

/**
 * Translate a thrown error into a JSON-RPC error object using the same
 * error description that `forwardError` renders for HTTP.
 *
 * The indirection is deliberate. The shared description's
 * `CopilotAuthFatalError` branch re-mints a stale Copilot bearer via
 * `rearmCopilotAuth()` and, only if that genuinely fails, degrades the session
 * non-destructively via `markAuthDegraded()`. Reimplementing the mapping here
 * would fork that recovery logic, and the copies would drift the first time the
 * auth state machine changes. HTTP retains the 429 `retry-after` / `x-*`
 * passthrough; IPC has no response headers.
 */
export async function toJsonRpcError(
  error: unknown,
  c?: Context,
): Promise<JsonRpcErrorObject> {
  if (error instanceof RpcParamsError) {
    return jsonRpcError(JSON_RPC_INVALID_PARAMS, error.message, {
      reason: "internal",
      retryable: false,
    } satisfies ControlErrorData)
  }

  const forwarded = await describeForwardedError(error)
  if (c) {
    for (const [name, value] of forwarded.headers ?? []) c.header(name, value)
  }
  const {
    message,
    type,
    remediation_url: remediationUrl,
  } = forwarded.body.error
  return controlError(reasonForErrorType(type, forwarded.status), message, {
    ...(remediationUrl ? { remediationUrl } : {}),
  })
}
