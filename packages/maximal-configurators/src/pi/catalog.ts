import { MaximalModelList } from "@maximal/maximal-core-contract/control"

import type { PiDiscoveryConfig } from "./config.ts"

import { proxyApiKey } from "./config.ts"
import { projectPiModels, type PiProjection } from "./projection.ts"

const MAX_CATALOG_BYTES = 2 * 1024 * 1024

async function catalogBody(
  response: Response,
  signal: AbortSignal,
): Promise<unknown> {
  if (!response.body) throw new Error("Maximal returned no model catalog.")
  const reader = response.body.getReader()
  const chunks: Array<Uint8Array> = []
  let size = 0
  const cancel = () => {
    void reader.cancel().catch(() => undefined)
  }
  signal.addEventListener("abort", cancel, { once: true })
  try {
    while (true) {
      signal.throwIfAborted()
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
      if (size > MAX_CATALOG_BYTES)
        throw new Error("Maximal's model catalog exceeds the client budget.")
      chunks.push(next.value)
    }
    signal.throwIfAborted()
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    const result: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    )
    return result
  } finally {
    signal.removeEventListener("abort", cancel)
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

export interface PiCatalogOptions {
  readonly environment?: NodeJS.ProcessEnv
  readonly fetchImplementation?: typeof fetch
  readonly signal?: AbortSignal
}

/** Metadata only. No inference, control RPC, adapter installation, or upstream credentials. */
export async function discoverPiModels(
  config: PiDiscoveryConfig,
  options: PiCatalogOptions = {},
): Promise<PiProjection> {
  const signal = AbortSignal.any([
    AbortSignal.timeout(5_000),
    ...(options.signal ? [options.signal] : []),
  ])
  const key = proxyApiKey(config, options.environment ?? process.env)
  let response: Response | undefined
  try {
    signal.throwIfAborted()
    response = await (options.fetchImplementation ?? fetch)(
      new URL("/v1/models?format=maximal", config.origin),
      {
        method: "GET",
        headers: {
          accept: "application/json",
          ...(key ? { authorization: `Bearer ${key}` } : {}),
        },
        redirect: "error",
        signal,
      },
    )
    if (!response.ok) throw new Error()
    const catalog = MaximalModelList.parse(await catalogBody(response, signal))
    if (catalog.data.length > 2048) throw new Error()
    return projectPiModels(catalog, config)
  } catch {
    if (signal.aborted)
      throw new Error("Maximal model discovery was cancelled or timed out.")
    // Fetch/schema errors may embed response bodies or credentials. Never echo them.
    throw new Error(
      "Maximal model discovery failed. Check the configured proxy origin, API key, and selector schemaVersion; existing static catalogs are not used as a fallback.",
    )
  } finally {
    if (response?.body && !response.body.locked)
      await response.body.cancel().catch(() => undefined)
  }
}
