import type {
  AdapterRegistrationHandle,
  LlmRuntime,
} from "@deepseek-ai/dsh-llm"
import type {
  LocalModelCatalogEntry,
  LocalModelCatalogSnapshot,
} from "@stuffbucket/local-model-registry"

import type { ResolvedConfig } from "./config.ts"

import { LlamaServerAdapter, type AdapterDependencies } from "./adapter.ts"
import {
  claimAssignedModels,
  releaseClaimedModels,
  type ClaimedModel,
  type LocalModelClaimer,
} from "./claims.ts"

export interface AssignedModelRegistry extends LocalModelClaimer {
  ensure(modelKey: string, signal: AbortSignal): Promise<LocalModelCatalogEntry>
  list(): LocalModelCatalogSnapshot
  subscribe(listener: (snapshot: LocalModelCatalogSnapshot) => void): () => void
}

export interface AdapterRegistrar {
  registerAdapter: LlmRuntime["registerAdapter"]
}

export interface ActivationDependencies extends AdapterDependencies {
  readonly createAdapter?: (
    config: ResolvedConfig,
    claims: ReadonlyArray<ClaimedModel>,
    dependencies: AdapterDependencies,
  ) => LlamaServerAdapter
}

export interface ActivationOptions {
  readonly config: ResolvedConfig
  readonly dependencies?: ActivationDependencies
  readonly registrar: AdapterRegistrar
  readonly registry: AssignedModelRegistry
}

interface ActiveAdapter {
  readonly adapter: LlamaServerAdapter
  readonly claims: ReadonlyArray<ClaimedModel>
  readonly unregister: AdapterRegistrationHandle
}

function abortReason(signal: AbortSignal): unknown {
  return (
    signal.reason ?? new DOMException("Operation was aborted.", "AbortError")
  )
}

function assignedEntries(
  snapshot: LocalModelCatalogSnapshot,
  assignments: ReadonlyMap<string, string>,
): ReadonlyArray<LocalModelCatalogEntry> | undefined {
  const byKey = new Map(snapshot.models.map((model) => [model.key, model]))
  const result: Array<LocalModelCatalogEntry> = []
  for (const modelKey of assignments.values()) {
    const model = byKey.get(modelKey)
    if (model === undefined || model.state === "failed") return undefined
    result.push(model)
  }
  return result
}

function claimsAreLive(claims: ReadonlyArray<ClaimedModel>): boolean {
  return claims.every(({ lease }) => !lease.released)
}

function assertClaimsLive(
  signal: AbortSignal,
  claims: ReadonlyArray<ClaimedModel>,
): void {
  if (signal.aborted) throw abortReason(signal)
  if (!claimsAreLive(claims)) {
    throw new Error("llama-server claim was released during activation")
  }
}

/**
 * Reconciles model registration/provisioning with one atomic set of runner
 * claims. Provider routes exist only for the lifetime of that complete claim set.
 */
export class LlamaServerActivation implements AsyncDisposable {
  readonly #registry: AssignedModelRegistry
  readonly #registrar: AdapterRegistrar
  readonly #config: ResolvedConfig
  readonly #dependencies: ActivationDependencies
  readonly #lifecycle = new AbortController()
  readonly #cleanups = new Set<Promise<void>>()
  #snapshot: LocalModelCatalogSnapshot | undefined
  #active: ActiveAdapter | undefined
  #attempt: AbortController | undefined
  #starting: Promise<void> | undefined
  #unsubscribe: (() => void) | undefined
  #blockedRevision: number | undefined
  #started = false
  #disposed = false
  #disposePromise: Promise<void> | undefined

  constructor(options: ActivationOptions) {
    this.#registry = options.registry
    this.#registrar = options.registrar
    this.#config = options.config
    this.#dependencies = options.dependencies ?? {}
  }

  start(): void {
    if (this.#disposed) throw new Error("llama-server activation is disposed")
    if (this.#started)
      throw new Error("llama-server activation is already started")
    this.#started = true
    this.#unsubscribe = this.#registry.subscribe((snapshot) => {
      this.#update(snapshot)
    })
  }

  dispose(): Promise<void> {
    this.#disposePromise ??= this.#dispose()
    return this.#disposePromise
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.dispose()
  }

  #update(snapshot: LocalModelCatalogSnapshot): void {
    if (this.#disposed) return
    this.#snapshot = snapshot
    const entries = assignedEntries(snapshot, this.#config.assignments)
    if (
      this.#active !== undefined
      && (entries === undefined
        || entries.some(({ state }) => state !== "ready")
        || !claimsAreLive(this.#active.claims))
    ) {
      this.#withdrawActive()
    }
    if (this.#starting !== undefined) {
      if (entries === undefined)
        this.#attempt?.abort(
          new DOMException(
            "Assigned model registration changed.",
            "AbortError",
          ),
        )
      return
    }
    this.#reconcile()
  }

  #reconcile(): void {
    if (
      this.#disposed
      || this.#active !== undefined
      || this.#starting !== undefined
    ) {
      return
    }
    const snapshot = this.#snapshot
    if (
      snapshot === undefined
      || snapshot.revision === this.#blockedRevision
      || assignedEntries(snapshot, this.#config.assignments) === undefined
    ) {
      return
    }
    const attempt = new AbortController()
    this.#attempt = attempt
    const activation = Promise.resolve().then(() => this.#activate(attempt))
    const starting = activation
      .catch(() => {
        if (!attempt.signal.aborted) {
          this.#blockedRevision = this.#snapshot?.revision
        }
      })
      .finally(() => {
        if (this.#attempt === attempt) this.#attempt = undefined
        if (this.#starting === starting) this.#starting = undefined
        this.#reconcile()
      })
    this.#starting = starting
  }

  async #activate(attempt: AbortController): Promise<void> {
    const signal = AbortSignal.any([attempt.signal, this.#lifecycle.signal])
    const modelKeys = [...new Set(this.#config.assignments.values())]
    const ensured = await Promise.all(
      modelKeys.map((modelKey) => this.#registry.ensure(modelKey, signal)),
    )
    if (signal.aborted) throw abortReason(signal)
    if (ensured.some(({ state }) => state !== "ready")) {
      throw new Error("llama-server assigned model did not become ready")
    }
    const snapshot = this.#snapshot
    const entries =
      snapshot === undefined ? undefined : (
        assignedEntries(snapshot, this.#config.assignments)
      )
    if (
      entries === undefined
      || entries.some(({ state }) => state !== "ready")
    ) {
      throw new Error("llama-server assigned model registration changed")
    }

    const claims = claimAssignedModels(this.#registry, this.#config.assignments)
    let adapter: LlamaServerAdapter | undefined
    try {
      assertClaimsLive(signal, claims)
      const createAdapter =
        this.#dependencies.createAdapter
        ?? ((config, values, dependencies) =>
          new LlamaServerAdapter(config, values, dependencies))
      adapter = createAdapter(this.#config, claims, this.#dependencies)
      assertClaimsLive(signal, claims)
      const unregister = this.#registrar.registerAdapter(
        claims.map(({ provider }) => provider),
        adapter,
      )
      try {
        assertClaimsLive(signal, claims)
      } catch (error) {
        unregister()
        throw error
      }
      this.#active = { adapter, claims, unregister }
    } catch (error) {
      await adapter?.dispose()
      releaseClaimedModels(claims)
      throw error
    }
  }

  #withdrawActive(): void {
    const active = this.#active
    if (active === undefined) return
    this.#active = undefined
    try {
      active.unregister()
    } catch {
      // A broken registration disposer must not retain the model lease.
    }
    const cleanup = active.adapter
      .dispose()
      .finally(() => releaseClaimedModels(active.claims))
    this.#cleanups.add(cleanup)
    void cleanup.then(
      () => this.#cleanups.delete(cleanup),
      () => this.#cleanups.delete(cleanup),
    )
  }

  async #dispose(): Promise<void> {
    if (this.#disposed) return
    this.#disposed = true
    this.#unsubscribe?.()
    this.#unsubscribe = undefined
    this.#lifecycle.abort(
      new DOMException("llama-server activation disposed", "AbortError"),
    )
    this.#attempt?.abort(this.#lifecycle.signal.reason)
    this.#withdrawActive()
    await this.#starting?.catch(() => undefined)
    await Promise.allSettled(this.#cleanups)
  }
}
