import type { Context } from "@deepseek-ai/cordis"
import type { ModelTopologyService } from "@maximal/maximal-model-contract"

import {
  LlmError,
  type GenerateOptions,
  type LlmModelInfo,
  type LlmResolvedModelInfo,
  type StreamChunk,
} from "@deepseek-ai/dsh-llm"
import { AnthropicAdapter, type SseEvent } from "@maximal/anthropic-provider"

import {
  resolveConfig,
  type Config as VllmConfig,
  type ResolvedConfig,
} from "./config.ts"
import { normalizeVllmEvents } from "./messages-events.ts"

export {
  Config,
  resolveConfig,
  type VllmInstanceConfig,
  type VllmModelConfig,
} from "./config.ts"
export const name = "maximal-runtime-vllm"
export const inject = ["llm", "modelTopology"]

export const vllmBackendDescriptor = Object.freeze({
  id: "vllm",
  transport: "http",
  operations: Object.freeze(["messages"] as const),
})

/** Only explicitly selected served IDs can receive requests; aliases are not variants. */
export class VllmAdapter extends AnthropicAdapter {
  readonly #models: ReadonlyMap<string, ReadonlySet<string>>

  constructor(config: ResolvedConfig, lifetime: AbortSignal) {
    super(config.messages, lifetime)
    this.#models = new Map(
      config.instances.map((instance) => [
        instance.provider,
        new Set(instance.models.map(({ id }) => id)),
      ]),
    )
  }

  override async listModels(
    provider: string,
  ): Promise<ReadonlyArray<LlmModelInfo>> {
    return (await super.listModels(provider)).filter(({ id }) =>
      this.#models.get(provider)?.has(id),
    )
  }

  override resolveModel(
    provider: string,
    model: string,
    signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo> {
    this.#assertSelected(provider, model)
    return super.resolveModel(provider, model, signal)
  }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.#assertSelected(options.provider, options.model)
    yield* super.stream(options)
  }

  protected override transformEvents(
    events: AsyncIterable<SseEvent>,
  ): AsyncIterable<SseEvent> {
    return normalizeVllmEvents(events)
  }

  #assertSelected(provider: string, model: string): void {
    if (!this.#models.get(provider)?.has(model)) {
      throw new LlmError(
        "vllm: model is not selected for this deployment",
        "INVALID_REQUEST",
      )
    }
  }
}

function cancelOnDispose(controller: AbortController): () => void {
  return () => controller.abort()
}

interface VllmContext extends Context {
  readonly modelTopology: ModelTopologyService
}

/** Connects existing deployments only. No installation, loading, or publication. */
export function apply(ctx: VllmContext, value: VllmConfig): void {
  const config = resolveConfig(value)
  const lifecycle = new AbortController()
  ctx.effect(
    () => cancelOnDispose(lifecycle),
    "cancel vLLM connection requests",
  )
  ctx.llm.registerAdapter(
    config.instances.map(({ provider }) => provider),
    new VllmAdapter(config, lifecycle.signal),
  )

  for (const instance of config.instances) {
    for (const model of instance.models) {
      ctx.effect(() => {
        const registration = ctx.modelTopology.registerTarget(
          {
            id: model.targetId,
            modelId: model.id,
            providerAccount: {
              provider: instance.provider,
              providerName: instance.displayName,
            },
            runner: {
              id: instance.runnerId,
              name: "vLLM",
              kind:
                instance.location === "device" ?
                  "external-local"
                : "remote-managed",
            },
            endpoint: { id: instance.endpointId, url: instance.baseURL },
            location: instance.location,
            adapters: [{ id: "vllm-messages", operation: "messages" }],
            // Configuration and discovery are not proof of loaded/healthy state.
            availability: { state: "unknown" },
            lifecycle: { state: "unknown" },
            evidence: {
              provenance: {
                source: "configuration",
                method: "declared",
                sourceId: model.targetId,
              },
              advertisedEndpoints: ["/v1/messages"],
              limits:
                model.contextWindow === undefined ?
                  {}
                : {
                    effective: { contextTokens: model.contextWindow },
                    effectiveProvenance: {
                      source: "configuration",
                      method: "declared",
                      sourceId: model.targetId,
                    },
                  },
            },
          },
          lifecycle.signal,
        )
        return () => registration.dispose()
      }, "register configured vLLM execution target")
    }
  }
}
