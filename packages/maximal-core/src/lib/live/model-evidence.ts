import type { ModelSummary } from "@maximal/maximal-core-contract/settings"
import type {
  ModelAccessEvidence,
  ModelOperation,
  ModelRuntimeCapabilities,
  ModelRuntimeEvidence,
  ModelRuntimeLimits,
  ModelSelectionEvidence,
  ModelTokenPriceTier,
  ModelTokenPricing,
} from "@maximal/maximal-model-contract"

import type {
  Model,
  TokenPrices,
  TokenPriceTier,
} from "~/services/copilot/get-models"

type ModelEvidenceWire = NonNullable<ModelSummary["evidence"]>

function optional<Key extends string, Value>(
  key: Key,
  value: Value | undefined,
): Partial<Record<Key, Value>> {
  return value === undefined ? {} : ({ [key]: value } as Record<Key, Value>)
}

function optionalInteger<Key extends string>(
  key: Key,
  value: unknown,
): Partial<Record<Key, number | null>> {
  if (value === undefined) return {}
  const normalized =
    typeof value === "number" && Number.isInteger(value) && value >= 0 ?
      value
    : null
  return { [key]: normalized } as Record<Key, number | null>
}

function optionalNumber<Key extends string>(
  key: Key,
  value: unknown,
): Partial<Record<Key, number | null>> {
  if (value === undefined) return {}
  const normalized =
    typeof value === "number" && Number.isFinite(value) ? value : null
  return { [key]: normalized } as Record<Key, number | null>
}

function completionOperations(): Array<ModelOperation> {
  return ["messages", "chat-completions", "responses"]
}

export function copilotModelOperations(model: Model): Array<ModelOperation> {
  const operations = new Set<ModelOperation>()
  for (const endpoint of model.supported_endpoints ?? []) {
    const normalized = endpoint.trim().toLowerCase()
    if (normalized === "/v1/messages") operations.add("messages")
    if (
      normalized === "/chat/completions"
      || normalized === "/v1/chat/completions"
    ) {
      operations.add("chat-completions")
    }
    if (
      normalized === "/responses"
      || normalized === "/v1/responses"
      || normalized === "ws:/responses"
    ) {
      operations.add("responses")
    }
    if (normalized === "/embeddings" || normalized === "/v1/embeddings") {
      operations.add("embeddings")
    }
  }
  if (operations.size > 0) return [...operations]
  return model.capabilities.type === "embeddings" ?
      ["embeddings"]
    : completionOperations()
}

function validIsoDate(value: string): string | undefined {
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.valueOf())) return undefined
  return date.toISOString().startsWith(value) ? value : undefined
}

function deprecationDate(model: Model): string | undefined {
  const diagnostics = [
    ...(model.info_messages ?? []),
    ...(model.warning_messages ?? []),
  ]
  for (const diagnostic of diagnostics) {
    if (!diagnostic.code.toLowerCase().includes("deprecat")) continue
    const value = /\b(\d{4}-\d{2}-\d{2})\b/u.exec(diagnostic.message)?.[1]
    if (value !== undefined) return validIsoDate(value)
  }
  return undefined
}

function lifecycleState(
  model: Model,
): NonNullable<ModelRuntimeEvidence["lifecycle"]>["state"] {
  const diagnostics = [
    ...(model.info_messages ?? []),
    ...(model.warning_messages ?? []),
  ]
  const codes = new Set(diagnostics.map(({ code }) => code.toLowerCase()))
  const modelDeprecationCode = [...codes].some(
    (code) => code.includes("deprecat") && !code.startsWith("client_"),
  )
  if (codes.has("model_deprecated")) return "deprecated"
  if (modelDeprecationCode || deprecationDate(model) !== undefined) {
    return "pending-deprecation"
  }
  return "active"
}

function copilotAccess(model: Model): ModelAccessEvidence | undefined {
  if (
    model.policy === undefined
    && model.billing?.restricted_to === undefined
  ) {
    return undefined
  }
  return {
    ...optional("restrictedTo", model.billing?.restricted_to),
    ...optional("state", model.policy?.state),
    ...optional("terms", model.policy?.terms),
  }
}

function copilotCapabilities(model: Model): ModelRuntimeCapabilities {
  const supports = model.capabilities.supports
  return {
    ...optional("adaptiveThinking", supports.adaptive_thinking),
    ...optional("dimensions", supports.dimensions),
    ...optionalInteger("maxThinkingBudget", supports.max_thinking_budget),
    ...optionalInteger("minThinkingBudget", supports.min_thinking_budget),
    ...optional("parallelToolCalls", supports.parallel_tool_calls),
    ...optional("reasoningEffort", supports.reasoning_effort),
    ...optional("streaming", supports.streaming),
    ...optional("structuredOutputs", supports.structured_outputs),
    ...optional("toolCalls", supports.tool_calls),
    ...optional("vision", supports.vision),
  }
}

function copilotLimits(model: Model): ModelRuntimeLimits {
  const limits = model.capabilities.limits
  const vision = limits.vision
  return {
    ...optionalInteger("contextTokens", limits.max_context_window_tokens),
    ...optionalInteger("embeddingMaxInputs", limits.max_inputs),
    ...optionalInteger("inputTokens", limits.max_prompt_tokens),
    ...optionalInteger(
      "nonStreamingOutputTokens",
      limits.max_non_streaming_output_tokens,
    ),
    ...optionalInteger("outputTokens", limits.max_output_tokens),
    ...(vision === undefined ?
      {}
    : {
        vision: {
          ...optionalInteger("maxImageBytes", vision.max_prompt_image_size),
          ...optionalInteger("maxImages", vision.max_prompt_images),
          ...optional("supportedMediaTypes", vision.supported_media_types),
        },
      }),
  }
}

function tokenPriceTier(tier: TokenPriceTier): ModelTokenPriceTier {
  return {
    ...optionalNumber("cacheReadAmount", tier.cache_read_price),
    ...optionalNumber("cacheWrite1HourAmount", tier.cache_write_1h_price),
    ...optionalNumber("cacheWriteAmount", tier.cache_write_price),
    ...optionalNumber("inputAmount", tier.input_price),
    ...optionalInteger("maxInputTokens", tier.max_prompt_tokens),
    ...optionalNumber("outputAmount", tier.output_price),
  }
}

function hasLegacyRates(prices: TokenPrices): boolean {
  if (prices.default !== undefined) return false
  return Object.entries(prices).some(
    ([key, value]) =>
      typeof value === "number"
      && (["cache_read", "cache_write", "input", "output"].includes(key)
        || key.endsWith("_price")),
  )
}

function legacyTokenPriceTier(prices: TokenPrices): ModelTokenPriceTier {
  return {
    ...optionalNumber("cacheReadAmount", prices.cache_read),
    ...optionalNumber("cacheWriteAmount", prices.cache_write),
    ...optionalNumber("inputAmount", prices.input),
    ...optionalNumber("outputAmount", prices.output),
  }
}

function positiveBatchSize(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ?
      value
    : null
}

function copilotPricing(model: Model): ModelTokenPricing | undefined {
  const prices = model.billing?.token_prices
  if (prices === undefined) return undefined
  if (prices.default !== undefined) {
    return {
      ...optionalNumber("autoDiscount", model.billing?.auto_discount),
      default: tokenPriceTier(prices.default),
      ...(prices.long_context === undefined ?
        {}
      : { longContext: tokenPriceTier(prices.long_context) }),
      unit: {
        currency: null,
        tokensPerBatch: positiveBatchSize(prices.batch_size),
      },
    }
  }
  if (!hasLegacyRates(prices)) return undefined
  return {
    ...optionalNumber("autoDiscount", model.billing?.auto_discount),
    default: legacyTokenPriceTier(prices),
    unit: { currency: null, tokensPerBatch: 1_000_000 },
  }
}

function copilotSelection(model: Model): ModelSelectionEvidence {
  return {
    ...optional("default", model.is_chat_default),
    ...optional("fallback", model.is_chat_fallback),
    preview: model.preview,
    selectable: model.model_picker_enabled,
  }
}

export function copilotModelEvidence(model: Model): ModelRuntimeEvidence {
  const date = deprecationDate(model)
  const billing = model.billing
  const hasLegacyBilling =
    billing?.is_premium !== undefined || billing?.multiplier !== undefined
  return {
    ...optional("access", copilotAccess(model)),
    capabilities: copilotCapabilities(model),
    ...optional("endpoints", model.supported_endpoints),
    lifecycle: {
      ...optional("deprecationDate", date),
      info: model.info_messages ?? [],
      state: lifecycleState(model),
      warnings: model.warning_messages ?? [],
    },
    limits: copilotLimits(model),
    ...optional("pricing", copilotPricing(model)),
    providerDetails: {
      kind: "github-copilot",
      ...(hasLegacyBilling ?
        {
          legacyBilling: {
            isPremium:
              typeof billing.is_premium === "boolean" ?
                billing.is_premium
              : null,
            multiplier:
              (
                typeof billing.multiplier === "number"
                && Number.isFinite(billing.multiplier)
              ) ?
                billing.multiplier
              : null,
          },
        }
      : {}),
      ...optional("pickerCategory", model.model_picker_category),
      ...optional("pickerPriceCategory", model.model_picker_price_category),
      version: model.version,
    },
    selection: copilotSelection(model),
  }
}

function accessWire(
  value: ModelAccessEvidence,
): NonNullable<ModelEvidenceWire["access"]> {
  return {
    ...optional(
      "restricted_to",
      value.restrictedTo === undefined ? undefined : [...value.restrictedTo],
    ),
    ...optional("state", value.state),
    ...optional("terms", value.terms),
  }
}

function capabilitiesWire(
  value: ModelRuntimeCapabilities,
): NonNullable<ModelEvidenceWire["capabilities"]> {
  return {
    ...optional("adaptive_thinking", value.adaptiveThinking),
    ...optional("dimensions", value.dimensions),
    ...optional("max_thinking_budget", value.maxThinkingBudget),
    ...optional("min_thinking_budget", value.minThinkingBudget),
    ...optional("parallel_tool_calls", value.parallelToolCalls),
    ...optional(
      "reasoning_effort",
      value.reasoningEffort === undefined ?
        undefined
      : [...value.reasoningEffort],
    ),
    ...optional("streaming", value.streaming),
    ...optional("structured_outputs", value.structuredOutputs),
    ...optional("tool_calls", value.toolCalls),
    ...optional("vision", value.vision),
  }
}

function limitsWire(
  value: ModelRuntimeLimits,
): NonNullable<ModelEvidenceWire["limits"]> {
  return {
    ...optional("context_tokens", value.contextTokens),
    ...optional("embedding_max_inputs", value.embeddingMaxInputs),
    ...optional("input_tokens", value.inputTokens),
    ...optional("non_streaming_output_tokens", value.nonStreamingOutputTokens),
    ...optional("output_tokens", value.outputTokens),
    ...(value.vision === undefined ?
      {}
    : {
        vision: {
          ...optional("max_image_bytes", value.vision.maxImageBytes),
          ...optional("max_images", value.vision.maxImages),
          ...optional(
            "supported_media_types",
            value.vision.supportedMediaTypes === undefined ?
              undefined
            : [...value.vision.supportedMediaTypes],
          ),
        },
      }),
  }
}

function priceTierWire(
  value: ModelTokenPriceTier,
): NonNullable<ModelEvidenceWire["pricing"]>["default"] {
  return {
    ...optional("cache_read_amount", value.cacheReadAmount),
    ...optional("cache_write_1h_amount", value.cacheWrite1HourAmount),
    ...optional("cache_write_amount", value.cacheWriteAmount),
    ...optional("input_amount", value.inputAmount),
    ...optional("max_input_tokens", value.maxInputTokens),
    ...optional("output_amount", value.outputAmount),
    ...optional("reasoning_amount", value.reasoningAmount),
  }
}

function pricingWire(
  value: ModelTokenPricing,
): NonNullable<ModelEvidenceWire["pricing"]> {
  return {
    ...optional("auto_discount", value.autoDiscount),
    default: priceTierWire(value.default),
    ...(value.longContext === undefined ?
      {}
    : { long_context: priceTierWire(value.longContext) }),
    unit: {
      currency: value.unit.currency,
      tokens_per_batch: value.unit.tokensPerBatch,
    },
  }
}

function providerDetailsWire(
  value: NonNullable<ModelRuntimeEvidence["providerDetails"]>,
): NonNullable<ModelEvidenceWire["provider_details"]> {
  return {
    kind: value.kind,
    ...(value.legacyBilling === undefined ?
      {}
    : {
        legacy_billing: {
          is_premium: value.legacyBilling.isPremium,
          multiplier: value.legacyBilling.multiplier,
        },
      }),
    ...optional("picker_category", value.pickerCategory),
    ...optional("picker_price_category", value.pickerPriceCategory),
    version: value.version,
  }
}

function selectionWire(
  value: ModelSelectionEvidence,
): NonNullable<ModelEvidenceWire["selection"]> {
  return {
    ...optional("default", value.default),
    ...optional("fallback", value.fallback),
    ...optional("preview", value.preview),
    ...optional("selectable", value.selectable),
  }
}

export function modelEvidenceWire(
  evidence: ModelRuntimeEvidence,
): ModelEvidenceWire {
  return {
    ...(evidence.access === undefined ?
      {}
    : { access: accessWire(evidence.access) }),
    ...(evidence.capabilities === undefined ?
      {}
    : { capabilities: capabilitiesWire(evidence.capabilities) }),
    ...optional(
      "endpoints",
      evidence.endpoints === undefined ? undefined : [...evidence.endpoints],
    ),
    ...(evidence.lifecycle === undefined ?
      {}
    : {
        lifecycle: {
          ...optional("deprecation_date", evidence.lifecycle.deprecationDate),
          info: [...evidence.lifecycle.info],
          state: evidence.lifecycle.state,
          warnings: [...evidence.lifecycle.warnings],
        },
      }),
    ...(evidence.limits === undefined ?
      {}
    : { limits: limitsWire(evidence.limits) }),
    ...(evidence.pricing === undefined ?
      {}
    : { pricing: pricingWire(evidence.pricing) }),
    ...(evidence.providerDetails === undefined ?
      {}
    : {
        provider_details: providerDetailsWire(evidence.providerDetails),
      }),
    ...(evidence.selection === undefined ?
      {}
    : { selection: selectionWire(evidence.selection) }),
  }
}
