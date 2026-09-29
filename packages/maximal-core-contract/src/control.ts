/**
 * Pure control-plane contract (maximal-core#4) — the consumer entry point.
 *
 * This barrel is what the Electron client imports. Its only runtime dependency
 * is zod: no fs, no process, no framework, no engine. Importing it must never
 * pull a code path that triggers a sidecar compile, which is the acceptance
 * criterion in #4 and the reason the impure halves (`errors.ts` reaches the auth
 * controller, `dispatch.ts` needs Hono) are deliberately not re-exported here.
 *
 * Published as `@maximal/maximal-core-contract/control`; Core republishes it
 * as `@maximal/maximal-core/control-contract`.
 */
import type {
  LocalModelCatalogEntry,
  LocalModelCatalogSnapshot,
  LocalModelProvisionProgress,
} from "@maximal/maximal-model-contract"
import { z } from "zod"

import type { AuthStatus as AuthStatusUnion } from "./settings.ts"

export {
  codeForReason,
  CONTROL_AUTH_FATAL,
  CONTROL_AUTH_RETRY,
  CONTROL_ERROR_REASONS,
  CONTROL_UNSUPPORTED_VERSION,
  CONTROL_UPSTREAM_ERROR,
  type ControlErrorData,
  type ControlErrorReason,
  JSON_RPC_INTERNAL_ERROR,
  JSON_RPC_INVALID_PARAMS,
  JSON_RPC_INVALID_REQUEST,
  JSON_RPC_METHOD_NOT_FOUND,
  JSON_RPC_PARSE_ERROR,
} from "./codes.ts"

export interface LocalModelEnsureResult {
  readonly modelKey: string
  readonly operationId: string
  readonly started: boolean
}

export interface LocalModelCancelResult {
  readonly cancelled: boolean
  readonly operationId: string
}

export type LocalModelOperationEvent =
  | {
      readonly type: "catalog"
      readonly snapshot: LocalModelCatalogSnapshot
    }
  | {
      readonly type: "progress"
      readonly operationId: string
      readonly progress: LocalModelProvisionProgress
    }
  | {
      readonly type: "completed"
      readonly operationId: string
      readonly model: LocalModelCatalogEntry
    }
  | {
      readonly type: "cancelled" | "failed"
      readonly operationId: string
      readonly error: {
        readonly message: string
        readonly retryable: boolean
      }
    }

/**
 * The `auth/status` result — ADR-0006's discriminated union, re-exported so a
 * consumer takes the method's result type from the same barrel as the envelope
 * instead of re-declaring it.
 *
 * Aliased through a type-only import rather than written
 * `export type { AuthStatus } from "…"`, and both halves of that are
 * load-bearing:
 *
 * - TYPE-ONLY, because `settings.ts` is a module of zod SCHEMAS. A value
 *   re-export would pull every one of them into
 *   `dist/control.js`; under `verbatimModuleSyntax` this form is
 *   erased from the emit entirely, which is what keeps zod the barrel's only
 *   runtime dependency. Core's `downstream/check.ts` is the gate that proves it.
 * - ALIASED, because `AuthStatus` in `settings` is a schema const AND the
 *   type inferred from it. Re-exporting the name forwards BOTH meanings into
 *   the bundled `.d.ts`, so `import { AuthStatus }` would typecheck as a VALUE
 *   against a barrel whose JS exports no such thing — a compile-clean runtime
 *   crash. A local type alias publishes the type meaning only.
 */
export type AuthStatus = AuthStatusUnion

const terminalScopeIdentifier = z.string().trim().min(1).max(200)

export const TerminalScopeIssueRequest = z
  .object({
    sessionId: terminalScopeIdentifier,
    profileId: terminalScopeIdentifier,
    application: terminalScopeIdentifier.nullable(),
  })
  .strict()

export type TerminalScopeIssueRequest = z.infer<
  typeof TerminalScopeIssueRequest
>

export const TerminalScopeCredential = TerminalScopeIssueRequest.extend({
  credential: z.string().min(8).max(128),
  expiresAt: z.string().datetime(),
}).strict()

export type TerminalScopeCredential = z.infer<
  typeof TerminalScopeCredential
>

export const TerminalScopeRevokeRequest = z
  .object({ sessionId: terminalScopeIdentifier })
  .strict()

export type TerminalScopeRevokeRequest = z.infer<
  typeof TerminalScopeRevokeRequest
>

export const TerminalScopeRevokeResult = TerminalScopeRevokeRequest.extend({
  revoked: z.boolean(),
}).strict()

export type TerminalScopeRevokeResult = z.infer<
  typeof TerminalScopeRevokeResult
>

export {
  errorResponse,
  type JsonRpcErrorObject,
  type JsonRpcErrorResponse,
  type JsonRpcNotification,
  jsonRpcNotificationSchema,
  type JsonRpcRequest,
  jsonRpcRequestSchema,
  type JsonRpcResponse,
  type JsonRpcSuccessResponse,
  notification,
  type ParsedMessage,
  successResponse,
} from "./message.ts"
export type {
  LocalModelCatalogEntry,
  LocalModelCatalogSnapshot,
  LocalModelProvisionProgress,
} from "@maximal/maximal-model-contract"
