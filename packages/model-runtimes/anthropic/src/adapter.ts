import {
  LlmAdapter,
  LlmError,
  ReasoningEffortId,
  type GenerateOptions,
  type LlmModelInfo,
  type LlmProviderInfo,
  type LlmResolvedModelInfo,
  type StreamChunk,
} from "@deepseek-ai/dsh-llm"

import type { ResolvedConfig, ResolvedInstanceConfig } from "./config.ts"

import { aborted, invalidRequest, protocolError } from "./errors.ts"
import {
  checkedFetch,
  createRequestScope,
  readModelsPage,
  requestHeaders,
} from "./http.ts"
import { parseSse } from "./sse.ts"
import { translate } from "./translate.ts"
import { configuredModel, serializeRequest } from "./wire.ts"

export class AnthropicAdapter extends LlmAdapter {
  readonly #instances = new Map<string, ResolvedInstanceConfig>()
  readonly #lifecycleSignal: AbortSignal

  constructor(config: ResolvedConfig, lifecycleSignal: AbortSignal) {
    super()
    this.#lifecycleSignal = lifecycleSignal
    for (const instance of config.instances) {
      for (const alias of instance.aliases) this.#instances.set(alias, instance)
    }
  }

  providerInfo(provider: string): LlmProviderInfo {
    const instance = this.#instance(provider)
    return { id: provider, name: instance.displayName }
  }

  async listModels(provider: string): Promise<ReadonlyArray<LlmModelInfo>> {
    const instance = this.#instance(provider)
    const discovered = await this.#listDiscoveredModels(instance)
    return discovered.map((model) => {
      const configured = configuredModel(instance, model.id)
      return {
        id: model.id,
        inputModalities: ["text"],
        name: configured?.name ?? model.name ?? model.id,
        provider,
        ...(configured?.description === undefined ?
          {}
        : { description: configured.description }),
      }
    })
  }

  async resolveModel(
    provider: string,
    model: string,
    signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo> {
    if (signal?.aborted === true || this.#lifecycleSignal.aborted) aborted()
    const instance = this.#instance(provider)
    const configured = configuredModel(instance, model)
    const contextWindow =
      configured?.contextWindow ?? instance.modelDefaults.contextWindow
    const maxTokens = configured?.maxTokens ?? instance.modelDefaults.maxTokens
    const defaultEffort =
      configured?.reasoningEffort ?? instance.modelDefaults.reasoningEffort
    return {
      id: model,
      inputModalities: ["text"],
      name: configured?.name ?? model,
      provider,
      ...(configured?.description === undefined ?
        {}
      : { description: configured.description }),
      ...(contextWindow === undefined ? {} : { context: { contextWindow } }),
      defaultMaxTokens: maxTokens,
      reasoning: {
        efforts: [
          { id: ReasoningEffortId("low"), name: "Low" },
          { id: ReasoningEffortId("medium"), name: "Medium" },
          { id: ReasoningEffortId("high"), name: "High" },
          { id: ReasoningEffortId("xhigh"), name: "Extra high" },
          { id: ReasoningEffortId("max"), name: "Maximum" },
        ],
        ...(defaultEffort === undefined ?
          {}
        : { defaultEffort: ReasoningEffortId(defaultEffort) }),
      },
    }
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const instance = this.#instance(options.provider)
    const scope = createRequestScope(this.#lifecycleSignal, options.signal)
    try {
      const response = await checkedFetch(
        new URL("/v1/messages", instance.baseURL),
        {
          body: JSON.stringify(serializeRequest(options, instance)),
          headers: {
            ...requestHeaders(instance, "text/event-stream"),
            "content-type": "application/json",
            ...(options.purpose === undefined ?
              {}
            : { "x-dsh-purpose": options.purpose }),
          },
          method: "POST",
        },
        scope,
      )
      const contentType = response.headers.get("content-type") ?? ""
      if (!contentType.toLowerCase().includes("text/event-stream")) {
        protocolError("response is not an SSE stream")
      }
      if (!response.body) protocolError("response body is missing")
      yield* translate(parseSse(response.body), instance)
    } catch (error) {
      rethrowAbort(scope.signal, error)
    } finally {
      scope.cleanup()
    }
  }

  async #listDiscoveredModels(instance: ResolvedInstanceConfig) {
    const scope = createRequestScope(this.#lifecycleSignal)
    const models = []
    const seen = new Set<string>()
    const cursors = new Set<string>()
    const url = new URL("/v1/models", instance.baseURL)
    try {
      while (true) {
        const response = await checkedFetch(
          url,
          {
            headers: requestHeaders(instance, "application/json"),
            method: "GET",
          },
          scope,
        )
        const page = await readModelsPage(response)
        for (const model of page.models) {
          if (seen.has(model.id)) continue
          seen.add(model.id)
          models.push(model)
        }
        if (!page.hasMore) return models
        if (!page.lastId || cursors.has(page.lastId)) {
          protocolError("models pagination did not advance")
        }
        cursors.add(page.lastId)
        url.searchParams.set("after_id", page.lastId)
      }
    } catch (error) {
      rethrowAbort(scope.signal, error)
    } finally {
      scope.cleanup()
    }
  }

  #instance(provider: string): ResolvedInstanceConfig {
    const instance = this.#instances.get(provider)
    if (!instance) invalidRequest("provider alias is not owned by this adapter")
    return instance
  }
}

function rethrowAbort(signal: AbortSignal, error: unknown): never {
  if (signal.aborted) {
    if (error instanceof LlmError && error.code === "ABORTED") throw error
    aborted(error)
  }
  throw error
}
