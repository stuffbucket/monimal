/* eslint-disable max-lines */
import type {
  ProviderDiagnostic,
  ProviderDispatch,
  ProviderGateway,
  ProviderOperation,
  ProviderStatus,
  ProviderTopology,
  ProviderTopologyListener,
  ProviderUnsubscribe,
} from "@stuffbucket/maximal-provider-contract"

import { watch } from "node:fs"

import { dispatchRuntime } from "./bridge.ts"
import {
  createCordisRuntime,
  type CordisRuntimeFacade,
} from "./cordis-runtime.ts"
import {
  cloneActivation,
  ProfileValidationError,
  profileValidationFailureReason,
  resolveExternalProfile,
  RestartRequiredError,
  type ActivationSnapshot,
  type ActivationSource,
  type ProfileValidationFailureReason,
  type ResolvedPackage,
  type ResolvedProfile,
} from "./profile.ts"

export interface DshHostOptions {
  readonly profileDirectory: string
  readonly activation: ActivationSnapshot | ActivationSource
  readonly reconcileDebounceMs?: number
  readonly drainTimeoutMs?: number
  readonly abortGraceMs?: number
}

export interface DshHostReconcileInput {
  readonly profileDirectory?: string
  readonly activation?: ActivationSnapshot | ActivationSource
}

export interface DshHostReconcileResult {
  readonly committed: boolean
  readonly diagnostics: ReadonlyArray<ProviderDiagnostic>
  readonly restartRequired: boolean
  readonly revision: number
}

const operations = Object.freeze<Array<ProviderOperation>>([
  "messages",
  "models",
])

function immutableDiagnostic(
  diagnostic: ProviderDiagnostic,
): ProviderDiagnostic {
  return Object.freeze({ ...diagnostic })
}

function immutableStatus(status: ProviderStatus): ProviderStatus {
  return Object.freeze({
    ...status,
    diagnostics: Object.freeze(
      status.diagnostics.map((diagnostic) => immutableDiagnostic(diagnostic)),
    ),
    operations: Object.freeze([...status.operations]),
  })
}

function immutableTopology(topology: ProviderTopology): ProviderTopology {
  return Object.freeze({
    revision: topology.revision,
    diagnostics: Object.freeze(
      topology.diagnostics.map((diagnostic) => immutableDiagnostic(diagnostic)),
    ),
    statuses: Object.freeze(
      topology.statuses.map((status) => immutableStatus(status)),
    ),
  })
}

const profileFailureDiagnostics = Object.freeze({
  "profile-invalid": {
    code: "provider-invalid",
    message: "The external provider profile is invalid.",
  },
  "dependency-unavailable": {
    code: "provider-load-failed",
    message: "An external provider dependency could not be loaded.",
  },
  "package-entry-unavailable": {
    code: "provider-load-failed",
    message: "An external provider package entry could not be loaded.",
  },
  "module-namespace-unavailable": {
    code: "provider-load-failed",
    message: "An external provider module could not be loaded.",
  },
} satisfies Record<
  ProfileValidationFailureReason,
  Readonly<Pick<ProviderDiagnostic, "code" | "message">>
>)

function diagnosticsFor(error: unknown): ReadonlyArray<ProviderDiagnostic> {
  if (error instanceof RestartRequiredError) {
    return Object.freeze([
      immutableDiagnostic({
        code: "provider-load-failed",
        message:
          "An external provider package changed after loading; restart is required.",
      }),
    ])
  }
  if (error instanceof ProfileValidationError) {
    return Object.freeze([
      immutableDiagnostic(
        profileFailureDiagnostics[profileValidationFailureReason(error)],
      ),
    ])
  }
  return Object.freeze([
    immutableDiagnostic({
      code: "provider-activation-failed",
      message: "The external provider generation could not be activated.",
    }),
  ])
}

function disposalDiagnostic(): ProviderDiagnostic {
  return immutableDiagnostic({
    code: "provider-disposal-failed",
    message: "A provider generation could not be fully disposed.",
  })
}

function unavailableResponse(message: string): Response {
  return Response.json(
    { type: "error", error: { type: "api_error", message } },
    {
      status: 503,
      headers: { "content-type": "application/json" },
    },
  )
}

function isSource(
  value: ActivationSnapshot | ActivationSource,
): value is ActivationSource {
  return (
    typeof value === "object"
    && "snapshot" in value
    && typeof (value as ActivationSource).snapshot === "function"
  )
}

async function activationSnapshot(
  value: ActivationSnapshot | ActivationSource,
): Promise<ActivationSnapshot> {
  return cloneActivation(isSource(value) ? await value.snapshot() : value)
}

function normalizedDelay(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  const result = value ?? fallback
  if (!Number.isFinite(result) || result < 0)
    throw new TypeError(`${name} must be a non-negative finite number.`)
  return result
}

class Generation {
  readonly profile: ResolvedProfile
  readonly activation: ActivationSnapshot
  readonly runtime: CordisRuntimeFacade
  readonly #forceAbort = new AbortController()
  readonly #leases = new Set<symbol>()
  #topologyDispose: (() => void) | undefined
  #retired = false
  #disposePromise: Promise<void> | undefined
  #drainedResolve: (() => void) | undefined
  #drainedPromise: Promise<void> | undefined

  constructor(
    profile: ResolvedProfile,
    activation: ActivationSnapshot,
    runtime: CordisRuntimeFacade,
  ) {
    this.profile = profile
    this.activation = activation
    this.runtime = runtime
  }

  activateTopologyNotifications(listener: () => void): void {
    if (this.#topologyDispose !== undefined) return
    this.#topologyDispose = this.runtime.activateTopologyNotifications(listener)
  }

  statuses(): ReadonlyArray<ProviderStatus> {
    const result = new Map<string, ProviderStatus>()
    for (const plugin of this.profile.plugins) {
      const enabled =
        Object.hasOwn(this.activation, plugin.id)
        && this.activation[plugin.id].enabled
      for (const provider of plugin.providers ?? [plugin.id]) {
        const diagnostic: ProviderDiagnostic =
          enabled ?
            {
              code: "provider-unavailable",
              provider,
              message: "A declared provider did not register an adapter.",
            }
          : {
              code: "provider-disabled",
              provider,
              message: "A declared provider is disabled.",
            }
        result.set(provider, {
          provider,
          state: enabled ? "unavailable" : "disabled",
          operations: [],
          diagnostics: [diagnostic],
        })
      }
    }
    for (const provider of this.runtime.listProviders()) {
      result.set(provider.id, {
        provider: provider.id,
        state: "available",
        operations,
        diagnostics: [],
      })
    }
    return Object.freeze(
      [...result.values()]
        .sort((left, right) => left.provider.localeCompare(right.provider))
        .map((status) => immutableStatus(status)),
    )
  }

  status(provider: string): ProviderStatus | undefined {
    return this.statuses().find((status) => status.provider === provider)
  }

  lease(
    signal: AbortSignal,
  ): { signal: AbortSignal; release: () => void } | undefined {
    if (this.#retired || this.#forceAbort.signal.aborted) return undefined
    const token = Symbol("generation-lease")
    this.#leases.add(token)
    let released = false
    return {
      signal: AbortSignal.any([signal, this.#forceAbort.signal]),
      release: () => {
        if (released) return
        released = true
        this.#leases.delete(token)
        if (this.#leases.size === 0) this.#drainedResolve?.()
      },
    }
  }

  async retire(drainTimeoutMs: number, abortGraceMs: number): Promise<void> {
    this.#retired = true
    let disposalFailed = this.#detachTopology()
    if (this.#leases.size > 0) {
      const drainedPromise =
        this.#drainedPromise
        ?? new Promise<void>((resolve) => {
          this.#drainedResolve = resolve
        })
      this.#drainedPromise = drainedPromise
      const waitForDrain = async (timeoutMs: number): Promise<boolean> => {
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          return await Promise.race([
            drainedPromise.then(() => true),
            new Promise<false>((resolve) => {
              timer = setTimeout(resolve, timeoutMs, false)
            }),
          ])
        } finally {
          if (timer !== undefined) clearTimeout(timer)
        }
      }
      const drained = await waitForDrain(drainTimeoutMs)
      if (!drained) {
        this.#forceAbort.abort(
          new Error("Provider generation drain deadline exceeded."),
        )
        if (this.#leases.size > 0) await waitForDrain(abortGraceMs)
      }
    }
    try {
      await this.dispose()
    } catch {
      disposalFailed = true
    }
    if (disposalFailed)
      throw new Error("The provider generation could not be fully disposed.")
  }

  async shutdown(): Promise<void> {
    this.#retired = true
    let disposalFailed = this.#detachTopology()
    this.#forceAbort.abort(new Error("Provider host disposed."))
    try {
      await this.dispose()
    } catch {
      disposalFailed = true
    }
    if (disposalFailed)
      throw new Error("The provider generation could not be fully disposed.")
  }

  #detachTopology(): boolean {
    const dispose = this.#topologyDispose
    this.#topologyDispose = undefined
    try {
      dispose?.()
      return false
    } catch {
      return true
    }
  }

  dispose(): Promise<void> {
    this.#disposePromise ??= this.runtime.dispose()
    return this.#disposePromise
  }
}

interface PendingReconcile {
  readonly input: DshHostReconcileInput
  readonly resolve: (result: DshHostReconcileResult) => void
}

/**
 * In-process blue/green host for profile-installed Cordis/DSH plugins.
 *
 * External plugins are trusted code. Cordis scopes effects created through its
 * context, but no host can recover resources a plugin leaks through ambient
 * globals or APIs outside that scope. Profiles must therefore contain only
 * packages trusted to run with the embedding process's authority.
 */
export class DshHost implements ProviderGateway, AsyncDisposable {
  readonly #debounceMs: number
  readonly #drainTimeoutMs: number
  readonly #abortGraceMs: number
  readonly #listeners = new Set<ProviderTopologyListener>()
  readonly #loadedModules = new Map<
    string,
    Pick<ResolvedPackage, "rootPath" | "entryPath" | "fingerprint" | "version">
  >()
  readonly #retired = new Set<Promise<void>>()
  #profileDirectory: string
  #activation: ActivationSnapshot | ActivationSource
  #activationUnsubscribe: (() => void) | undefined
  #profileWatchDispose: (() => void) | undefined
  #active: Generation | undefined
  #topology: ProviderTopology = immutableTopology({
    revision: 0,
    diagnostics: [],
    statuses: [],
  })
  #diagnostics: ReadonlyArray<ProviderDiagnostic> = Object.freeze([])
  #pending: Array<PendingReconcile> = []
  #debounceTimer: ReturnType<typeof setTimeout> | undefined
  #serial: Promise<void> = Promise.resolve()
  #started = false
  #disposed = false
  #disposePromise: Promise<void> | undefined

  constructor(options: DshHostOptions) {
    this.#profileDirectory = options.profileDirectory
    this.#activation = options.activation
    this.#debounceMs = normalizedDelay(
      options.reconcileDebounceMs,
      10,
      "reconcileDebounceMs",
    )
    this.#drainTimeoutMs = normalizedDelay(
      options.drainTimeoutMs,
      30_000,
      "drainTimeoutMs",
    )
    this.#abortGraceMs = normalizedDelay(
      options.abortGraceMs,
      2_000,
      "abortGraceMs",
    )
  }

  get gateway(): ProviderGateway {
    return this
  }

  getProviderGateway(): ProviderGateway {
    return this
  }

  async start(): Promise<this> {
    if (this.#disposed) throw new Error("The provider host is disposed.")
    if (this.#started) return this
    const result = await this.#enqueueReconcile({})
    if (!result.committed || this.#isDisposed()) {
      const error = new Error(
        result.diagnostics[0]?.message ?? "The provider host failed to start.",
      )
      error.name = "DshHostStartError"
      throw error
    }
    this.#started = true
    return this
  }

  reconcile(
    input: DshHostReconcileInput = {},
  ): Promise<DshHostReconcileResult> {
    if (this.#disposed) {
      return Promise.resolve(
        Object.freeze({
          committed: false,
          diagnostics: Object.freeze([
            immutableDiagnostic({
              code: "provider-unavailable",
              message: "The provider host is disposed.",
            }),
          ]),
          restartRequired: false,
          revision: this.#topology.revision,
        }),
      )
    }
    return new Promise((resolve) => {
      this.#pending.push({ input, resolve })
      if (this.#debounceTimer !== undefined) clearTimeout(this.#debounceTimer)
      this.#debounceTimer = setTimeout(() => {
        this.#debounceTimer = undefined
        const pending = this.#pending
        this.#pending = []
        const merged = pending.reduce<DshHostReconcileInput>(
          (result, item) => ({
            ...result,
            ...(item.input.profileDirectory === undefined ?
              {}
            : { profileDirectory: item.input.profileDirectory }),
            ...(item.input.activation === undefined ?
              {}
            : { activation: item.input.activation }),
          }),
          {},
        )
        void this.#enqueueReconcile(merged).then((result) => {
          for (const item of pending) item.resolve(result)
        })
      }, this.#debounceMs)
    })
  }

  diagnostics(): ReadonlyArray<ProviderDiagnostic> {
    return this.#diagnostics
  }

  async dispatch(dispatch: ProviderDispatch): Promise<Response> {
    if (this.#disposed)
      return unavailableResponse("The provider host is disposed.")
    const generation = this.#active
    if (generation === undefined)
      return unavailableResponse("The provider host is not started.")
    try {
      const status = generation.status(dispatch.provider)
      if (status?.state !== "available")
        return unavailableResponse(
          `Provider "${dispatch.provider}" is unavailable.`,
        )
      const lease = generation.lease(dispatch.signal)
      if (lease === undefined)
        return unavailableResponse("The provider generation is draining.")
      try {
        return await dispatchRuntime(
          generation.runtime,
          { ...dispatch, signal: lease.signal },
          lease.release,
        )
      } catch {
        lease.release()
        return unavailableResponse("The provider gateway failed.")
      }
    } catch {
      return unavailableResponse("The provider gateway failed.")
    }
  }

  getStatus(provider: string): ProviderStatus | undefined {
    return this.#topology.statuses.find(
      (status) => status.provider === provider,
    )
  }

  listStatuses(): ReadonlyArray<ProviderStatus> {
    return this.#topology.statuses
  }

  subscribe(listener: ProviderTopologyListener): ProviderUnsubscribe {
    if (this.#disposed) return () => undefined
    this.#listeners.add(listener)
    try {
      listener(this.#topology)
    } catch {
      // Observer failures never escape or affect the committed topology.
    }
    let subscribed = true
    return () => {
      if (!subscribed) return
      subscribed = false
      this.#listeners.delete(listener)
    }
  }

  dispose(): Promise<void> {
    if (this.#disposePromise === undefined) {
      this.#disposed = true
      this.#commitTopology([], this.#diagnostics)
      this.#disposePromise = this.#dispose()
    }
    return this.#disposePromise
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.dispose()
  }

  #enqueueReconcile(
    input: DshHostReconcileInput,
  ): Promise<DshHostReconcileResult> {
    const operation = this.#serial.then(
      async () => await this.#reconcileNow(input),
    )
    this.#serial = operation.then(
      () => undefined,
      () => undefined,
    )
    return operation
  }

  // Candidate activation is kept in one transaction to preserve atomicity.
  // eslint-disable-next-line max-lines-per-function
  async #reconcileNow(
    input: DshHostReconcileInput,
  ): Promise<DshHostReconcileResult> {
    if (this.#isDisposed()) return this.#disposedResult()
    const nextDirectory = input.profileDirectory ?? this.#profileDirectory
    const nextActivationValue = input.activation ?? this.#activation
    let candidate: Generation | undefined
    let candidateActivationDispose: (() => void) | undefined
    let candidateWatchDispose: (() => void) | undefined
    const candidateDisposalFailures = new Set<"runtime">()
    try {
      const [profile, activation] = await Promise.all([
        resolveExternalProfile(nextDirectory),
        activationSnapshot(nextActivationValue),
      ])
      this.#assertModuleCache(profile, activation)
      const runtime = await createCordisRuntime(profile, activation, {
        onImport: (module) => this.#rememberLoadedModule(module),
        onDisposalFailure: () => {
          candidateDisposalFailures.add("runtime")
        },
      })
      const committed = new Generation(profile, activation, runtime)
      candidate = committed
      const statuses = this.#statusesForCandidate(committed)
      committed.activateTopologyNotifications(() => {
        if (this.#active !== committed || this.#disposed) return
        try {
          this.#commitTopology(
            this.#statusesForCandidate(committed),
            this.#diagnostics,
          )
        } catch (error) {
          this.#publishFailure(diagnosticsFor(error))
        }
      })
      candidateActivationDispose =
        this.#prepareActivationSubscription(nextActivationValue)
      candidateWatchDispose = this.#prepareProfileWatcher(nextDirectory)
      if (this.#isDisposed()) throw new Error("The provider host is disposed.")

      const previous = this.#active
      const previousActivationDispose = this.#activationUnsubscribe
      const previousWatchDispose = this.#profileWatchDispose
      const nextTopology = immutableTopology({
        revision: this.#topology.revision + 1,
        statuses,
        diagnostics: this.#persistentDiagnostics(),
      })

      this.#active = committed
      this.#profileDirectory = nextDirectory
      this.#activation = nextActivationValue
      this.#activationUnsubscribe = candidateActivationDispose
      this.#profileWatchDispose = candidateWatchDispose
      this.#diagnostics = nextTopology.diagnostics
      this.#topology = nextTopology
      candidate = undefined
      candidateActivationDispose = undefined
      candidateWatchDispose = undefined
      this.#notifyTopology()

      const watchDisposalFailed = this.#safeDispose(previousWatchDispose)
      const activationDisposalFailed = this.#safeDispose(
        previousActivationDispose,
      )
      if (activationDisposalFailed || watchDisposalFailed)
        this.#reportDisposalFailure()
      if (previous !== undefined) this.#retire(previous)
      return Object.freeze({
        committed: true,
        diagnostics: this.#diagnostics,
        restartRequired: false,
        revision: this.#topology.revision,
      })
    } catch (error) {
      const watchDisposalFailed = this.#safeDispose(candidateWatchDispose)
      const activationDisposalFailed = this.#safeDispose(
        candidateActivationDispose,
      )
      let shutdownFailed = false
      try {
        await candidate?.shutdown()
      } catch {
        shutdownFailed = true
      }
      const disposalFailed =
        candidateDisposalFailures.size > 0
        || activationDisposalFailed
        || watchDisposalFailed
        || shutdownFailed
      if (this.#isDisposed()) {
        if (disposalFailed) this.#reportDisposalFailure()
        return this.#disposedResult()
      }
      const diagnostics = this.#mergeDisposalDiagnostic(
        diagnosticsFor(error),
        disposalFailed,
      )
      this.#publishFailure(diagnostics)
      return Object.freeze({
        committed: false,
        diagnostics,
        restartRequired: error instanceof RestartRequiredError,
        revision: this.#topology.revision,
      })
    }
  }

  #statusesForCandidate(generation: Generation): ReadonlyArray<ProviderStatus> {
    const statuses = new Map(
      generation.statuses().map((status) => [status.provider, status]),
    )
    for (const previous of this.#topology.statuses) {
      if (statuses.has(previous.provider)) continue
      statuses.set(
        previous.provider,
        immutableStatus({
          provider: previous.provider,
          state: "unavailable",
          operations: [],
          diagnostics: [
            {
              code: "provider-unavailable",
              provider: previous.provider,
              message:
                "A provider is no longer declared by the external profile.",
            },
          ],
        }),
      )
    }
    return Object.freeze(
      [...statuses.values()].sort((left, right) =>
        left.provider.localeCompare(right.provider),
      ),
    )
  }

  #assertModuleCache(
    profile: ResolvedProfile,
    activation: ActivationSnapshot,
  ): void {
    for (const module of this.#modulesLoadedBy(profile, activation)) {
      const previous = this.#loadedModules.get(module.name)
      if (previous === undefined) continue
      if (
        previous.rootPath !== module.rootPath
        || previous.entryPath !== module.entryPath
        || previous.fingerprint !== module.fingerprint
        || previous.version !== module.version
      ) {
        throw new RestartRequiredError(
          `Package "${module.name}" changed after it entered the ESM module cache; restart is required.`,
        )
      }
    }
  }

  #rememberLoadedModule(module: ResolvedPackage): void {
    this.#loadedModules.set(module.name, {
      rootPath: module.rootPath,
      entryPath: module.entryPath,
      fingerprint: module.fingerprint,
      version: module.version,
    })
  }

  #modulesLoadedBy(
    profile: ResolvedProfile,
    activation: ActivationSnapshot,
  ): Array<ResolvedPackage> {
    return [
      profile.cordis,
      profile.llm,
      ...profile.services.map((service) => service.module),
      ...profile.plugins
        .filter(
          (plugin) =>
            Object.hasOwn(activation, plugin.id)
            && activation[plugin.id].enabled,
        )
        .map((plugin) => plugin.module),
    ]
  }

  #commitTopology(
    statuses: ReadonlyArray<ProviderStatus>,
    diagnostics: ReadonlyArray<ProviderDiagnostic>,
  ): void {
    this.#topology = immutableTopology({
      revision: this.#topology.revision + 1,
      statuses,
      diagnostics,
    })
    this.#notifyTopology()
  }

  #publishFailure(diagnostics: ReadonlyArray<ProviderDiagnostic>): void {
    const merged = this.#mergeDisposalDiagnostic(
      diagnostics,
      this.#persistentDiagnostics().length > 0,
    )
    this.#diagnostics = merged
    this.#commitTopology(this.#topology.statuses, merged)
  }

  #persistentDiagnostics(): ReadonlyArray<ProviderDiagnostic> {
    return Object.freeze(
      this.#diagnostics.filter(
        (diagnostic) => diagnostic.code === "provider-disposal-failed",
      ),
    )
  }

  #mergeDisposalDiagnostic(
    diagnostics: ReadonlyArray<ProviderDiagnostic>,
    disposalFailed: boolean,
  ): ReadonlyArray<ProviderDiagnostic> {
    const includeDisposal =
      disposalFailed
      || diagnostics.some(
        (diagnostic) => diagnostic.code === "provider-disposal-failed",
      )
    const withoutDuplicate = diagnostics.filter(
      (diagnostic) => diagnostic.code !== "provider-disposal-failed",
    )
    return Object.freeze([
      ...withoutDuplicate.map((diagnostic) => immutableDiagnostic(diagnostic)),
      ...(includeDisposal ? [disposalDiagnostic()] : []),
    ])
  }

  #reportDisposalFailure(): void {
    if (this.#persistentDiagnostics().length > 0) return
    const diagnostics = this.#mergeDisposalDiagnostic(this.#diagnostics, true)
    this.#diagnostics = diagnostics
    this.#commitTopology(this.#topology.statuses, diagnostics)
  }

  #notifyTopology(): void {
    for (const listener of this.#listeners) {
      try {
        listener(this.#topology)
      } catch {
        // A topology observer cannot veto a committed generation.
      }
    }
  }

  #prepareActivationSubscription(
    value: ActivationSnapshot | ActivationSource,
  ): (() => void) | undefined {
    if (!isSource(value) || value.subscribe === undefined) return undefined
    let subscribed = true
    const unsubscribe: unknown = value.subscribe(() => {
      if (!subscribed || this.#disposed) return
      void this.reconcile()
    })
    if (typeof unsubscribe !== "function")
      throw new TypeError("ActivationSource.subscribe must return a function.")
    const dispose = unsubscribe as () => void
    return () => {
      if (!subscribed) return
      subscribed = false
      dispose()
    }
  }

  #prepareProfileWatcher(directory: string): () => void {
    let watching = true
    const watcher = watch(
      directory,
      { persistent: false },
      (_eventType, filename) => {
        if (!watching || this.#disposed) return
        const name = filename?.toString()
        if (
          name !== undefined
          && name !== "providers.json"
          && name !== "package.json"
        ) {
          return
        }
        void this.reconcile()
      },
    )
    return () => {
      if (!watching) return
      watching = false
      watcher.close()
    }
  }

  #safeDispose(dispose: (() => void) | undefined): boolean {
    try {
      dispose?.()
      return false
    } catch {
      return true
    }
  }

  #retire(generation: Generation): void {
    const retirement = generation
      .retire(this.#drainTimeoutMs, this.#abortGraceMs)
      .catch(() => {
        this.#reportDisposalFailure()
      })
      .finally(() => {
        this.#retired.delete(retirement)
      })
    this.#retired.add(retirement)
  }

  #isDisposed(): boolean {
    return this.#disposed
  }

  #disposedResult(): DshHostReconcileResult {
    return Object.freeze({
      committed: false,
      diagnostics: Object.freeze([
        immutableDiagnostic({
          code: "provider-unavailable",
          message: "The provider host is disposed.",
        }),
      ]),
      restartRequired: false,
      revision: this.#topology.revision,
    })
  }

  async #dispose(): Promise<void> {
    if (this.#debounceTimer !== undefined) clearTimeout(this.#debounceTimer)
    this.#debounceTimer = undefined
    const watchDisposalFailed = this.#safeDispose(this.#profileWatchDispose)
    this.#profileWatchDispose = undefined
    const activationDisposalFailed = this.#safeDispose(
      this.#activationUnsubscribe,
    )
    this.#activationUnsubscribe = undefined
    if (activationDisposalFailed || watchDisposalFailed)
      this.#reportDisposalFailure()
    const pending = this.#pending
    this.#pending = []
    const result = this.#disposedResult()
    for (const item of pending) item.resolve(result)
    this.#listeners.clear()

    await this.#serial
    const active = this.#active
    this.#active = undefined
    try {
      await active?.shutdown()
    } catch {
      this.#reportDisposalFailure()
    }
    await Promise.all(this.#retired)
  }
}

export function createDshHost(options: DshHostOptions): DshHost {
  return new DshHost(options)
}

export async function startDshHost(options: DshHostOptions): Promise<DshHost> {
  return await new DshHost(options).start()
}
