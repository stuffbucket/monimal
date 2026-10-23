import type {
  DiscoveredModelEndpoint,
  DiscoveredModel,
  ModelExecutionTarget,
} from "@maximal/maximal-model-contract"

import { OLLAMA_DEFAULT_PORT } from "@maximal/maximal-provider-decision-model"

export interface DiscoveryProbe {
  readonly url: string
  readonly scope: "device" | "lan"
  readonly targets: ReadonlyArray<ModelExecutionTarget>
}
interface ProbeOptions {
  readonly signal: AbortSignal
  readonly fetchImplementation: typeof fetch
  readonly now: () => number
}

/** Protocol defaults are probes, not runtime identity or sharing permission. */
export const MODEL_DISCOVERY_DEFAULT_PORTS = Object.freeze([
  OLLAMA_DEFAULT_PORT,
  8000,
  1234,
  8080,
])

function containsDisplayControls(id: string): boolean {
  return Array.from(id).some((character) => {
    const code = character.codePointAt(0) ?? 0
    return (
      code < 32
      || (code >= 127 && code <= 159)
      || (code >= 8234 && code <= 8238)
      || (code >= 8294 && code <= 8297)
    )
  })
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

async function boundedJson(
  response: Response,
  signal: AbortSignal,
): Promise<unknown> {
  if (!response.body) throw new Error("Missing catalogue")
  const reader = response.body.getReader()
  const abort = () => {
    void reader.cancel().catch(() => undefined)
  }
  signal.addEventListener("abort", abort, { once: true })
  let size = 0
  const chunks: Array<Uint8Array> = []
  try {
    while (true) {
      signal.throwIfAborted()
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
      if (size > 1024 * 1024)
        throw new Error("Catalogue exceeds discovery limit")
      chunks.push(next.value)
    }
    signal.throwIfAborted()
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    const result: unknown = JSON.parse(new TextDecoder().decode(bytes))
    return result
  } finally {
    signal.removeEventListener("abort", abort)
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

function servedModels(
  entries: ReadonlyArray<Record<string, unknown>>,
  protocol: "ollama" | "openai-compatible",
  targets: ReadonlyArray<ModelExecutionTarget>,
): ReadonlyArray<DiscoveredModel> {
  const models = entries
    .flatMap((entry) => {
      const id = protocol === "ollama" ? (entry.model ?? entry.name) : entry.id
      if (
        typeof id !== "string"
        || id.length === 0
        || id.length > 512
        || containsDisplayControls(id)
      )
        return []
      const matchingTargets = targets.filter(({ modelId }) => modelId === id)
      const target =
        matchingTargets.length === 1 ? matchingTargets[0] : undefined
      return [
        {
          id,
          name: id,
          executionLocation: target?.location ?? ("unknown" as const),
          ...(target ? { configuredTargetId: target.id } : {}),
        },
      ]
    })
    .slice(0, 128)
  return models.filter(
    (model, index) => models.findIndex(({ id }) => id === model.id) === index,
  )
}

function catalogue(
  payload: unknown,
  protocol: "ollama" | "openai-compatible",
  targets: ReadonlyArray<ModelExecutionTarget>,
) {
  const listField = protocol === "ollama" ? "models" : "data"
  if (!record(payload) || !Array.isArray(payload[listField])) return undefined
  const rawEntries: Array<unknown> = payload[listField]
  const entries = rawEntries.filter(record)
  const models = servedModels(entries, protocol, targets)
  if (rawEntries.length > 0 && models.length === 0) return undefined
  let runtime: string | null = null
  if (protocol === "ollama") runtime = "Ollama (reported)"
  else if (entries.some((entry) => entry.owned_by === "vllm"))
    runtime = "vLLM (reported)"
  return { models, runtime }
}

export async function probeModels(
  probe: DiscoveryProbe,
  options: ProbeOptions,
): Promise<DiscoveredModelEndpoint | undefined> {
  const { signal, fetchImplementation, now } = options
  const url = new URL(probe.url)
  let authenticationRequired = false
  for (const [path, protocol] of [
    ["/api/tags", "ollama"],
    ["/v1/models", "openai-compatible"],
  ] as const) {
    let response: Response | undefined
    try {
      response = await fetchImplementation(new URL(path, url), {
        method: "GET",
        headers: { accept: "application/json" },
        redirect: "error",
        signal,
      })
      if (response.status === 401 || response.status === 403)
        authenticationRequired = true
      if (!response.ok) {
        await response.body?.cancel()
        continue
      }
      const metadata = catalogue(
        await boundedJson(response, signal),
        protocol,
        probe.targets,
      )
      if (!metadata) continue
      return {
        id: url.origin,
        url: url.origin,
        address: url.hostname,
        scope: probe.scope,
        protocol,
        ...metadata,
        observedAt: new Date(now()).toISOString(),
        authenticationRequired: false,
        reachability: "responded",
        isolation: "unverified",
      }
    } catch {
      // Failure and untrusted response content never escape as diagnostic text.
      if (signal.aborted) return undefined
    } finally {
      if (response?.body && !response.body.locked)
        await response.body.cancel().catch(() => undefined)
    }
  }
  if (!authenticationRequired || signal.aborted) return undefined
  return {
    id: url.origin,
    url: url.origin,
    address: url.hostname,
    scope: probe.scope,
    protocol: "unverified",
    runtime: null,
    observedAt: new Date(now()).toISOString(),
    authenticationRequired: true,
    reachability: "responded",
    isolation: "unverified",
    models: [],
  }
}
