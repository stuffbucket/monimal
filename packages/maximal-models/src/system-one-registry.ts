import { RegistrationMap } from "./registration-map.ts"

export interface SystemOneModelInfo {
  readonly family?: string
  readonly id: string
  readonly name: string
}

export type SystemOneRequestHandler = (request: Request) => Promise<Response>

export interface SystemOneProviderRegistration {
  readonly id: string
  readonly models: ReadonlyArray<SystemOneModelInfo>
  readonly name: string
  readonly handle: SystemOneRequestHandler
}

export interface SystemOneRegistration {
  dispose(): void
}

export interface SystemOneService {
  dispatch(
    provider: string,
    request: Request,
    signal: AbortSignal,
  ): Promise<Response>
  listModels(provider: string): ReadonlyArray<SystemOneModelInfo>
  listProviders(): ReadonlyArray<
    Readonly<Pick<SystemOneProviderRegistration, "id" | "name">>
  >
  registerProvider(
    provider: SystemOneProviderRegistration,
    lifetime?: AbortSignal,
  ): SystemOneRegistration
  subscribe(listener: () => void): () => void
}

function nonEmpty(value: string, name: string): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value !== value.trim()
  ) {
    throw new TypeError(
      `${name} must be non-empty and have no surrounding whitespace.`,
    )
  }
  return value
}

function immutableProvider(
  value: SystemOneProviderRegistration,
): SystemOneProviderRegistration {
  if (typeof value.handle !== "function") {
    throw new TypeError("System One provider handle must be a function.")
  }
  const ids = value.models.map(({ id }) => nonEmpty(id, "System One model id"))
  if (new Set(ids).size !== ids.length) {
    throw new TypeError(
      `System One provider "${value.id}" has duplicate models.`,
    )
  }
  return Object.freeze({
    id: nonEmpty(value.id, "System One provider id"),
    name: nonEmpty(value.name, "System One provider name"),
    handle: value.handle,
    models: Object.freeze(
      value.models.map((model) =>
        Object.freeze({
          ...(model.family === undefined ?
            {}
          : { family: nonEmpty(model.family, "System One model family") }),
          id: nonEmpty(model.id, "System One model id"),
          name: nonEmpty(model.name, "System One model name"),
        }),
      ),
    ),
  })
}

/** Lifecycle-bound registry mounted as the Cordis `systemOne` service. */
export class SystemOneRegistry implements SystemOneService {
  readonly #listeners = new Set<() => void>()
  readonly #providers = new RegistrationMap<SystemOneProviderRegistration>({
    disposedMessage: "The System One registry is disposed.",
    duplicateMessage: (id) =>
      `System One provider "${id}" is already registered.`,
    expiredMessage: "The System One registration lifetime has ended.",
    onChange: () => this.#publish(),
  })

  registerProvider(
    provider: SystemOneProviderRegistration,
    lifetime?: AbortSignal,
  ): SystemOneRegistration {
    const stored = immutableProvider(provider)
    const dispose = this.#providers.register(stored.id, stored, lifetime)
    return Object.freeze({ dispose })
  }

  listProviders(): ReadonlyArray<
    Readonly<Pick<SystemOneProviderRegistration, "id" | "name">>
  > {
    return Object.freeze(
      this.#providers
        .values()
        .toSorted((left, right) => left.id.localeCompare(right.id))
        .map(({ id, name }) => Object.freeze({ id, name })),
    )
  }

  listModels(provider: string): ReadonlyArray<SystemOneModelInfo> {
    return this.#provider(provider).models
  }

  dispatch(
    provider: string,
    request: Request,
    signal: AbortSignal,
  ): Promise<Response> {
    const registered = this.#provider(provider)
    return registered.handle(new Request(request, { signal }))
  }

  subscribe(listener: () => void): () => void {
    this.#providers.assertActive()
    this.#listeners.add(listener)
    let active = true
    return () => {
      if (!active) return
      active = false
      this.#listeners.delete(listener)
    }
  }

  dispose(): void {
    this.#providers.dispose()
    this.#listeners.clear()
  }

  #provider(id: string): SystemOneProviderRegistration {
    const provider = this.#providers.get(id)
    if (provider === undefined) {
      throw new Error(`System One provider "${id}" is not registered.`)
    }
    return provider
  }

  #publish(): void {
    for (const listener of this.#listeners) {
      try {
        listener()
      } catch {
        // Observer failures cannot alter registry state.
      }
    }
  }
}
