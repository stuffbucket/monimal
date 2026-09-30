import type {
  RuntimeModelFeature,
  RuntimeModelObservation,
  ModelInventoryEntry,
} from '@maximal/maximal-model-catalog'

import type {
  LocalModelCatalogSnapshot,
  ModelsListResponse,
} from './capabilities'
import {
  cloudProviderId,
  cloudProviderName,
} from './cloud-model-providers'

interface ProviderAccess {
  readonly available: boolean
  readonly enabled: boolean
}

function modelKind(type: string): string {
  const normalized = type.trim().toLowerCase()
  if (normalized === 'image') return 'Image models'
  if (normalized === 'video') return 'Video models'
  return normalized || 'Other models'
}

function runtimeEvidence(
  evidence: ModelsListResponse['models'][number]['evidence'],
): RuntimeModelObservation['evidence'] {
  if (evidence === undefined) return undefined
  const tier = (
    value: NonNullable<typeof evidence.pricing>['default'],
  ) => ({
    ...(value.cache_read_amount === undefined
      ? {}
      : { cacheReadAmount: value.cache_read_amount }),
    ...(value.cache_write_1h_amount === undefined
      ? {}
      : { cacheWrite1HourAmount: value.cache_write_1h_amount }),
    ...(value.cache_write_amount === undefined
      ? {}
      : { cacheWriteAmount: value.cache_write_amount }),
    ...(value.input_amount === undefined
      ? {}
      : { inputAmount: value.input_amount }),
    ...(value.max_input_tokens === undefined
      ? {}
      : { maxInputTokens: value.max_input_tokens }),
    ...(value.output_amount === undefined
      ? {}
      : { outputAmount: value.output_amount }),
    ...(value.reasoning_amount === undefined
      ? {}
      : { reasoningAmount: value.reasoning_amount }),
  })
  return {
    ...(evidence.access === undefined
      ? {}
      : {
          access: {
            ...(evidence.access.restricted_to === undefined
              ? {}
              : { restrictedTo: evidence.access.restricted_to }),
            ...(evidence.access.state === undefined
              ? {}
              : { state: evidence.access.state }),
            ...(evidence.access.terms === undefined
              ? {}
              : { terms: evidence.access.terms }),
          },
        }),
    ...(evidence.capabilities === undefined
      ? {}
      : {
          capabilities: {
            ...(evidence.capabilities.adaptive_thinking === undefined
              ? {}
              : {
                  adaptiveThinking:
                    evidence.capabilities.adaptive_thinking,
                }),
            ...(evidence.capabilities.dimensions === undefined
              ? {}
              : { dimensions: evidence.capabilities.dimensions }),
            ...(evidence.capabilities.max_thinking_budget === undefined
              ? {}
              : {
                  maxThinkingBudget:
                    evidence.capabilities.max_thinking_budget,
                }),
            ...(evidence.capabilities.min_thinking_budget === undefined
              ? {}
              : {
                  minThinkingBudget:
                    evidence.capabilities.min_thinking_budget,
                }),
            ...(evidence.capabilities.parallel_tool_calls === undefined
              ? {}
              : {
                  parallelToolCalls:
                    evidence.capabilities.parallel_tool_calls,
                }),
            ...(evidence.capabilities.reasoning_effort === undefined
              ? {}
              : {
                  reasoningEffort:
                    evidence.capabilities.reasoning_effort,
                }),
            ...(evidence.capabilities.streaming === undefined
              ? {}
              : { streaming: evidence.capabilities.streaming }),
            ...(evidence.capabilities.structured_outputs === undefined
              ? {}
              : {
                  structuredOutputs:
                    evidence.capabilities.structured_outputs,
                }),
            ...(evidence.capabilities.tool_calls === undefined
              ? {}
              : { toolCalls: evidence.capabilities.tool_calls }),
            ...(evidence.capabilities.vision === undefined
              ? {}
              : { vision: evidence.capabilities.vision }),
          },
        }),
    ...(evidence.endpoints === undefined
      ? {}
      : { endpoints: evidence.endpoints }),
    ...(evidence.lifecycle === undefined
      ? {}
      : {
          lifecycle: {
            ...(evidence.lifecycle.deprecation_date === undefined
              ? {}
              : {
                  deprecationDate:
                    evidence.lifecycle.deprecation_date,
                }),
            info: evidence.lifecycle.info,
            state: evidence.lifecycle.state,
            warnings: evidence.lifecycle.warnings,
          },
        }),
    ...(evidence.limits === undefined
      ? {}
      : {
          limits: {
            ...(evidence.limits.context_tokens === undefined
              ? {}
              : { contextTokens: evidence.limits.context_tokens }),
            ...(evidence.limits.embedding_max_inputs === undefined
              ? {}
              : {
                  embeddingMaxInputs:
                    evidence.limits.embedding_max_inputs,
                }),
            ...(evidence.limits.input_tokens === undefined
              ? {}
              : { inputTokens: evidence.limits.input_tokens }),
            ...(evidence.limits.non_streaming_output_tokens === undefined
              ? {}
              : {
                  nonStreamingOutputTokens:
                    evidence.limits.non_streaming_output_tokens,
                }),
            ...(evidence.limits.output_tokens === undefined
              ? {}
              : { outputTokens: evidence.limits.output_tokens }),
            ...(evidence.limits.vision === undefined
              ? {}
              : {
                  vision: {
                    ...(evidence.limits.vision.max_image_bytes === undefined
                      ? {}
                      : {
                          maxImageBytes:
                            evidence.limits.vision.max_image_bytes,
                        }),
                    ...(evidence.limits.vision.max_images === undefined
                      ? {}
                      : {
                          maxImages:
                            evidence.limits.vision.max_images,
                        }),
                    ...(evidence.limits.vision.supported_media_types
                        === undefined
                      ? {}
                      : {
                          supportedMediaTypes:
                            evidence.limits.vision.supported_media_types,
                        }),
                  },
                }),
          },
        }),
    ...(evidence.pricing === undefined
      ? {}
      : {
          pricing: {
            ...(evidence.pricing.auto_discount === undefined
              ? {}
              : { autoDiscount: evidence.pricing.auto_discount }),
            default: tier(evidence.pricing.default),
            ...(evidence.pricing.long_context === undefined
              ? {}
              : {
                  longContext: tier(evidence.pricing.long_context),
                }),
            unit: {
              currency: evidence.pricing.unit.currency,
              tokensPerBatch:
                evidence.pricing.unit.tokens_per_batch,
            },
          },
        }),
    ...(evidence.provider_details === undefined
      ? {}
      : {
          providerDetails: {
            kind: evidence.provider_details.kind,
            ...(evidence.provider_details.legacy_billing === undefined
              ? {}
              : {
                  legacyBilling: {
                    isPremium:
                      evidence.provider_details.legacy_billing
                        .is_premium,
                    multiplier:
                      evidence.provider_details.legacy_billing
                        .multiplier,
                  },
                }),
            ...(evidence.provider_details.picker_category === undefined
              ? {}
              : {
                  pickerCategory:
                    evidence.provider_details.picker_category,
                }),
            ...(evidence.provider_details.picker_price_category === undefined
              ? {}
              : {
                  pickerPriceCategory:
                    evidence.provider_details.picker_price_category,
                }),
            version: evidence.provider_details.version,
          },
        }),
    ...(evidence.selection === undefined
      ? {}
      : {
          selection: {
            ...(evidence.selection.default === undefined
              ? {}
              : { default: evidence.selection.default }),
            ...(evidence.selection.fallback === undefined
              ? {}
              : { fallback: evidence.selection.fallback }),
            ...(evidence.selection.preview === undefined
              ? {}
              : { preview: evidence.selection.preview }),
            ...(evidence.selection.selectable === undefined
              ? {}
              : { selectable: evidence.selection.selectable }),
          },
        }),
  }
}

export function isLocalModelProvider(provider: string): boolean {
  const normalized = provider.trim().toLowerCase()
  return normalized === 'local' || normalized === 'embedded'
}

export function cloudModelObservations(
  models: ModelsListResponse['models'],
  providers: ReadonlyMap<string, ProviderAccess>,
): RuntimeModelObservation[] {
  return models.map((model) => {
    const providerId = cloudProviderId(model)
    const provider = providers.get(providerId)
    const availability =
      provider === undefined || (provider.available && provider.enabled)
        ? 'available'
        : provider.available
          ? 'disabled'
          : 'unavailable'
    const evidence = runtimeEvidence(model.evidence)
    const evidenceLimits = evidence?.limits
    return {
      id: model.id,
      name: model.name,
      family: model.family,
      kind: modelKind(model.type),
      provider: {
        id: providerId,
        name: cloudProviderName(providerId, model.vendor),
      },
      location:
        model.location === 'local' || isLocalModelProvider(model.vendor)
          ? 'local'
          : 'cloud',
      availability,
      preview: model.preview,
      ...(evidence === undefined ? {} : { evidence }),
      ...(model.operations === undefined ? {} : { operations: model.operations }),
      ...(model.tokenizer == null ? {} : { tokenizer: model.tokenizer }),
      limits: {
        ...(evidenceLimits?.contextTokens !== undefined
          ? { contextTokens: evidenceLimits.contextTokens }
          : model.context_window_tokens === null
          ? {}
          : { contextTokens: model.context_window_tokens }),
        ...(evidenceLimits?.inputTokens === undefined
          ? {}
          : { inputTokens: evidenceLimits.inputTokens }),
        ...(evidenceLimits?.outputTokens !== undefined
          ? { outputTokens: evidenceLimits.outputTokens }
          : model.max_output_tokens === null
          ? {}
          : { outputTokens: model.max_output_tokens }),
        ...(evidenceLimits?.embeddingMaxInputs === undefined
          ? {}
          : {
              embeddingMaxInputs:
                evidenceLimits.embeddingMaxInputs,
            }),
        ...(evidenceLimits?.nonStreamingOutputTokens === undefined
          ? {}
          : {
              nonStreamingOutputTokens:
                evidenceLimits.nonStreamingOutputTokens,
            }),
        ...(evidenceLimits?.vision === undefined
          ? {}
          : { vision: evidenceLimits.vision }),
      },
      features: {
        vision: model.capabilities.vision,
        imageGeneration: model.capabilities.image_generation,
        videoGeneration: model.capabilities.video_generation,
        toolCalls: model.capabilities.tool_calls,
        streaming: model.capabilities.streaming,
        structuredOutput:
          evidence?.capabilities?.structuredOutputs,
        reasoning: model.capabilities.reasoning,
      },
    }
  })
}

export function localModelObservations(
  models: LocalModelCatalogSnapshot['models'],
): RuntimeModelObservation[] {
  return models.map((model) => ({
    id: model.modelId,
    instanceId: model.key,
    name: model.displayName,
    kind: 'Chat models',
    provider: { id: 'maximal-local', name: 'Maximal' },
    location: 'local',
    availability: model.state === 'ready' ? 'available' : 'unavailable',
    ...(model.operations === undefined ? {} : { operations: model.operations }),
    ...(model.tokenizer === undefined ? {} : { tokenizer: model.tokenizer }),
    limits: {
      contextTokens: model.context.contextWindow,
      ...(model.context.maxOutputTokens === undefined
        ? {}
        : { outputTokens: model.context.maxOutputTokens }),
    },
    features: {
      vision: model.capabilities.input.includes('image'),
      imageGeneration: model.capabilities.output.includes('image'),
      videoGeneration: model.capabilities.output.includes('video'),
      toolCalls: false,
      streaming: false,
      reasoning: false,
    },
  }))
}

export function modelFeatureEnabled(
  model: ModelInventoryEntry,
  feature: RuntimeModelFeature,
): boolean {
  const evidence = model.features[feature]
  return evidence.runtime ?? evidence.catalog === 'supported'
}
