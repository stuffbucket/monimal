import type { Context } from "hono"

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createHash, randomUUID } from "node:crypto"

import type { AnthropicMessagesPayload } from "~/lib/models/anthropic-types"
import type { Model } from "~/services/copilot/get-models"

import { getConfig, writeConfig } from "~/lib/config/config"
import { state } from "~/lib/runtime-state/state"

import {
  cacheModels,
  cacheVSCodeVersion,
  getRootSessionId,
  getUUID,
} from "../src/lib/platform/utils"

function catalogModel(
  id: string,
  modelPickerEnabled: boolean,
  type: string,
): Model {
  return {
    id,
    name: id,
    object: "model",
    vendor: "test",
    version: "1",
    preview: false,
    model_picker_enabled: modelPickerEnabled,
    supported_endpoints: [],
    capabilities: {
      family: "test",
      type,
      tokenizer: "test",
      object: "model_capabilities",
      limits: {},
      supports: {},
    },
  }
}

const jsonStyleUserId = JSON.stringify({
  device_id: "3f4a1b7c8d9e0f1234567890abcdef1234567890abcdef1234567890abcdef12",
  account_uuid: "",
  session_id: "2c4e1cf0-7a67-4d2e-9a4b-1d16d3f44752",
})

const legacyStyleUserId =
  "user_8b7e2c1d4f6a9b3c0d1e2f3456789abcdeffedcba9876543210fedcba1234567_account__session_7d0e2f61-4b5c-4a9d-8f11-2c3d4e5f6a7b"

const getLegacyUUID = (content: string): string => {
  const hash32 = createHash("sha256").update(content).digest("hex").slice(0, 32)
  return `${hash32.slice(0, 8)}-${hash32.slice(8, 12)}-${hash32.slice(12, 16)}-${hash32.slice(16, 20)}-${hash32.slice(20)}`
}

describe("cacheVSCodeVersion", () => {
  const originalConfig = structuredClone(getConfig())
  const originalVersion = state.vsCodeVersion

  beforeEach(() => {
    writeConfig({ ...originalConfig, editorVersion: undefined })
    state.vsCodeVersion = undefined
  })

  afterEach(() => {
    writeConfig(originalConfig)
    state.vsCodeVersion = originalVersion
  })

  test("uses the pinned fallback when no editor version is configured", async () => {
    await cacheVSCodeVersion()

    expect(state.vsCodeVersion).toBe("1.138.0")
  })
})

describe("cacheModels", () => {
  const originalModels = state.models

  beforeEach(() => {
    state.models = originalModels
  })

  afterEach(() => {
    state.models = originalModels
  })

  test("keeps picker models and hidden embedding models", async () => {
    await cacheModels(() =>
      Promise.resolve({
        object: "list",
        data: [
          catalogModel("picker-chat", true, "chat"),
          catalogModel("hidden-embedding", false, "embeddings"),
          catalogModel("hidden-chat", false, "chat"),
        ],
      }),
    )

    expect(state.models?.data.map((model) => model.id)).toEqual([
      "picker-chat",
      "hidden-embedding",
    ])
  })
})

test("getUUID returns a deterministic standards-compliant UUIDv4", () => {
  const uuid = getUUID("hello world")

  expect(uuid).toBe("b94d27b9-934d-4e08-a52e-52d7da7dabfa")
  expect(uuid).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  )
  expect(getUUID("hello world")).toBe(uuid)
  expect(getUUID("hello world!")).not.toBe(uuid)
})

test("prints randomUUID and deterministic UUID for comparison", () => {
  const input = "hello world"
  const random = randomUUID()
  const legacy = getLegacyUUID(input)
  const derived = getUUID(input)
  const derivedAgain = getUUID(input)

  console.info(`randomUUID(): ${random}`)
  console.info(`legacy getUUID(${JSON.stringify(input)}): ${legacy}`)
  console.info(`getUUID(${JSON.stringify(input)}): ${derived}`)
  console.info(`getUUID(${JSON.stringify(input)}) again: ${derivedAgain}`)

  expect(random).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  )
  expect(derived).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  )
  expect(legacy).toBe("b94d27b9-934d-3e08-a52e-52d7da7dabfa")
  expect(derived).toBe("b94d27b9-934d-4e08-a52e-52d7da7dabfa")
  expect(derivedAgain).toBe(derived)
  expect(legacy).not.toBe(derived)
  expect(random).not.toBe(derived)
})

test("getRootSessionId supports JSON-like user_id metadata", () => {
  const anthropicPayload = {
    model: "claude-3-5-sonnet",
    messages: [],
    max_tokens: 0,
    metadata: {
      user_id: jsonStyleUserId,
    },
  } as AnthropicMessagesPayload
  const context = {
    req: {
      header: (_name: string) => undefined,
    },
  } as unknown as Context

  expect(getRootSessionId(anthropicPayload, context)).toBe(
    getUUID("2c4e1cf0-7a67-4d2e-9a4b-1d16d3f44752"),
  )
})

test("getRootSessionId keeps legacy parsing before JSON fallback", () => {
  const anthropicPayload = {
    model: "claude-3-5-sonnet",
    messages: [],
    max_tokens: 0,
    metadata: {
      user_id: legacyStyleUserId,
    },
  } as AnthropicMessagesPayload
  const context = {
    req: {
      header: (_name: string) => undefined,
    },
  } as unknown as Context

  expect(getRootSessionId(anthropicPayload, context)).toBe(
    getUUID("7d0e2f61-4b5c-4a9d-8f11-2c3d4e5f6a7b"),
  )
})
