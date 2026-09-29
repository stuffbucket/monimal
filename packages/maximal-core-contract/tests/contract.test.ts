import assert from "node:assert/strict"
import { test } from "node:test"

import {
  codeForReason,
  CONTROL_ERROR_REASONS,
  errorResponse,
  jsonRpcRequestSchema,
  successResponse,
} from "../src/control.ts"
import {
  AuthStatus,
  CopilotAccountUsage,
  OllamaAccountsListResponse,
  OllamaSettingsResponse,
} from "../src/settings.ts"

void test("every control error reason has its own code", () => {
  const codes = CONTROL_ERROR_REASONS.map((reason) => codeForReason(reason))

  assert.equal(new Set(codes).size, CONTROL_ERROR_REASONS.length)
})

void test("a request parses and its responses echo the id", () => {
  const request = jsonRpcRequestSchema.parse({
    jsonrpc: "2.0",
    id: 7,
    method: "auth/status",
  })

  assert.equal(successResponse(request.id, null).id, 7)
  assert.deepEqual(
    errorResponse(request.id, { code: -32603, message: "boom" }),
    {
      jsonrpc: "2.0",
      id: 7,
      error: { code: -32603, message: "boom" },
    },
  )
})

void test("the auth status union rejects an unknown state", () => {
  assert.equal(AuthStatus.safeParse({ state: "unauthenticated" }).success, true)
  assert.equal(AuthStatus.safeParse({ state: "bogus" }).success, false)
})

void test("Copilot usage preserves known quota data and tolerates upstream additions", () => {
  const result = CopilotAccountUsage.parse({
    copilot_plan: "enterprise",
    quota_reset_date: "2026-09-30",
    quota_snapshots: {
      premium_interactions: {
        entitlement: 100,
        remaining: 65,
        percent_remaining: 65,
        future_field: "preserved",
      },
    },
    future_top_level_field: true,
  })

  const quotaSnapshots = result.quota_snapshots
  assert.ok(quotaSnapshots)
  const premiumInteractions = quotaSnapshots.premium_interactions
  assert.ok(premiumInteractions)
  assert.equal(premiumInteractions.percent_remaining, 65)
  assert.equal(premiumInteractions.future_field, "preserved")
  assert.equal(result.future_top_level_field, true)
  assert.equal(
    CopilotAccountUsage.safeParse({ copilot_plan: 42 }).success,
    false,
  )
})

void test("legacy Ollama account results default a missing error code", () => {
  const result = OllamaAccountsListResponse.parse({
    accounts: [
      {
        type: "ollama",
        provider: "ollama",
        endpoint: "local-endpoint",
        scope: "remote",
        account_state: "unauthenticated",
        availability: "unavailable",
        model_count: null,
      },
      {
        type: "ollama",
        provider: "ollama-cloud",
        endpoint: "cloud-endpoint",
        scope: "remote",
        account_state: "authenticated",
        availability: "unavailable",
        model_count: null,
      },
    ],
  })

  assert.deepEqual(
    result.accounts.map(({ error_code: errorCode }) => errorCode),
    [null, null],
  )
})

void test("legacy Ollama settings default a missing API key value", () => {
  const result = OllamaSettingsResponse.parse({
    has_api_key: true,
    credential_source: "file",
    local_enabled: true,
    local_endpoint: "data:,ollama",
    prefer_local_models: true,
  })

  assert.equal(result.api_key, null)
})
