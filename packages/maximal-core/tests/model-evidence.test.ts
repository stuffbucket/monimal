import { ModelSummary } from "@maximal/maximal-core-contract/settings"
import { describe, expect, test } from "bun:test"

import {
  copilotModelEvidence,
  copilotModelOperations,
  modelEvidenceWire,
} from "~/lib/live/model-evidence"

import { copilotModelMetadataFixture } from "./fixtures/copilot-model-metadata"

describe("Copilot model evidence", () => {
  test("normalizes lifecycle, limits, capabilities, access, and tiered pricing", () => {
    const model = copilotModelMetadataFixture[0]
    const evidence = copilotModelEvidence(model)

    expect(evidence.lifecycle).toEqual({
      deprecationDate: "2026-10-02",
      info: model.info_messages ?? [],
      state: "pending-deprecation",
      warnings: model.warning_messages,
    })
    expect(evidence.limits).toEqual({
      contextTokens: 1_000_000,
      inputTokens: 936_000,
      nonStreamingOutputTokens: 16_000,
      outputTokens: 64_000,
      vision: {
        maxImageBytes: 3_145_728,
        maxImages: 1,
        supportedMediaTypes: ["image/jpeg", "image/png", "application/pdf"],
      },
    })
    expect(evidence.capabilities).toMatchObject({
      adaptiveThinking: true,
      maxThinkingBudget: 32_000,
      minThinkingBudget: 1024,
      parallelToolCalls: true,
      structuredOutputs: true,
      toolCalls: true,
      vision: true,
    })
    expect(evidence.access).toEqual({
      restrictedTo: ["pro_plus", "business", "enterprise", "max"],
      state: "enabled",
      terms: "Enable access to Claude Opus 4.7.",
    })
    expect(evidence.pricing).toEqual({
      default: {
        cacheReadAmount: 50,
        cacheWrite1HourAmount: 1000,
        cacheWriteAmount: 625,
        inputAmount: 500,
        maxInputTokens: 200_000,
        outputAmount: 2500,
      },
      longContext: {
        cacheReadAmount: 50,
        cacheWrite1HourAmount: 1000,
        cacheWriteAmount: 625,
        inputAmount: 500,
        maxInputTokens: 936_000,
        outputAmount: 2500,
      },
      unit: { currency: null, tokensPerBatch: 1_000_000 },
    })
    expect(copilotModelOperations(model)).toEqual([
      "messages",
      "chat-completions",
    ])
  })

  test("retains hidden legacy selection and zero-batch prices", () => {
    const evidence = copilotModelEvidence(copilotModelMetadataFixture[1])

    expect(evidence.selection).toEqual({
      default: false,
      fallback: false,
      preview: true,
      selectable: false,
    })
    expect(evidence.pricing).toEqual({
      default: {
        cacheReadAmount: 0,
        cacheWriteAmount: 0,
        inputAmount: 0,
        outputAmount: 0,
      },
      unit: { currency: null, tokensPerBatch: null },
    })
    expect(evidence.providerDetails).toMatchObject({
      legacyBilling: { isPremium: false, multiplier: 0 },
    })
  })

  test("retains default/fallback selection, response transports, and discount", () => {
    const model = copilotModelMetadataFixture[2]
    const evidence = copilotModelEvidence(model)

    expect(evidence.selection).toEqual({
      default: true,
      fallback: true,
      preview: false,
      selectable: true,
    })
    expect(evidence.endpoints).toEqual(["/responses", "ws:/responses"])
    expect(evidence.pricing?.autoDiscount).toBe(0.1)
    expect(copilotModelOperations(model)).toEqual(["responses"])
  })
})

describe("Copilot model evidence edge cases", () => {
  test("extracts valid dates from deprecation notices in either channel", () => {
    const model = copilotModelMetadataFixture[0]
    const warningOnly = copilotModelEvidence({
      ...model,
      info_messages: [],
      warning_messages: [
        {
          code: "model_pending_deprecation",
          message: "Planned deprecation date: 2026-10-02.",
        },
      ],
    })
    const invalidDate = copilotModelEvidence({
      ...model,
      info_messages: [
        {
          code: "model_pending_deprecation",
          message: "Planned deprecation date: 2026-99-99.",
        },
      ],
    })

    expect(warningOnly.lifecycle).toMatchObject({
      deprecationDate: "2026-10-02",
      state: "pending-deprecation",
    })
    expect(invalidDate.lifecycle).toMatchObject({
      state: "pending-deprecation",
    })
    expect(invalidDate.lifecycle?.deprecationDate).toBeUndefined()
  })

  test("keeps legacy flat and tiered pricing records distinct", () => {
    const model = copilotModelMetadataFixture[2]
    const legacy = copilotModelEvidence({
      ...model,
      billing: {
        ...model.billing,
        token_prices: {
          cache_read: 25,
          input: 250,
          output: 2000,
        },
      },
    })
    const tiered = copilotModelEvidence({
      ...model,
      billing: {
        ...model.billing,
        token_prices: {
          batch_size: 1_000_000,
          default: { output_price: 1400 },
          input: 999,
        },
      },
    })

    expect(legacy.pricing).toEqual({
      autoDiscount: 0.1,
      default: {
        cacheReadAmount: 25,
        inputAmount: 250,
        outputAmount: 2000,
      },
      unit: { currency: null, tokensPerBatch: 1_000_000 },
    })
    expect(tiered.pricing).toEqual({
      autoDiscount: 0.1,
      default: { outputAmount: 1400 },
      unit: { currency: null, tokensPerBatch: 1_000_000 },
    })
  })

  test("degrades malformed integer evidence independently to null", () => {
    const model = copilotModelMetadataFixture[0]
    const evidence = copilotModelEvidence({
      ...model,
      capabilities: {
        ...model.capabilities,
        limits: {
          ...model.capabilities.limits,
          max_context_window_tokens: -1,
          max_output_tokens: 1.5,
          vision: {
            max_prompt_image_size: -3,
            max_prompt_images: 2.5,
          },
        },
        supports: {
          ...model.capabilities.supports,
          max_thinking_budget: -1,
          min_thinking_budget: 1.5,
        },
      },
      billing: {
        ...model.billing,
        token_prices: {
          batch_size: 0,
          default: {
            input_price: 500,
            max_prompt_tokens: -1,
          },
        },
      },
    })
    const wire = modelEvidenceWire(evidence)

    expect(wire.limits).toMatchObject({
      context_tokens: null,
      output_tokens: null,
      vision: { max_image_bytes: null, max_images: null },
    })
    expect(wire.capabilities).toMatchObject({
      max_thinking_budget: null,
      min_thinking_budget: null,
    })
    expect(wire.pricing).toMatchObject({
      default: { max_input_tokens: null },
      unit: { tokens_per_batch: null },
    })
    expect(() =>
      ModelSummary.parse({
        id: model.id,
        name: model.name,
        vendor: model.vendor,
        family: model.capabilities.family,
        type: model.capabilities.type,
        preview: false,
        context_window_tokens: null,
        max_output_tokens: null,
        evidence: wire,
        capabilities: {
          vision: true,
          image_generation: false,
          video_generation: false,
          tool_calls: true,
          streaming: true,
          reasoning: true,
        },
      }),
    ).not.toThrow()
  })

  test("serializes normalized evidence through the stable Core wire schema", () => {
    const model = copilotModelMetadataFixture[0]
    const evidence = modelEvidenceWire(copilotModelEvidence(model))
    const parsed = ModelSummary.parse({
      id: model.id,
      name: model.name,
      vendor: model.vendor,
      family: model.capabilities.family,
      type: model.capabilities.type,
      preview: model.preview,
      context_window_tokens: 1_000_000,
      max_output_tokens: 64_000,
      operations: copilotModelOperations(model),
      tokenizer: { id: model.capabilities.tokenizer },
      evidence,
      capabilities: {
        vision: true,
        image_generation: false,
        video_generation: false,
        tool_calls: true,
        streaming: true,
        reasoning: true,
      },
    })

    expect(parsed.evidence?.lifecycle?.deprecation_date).toBe("2026-10-02")
    expect(parsed.evidence?.pricing?.unit).toEqual({
      currency: null,
      tokens_per_batch: 1_000_000,
    })
    expect(parsed.evidence?.provider_details).toMatchObject({
      kind: "github-copilot",
      picker_category: "powerful",
      picker_price_category: "high",
    })
  })
})
