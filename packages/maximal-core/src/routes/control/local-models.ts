import type {
  LocalModelCatalogEntry,
  LocalModelCatalogSnapshot,
  LocalModelControl,
  LocalModelProvisionProgress,
  ProviderUnsubscribe,
} from "@stuffbucket/maximal-model-contract"

import { randomUUID } from "node:crypto"

import type {
  LocalModelCancelResult,
  LocalModelEnsureResult,
  LocalModelOperationEvent,
} from "~/lib/jsonrpc/contract"
import type { ControlHub } from "~/lib/live/hub"
import type { ControlSnapshot } from "~/lib/live/resources"

const MAX_ACTIVE_OPERATIONS = 16
const UNAVAILABLE_MESSAGE = "Local model control is unavailable."
const FAILED_MESSAGE = "Local model provisioning failed."
const CANCELLED_MESSAGE = "Local model provisioning was cancelled."

interface Operation {
  readonly controller: AbortController
  readonly id: string
  readonly modelKey: string
}

export interface LocalModelOperationsOptions {
  readonly control: () => LocalModelControl | undefined
  readonly hub: () => ControlHub<ControlSnapshot>
}

function safeEntry(model: LocalModelCatalogEntry): LocalModelCatalogEntry {
  return {
    capabilities: {
      input: [...model.capabilities.input],
      output: [...model.capabilities.output],
    },
    context: {
      contextWindow: model.context.contextWindow,
      ...(model.context.maxOutputTokens === undefined ?
        {}
      : { maxOutputTokens: model.context.maxOutputTokens }),
    },
    displayName: model.displayName,
    expectedBytes: model.expectedBytes,
    format: model.format,
    key: model.key,
    modelId: model.modelId,
    publication: model.publication,
    state: model.state,
  }
}

function safeSnapshot(
  snapshot: LocalModelCatalogSnapshot,
): LocalModelCatalogSnapshot {
  return {
    models: snapshot.models.map((model) => safeEntry(model)),
    revision: snapshot.revision,
  }
}

function safeProgress(
  progress: LocalModelProvisionProgress,
): LocalModelProvisionProgress {
  return {
    completedBytes: progress.completedBytes,
    modelKey: progress.modelKey,
    phase: progress.phase,
    totalBytes: progress.totalBytes,
  }
}

function boundedControl(
  control: LocalModelControl | undefined,
): LocalModelControl {
  if (control === undefined) throw new Error(UNAVAILABLE_MESSAGE)
  return control
}

/** Owns asynchronous local-model control operations for one Core server. */
export class LocalModelOperations {
  readonly #options: LocalModelOperationsOptions
  readonly #operations = new Map<string, Operation>()
  readonly #operationByModel = new Map<string, string>()
  #subscribedControl: LocalModelControl | undefined
  #unsubscribe: ProviderUnsubscribe | undefined
  #disposed = false

  constructor(options: LocalModelOperationsOptions) {
    this.#options = options
  }

  list(): LocalModelCatalogSnapshot {
    const control = boundedControl(this.#options.control())
    this.#follow(control)
    try {
      return safeSnapshot(control.list())
    } catch {
      throw new Error(UNAVAILABLE_MESSAGE)
    }
  }

  ensure(modelKey: string): LocalModelEnsureResult {
    if (this.#disposed) throw new Error(UNAVAILABLE_MESSAGE)
    const existing = this.#operationByModel.get(modelKey)
    if (existing !== undefined) {
      return { modelKey, operationId: existing, started: false }
    }
    if (this.#operations.size >= MAX_ACTIVE_OPERATIONS) {
      throw new Error("Too many local model operations are active.")
    }

    const control = boundedControl(this.#options.control())
    this.#follow(control)
    const operation: Operation = {
      controller: new AbortController(),
      id: randomUUID(),
      modelKey,
    }
    this.#operations.set(operation.id, operation)
    this.#operationByModel.set(modelKey, operation.id)

    let result: Promise<LocalModelCatalogEntry>
    try {
      result = Promise.resolve(
        control.ensure(modelKey, operation.controller.signal, (progress) => {
          if (!this.#isActive(operation)) return
          try {
            this.#emit({
              type: "progress",
              operationId: operation.id,
              progress: safeProgress(progress),
            })
          } catch {
            operation.controller.abort(new Error(FAILED_MESSAGE))
            this.#fail(operation, false)
          }
        }),
      )
    } catch {
      result = Promise.reject(new Error(FAILED_MESSAGE))
    }
    void result.then(
      (model) => {
        if (!this.#isActive(operation)) return
        let projected: LocalModelCatalogEntry
        try {
          projected = safeEntry(model)
        } catch {
          this.#fail(operation, false)
          return
        }
        try {
          this.#emit({
            type: "completed",
            operationId: operation.id,
            model: projected,
          })
        } finally {
          this.#finish(operation)
        }
      },
      () => {
        this.#fail(operation, operation.controller.signal.aborted)
      },
    )

    return { modelKey, operationId: operation.id, started: true }
  }

  cancel(operationId: string): LocalModelCancelResult {
    const operation = this.#operations.get(operationId)
    if (operation === undefined) return { cancelled: false, operationId }
    operation.controller.abort(
      new DOMException(CANCELLED_MESSAGE, "AbortError"),
    )
    this.#fail(operation, true)
    return { cancelled: true, operationId }
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    this.#stopFollowing()
    for (const operation of this.#operations.values()) {
      operation.controller.abort(
        new DOMException("Local model control was disposed.", "AbortError"),
      )
    }
    this.#operations.clear()
    this.#operationByModel.clear()
  }

  get activeOperationCount(): number {
    return this.#operations.size
  }

  #follow(control: LocalModelControl): void {
    if (this.#subscribedControl === control) return
    this.#stopFollowing()
    this.#subscribedControl = control
    try {
      const unsubscribe = control.subscribe((snapshot) => {
        if (this.#disposed || this.#subscribedControl !== control) return
        try {
          this.#emit({ type: "catalog", snapshot: safeSnapshot(snapshot) })
        } catch {
          // An invalid plugin snapshot must not cross the control boundary.
        }
      })
      if (typeof unsubscribe !== "function") throw new TypeError()
      this.#unsubscribe = unsubscribe
    } catch {
      this.#stopFollowing()
      throw new Error(UNAVAILABLE_MESSAGE)
    }
  }

  #stopFollowing(): void {
    const unsubscribe = this.#unsubscribe
    this.#unsubscribe = undefined
    this.#subscribedControl = undefined
    try {
      unsubscribe?.()
    } catch {
      // Plugin cleanup cannot prevent Core operation cleanup or gateway disposal.
    }
  }

  #emit(event: LocalModelOperationEvent): void {
    if (!this.#disposed) this.#options.hub().emit("localModels", event)
  }

  #isActive(operation: Operation): boolean {
    return !this.#disposed && this.#operations.get(operation.id) === operation
  }

  #fail(operation: Operation, cancelled: boolean): void {
    if (!this.#isActive(operation)) return
    try {
      this.#emit({
        type: cancelled ? "cancelled" : "failed",
        operationId: operation.id,
        error: {
          message: cancelled ? CANCELLED_MESSAGE : FAILED_MESSAGE,
          retryable: !cancelled,
        },
      })
    } finally {
      this.#finish(operation)
    }
  }

  #finish(operation: Operation): void {
    if (this.#operations.get(operation.id) !== operation) return
    this.#operations.delete(operation.id)
    if (this.#operationByModel.get(operation.modelKey) === operation.id) {
      this.#operationByModel.delete(operation.modelKey)
    }
  }
}
