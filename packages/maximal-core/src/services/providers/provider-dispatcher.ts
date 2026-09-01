import type {
  ProviderDispatch,
  ProviderGateway,
  ProviderOperation,
} from "@stuffbucket/maximal-provider-contract"

import consola from "consola"

import type { AppConfig } from "~/lib/config/config"
import type { FrameUsage } from "~/lib/http/untrusted-frame"
import type {
  ProviderGatewayFactory,
  ProviderHostConfigSnapshot,
  ProviderHostConfigSource,
} from "~/lib/provider-host-types"
import type { UsageTokens } from "~/lib/token-usage"

import { getConfig } from "~/lib/config/config"
import {
  asRecord,
  readNestedUsage,
  readUsage,
} from "~/lib/http/untrusted-frame"
import { parseUserIdMetadata } from "~/lib/platform/utils"
import {
  createProviderTokenUsageRecorder,
  mergeAnthropicUsage,
  normalizeAnthropicUsage,
} from "~/lib/token-usage"

export interface ProviderDispatchOptions {
  legacy: () => Promise<Response>
  operation: ProviderOperation
  provider: string
  request: ProviderDispatch["request"]
  signal: ProviderDispatch["signal"]
}

export interface ProviderDispatcher {
  dispatch(options: ProviderDispatchOptions): Promise<Response>
  dispose(): Promise<void>
  ready(): Promise<void>
  requiresGithubAuth(): boolean
}

export interface CreateProviderDispatcherOptions {
  configSource?: ProviderHostConfigSource
  gateway?: ProviderGateway
  gatewayFactory?: ProviderGatewayFactory
  readConfig?: () => AppConfig
}

interface RequestUsageMetadata {
  model: string
  sessionId?: string
}

const unavailableResponse = (provider: string): Response =>
  Response.json(
    {
      type: "error",
      error: {
        type: "api_error",
        message: `Provider '${provider}' is unavailable`,
      },
    },
    { status: 503 },
  )

/**
 * The sole rollout switch between the reversible legacy proxy and an injected
 * provider host. Routes and auth middleware ask this boundary what to do; they
 * do not interpret providerHost.mode themselves.
 */
interface ManagedGateway {
  readonly gateway: ProviderGateway
  acquire(): () => void
  retire(): Promise<void>
}

function managedGateway(gateway: ProviderGateway): ManagedGateway {
  let leases = 0
  let retired = false
  let disposePromise: Promise<void> | undefined
  let resolveDrained: (() => void) | undefined

  const drained = (): Promise<void> => {
    if (leases === 0) return Promise.resolve()
    return new Promise<void>((resolve) => {
      resolveDrained = resolve
    })
  }

  return {
    gateway,
    acquire() {
      if (retired) throw new Error("The provider gateway generation is retired")
      leases += 1
      let released = false
      return () => {
        if (released) return
        released = true
        leases -= 1
        if (leases === 0) {
          resolveDrained?.()
          resolveDrained = undefined
        }
      }
    },
    retire() {
      disposePromise ??= (async () => {
        retired = true
        await drained()
        await gateway.dispose()
      })()
      return disposePromise
    },
  }
}

// The boundary intentionally keeps mode, activation, dispatch, and disposal together.
// eslint-disable-next-line max-lines-per-function
export function createProviderDispatcher(
  options: CreateProviderDispatcherOptions = {},
): ProviderDispatcher {
  const configSource = options.configSource
  const gatewayFactory = options.gatewayFactory
  const readConfig = options.readConfig ?? getConfig
  const staticGateway =
    options.gateway ? managedGateway(options.gateway) : undefined
  let factoryGateway: ManagedGateway | undefined
  let activation: Promise<void> | undefined
  let queuedActivation: ProviderHostConfigSnapshot | undefined
  let disposePromise: Promise<void> | undefined
  let disposed = false
  let generation = 0
  const transitionDisposals = new Set<Promise<void>>()

  const isLegacyMode = (): boolean =>
    configSource ?
      configSource.getSnapshot().providerHost.mode === "legacy"
    : (readConfig().providerHost?.mode ?? "legacy") === "legacy"

  const safeRetire = async (
    candidate: ManagedGateway,
    context: string,
  ): Promise<void> => {
    try {
      await candidate.retire()
    } catch (error) {
      consola.error(`Provider gateway ${context} disposal failed`, error)
    }
  }

  const trackRetirement = (candidate: ManagedGateway): void => {
    const retirement = safeRetire(candidate, "transition").finally(() =>
      transitionDisposals.delete(retirement),
    )
    transitionDisposals.add(retirement)
  }

  const activate = (
    snapshot: ProviderHostConfigSnapshot,
  ): Promise<void> | undefined => {
    if (
      disposed
      || staticGateway
      || factoryGateway
      || !gatewayFactory
      || !configSource
    ) {
      return activation
    }
    if (activation) {
      queuedActivation = snapshot
      return activation
    }
    const activationGeneration = generation
    const running = Promise.resolve().then(async () => {
      let candidate: ManagedGateway
      try {
        candidate = managedGateway(
          await gatewayFactory({
            config: snapshot,
            configSource,
          }),
        )
      } catch (error) {
        consola.error("Provider gateway activation failed", error)
        return
      }
      if (
        disposed
        || activationGeneration !== generation
        || configSource.getSnapshot().providerHost.mode !== "dsh"
      ) {
        await safeRetire(candidate, "stale activation")
        return
      }
      factoryGateway = candidate
      queuedActivation = undefined
    })
    activation = running.finally(() => {
      activation = undefined
      if (disposed || factoryGateway) {
        queuedActivation = undefined
        return
      }
      if (configSource.getSnapshot().providerHost.mode !== "dsh") {
        queuedActivation = undefined
        return
      }
      const nextSnapshot = queuedActivation
      queuedActivation = undefined
      if (nextSnapshot) return activate(nextSnapshot)
      if (activationGeneration !== generation) {
        return activate(configSource.getSnapshot())
      }
    })
    return activation
  }

  const onConfig = (snapshot: ProviderHostConfigSnapshot): void => {
    if (snapshot.providerHost.mode === "legacy") {
      generation += 1
      queuedActivation = undefined
      const previous = factoryGateway
      factoryGateway = undefined
      if (previous) trackRetirement(previous)
      return
    }
    void activate(snapshot)
  }

  const unsubscribeConfig = configSource?.subscribe(onConfig)
  const initialActivation =
    configSource?.getSnapshot().providerHost.mode === "dsh" ?
      activate(configSource.getSnapshot())
    : undefined

  return {
    async dispatch(dispatchOptions) {
      if (isLegacyMode()) {
        return await dispatchOptions.legacy()
      }

      const activeGateway = staticGateway ?? factoryGateway
      if (!activeGateway) {
        return unavailableResponse(dispatchOptions.provider)
      }

      const release = activeGateway.acquire()
      try {
        const metadataPromise =
          dispatchOptions.operation === "messages" ?
            readRequestUsageMetadata(dispatchOptions.request.clone())
          : undefined
        let response = await activeGateway.gateway.dispatch({
          operation: dispatchOptions.operation,
          provider: dispatchOptions.provider,
          request: dispatchOptions.request,
          signal: dispatchOptions.signal,
        })

        if (
          dispatchOptions.operation === "messages"
          && response.ok
          && response.body
          && metadataPromise
        ) {
          response = observeMessagesUsage(
            response,
            dispatchOptions.provider,
            metadataPromise,
          )
        }

        return holdGatewayLease(response, release)
      } catch (error) {
        release()
        throw error
      }
    },

    dispose() {
      disposePromise ??= (async () => {
        disposed = true
        generation += 1
        queuedActivation = undefined
        unsubscribeConfig?.()
        await activation
        const currentFactory = factoryGateway
        factoryGateway = undefined
        if (currentFactory) await safeRetire(currentFactory, "final")
        if (staticGateway) await safeRetire(staticGateway, "final")
        await Promise.all(transitionDisposals)
        await configSource?.dispose()
      })()
      return disposePromise
    },

    async ready() {
      await initialActivation
    },

    requiresGithubAuth() {
      return isLegacyMode()
    },
  }
}

function holdGatewayLease(response: Response, release: () => void): Response {
  const reader = response.body?.getReader()
  if (!reader) {
    release()
    return response
  }

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read()
        if (chunk.done) {
          release()
          controller.close()
          return
        }
        const value: unknown = chunk.value
        if (!(value instanceof Uint8Array)) {
          throw new TypeError("Provider response body emitted a non-byte chunk")
        }
        controller.enqueue(value)
      } catch (error) {
        release()
        controller.error(error)
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason)
      } finally {
        release()
      }
    },
  })

  return new Response(body, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  })
}

async function readRequestUsageMetadata(request: {
  json(): Promise<unknown>
}): Promise<RequestUsageMetadata> {
  try {
    const payload = asRecord(await request.json())
    const model = payload?.model
    const userId = asRecord(payload?.metadata)?.user_id
    return {
      model: typeof model === "string" ? model : "unknown",
      sessionId:
        typeof userId === "string" ?
          (parseUserIdMetadata(userId).sessionId ?? undefined)
        : undefined,
    }
  } catch {
    return { model: "unknown" }
  }
}

function observeMessagesUsage(
  response: Response,
  provider: string,
  metadataPromise: Promise<RequestUsageMetadata>,
): Response {
  const reader = response.body?.getReader()
  if (!reader) return response

  const isSse = (response.headers.get("content-type") ?? "").includes(
    "text/event-stream",
  )
  const observer = isSse ? new AnthropicSseUsageObserver() : undefined
  const jsonDecoder = isSse ? undefined : new TextDecoder()
  let jsonBody = ""

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read()
        if (!chunk.done) {
          const value: unknown = chunk.value
          if (!(value instanceof Uint8Array)) {
            throw new TypeError(
              "Provider response body emitted a non-byte chunk",
            )
          }
          if (observer) {
            observer.push(value)
          } else {
            jsonBody += jsonDecoder?.decode(value, { stream: true }) ?? ""
          }
          controller.enqueue(value)
          return
        }

        const usage =
          observer ?
            observer.finish()
          : readJsonUsage(jsonBody + (jsonDecoder?.decode() ?? ""))
        const metadata = await metadataPromise
        try {
          createProviderTokenUsageRecorder({
            endpoint: "provider_messages",
            model: metadata.model,
            providerName: provider,
            sessionId: metadata.sessionId,
          })(usage)
        } catch (error) {
          consola.warn("Failed to record provider token usage", error)
        }
        controller.close()
      } catch (error) {
        controller.error(error)
      }
    },

    async cancel(reason) {
      await reader.cancel(reason)
    },
  })

  return new Response(body, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  })
}

function readJsonUsage(body: string): UsageTokens {
  try {
    return normalizeAnthropicUsage(readUsage(JSON.parse(body)))
  } catch {
    return {}
  }
}

class AnthropicSseUsageObserver {
  private readonly decoder = new TextDecoder()
  private buffer = ""
  private usage: UsageTokens = {}

  push(chunk: Uint8Array): void {
    this.buffer += this.decoder.decode(chunk, { stream: true })
    this.drain(false)
  }

  finish(): UsageTokens {
    this.buffer += this.decoder.decode()
    this.drain(true)
    return this.usage
  }

  private drain(flush: boolean): void {
    const normalized = this.buffer.replaceAll("\r\n", "\n")
    const blocks = normalized.split("\n\n")
    this.buffer = flush ? "" : (blocks.pop() ?? "")

    for (const block of blocks) {
      this.readBlock(block)
    }
    if (flush && this.buffer.length > 0) {
      this.readBlock(this.buffer)
      this.buffer = ""
    }
  }

  private readBlock(block: string): void {
    const data = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
    if (!data || data === "[DONE]") return

    try {
      const event: unknown = JSON.parse(data)
      const type = asRecord(event)?.type
      let eventUsage: FrameUsage | undefined
      if (type === "message_start") {
        eventUsage = readNestedUsage(event, "message")
      } else if (type === "message_delta") {
        eventUsage = readUsage(event)
      }
      this.usage = mergeAnthropicUsage(
        this.usage,
        normalizeAnthropicUsage(eventUsage),
      )
    } catch {
      // Usage is ancillary. An opaque or malformed event still passes through
      // byte-for-byte and must not terminate the provider stream.
    }
  }
}
