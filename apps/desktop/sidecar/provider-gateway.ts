import type {
  ProviderCompatibilityConfig,
  ProviderGatewayFactoryContext,
  ProviderHostConfigSnapshot,
} from "@maximal/maximal-core/provider-host"
import type {
  LocalModelControl,
  ModelTopologyService,
  ProviderDispatch,
  ProviderGateway,
  ProviderStatus,
  ProviderTopology,
  ProviderTopologyListener,
  ProviderUnsubscribe,
} from "@maximal/maximal-model-contract"

import {
  ProfileValidationError,
  dispatchSystemOneHttpProvider,
  startProviderPluginHost,
  type ActivationSnapshot,
  type ActivationSource,
  type ProviderPluginHostOptions,
  type ProviderPluginHostReconcileInput,
  type ProviderPluginHostReconcileResult,
  type SystemOneHttpProviderFetch,
} from "@maximal/maximal-models"

interface AnthropicCompatibilityInstance {
  readonly adjustInputTokens?: boolean
  readonly aliases: ReadonlyArray<string>
  readonly apiKey: string
  readonly authType: "authorization" | "x-api-key"
  readonly baseURL: string
  readonly displayName: string
  readonly models?: ProviderCompatibilityConfig["models"]
}

interface ReconciliableGateway extends ProviderGateway {
  reconcile(
    input?: ProviderPluginHostReconcileInput,
  ): Promise<ProviderPluginHostReconcileResult>
}

type StartHost = (
  options: ProviderPluginHostOptions,
) => Promise<ReconciliableGateway>

export interface ProviderPluginGatewayComposition {
  readonly defaultActivation?: ActivationSnapshot | ActivationSource
  readonly defaultProfileDirectory?: string
}

export interface ProviderPluginGatewayDependencies extends ProviderPluginGatewayComposition {
  readonly fetchImplementation?: SystemOneHttpProviderFetch
  readonly startHost?: StartHost
}

function profileDirectory(
  snapshot: ProviderHostConfigSnapshot,
  defaultProfileDirectory: string | undefined,
): string {
  return (
    snapshot.providerHost.profileDirectory
    ?? defaultProfileDirectory
    ?? snapshot.defaultProfileDirectory
  )
}

function compatibilityInstance(
  provider: string,
  config: ProviderCompatibilityConfig,
): AnthropicCompatibilityInstance {
  return {
    aliases: [provider],
    apiKey: config.apiKey ?? "",
    authType: config.authType ?? "x-api-key",
    baseURL: config.baseUrl ?? "",
    displayName: provider,
    ...(config.adjustInputTokens === undefined ?
      {}
    : { adjustInputTokens: config.adjustInputTokens }),
    ...(config.models === undefined ? {} : { models: config.models }),
  }
}

function pluginActivation(
  snapshot: ProviderHostConfigSnapshot,
): Record<string, { readonly enabled: boolean; readonly config?: unknown }> {
  return Object.fromEntries(
    Object.entries(snapshot.providerPlugins ?? {}).map(([id, entry]) => [
      id,
      {
        enabled: entry.enabled ?? true,
        ...(entry.config === undefined ? {} : { config: entry.config }),
      },
    ]),
  )
}

function compatibilityInstances(
  snapshot: ProviderHostConfigSnapshot,
): ReadonlyArray<AnthropicCompatibilityInstance> {
  const instances: Array<AnthropicCompatibilityInstance> = []
  for (const [provider, config] of Object.entries(snapshot.providers)) {
    if (config.enabled === false) continue
    const type = config.type ?? "anthropic"
    if (type === "systemone") continue
    if (type !== "anthropic") {
      throw new ProfileValidationError(
        "A configured legacy provider type is unsupported in provider plugin mode.",
      )
    }

    instances.push(compatibilityInstance(provider, config))
  }
  return instances
}

function systemOneProviderStatus(
  provider: string,
  config: ProviderCompatibilityConfig,
): ProviderStatus {
  if (config.enabled === false) {
    return {
      provider,
      state: "disabled",
      operations: [],
      diagnostics: [
        {
          code: "provider-disabled",
          provider,
          message: "The System One provider is disabled.",
        },
      ],
    }
  }
  if (!config.baseUrl?.trim() || !config.apiKey?.trim()) {
    return {
      provider,
      state: "unavailable",
      operations: [],
      diagnostics: [
        {
          code: "provider-unavailable",
          provider,
          message:
            "The System One provider requires an endpoint and credential.",
        },
      ],
    }
  }
  return {
    provider,
    state: "available",
    operations: ["models", "systemone"],
    diagnostics: [],
  }
}

function systemOneProviderStatuses(
  snapshot: ProviderHostConfigSnapshot,
): ReadonlyArray<ProviderStatus> {
  return Object.entries(snapshot.providers).flatMap(([provider, config]) =>
    config.type === "systemone" ?
      [systemOneProviderStatus(provider, config)]
    : [],
  )
}

/** Convert Core's validated, provider-agnostic snapshot to plugin activation data. */
export function buildProviderActivation(
  snapshot: ProviderHostConfigSnapshot,
): ActivationSnapshot {
  if (snapshot.configStatus.state === "error") {
    throw new ProfileValidationError(
      `Provider configuration could not be reloaded (${snapshot.configStatus.reason}).`,
    )
  }

  const activation = pluginActivation(snapshot)
  const explicitAnthropic = snapshot.providerPlugins?.anthropic
  if (
    explicitAnthropic?.enabled === false
    || explicitAnthropic?.config !== undefined
  ) {
    return activation
  }

  const instances = compatibilityInstances(snapshot)
  if (instances.length > 0) {
    activation.anthropic = {
      enabled: explicitAnthropic?.enabled ?? true,
      config: { instances },
    }
  }
  return activation
}

function isActivationSource(
  value: ActivationSnapshot | ActivationSource,
): value is ActivationSource {
  return "snapshot" in value && typeof value.snapshot === "function"
}

async function defaultActivationSnapshot(
  value: ActivationSnapshot | ActivationSource | undefined,
): Promise<ActivationSnapshot> {
  if (value === undefined) return {}
  return isActivationSource(value) ? await value.snapshot() : value
}

function activationSource(
  snapshot: ProviderHostConfigSnapshot,
  defaultActivation: ActivationSnapshot | ActivationSource | undefined,
): ActivationSource {
  const source =
    defaultActivation !== undefined && isActivationSource(defaultActivation) ?
      defaultActivation
    : undefined
  return {
    async snapshot() {
      return {
        ...(await defaultActivationSnapshot(defaultActivation)),
        ...buildProviderActivation(snapshot),
      }
    },
    ...(source?.subscribe === undefined ?
      {}
    : {
        subscribe: (listener) =>
          source.subscribe?.(listener) ?? (() => undefined),
      }),
  }
}

class ManagedProviderPluginGateway implements ProviderGateway {
  readonly #host: ReconciliableGateway
  readonly #source: ProviderGatewayFactoryContext["configSource"]
  readonly #composition: ProviderPluginGatewayDependencies
  readonly #unsubscribe: () => void
  readonly #unsubscribeHost: () => void
  readonly #listeners = new Set<ProviderTopologyListener>()
  #snapshot: ProviderHostConfigSnapshot
  #hostTopology: ProviderTopology = {
    diagnostics: [],
    revision: 0,
    statuses: [],
  }
  #topologyRevision = 0
  #disposed = false
  #disposePromise: Promise<void> | undefined
  #reconcileTail: Promise<void> = Promise.resolve()

  constructor(
    host: ReconciliableGateway,
    source: ProviderGatewayFactoryContext["configSource"],
    composition: ProviderPluginGatewayDependencies,
  ) {
    this.#host = host
    this.#source = source
    this.#composition = composition
    this.#snapshot = source.getSnapshot()
    this.#unsubscribe = source.subscribe((snapshot) => {
      this.#snapshot = snapshot
      this.#enqueue(snapshot)
      this.#publishTopology()
    })
    this.#unsubscribeHost = host.subscribe((topology) => {
      this.#hostTopology = topology
      this.#publishTopology()
    })
  }

  get localModels(): LocalModelControl | undefined {
    return this.#host.localModels
  }

  get modelTopology(): ModelTopologyService | undefined {
    return this.#host.modelTopology
  }

  async synchronize(initial: ProviderHostConfigSnapshot): Promise<void> {
    const current = this.#source.getSnapshot()
    if (current !== initial) this.#enqueue(current)
    await this.#reconcileTail
  }

  #enqueue(snapshot: ProviderHostConfigSnapshot): void {
    if (this.#disposed || snapshot.providerHost.mode !== "plugins") return
    const reconcile = async (): Promise<void> => {
      if (this.#disposed) return
      try {
        await this.#host.reconcile({
          activation: activationSource(
            snapshot,
            this.#composition.defaultActivation,
          ),
          profileDirectory: profileDirectory(
            snapshot,
            this.#composition.defaultProfileDirectory,
          ),
        })
      } catch {
        // ProviderPluginHost converts candidate failures into bounded topology diagnostics.
        // A throw here means the host is already disposing; retain its last state.
      }
    }
    this.#reconcileTail = this.#reconcileTail.then(reconcile, reconcile)
  }

  dispatch(input: ProviderDispatch): Promise<Response> {
    const config: ProviderCompatibilityConfig | undefined =
      Object.hasOwn(this.#snapshot.providers, input.provider) ?
        this.#snapshot.providers[input.provider]
      : undefined
    if (config?.type === "systemone") {
      const status = systemOneProviderStatus(input.provider, config)
      if (status.state !== "available") {
        return Promise.resolve(
          Response.json(
            {
              type: "error",
              error: {
                type: "api_error",
                message: `Provider '${input.provider}' is unavailable`,
              },
            },
            { status: 503 },
          ),
        )
      }
      return dispatchSystemOneHttpProvider(
        {
          apiKey: config.apiKey ?? "",
          authType: config.authType ?? "x-api-key",
          baseUrl: config.baseUrl ?? "",
        },
        input,
        this.#composition.fetchImplementation,
      )
    }
    return this.#host.dispatch(input)
  }

  getStatus(provider: string): ProviderStatus | undefined {
    return this.listStatuses().find((status) => status.provider === provider)
  }

  listStatuses(): ReadonlyArray<ProviderStatus> {
    const statuses = new Map(
      this.#host.listStatuses().map((status) => [status.provider, status]),
    )
    for (const status of systemOneProviderStatuses(this.#snapshot)) {
      statuses.set(status.provider, status)
    }
    return [...statuses.values()]
  }

  subscribe(listener: ProviderTopologyListener): ProviderUnsubscribe {
    this.#listeners.add(listener)
    listener(this.#topology())
    return () => this.#listeners.delete(listener)
  }

  #topology(): ProviderTopology {
    return {
      diagnostics: [
        ...this.#hostTopology.diagnostics,
        ...systemOneProviderStatuses(this.#snapshot).flatMap(
          (status) => status.diagnostics,
        ),
      ],
      revision: this.#topologyRevision,
      statuses: this.listStatuses(),
    }
  }

  #publishTopology(): void {
    this.#topologyRevision += 1
    const topology = this.#topology()
    for (const listener of this.#listeners) listener(topology)
  }

  dispose(): Promise<void> {
    if (this.#disposePromise !== undefined) return this.#disposePromise
    this.#disposed = true
    this.#disposePromise = (async () => {
      this.#unsubscribe()
      this.#unsubscribeHost()
      this.#listeners.clear()
      await this.#reconcileTail
      await this.#host.dispose()
    })()
    return this.#disposePromise
  }
}

/** Start the generic host and bind it to Core's live validated configuration. */
export async function createProviderPluginGateway(
  context: ProviderGatewayFactoryContext,
  dependencies: ProviderPluginGatewayDependencies = {},
): Promise<ProviderGateway> {
  const startHost: StartHost = dependencies.startHost ?? startProviderPluginHost
  const host = await startHost({
    activation: activationSource(
      context.config,
      dependencies.defaultActivation,
    ),
    profileDirectory: profileDirectory(
      context.config,
      dependencies.defaultProfileDirectory,
    ),
  })
  try {
    const gateway = new ManagedProviderPluginGateway(
      host,
      context.configSource,
      dependencies,
    )
    await gateway.synchronize(context.config)
    return gateway
  } catch (error) {
    await host.dispose()
    throw error
  }
}
