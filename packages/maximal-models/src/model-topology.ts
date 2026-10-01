import type {
  ModelAccessEvidence,
  ModelExecutionTarget,
  ModelProviderDetails,
  ModelRuntimeCapabilities,
  ModelRuntimeLimits,
  ModelTokenPricing,
  ModelTopologyListener,
  ModelTopologyRegistration,
  ModelTopologyService,
  ModelTopologySnapshot,
  ProviderUnsubscribe,
} from "@maximal/maximal-model-contract"

function immutableArray<T>(values: ReadonlyArray<T>): ReadonlyArray<T> {
  return Object.freeze([...values])
}

function immutableCapabilities(
  value: ModelRuntimeCapabilities,
): ModelRuntimeCapabilities {
  return Object.freeze({
    ...value,
    ...(value.reasoningEffort === undefined ?
      {}
    : { reasoningEffort: immutableArray(value.reasoningEffort) }),
  })
}

function immutableAccess(value: ModelAccessEvidence): ModelAccessEvidence {
  return Object.freeze({
    ...value,
    ...(value.restrictedTo === undefined ?
      {}
    : { restrictedTo: immutableArray(value.restrictedTo) }),
  })
}

function immutableLimits(value: ModelRuntimeLimits): ModelRuntimeLimits {
  return Object.freeze({
    ...value,
    ...(value.vision === undefined ?
      {}
    : {
        vision: Object.freeze({
          ...value.vision,
          ...(value.vision.supportedMediaTypes === undefined ?
            {}
          : {
              supportedMediaTypes: immutableArray(
                value.vision.supportedMediaTypes,
              ),
            }),
        }),
      }),
  })
}

function immutablePricing(value: ModelTokenPricing): ModelTokenPricing {
  return Object.freeze({
    ...value,
    default: Object.freeze({ ...value.default }),
    ...(value.longContext === undefined ?
      {}
    : { longContext: Object.freeze({ ...value.longContext }) }),
    unit: Object.freeze({ ...value.unit }),
  })
}

function immutableProviderDetails(
  value: ModelProviderDetails,
): ModelProviderDetails {
  return Object.freeze({
    ...value,
    ...(value.legacyBilling === undefined ?
      {}
    : { legacyBilling: Object.freeze({ ...value.legacyBilling }) }),
  })
}

function immutableEvidence(
  value: ModelExecutionTarget["evidence"],
): ModelExecutionTarget["evidence"] {
  return Object.freeze({
    ...value,
    ...(value.access === undefined ?
      {}
    : { access: immutableAccess(value.access) }),
    ...(value.advertisedEndpoints === undefined ?
      {}
    : {
        advertisedEndpoints: immutableArray(value.advertisedEndpoints),
      }),
    ...(value.capabilities === undefined ?
      {}
    : {
        capabilities: immutableCapabilities(value.capabilities),
      }),
    ...(value.declaredCapabilities === undefined ?
      {}
    : {
        declaredCapabilities: immutableArray(value.declaredCapabilities),
      }),
    limits: Object.freeze({
      ...(value.limits.effective === undefined ?
        {}
      : { effective: immutableLimits(value.limits.effective) }),
      ...(value.limits.effectiveProvenance === undefined ?
        {}
      : {
          effectiveProvenance: Object.freeze({
            ...value.limits.effectiveProvenance,
          }),
        }),
      ...(value.limits.intrinsic === undefined ?
        {}
      : { intrinsic: immutableLimits(value.limits.intrinsic) }),
      ...(value.limits.intrinsicProvenance === undefined ?
        {}
      : {
          intrinsicProvenance: Object.freeze({
            ...value.limits.intrinsicProvenance,
          }),
        }),
    }),
    ...(value.modelLifecycle === undefined ?
      {}
    : {
        modelLifecycle: Object.freeze({
          ...value.modelLifecycle,
          info: immutableArray(
            value.modelLifecycle.info.map((entry) =>
              Object.freeze({ ...entry }),
            ),
          ),
          warnings: immutableArray(
            value.modelLifecycle.warnings.map((entry) =>
              Object.freeze({ ...entry }),
            ),
          ),
        }),
      }),
    ...(value.pricing === undefined ?
      {}
    : { pricing: immutablePricing(value.pricing) }),
    ...(value.providerDetails === undefined ?
      {}
    : {
        providerDetails: immutableProviderDetails(value.providerDetails),
      }),
    provenance: Object.freeze({ ...value.provenance }),
    ...(value.selection === undefined ?
      {}
    : { selection: Object.freeze({ ...value.selection }) }),
    ...(value.tokenizer === undefined ?
      {}
    : {
        tokenizer: Object.freeze({
          provenance: Object.freeze({
            ...value.tokenizer.provenance,
          }),
          tokenizer: Object.freeze({
            ...value.tokenizer.tokenizer,
          }),
        }),
      }),
  })
}

function immutableTarget(value: ModelExecutionTarget): ModelExecutionTarget {
  return Object.freeze({
    ...value,
    adapters: immutableArray(
      value.adapters.map((adapter) => Object.freeze({ ...adapter })),
    ),
    availability: Object.freeze({ ...value.availability }),
    endpoint: Object.freeze({ ...value.endpoint }),
    evidence: immutableEvidence(value.evidence),
    lifecycle: Object.freeze({ ...value.lifecycle }),
    providerAccount: Object.freeze({ ...value.providerAccount }),
    runner: Object.freeze({ ...value.runner }),
  })
}

function registration(dispose: () => void): ModelTopologyRegistration {
  return Object.freeze({ dispose })
}

/** Revisioned target registry mounted as a Cordis service. */
export class ModelTopologyRegistry implements ModelTopologyService {
  readonly #listeners = new Set<ModelTopologyListener>()
  readonly #registrations = new Set<() => void>()
  readonly #targets = new Map<string, ModelExecutionTarget>()
  #disposed = false
  #revision = 0

  registerTarget(
    target: ModelExecutionTarget,
    lifetime?: AbortSignal,
  ): ModelTopologyRegistration {
    this.#assertActive()
    if (lifetime?.aborted) {
      throw new DOMException(
        "The topology registration lifetime has ended.",
        "AbortError",
      )
    }
    if (this.#targets.has(target.id)) {
      throw new Error(`Execution target "${target.id}" is already registered.`)
    }
    const operations = target.adapters.map(({ operation }) => operation)
    if (new Set(operations).size !== operations.length) {
      throw new Error(
        `Execution target "${target.id}" has duplicate operation adapters.`,
      )
    }

    const stored = immutableTarget(target)
    this.#targets.set(stored.id, stored)
    this.#publish()

    let active = true
    const dispose = (): void => {
      if (!active) return
      active = false
      this.#registrations.delete(dispose)
      lifetime?.removeEventListener("abort", dispose)
      if (this.#targets.get(stored.id) !== stored) return
      this.#targets.delete(stored.id)
      if (!this.#disposed) this.#publish()
    }
    lifetime?.addEventListener("abort", dispose, { once: true })
    this.#registrations.add(dispose)
    return registration(dispose)
  }

  snapshot(): ModelTopologySnapshot {
    this.#assertActive()
    return Object.freeze({
      revision: this.#revision,
      targets: Object.freeze(
        [...this.#targets.values()].sort((left, right) =>
          left.id.localeCompare(right.id),
        ),
      ),
    })
  }

  subscribe(listener: ModelTopologyListener): ProviderUnsubscribe {
    this.#assertActive()
    this.#listeners.add(listener)
    try {
      listener(this.snapshot())
    } catch {
      // Observer failures cannot alter topology state.
    }
    let subscribed = true
    return () => {
      if (!subscribed) return
      subscribed = false
      this.#listeners.delete(listener)
    }
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    for (const dispose of this.#registrations) dispose()
    this.#registrations.clear()
    this.#listeners.clear()
    this.#targets.clear()
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error("The model topology is disposed.")
  }

  #publish(): void {
    this.#revision += 1
    const snapshot = this.snapshot()
    for (const listener of this.#listeners) {
      try {
        listener(snapshot)
      } catch {
        // Observer failures cannot alter topology state.
      }
    }
  }
}
