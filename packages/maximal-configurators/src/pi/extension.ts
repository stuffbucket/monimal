import type { PiCatalogOptions } from "./catalog.ts"
import type { PiDiscoveryConfig } from "./config.ts"
import type { PiDiscoveredModel, PiProjection } from "./projection.ts"

import { discoverPiModels } from "./catalog.ts"
import { readPiDiscoveryConfig } from "./config.ts"

export interface PiCommandContext {
  readonly hasUI: boolean
  readonly ui: { notify(message: string, type: "info" | "error"): void }
}

/** Narrow structural port for Pi's documented config-form API; no bundled Pi registries. */
export interface MaximalPiHost {
  registerProvider(
    id: string,
    config: {
      baseUrl: string
      apiKey: string
      api: string
      models: Array<PiDiscoveredModel>
      refreshModels(context: {
        signal?: AbortSignal
      }): Promise<Array<PiDiscoveredModel>>
    },
  ): void
  unregisterProvider(id: string): void
  registerCommand(
    name: string,
    command: {
      description: string
      handler(args: string, context: PiCommandContext): Promise<void>
    },
  ): void
  on(event: "session_shutdown", handler: () => void): void
}

function summary(projection: PiProjection): string {
  const count = projection.providers.reduce(
    (total, provider) => total + provider.models.length,
    0,
  )
  return `Maximal: ${count} chat models across ${projection.providers.length} providers; ${projection.skipped.length} skipped.\n${projection.skipped.map((model) => `${JSON.stringify([model.source, model.provider, model.id])}: ${model.reason}`).join("\n")}`
}

function registerCommands(
  host: MaximalPiHost,
  refresh: () => Promise<void>,
  getLatest: () => PiProjection,
): void {
  host.registerCommand("maximal-refresh", {
    description:
      "Refresh Maximal's model inventory and reconcile its providers (metadata only).",
    handler: async (_args, context) => {
      try {
        await refresh()
        if (context.hasUI) context.ui.notify(summary(getLatest()), "info")
      } catch {
        if (context.hasUI)
          context.ui.notify(
            "Maximal refresh failed; managed providers were withdrawn. Run pnpm pi:models to diagnose the configured inventory.",
            "error",
          )
      }
    },
  })
  host.registerCommand("maximal-models", {
    description:
      "Explain which Maximal models are available or skipped; does not run inference.",
    handler: (_args, context) => {
      if (context.hasUI) context.ui.notify(summary(getLatest()), "info")
      return Promise.resolve()
    },
  })
}

function pinnedConfigReader(file: string): () => Promise<PiDiscoveryConfig> {
  let pinnedDestination: string | undefined
  return async () => {
    const config = await readPiDiscoveryConfig(file)
    // Refresh may change reviewed model metadata, never the credential destination.
    const destination = JSON.stringify([config.origin, config.apiKeyEnv])
    if (pinnedDestination !== undefined && pinnedDestination !== destination) {
      throw new Error(
        "Restart Pi after reviewing a changed origin or credential reference.",
      )
    }
    pinnedDestination = destination
    return config
  }
}

/** Exposed for contract tests and hosts that explicitly select their own config path. */
export async function installMaximalPi(
  host: MaximalPiHost,
  file: string,
  options: PiCatalogOptions = {},
): Promise<void> {
  const lifetime = new AbortController()
  const readConfig = pinnedConfigReader(file)
  const owned = new Set<string>()
  let generation = 0
  let latest: PiProjection = { providers: [], skipped: [] }
  host.on("session_shutdown", () => lifetime.abort())

  const load = async (signal?: AbortSignal) => {
    const config = await readConfig()
    const projection = await discoverPiModels(config, {
      ...options,
      signal: AbortSignal.any([
        lifetime.signal,
        ...(signal ? [signal] : []),
        ...(options.signal ? [options.signal] : []),
      ]),
    })
    return { config, projection }
  }
  const withdraw = () => {
    // Invalidate native callbacks already in flight, not only the registry rows.
    generation++
    for (const id of owned) host.unregisterProvider(id)
    owned.clear()
    latest = { providers: [], skipped: [] }
  }
  const refresh = async () => {
    const epoch = ++generation
    try {
      const { config, projection } = await load()
      if (epoch !== generation || lifetime.signal.aborted) return
      latest = projection
      const next = new Set(projection.providers.map(({ id }) => id))
      for (const id of owned)
        if (!next.has(id)) {
          host.unregisterProvider(id)
          owned.delete(id)
        }
      for (const provider of projection.providers) {
        const first = provider.models.at(0)
        if (!first) continue
        host.registerProvider(provider.id, {
          baseUrl: first.baseUrl,
          apiKey:
            config.apiKeyEnv === null ?
              "maximal-loopback"
            : `$${config.apiKeyEnv}`,
          api: first.api,
          models: provider.models,
          refreshModels: async ({ signal }) => {
            try {
              const current = await load(signal)
              if (
                epoch !== generation
                || signal?.aborted
                || lifetime.signal.aborted
              )
                return []
              latest = current.projection
              const matching = current.projection.providers.find(
                ({ id }) => id === provider.id,
              )
              return matching?.models ?? []
            } catch {
              if (
                epoch !== generation
                || signal?.aborted
                || lifetime.signal.aborted
                || options.signal?.aborted
              )
                return []
              withdraw()
              throw new Error(
                "Maximal discovery is unavailable. Managed providers were withdrawn; check the proxy and refresh explicitly.",
              )
            }
          },
        })
        owned.add(provider.id)
      }
    } catch {
      if (epoch === generation) withdraw()
      throw new Error(
        "Maximal discovery is unavailable. Check MAXIMAL_PI_CONFIG, the proxy, and reviewed metadata using pnpm pi:models.",
      )
    }
  }
  registerCommands(host, refresh, () => latest)
  await refresh()
}

/** Explicit loading is not installation, endpoint approval, or a change to existing Pi configuration. */
export default async function maximalPi(host: MaximalPiHost): Promise<void> {
  const file = process.env.MAXIMAL_PI_CONFIG
  if (!file)
    throw new Error(
      "Set MAXIMAL_PI_CONFIG to an explicitly reviewed Maximal Pi JSON config before loading this extension.",
    )
  await installMaximalPi(host, file)
}
