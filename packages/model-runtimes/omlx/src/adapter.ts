import {
  LlmAdapter,
  LlmError,
  ProviderRequestId,
  attributionHeaders,
  type GenerateOptions,
  type LlmModelInfo,
  type LlmProviderInfo,
  type LlmResolvedModelInfo,
  type StreamChunk,
} from "@deepseek-ai/dsh-llm"

import {
  type Config,
  type ResolvedOmlxInstance,
  type ResolvedOmlxInstances,
  resolveConfig,
} from "./config.ts"
import { serializeRequest } from "./serialize.ts"
import { parseSse, translateSse } from "./sse.ts"

interface DiscoveredModel {
  readonly id: string
  readonly name: string
  readonly contextWindow?: number
  readonly maxTokens?: number
}

function httpErrorCode(status: number): string {
  if (status === 401 || status === 403) return "AUTH"
  if (status === 429) return "RATE_LIMIT"
  if (status === 400 || status === 404 || status === 422)
    return "INVALID_REQUEST"
  if (status >= 500) return "SERVER"
  return `HTTP_${status}`
}

function retryAfterMs(value: string | null): number | undefined {
  if (value === null) return undefined
  if (/^\d+$/.test(value)) {
    const delay = Number(value) * 1_000
    return Number.isFinite(delay) && delay > 0 ? delay : undefined
  }
  const delay = Date.parse(value) - Date.now()
  return Number.isFinite(delay) && delay > 0 ? delay : undefined
}

function cancelResponseBody(response: Response): void {
  if (response.body !== null) {
    void response.body
      .cancel("omlx rejected HTTP response")
      .catch(() => undefined)
  }
}

function requestId(
  headers: Headers,
): ReturnType<typeof ProviderRequestId> | undefined {
  const value = headers.get("request-id") ?? headers.get("x-request-id")
  return value === null || value.length === 0 ?
      undefined
    : ProviderRequestId(value)
}

function positiveInteger(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && (value as number) > 0 ?
      (value as number)
    : undefined
}

function discoveredModelName(model: Record<string, unknown>): string {
  if (typeof model.display_name === "string" && model.display_name.length > 0) {
    return model.display_name
  }
  if (typeof model.name === "string" && model.name.length > 0) {
    return model.name
  }
  return model.id as string
}

function parseModels(value: unknown): Array<DiscoveredModel> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new LlmError("omlx: malformed models response", "MALFORMED_RESPONSE")
  }
  const data = (value as Record<string, unknown>).data
  if (!Array.isArray(data)) {
    throw new LlmError("omlx: malformed models response", "MALFORMED_RESPONSE")
  }

  const seen = new Set<string>()
  return data.map((entry) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new LlmError("omlx: malformed model entry", "MALFORMED_RESPONSE")
    }
    const model = entry as Record<string, unknown>
    if (
      typeof model.id !== "string"
      || model.id.length === 0
      || seen.has(model.id)
    ) {
      throw new LlmError(
        "omlx: malformed or duplicate model id",
        "MALFORMED_RESPONSE",
      )
    }
    seen.add(model.id)
    const name = discoveredModelName(model)
    const contextWindow = positiveInteger(
      model.context_window ?? model.contextWindow ?? model.max_input_tokens,
    )
    const maxTokens = positiveInteger(model.max_tokens ?? model.maxTokens)
    return {
      id: model.id,
      name,
      ...(contextWindow === undefined ? {} : { contextWindow }),
      ...(maxTokens === undefined ? {} : { maxTokens }),
    }
  })
}

export class OmlxAdapter extends LlmAdapter {
  readonly #instances: ResolvedOmlxInstances
  readonly #controllers = new Set<AbortController>()
  #disposed = false

  constructor(config: Config) {
    super()
    this.#instances = resolveConfig(config)
  }

  providerInfo(provider: string): LlmProviderInfo {
    this.#instance(provider)
    return { id: provider, name: `oMLX (${provider})` }
  }

  async listModels(provider: string): Promise<ReadonlyArray<LlmModelInfo>> {
    const instance = this.#instance(provider)
    const models = await this.#discover(instance)
    return models.map((model) => ({
      provider,
      id: model.id,
      name: model.name,
      inputModalities: ["text"],
    }))
  }

  async resolveModel(
    provider: string,
    model: string,
    signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo> {
    const instance = this.#instance(provider)
    const models = await this.#discover(instance, signal)
    const discovered = models.find((entry) => entry.id === model)
    const contextWindow =
      discovered?.contextWindow ?? instance.modelDefaults?.contextWindow
    const maxTokens = discovered?.maxTokens ?? instance.modelDefaults?.maxTokens
    return {
      provider,
      id: model,
      name: discovered?.name ?? model,
      inputModalities: ["text"],
      ...(contextWindow === undefined ? {} : { context: { contextWindow } }),
      ...(maxTokens === undefined ? {} : { defaultMaxTokens: maxTokens }),
    }
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const instance = this.#instance(options.provider)
    const controller = this.#controller()
    const signal =
      options.signal === undefined ?
        controller.signal
      : AbortSignal.any([options.signal, controller.signal])
    const iterator = this.#request(options, instance, signal)[
      Symbol.asyncIterator
    ]()
    let exhausted = false

    try {
      while (true) {
        const result = await iterator.next()
        if (result.done) {
          exhausted = true
          return
        }
        yield result.value
      }
    } catch (error) {
      if (options.signal?.aborted) {
        throw new LlmError("omlx: request aborted by caller", "ABORTED", {
          cause: error,
        })
      }
      if (this.#disposed || controller.signal.aborted) {
        throw new LlmError(
          "omlx: request stopped during adapter disposal",
          "ABORTED",
          {
            cause: error,
          },
        )
      }
      if (error instanceof LlmError) throw error
      throw new LlmError(
        `omlx: request to ${instance.baseUrl} failed`,
        "TRANSPORT",
        {
          cause: error,
        },
      )
    } finally {
      controller.abort("omlx stream consumer stopped")
      this.#controllers.delete(controller)
      if (!exhausted) {
        try {
          await iterator.return(undefined)
        } catch {
          // Aborting a partially consumed response is expected transport teardown.
        }
      }
    }
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    for (const controller of this.#controllers) {
      controller.abort("omlx adapter disposed")
    }
    this.#controllers.clear()
  }

  #instance(provider: string): ResolvedOmlxInstance {
    if (this.#disposed) {
      throw new LlmError("omlx: adapter is disposed", "ADAPTER_DISPOSED")
    }
    const instance = this.#instances.get(provider)
    if (instance === undefined) {
      throw new LlmError(
        `omlx: unknown instance alias "${provider}"`,
        "NO_ADAPTER",
      )
    }
    return instance
  }

  #controller(): AbortController {
    const controller = new AbortController()
    this.#controllers.add(controller)
    return controller
  }

  #headers(
    accept: string,
    instance: ResolvedOmlxInstance,
  ): Record<string, string> {
    return {
      authorization: `Bearer ${instance.apiKey}`,
      accept,
      ...attributionHeaders(),
    }
  }

  async #discover(
    instance: ResolvedOmlxInstance,
    callerSignal?: AbortSignal,
  ): Promise<Array<DiscoveredModel>> {
    const controller = this.#controller()
    const signal =
      callerSignal === undefined ?
        controller.signal
      : AbortSignal.any([callerSignal, controller.signal])
    try {
      let response: Response
      try {
        response = await fetch(`${instance.baseUrl}/v1/models`, {
          method: "GET",
          headers: this.#headers("application/json", instance),
          signal,
        })
      } catch (error) {
        if (callerSignal?.aborted) {
          throw new LlmError(
            "omlx: model discovery aborted by caller",
            "ABORTED",
            {
              cause: error,
            },
          )
        }
        if (this.#disposed || controller.signal.aborted) {
          throw new LlmError(
            "omlx: model discovery stopped during adapter disposal",
            "ABORTED",
            { cause: error },
          )
        }
        throw new LlmError(
          `omlx: model discovery from ${instance.baseUrl} failed`,
          "TRANSPORT",
          {
            cause: error,
          },
        )
      }
      if (!response.ok) {
        cancelResponseBody(response)
        throw this.#httpError(response, "model discovery")
      }
      let payload: unknown
      try {
        payload = await response.json()
      } catch (error) {
        throw new LlmError(
          "omlx: models response was not valid JSON",
          "MALFORMED_RESPONSE",
          {
            cause: error,
          },
        )
      }
      return parseModels(payload)
    } finally {
      controller.abort("omlx model discovery complete")
      this.#controllers.delete(controller)
    }
  }

  async *#request(
    options: GenerateOptions,
    instance: ResolvedOmlxInstance,
    signal: AbortSignal,
  ): AsyncGenerator<StreamChunk> {
    const body = JSON.stringify(serializeRequest(options, instance))
    let response: Response
    try {
      response = await fetch(`${instance.baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          ...this.#headers("text/event-stream", instance),
          "content-type": "application/json",
        },
        body,
        signal,
      })
    } catch (error) {
      if (signal.aborted) throw error
      throw new LlmError(
        `omlx: request to ${instance.baseUrl} failed`,
        "TRANSPORT",
        {
          cause: error,
        },
      )
    }
    if (!response.ok) {
      cancelResponseBody(response)
      throw this.#httpError(response, "message request")
    }
    if (response.body === null) {
      throw new LlmError(
        "omlx: Messages endpoint returned no response body",
        "EMPTY_RESPONSE",
      )
    }
    yield* translateSse(parseSse(response.body))
  }

  #httpError(response: Response, operation: string): LlmError {
    const delay = retryAfterMs(response.headers.get("retry-after"))
    const id = requestId(response.headers)
    return new LlmError(
      `omlx: ${operation} failed with HTTP ${response.status}`,
      httpErrorCode(response.status),
      {
        status: response.status,
        ...(delay === undefined ? {} : { providerRetryAfterMs: delay }),
        ...(id === undefined ? {} : { requestId: id }),
      },
    )
  }
}
