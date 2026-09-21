import { afterEach, beforeEach, describe, expect, test } from "bun:test"

import type { Model } from "~/services/copilot/get-models"

import { buildDiagnostics } from "~/lib/config/settings-operations"
import { ContextManagementDiagnostics } from "~/lib/config/settings-types"
import { state } from "~/lib/runtime-state/state"
import {
  clearContextManagementRejections,
  recordContextManagementRejection,
} from "~/services/copilot/context-management-capabilities"

const originalState = {
  accountType: state.accountType,
  copilotApiUrl: state.copilotApiUrl,
  models: state.models,
  userName: state.userName,
}

function model(id: string, contextEditing?: boolean): Model {
  return {
    id,
    name: id,
    object: "model",
    vendor: "Anthropic",
    version: "1",
    preview: false,
    model_picker_enabled: true,
    capabilities: {
      family: "claude",
      type: "chat",
      tokenizer: "o200k_base",
      object: "model_capabilities",
      limits: {},
      supports:
        contextEditing === undefined ?
          { future_capability: "kept" }
        : { context_editing: contextEditing },
    },
  }
}

beforeEach(() => {
  clearContextManagementRejections()
  state.accountType = "individual"
  state.copilotApiUrl = undefined
  state.models = undefined
  state.userName = undefined
})

afterEach(() => {
  clearContextManagementRejections()
  state.accountType = originalState.accountType
  state.copilotApiUrl = originalState.copilotApiUrl
  state.models = originalState.models
  state.userName = originalState.userName
})

describe("context-management diagnostics", () => {
  test("projects advertised support and only same-scope rejections", () => {
    state.userName = "diagnostics-account"
    state.models = {
      object: "list",
      data: [
        model("claude-supported", true),
        model("claude-unsupported", false),
        model("claude-unadvertised"),
      ],
    }
    recordContextManagementRejection(
      {
        account: "diagnostics-account",
        host: "https://api.githubcopilot.com",
        model: "claude-diagnostics",
        strategy: '{"edits":[]}',
      },
      0,
    )
    recordContextManagementRejection(
      {
        account: "diagnostics-account",
        host: "https://other.example.test",
        model: "wrong-host",
        strategy: "{}",
      },
      1,
    )
    recordContextManagementRejection(
      {
        account: "other-account",
        host: "https://api.githubcopilot.com",
        model: "wrong-account",
        strategy: "{}",
      },
      2,
    )

    const diagnostics = buildDiagnostics().context_management

    expect(diagnostics).toEqual({
      advertised: [
        { model: "claude-supported", support: true },
        { model: "claude-unsupported", support: false },
      ],
      observed_rejections: [
        {
          model: "claude-diagnostics",
          strategy: '{"edits":[]}',
          rejected_at: "1970-01-01T00:00:00.000Z",
        },
      ],
      cache_policy: "rejections-only-no-expiry",
    })
    expect(JSON.stringify(diagnostics)).not.toContain("diagnostics-account")
  })

  test("uses the unknown account scope when no account is loaded", () => {
    recordContextManagementRejection(
      {
        account: "unknown",
        host: "https://api.githubcopilot.com",
        model: "claude-unknown-account",
        strategy: "{}",
      },
      0,
    )

    expect(buildDiagnostics().context_management?.observed_rejections).toEqual([
      {
        model: "claude-unknown-account",
        strategy: "{}",
        rejected_at: "1970-01-01T00:00:00.000Z",
      },
    ])
  })

  test("rejects malformed diagnostic entries", () => {
    const base = {
      advertised: [],
      observed_rejections: [],
      cache_policy: "rejections-only-no-expiry" as const,
    }

    expect(
      ContextManagementDiagnostics.safeParse({
        ...base,
        advertised: [{}],
      }).success,
    ).toBe(false)
    expect(
      ContextManagementDiagnostics.safeParse({
        ...base,
        observed_rejections: [{}],
      }).success,
    ).toBe(false)
  })
})
