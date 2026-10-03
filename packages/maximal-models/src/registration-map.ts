interface RegistrationMapOptions {
  readonly disposedMessage: string
  readonly duplicateMessage: (id: string) => string
  readonly expiredMessage: string
  readonly onChange: () => void
}

/** Shared keyed registration ownership for Cordis-provided registries. */
export class RegistrationMap<TValue> {
  readonly #entries = new Map<string, TValue>()
  readonly #options: RegistrationMapOptions
  readonly #remove = new Set<() => void>()
  #disposed = false

  constructor(options: RegistrationMapOptions) {
    this.#options = options
  }

  register(id: string, value: TValue, lifetime?: AbortSignal): () => void {
    this.assertActive()
    if (lifetime?.aborted) {
      throw new DOMException(this.#options.expiredMessage, "AbortError")
    }
    if (this.#entries.has(id)) {
      throw new Error(this.#options.duplicateMessage(id))
    }
    this.#entries.set(id, value)
    this.#options.onChange()

    let registered = true
    const remove = (): void => {
      if (!registered) return
      registered = false
      this.#remove.delete(remove)
      lifetime?.removeEventListener("abort", remove)
      if (this.#entries.get(id) !== value) return
      this.#entries.delete(id)
      if (!this.#disposed) this.#options.onChange()
    }
    lifetime?.addEventListener("abort", remove, { once: true })
    this.#remove.add(remove)
    return remove
  }

  get(id: string): TValue | undefined {
    this.assertActive()
    return this.#entries.get(id)
  }

  values(): ReadonlyArray<TValue> {
    this.assertActive()
    return [...this.#entries.values()]
  }

  assertActive(): void {
    if (this.#disposed) throw new Error(this.#options.disposedMessage)
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    for (const remove of this.#remove) remove()
    this.#remove.clear()
    this.#entries.clear()
  }
}
