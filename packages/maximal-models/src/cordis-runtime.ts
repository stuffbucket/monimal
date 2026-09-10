import type {
  GenerateOptions,
  LlmModelInfo,
  LlmProviderInfo,
  StreamChunk,
} from "@deepseek-ai/dsh-llm"

import type {
  ActivationSnapshot,
  ResolvedPackage,
  ResolvedProfile,
} from "./profile.ts"

import {
  currentPackageFingerprint,
  profileValidationFailure,
} from "./profile.ts"

interface FiberLike {
  await(): Promise<FiberLike>
  dispose(): Promise<void>
}

interface ContextLike {
  readonly fiber: FiberLike
  plugin(plugin: unknown, config?: unknown): FiberLike
  get(name: string): unknown
  on(name: string, listener: () => void): () => void
  readonly llm?: LlmRuntimeLike
}

interface LlmRuntimeLike {
  listProviders(): Array<LlmProviderInfo>
  listModels(provider: string): Promise<Array<LlmModelInfo>>
  stream(options: GenerateOptions): AsyncIterable<StreamChunk>
}

interface StandardSchemaLike {
  readonly "~standard": {
    validate(value: unknown): unknown
  }
}

function isStandardSchema(value: unknown): value is StandardSchemaLike {
  if (
    value === null
    || (typeof value !== "object" && typeof value !== "function")
    || !("~standard" in value)
  ) {
    return false
  }
  const standard: unknown = value["~standard"]
  return (
    standard !== null
    && typeof standard === "object"
    && typeof (standard as { readonly validate?: unknown }).validate
      === "function"
  )
}

interface CordisModule {
  readonly Context: new () => ContextLike
}

interface LlmModule {
  readonly LlmRuntime?: new (context: ContextLike) => unknown
  readonly default?: new (context: ContextLike) => unknown
}

interface GenuinePluginModule {
  readonly name: string
  readonly inject: ReadonlyArray<string> | Readonly<Record<string, unknown>>
  readonly Config: StandardSchemaLike
  readonly apply: (context: unknown, config: unknown) => unknown
}

export interface CordisRuntimeFacade {
  listProviders(): ReadonlyArray<LlmProviderInfo>
  listModels(provider: string): Promise<ReadonlyArray<LlmModelInfo>>
  stream(options: GenerateOptions): AsyncIterable<StreamChunk>
  activateTopologyNotifications(listener: () => void): () => void
  dispose(): Promise<void>
}

async function importAbsoluteModule(
  module: ResolvedPackage,
  onImport: (module: ResolvedPackage) => void,
): Promise<Record<string, unknown>> {
  await assertFresh(module)
  onImport(module)
  let namespace: unknown
  try {
    namespace = await import(module.entryUrl)
  } catch (cause) {
    throw profileValidationFailure(
      "module-namespace-unavailable",
      `Package "${module.name}" could not load its ESM module namespace.`,
      { cause },
    )
  }
  if (namespace === null || typeof namespace !== "object") {
    throw profileValidationFailure(
      "module-namespace-unavailable",
      `Package "${module.name}" did not expose an ESM module namespace.`,
    )
  }
  return namespace as Record<string, unknown>
}

async function assertFresh(module: ResolvedPackage): Promise<void> {
  if ((await currentPackageFingerprint(module)) !== module.fingerprint) {
    throw profileValidationFailure(
      "profile-invalid",
      `Package "${module.name}" changed while the profile was activating.`,
    )
  }
}

function cordisModule(
  namespace: Record<string, unknown>,
  packageName: string,
): CordisModule {
  if (typeof namespace.Context !== "function") {
    throw profileValidationFailure(
      "profile-invalid",
      `Cordis package "${packageName}" does not export Context.`,
    )
  }
  return namespace as unknown as CordisModule
}

function llmModule(
  namespace: Record<string, unknown>,
  packageName: string,
): LlmModule {
  const constructor = namespace.LlmRuntime ?? namespace.default
  if (typeof constructor !== "function") {
    throw profileValidationFailure(
      "profile-invalid",
      `LLM package "${packageName}" does not export LlmRuntime.`,
    )
  }
  return namespace
}

function injectServices(
  inject: GenuinePluginModule["inject"],
  packageName: string,
): ReadonlyArray<string> {
  const entries = Array.isArray(inject) ? inject : Object.keys(inject)
  if (
    entries.some((entry) => typeof entry !== "string" || entry.length === 0)
  ) {
    throw profileValidationFailure(
      "profile-invalid",
      `Plugin package "${packageName}" has an invalid inject declaration.`,
    )
  }
  return entries as Array<string>
}

function genuinePlugin(
  namespace: Record<string, unknown>,
  packageName: string,
): GenuinePluginModule {
  if (
    typeof namespace.name !== "string"
    || namespace.name.trim().length === 0
  ) {
    throw profileValidationFailure(
      "profile-invalid",
      `Plugin package "${packageName}" must export a non-empty name.`,
    )
  }
  if (
    !Array.isArray(namespace.inject)
    && (namespace.inject === null || typeof namespace.inject !== "object")
  ) {
    throw profileValidationFailure(
      "profile-invalid",
      `Plugin package "${packageName}" must export inject.`,
    )
  }
  const config = namespace.Config
  if (!isStandardSchema(config)) {
    throw profileValidationFailure(
      "profile-invalid",
      `Plugin package "${packageName}" must export a Standard Schema Config.`,
    )
  }
  if (typeof namespace.apply !== "function") {
    throw profileValidationFailure(
      "profile-invalid",
      `Plugin package "${packageName}" must export apply.`,
    )
  }
  const plugin = namespace as unknown as GenuinePluginModule
  injectServices(plugin.inject, packageName)
  return plugin
}

function assertDependencies(
  plugin: GenuinePluginModule,
  packageName: string,
  services: ReadonlySet<string>,
): void {
  const missing = injectServices(plugin.inject, packageName).filter(
    (name) => !services.has(name),
  )
  if (missing.length > 0) {
    throw profileValidationFailure(
      "profile-invalid",
      `Plugin package "${packageName}" requires missing service${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`,
    )
  }
}

class RuntimeAggregate implements CordisRuntimeFacade {
  readonly #context: ContextLike
  readonly #llm: LlmRuntimeLike
  readonly #disposers: Array<() => void | Promise<void>>
  #disposePromise: Promise<void> | undefined

  constructor(
    context: ContextLike,
    llm: LlmRuntimeLike,
    disposers: Array<() => void | Promise<void>>,
  ) {
    this.#context = context
    this.#llm = llm
    this.#disposers = disposers
  }

  listProviders(): ReadonlyArray<LlmProviderInfo> {
    return this.#llm
      .listProviders()
      .map((provider) => Object.freeze({ ...provider }))
  }

  async listModels(provider: string): Promise<ReadonlyArray<LlmModelInfo>> {
    return (await this.#llm.listModels(provider)).map((model) =>
      Object.freeze({ ...model }),
    )
  }

  stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    return this.#llm.stream(options)
  }

  activateTopologyNotifications(listener: () => void): () => void {
    return this.#context.on("llm/adapters-updated", listener)
  }

  dispose(): Promise<void> {
    this.#disposePromise ??= this.#dispose()
    return this.#disposePromise
  }

  async #dispose(): Promise<void> {
    let firstFailure: unknown
    for (const dispose of this.#disposers.reverse()) {
      try {
        await dispose()
      } catch (error) {
        firstFailure ??= error
      }
    }
    if (firstFailure !== undefined)
      throw firstFailure instanceof Error ? firstFailure : (
          new Error("Disposal failed.")
        )
  }
}

interface CordisRuntimeHooks {
  readonly onImport?: (module: ResolvedPackage) => void
  readonly onDisposalFailure?: () => void
}

// Activation intentionally remains one ordered Cordis transaction.
// eslint-disable-next-line complexity
export async function createCordisRuntime(
  profile: ResolvedProfile,
  activation: ActivationSnapshot,
  hooks: CordisRuntimeHooks | ((module: ResolvedPackage) => void) = {},
): Promise<CordisRuntimeFacade> {
  const onImport =
    typeof hooks === "function" ? hooks : (hooks.onImport ?? (() => undefined))
  const onDisposalFailure =
    typeof hooks === "function" ?
      () => undefined
    : (hooks.onDisposalFailure ?? (() => undefined))
  const [cordisNamespace, llmNamespace] = await Promise.all([
    importAbsoluteModule(profile.cordis, onImport),
    importAbsoluteModule(profile.llm, onImport),
  ])
  const Cordis = cordisModule(cordisNamespace, profile.cordis.name)
  const Llm = llmModule(llmNamespace, profile.llm.name)
  const LlmRuntime = Llm.LlmRuntime ?? Llm.default
  if (LlmRuntime === undefined)
    throw profileValidationFailure(
      "profile-invalid",
      "LLM runtime constructor is unavailable.",
    )
  const context = new Cordis.Context()
  const disposers: Array<() => void | Promise<void>> = [
    () => context.fiber.dispose(),
  ]
  try {
    const llmFiber = context.plugin(LlmRuntime)
    await llmFiber.await()
    disposers.push(() => llmFiber.dispose())
    const llm = context.llm
    if (
      llm === undefined
      || typeof llm.stream !== "function"
      || typeof llm.listProviders !== "function"
      || typeof llm.listModels !== "function"
    ) {
      throw profileValidationFailure(
        "profile-invalid",
        "The mounted LLM runtime did not provide the llm service.",
      )
    }
    const services = new Set(["llm"])
    for (const service of profile.services) {
      const namespace = await importAbsoluteModule(service.module, onImport)
      const plugin = genuinePlugin(namespace, service.module.name)
      assertDependencies(plugin, service.module.name, services)
      const fiber = context.plugin(plugin, service.config)
      await fiber.await()
      disposers.push(() => fiber.dispose())
      if (context.get(service.id) === undefined) {
        throw profileValidationFailure(
          "profile-invalid",
          `Service plugin "${service.module.name}" did not provide "${service.id}".`,
        )
      }
      services.add(service.id)
    }
    for (const entry of profile.plugins) {
      const selected = activation[entry.id]
      if (!Object.hasOwn(activation, entry.id) || !selected.enabled) continue
      const namespace = await importAbsoluteModule(entry.module, onImport)
      const plugin = genuinePlugin(namespace, entry.module.name)
      assertDependencies(plugin, entry.module.name, services)
      const fiber = context.plugin(plugin, selected.config)
      await fiber.await()
      disposers.push(() => fiber.dispose())
    }
    return new RuntimeAggregate(context, llm, disposers)
  } catch (error) {
    let disposalFailed = false
    for (const dispose of disposers.reverse()) {
      try {
        await dispose()
      } catch {
        disposalFailed = true
      }
    }
    if (disposalFailed) onDisposalFailure()
    throw error
  }
}
