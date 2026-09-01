import type {
  ProviderCompatibilityConfig,
  ProviderGatewayFactoryContext,
  ProviderHostConfigSnapshot,
} from "@stuffbucket/maximal-core/provider-host"
import type {
  ProviderDispatch,
  ProviderGateway,
  ProviderStatus,
  ProviderTopologyListener,
  ProviderUnsubscribe,
} from "@stuffbucket/maximal-provider-contract"

import {
  ProfileValidationError,
  startDshHost,
  type ActivationSnapshot,
  type ActivationSource,
  type DshHostOptions,
  type DshHostReconcileInput,
  type DshHostReconcileResult,
} from "@stuffbucket/maximal-dsh-host"

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
  reconcile(input?: DshHostReconcileInput): Promise<DshHostReconcileResult>
}

type StartHost = (options: DshHostOptions) => Promise<ReconciliableGateway>

export interface DshProviderGatewayDependencies {
  readonly startHost?: StartHost
}

function profileDirectory(snapshot: ProviderHostConfigSnapshot): string {
  return (
    snapshot.providerHost.profileDirectory ?? snapshot.defaultProfileDirectory
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
    if ((config.type ?? "anthropic") !== "anthropic") {
      throw new ProfileValidationError(
        "A configured legacy provider type is unsupported in DSH mode.",
      )
    }
    instances.push(compatibilityInstance(provider, config))
  }
  return instances
}

/** Convert Core's validated, provider-agnostic snapshot to DSH activation data. */
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

function activationSource(
  snapshot: ProviderHostConfigSnapshot,
): ActivationSource {
  return { snapshot: () => buildProviderActivation(snapshot) }
}

class ManagedDshGateway implements ProviderGateway {
  readonly #host: ReconciliableGateway
  readonly #source: ProviderGatewayFactoryContext["configSource"]
  readonly #unsubscribe: () => void
  #disposed = false
  #disposePromise: Promise<void> | undefined
  #reconcileTail: Promise<void> = Promise.resolve()

  constructor(
    host: ReconciliableGateway,
    source: ProviderGatewayFactoryContext["configSource"],
  ) {
    this.#host = host
    this.#source = source
    this.#unsubscribe = source.subscribe((snapshot) => {
      this.#enqueue(snapshot)
    })
  }

  async synchronize(initial: ProviderHostConfigSnapshot): Promise<void> {
    const current = this.#source.getSnapshot()
    if (current !== initial) this.#enqueue(current)
    await this.#reconcileTail
  }

  #enqueue(snapshot: ProviderHostConfigSnapshot): void {
    if (this.#disposed || snapshot.providerHost.mode !== "dsh") return
    const reconcile = async (): Promise<void> => {
      if (this.#disposed) return
      try {
        await this.#host.reconcile({
          activation: activationSource(snapshot),
          profileDirectory: profileDirectory(snapshot),
        })
      } catch {
        // DshHost converts candidate failures into bounded topology diagnostics.
        // A throw here means the host is already disposing; retain its last state.
      }
    }
    this.#reconcileTail = this.#reconcileTail.then(reconcile, reconcile)
  }

  dispatch(input: ProviderDispatch): Promise<Response> {
    return this.#host.dispatch(input)
  }

  getStatus(provider: string): ProviderStatus | undefined {
    return this.#host.getStatus(provider)
  }

  listStatuses(): ReadonlyArray<ProviderStatus> {
    return this.#host.listStatuses()
  }

  subscribe(listener: ProviderTopologyListener): ProviderUnsubscribe {
    return this.#host.subscribe(listener)
  }

  dispose(): Promise<void> {
    if (this.#disposePromise !== undefined) return this.#disposePromise
    this.#disposed = true
    this.#disposePromise = (async () => {
      this.#unsubscribe()
      await this.#reconcileTail
      await this.#host.dispose()
    })()
    return this.#disposePromise
  }
}

/** Start the generic host and bind it to Core's live validated configuration. */
export async function createDshProviderGateway(
  context: ProviderGatewayFactoryContext,
  dependencies: DshProviderGatewayDependencies = {},
): Promise<ProviderGateway> {
  const startHost: StartHost = dependencies.startHost ?? startDshHost
  const host = await startHost({
    activation: activationSource(context.config),
    profileDirectory: profileDirectory(context.config),
  })
  try {
    const gateway = new ManagedDshGateway(host, context.configSource)
    await gateway.synchronize(context.config)
    return gateway
  } catch (error) {
    await host.dispose()
    throw error
  }
}
