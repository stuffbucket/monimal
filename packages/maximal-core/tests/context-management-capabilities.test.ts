import { afterEach, beforeEach, describe, expect, test } from "bun:test"

import { cacheModels } from "~/lib/platform/utils"
import { allCacheMetrics } from "~/lib/runtime-state/cache"
import { state } from "~/lib/runtime-state/state"
import {
  clearContextManagementRejections,
  contextManagementStrategy,
  hasContextManagementRejection,
  listContextManagementRejections,
  MAX_CONTEXT_MANAGEMENT_REJECTIONS,
  recordContextManagementRejection,
} from "~/services/copilot/context-management-capabilities"

const originalModels = state.models

beforeEach(() => {
  clearContextManagementRejections()
  state.models = originalModels
})
afterEach(() => {
  clearContextManagementRejections()
  state.models = originalModels
})

describe("context-management rejection capabilities", () => {
  test("registers the bounded rejection cache for runtime diagnostics", () => {
    expect(
      allCacheMetrics().find(
        (metrics) => metrics.name === "context_management_rejections",
      ),
    ).toMatchObject({
      kind: "lru",
      max: MAX_CONTEXT_MANAGEMENT_REJECTIONS,
    })
  })

  test("normalizes object key order and preserves parameter differences", () => {
    const first = contextManagementStrategy({
      mode: "auto",
      edits: [
        {
          type: "clear_tool_uses_20250919",
          trigger: { value: 1000, type: "input_tokens" },
        },
      ],
    })
    const reordered = contextManagementStrategy({
      edits: [
        {
          trigger: { type: "input_tokens", value: 1000 },
          type: "clear_tool_uses_20250919",
        },
      ],
      mode: "auto",
    })
    const different = contextManagementStrategy({
      mode: "auto",
      edits: [
        {
          type: "clear_tool_uses_20250919",
          trigger: { value: 2000, type: "input_tokens" },
        },
      ],
    })

    expect(first).toBe(reordered)
    expect(first).not.toBe(different)
  })

  test("preserves arrays and nested nulls in the normalized strategy", () => {
    expect(contextManagementStrategy({ edits: ["clear"], trigger: null })).toBe(
      '{"edits":["clear"],"trigger":null}',
    )
  })

  test("rejects non-object and array strategies", () => {
    for (const value of [undefined, null, "auto", 1, true, []]) {
      expect(contextManagementStrategy(value)).toBeNull()
    }
  })

  test("caches rejections without expiry and isolates every scope dimension", () => {
    const scope = {
      account: "account-a",
      host: "https://api.example.test",
      model: "claude-test",
      strategy: '{"edits":[]}',
    }
    recordContextManagementRejection(scope, 0)

    expect(hasContextManagementRejection(scope)).toBe(true)
    for (const changed of [
      { ...scope, account: "account-b" },
      { ...scope, host: "https://other.example.test" },
      { ...scope, model: "claude-other" },
      { ...scope, strategy: '{"edits":[{"type":"other"}]}' },
    ]) {
      expect(hasContextManagementRejection(changed)).toBe(false)
    }
    expect(listContextManagementRejections()).toEqual([
      { ...scope, rejectedAt: "1970-01-01T00:00:00.000Z" },
    ])
  })

  test("scope framing prevents concatenation collisions", () => {
    const recorded = {
      account: "ab",
      host: "c",
      model: "model",
      strategy: "strategy",
    }
    recordContextManagementRejection(recorded, 0)

    expect(
      hasContextManagementRejection({
        ...recorded,
        account: "a",
        host: "bc",
      }),
    ).toBe(false)
  })

  test("clear removes recorded rejections", () => {
    const scope = {
      account: "account",
      host: "host",
      model: "model",
      strategy: "strategy",
    }
    recordContextManagementRejection(scope, 0)

    clearContextManagementRejections()

    expect(hasContextManagementRejection(scope)).toBe(false)
    expect(listContextManagementRejections()).toEqual([])
  })

  test("evicts the least-recent rejection at the central cache bound", () => {
    const first = {
      account: "account",
      host: "host",
      model: "model-0",
      strategy: "strategy",
    }
    for (let index = 0; index <= MAX_CONTEXT_MANAGEMENT_REJECTIONS; index++) {
      recordContextManagementRejection({
        ...first,
        model: `model-${index}`,
      })
    }

    expect(listContextManagementRejections()).toHaveLength(
      MAX_CONTEXT_MANAGEMENT_REJECTIONS,
    )
    expect(hasContextManagementRejection(first)).toBe(false)
    expect(
      hasContextManagementRejection({
        ...first,
        model: `model-${MAX_CONTEXT_MANAGEMENT_REJECTIONS}`,
      }),
    ).toBe(true)
  })

  test("successful model refresh clears observed rejections", async () => {
    const scope = {
      account: "account",
      host: "host",
      model: "model",
      strategy: "strategy",
    }
    recordContextManagementRejection(scope)

    await cacheModels(() =>
      Promise.resolve({
        object: "list",
        data: [],
      }),
    )

    expect(hasContextManagementRejection(scope)).toBe(false)
    expect(listContextManagementRejections()).toEqual([])
  })
})
