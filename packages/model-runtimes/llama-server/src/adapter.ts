import {
  LlmAdapter,
  LlmError,
  attributionHeaders,
  type GenerateOptions,
  type LlmModelInfo,
  type LlmProviderInfo,
  type LlmResolvedModelInfo,
  type StreamChunk,
} from "@deepseek-ai/dsh-llm"

import type { ClaimedModel } from "./claims.ts"
import type { ResolvedConfig } from "./config.ts"

import { serializeOpenAiRequest } from "./openai.ts"
import { parseOpenAiSse, translateOpenAiSse } from "./sse.ts"
import {
  LlamaServerProcessError,
  LlamaServerSupervisor,
  type SupervisorConfig,
} from "./supervisor.ts"

export interface LlamaServerTransport {
  request(
    path: string,
    init: RequestInit,
    signal: AbortSignal,
  ): Promise<Response>
  dispose(): Promise<void>
}

export interface AdapterDependencies {
  readonly createTransport?: (
    assignment: ClaimedModel,
    config: SupervisorConfig,
  ) => LlamaServerTransport
}

interface Assignment {
  readonly claimed: ClaimedModel
  readonly transport: LlamaServerTransport
}

function httpErrorCode(status: number): string {
  if (status === 429) return "RATE_LIMIT"
  if (status === 400 || status === 404 || status === 422) {
    return "INVALID_REQUEST"
  }
  if (status >= 500) return "SERVER"
  return `HTTP_${status}`
}

function retryAfterMs(value: string | null): number | undefined {
  if (value === null) return undefined
  if (/^\d+$/u.test(value)) {
    const milliseconds = Number(value) * 1_000
    return Number.isFinite(milliseconds) && milliseconds > 0 ?
        milliseconds
      : undefined
  }
  const milliseconds = Date.parse(value) - Date.now()
  return Number.isFinite(milliseconds) && milliseconds > 0 ?
      milliseconds
    : undefined
}

function cancelBody(response: Response): void {
  if (response.body !== null) {
    void response.body
      .cancel("llama-server rejected HTTP response")
      .catch(() => undefined)
  }
}

export class LlamaServerAdapter extends LlmAdapter implements AsyncDisposable {
  readonly #assignments = new Map<string, Assignment>()
  readonly #controllers = new Set<AbortController>()
  #disposed = false
  #disposePromise: Promise<void> | undefined

  constructor(
    config: ResolvedConfig,
    assignments: ReadonlyArray<ClaimedModel>,
    dependencies: AdapterDependencies = {},
  ) {
    super()
    const supervisorConfig: SupervisorConfig = {
      executablePath: config.executablePath,
      serverArguments: config.serverArguments,
      maxRestarts: config.maxRestarts,
      startupTimeoutMs: config.startupTimeoutMs,
      shutdownTimeoutMs: config.shutdownTimeoutMs,
    }
    const createTransport =
      dependencies.createTransport
      ?? ((assignment: ClaimedModel, value: SupervisorConfig) =>
        new LlamaServerSupervisor(assignment.lease, value))
    for (const claimed of assignments) {
      this.#assignments.set(claimed.provider, {
        claimed,
        transport: createTransport(claimed, supervisorConfig),
      })
    }
  }

  providerInfo(provider: string): LlmProviderInfo {
    const assignment = this.#assignment(provider)
    return {
      id: provider,
      name: `llama.cpp (${assignment.claimed.lease.manifest.displayName})`,
    }
  }

  async listModels(provider: string): Promise<ReadonlyArray<LlmModelInfo>> {
    await Promise.resolve()
    const manifest = this.#assignment(provider).claimed.lease.manifest
    return [
      {
        provider,
        id: manifest.modelId,
        name: manifest.displayName,
        inputModalities: ["text"],
      },
    ]
  }

  async resolveModel(
    provider: string,
    model: string,
    signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo> {
    await Promise.resolve()
    if (signal?.aborted === true) throw signal.reason
    const manifest = this.#assignment(provider).claimed.lease.manifest
    if (model !== manifest.modelId) {
      throw new LlmError(
        `llama-server: provider "${provider}" is assigned to model "${manifest.modelId}"`,
        "INVALID_REQUEST",
      )
    }
    return {
      provider,
      id: manifest.modelId,
      name: manifest.displayName,
      inputModalities: ["text"],
      context: { contextWindow: manifest.context.contextWindow },
      ...(manifest.context.maxOutputTokens === undefined ?
        {}
      : {
          defaultMaxTokens: manifest.context.maxOutputTokens,
        }),
    }
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const assignment = this.#assignment(options.provider)
    const modelId = assignment.claimed.lease.manifest.modelId
    if (options.model !== modelId) {
      throw new LlmError(
        `llama-server: provider "${options.provider}" is assigned to model "${modelId}"`,
        "INVALID_REQUEST",
      )
    }
    const controller = new AbortController()
    this.#controllers.add(controller)
    const signal =
      options.signal === undefined ?
        controller.signal
      : AbortSignal.any([options.signal, controller.signal])
    let response: Response
    try {
      response = await assignment.transport.request(
        "/v1/chat/completions",
        {
          method: "POST",
          headers: {
            accept: "text/event-stream",
            "content-type": "application/json",
            ...attributionHeaders(),
          },
          body: JSON.stringify(serializeOpenAiRequest(options, modelId)),
        },
        signal,
      )
      if (!response.ok) {
        cancelBody(response)
        throw this.#httpError(response)
      }
      if (response.body === null) {
        throw new LlmError(
          "llama-server: chat completions endpoint returned no response body",
          "EMPTY_RESPONSE",
        )
      }
      yield* translateOpenAiSse(parseOpenAiSse(response.body))
    } catch (error) {
      if (options.signal?.aborted === true) {
        throw new LlmError("llama-server: request aborted by caller", "ABORTED")
      }
      if (this.#disposed || controller.signal.aborted) {
        throw new LlmError(
          "llama-server: request stopped during adapter disposal",
          "ABORTED",
        )
      }
      if (error instanceof LlmError) throw error
      if (error instanceof LlamaServerProcessError) {
        throw new LlmError(error.message, "TRANSPORT")
      }
      throw new LlmError(
        "llama-server: private server request failed",
        "TRANSPORT",
      )
    } finally {
      controller.abort("llama-server stream consumer stopped")
      this.#controllers.delete(controller)
    }
  }

  dispose(): Promise<void> {
    this.#disposePromise ??= this.#dispose()
    return this.#disposePromise
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.dispose()
  }

  #assignment(provider: string): Assignment {
    if (this.#disposed) {
      throw new LlmError(
        "llama-server: adapter is disposed",
        "ADAPTER_DISPOSED",
      )
    }
    const assignment = this.#assignments.get(provider)
    if (assignment === undefined) {
      throw new LlmError(
        `llama-server: unknown model assignment "${provider}"`,
        "NO_ADAPTER",
      )
    }
    return assignment
  }

  #httpError(response: Response): LlmError {
    const delay = retryAfterMs(response.headers.get("retry-after"))
    return new LlmError(
      `llama-server: chat completion failed with HTTP ${response.status}`,
      httpErrorCode(response.status),
      {
        status: response.status,
        ...(delay === undefined ? {} : { providerRetryAfterMs: delay }),
      },
    )
  }

  async #dispose(): Promise<void> {
    if (this.#disposed) return
    this.#disposed = true
    for (const controller of this.#controllers) {
      controller.abort("llama-server adapter disposed")
    }
    this.#controllers.clear()
    await Promise.allSettled(
      [...this.#assignments.values()].map(({ transport }) =>
        transport.dispose(),
      ),
    )
    this.#assignments.clear()
  }
}
