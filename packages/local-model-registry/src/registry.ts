import type {
  LocalModelCatalogEntry,
  LocalModelCatalogListener,
  LocalModelCatalogSnapshot,
  LocalModelControl,
  LocalModelProgressListener,
  LocalModelProvisionPhase,
  LocalModelState,
  ProviderUnsubscribe,
} from "@stuffbucket/maximal-model-contract"

import { Context, Service } from "@deepseek-ai/cordis"
import { createHash, randomUUID } from "node:crypto"
import { createReadStream } from "node:fs"
import { lstat, mkdir, open, rename, rm } from "node:fs/promises"
import { join } from "node:path"

import type {
  LocalModelLease,
  LocalModelManifest,
  LocalModelRegistrationDispose,
  LocalModelRunnerDescriptor,
  LocalModelSource,
} from "./types.ts"

import { resolveLocalModelsPath } from "./paths.ts"
import {
  assertCompatible,
  validateManifest,
  validateRunner,
} from "./validation.ts"

interface ProvisionContext {
  readonly onProgress: LocalModelProgressListener | undefined
  readonly signal: AbortSignal
}

interface ProvisionCaller {
  readonly onAbort: () => void
  readonly signal: AbortSignal
}

interface ProvisionOperation {
  readonly callers: Set<ProvisionCaller>
  readonly controller: AbortController
  promise: Promise<LocalModelCatalogEntry>
  settled: boolean
}

interface Registration {
  readonly lifecycle: AbortController
  readonly manifest: LocalModelManifest
  readonly source: LocalModelSource
  claim?: Lease
  provision?: ProvisionOperation
  state: LocalModelState
}

interface LeaseInit {
  readonly filePath: string
  readonly manifest: LocalModelManifest
  readonly release: () => void
  readonly runner: LocalModelRunnerDescriptor
}

class Lease implements LocalModelLease {
  readonly filePath: string
  readonly manifest: LocalModelManifest
  readonly runner: LocalModelRunnerDescriptor
  #release: (() => void) | undefined

  constructor(init: LeaseInit) {
    this.filePath = init.filePath
    this.manifest = init.manifest
    this.runner = init.runner
    this.#release = init.release
    Object.freeze(this)
  }

  get released(): boolean {
    return this.#release === undefined
  }

  dispose(): void {
    const release = this.#release
    this.#release = undefined
    release?.()
  }

  [Symbol.dispose](): void {
    this.dispose()
  }
}

function entry(
  manifest: LocalModelManifest,
  state: LocalModelState,
): LocalModelCatalogEntry {
  return Object.freeze({
    capabilities: manifest.capabilities,
    context: manifest.context,
    displayName: manifest.displayName,
    expectedBytes: manifest.expectedBytes,
    format: manifest.format,
    key: manifest.key,
    modelId: manifest.modelId,
    publication: manifest.publication,
    state,
  })
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ?
      signal.reason
    : new DOMException("Provisioning was aborted.", "AbortError")
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError(signal)
}

function isMissingPath(error: unknown): boolean {
  return (
    error instanceof Error
    && "code" in error
    && (error as NodeJS.ErrnoException).code === "ENOENT"
  )
}

/** Cordis service that owns local-model registration, artifacts, and claims. */
export class LocalModelRegistry
  extends Service
  implements LocalModelControl, AsyncDisposable
{
  readonly modelDirectory: string
  readonly #registrations = new Map<string, Registration>()
  readonly #listeners = new Set<LocalModelCatalogListener>()
  readonly #pending = new Set<Promise<unknown>>()
  #revision = 0
  #disposed = false
  #disposePromise: Promise<void> | undefined

  constructor(ctx: Context, suiteDataRoot?: string) {
    super(ctx, "localModels")
    this.modelDirectory = resolveLocalModelsPath({ suiteDataRoot })
    ctx.effect(() => () => this.dispose(), "dispose local-model registry")
  }

  registerModel = (
    manifestValue: LocalModelManifest,
    source: LocalModelSource,
  ): LocalModelRegistrationDispose => {
    this.#assertActive()
    const manifest = validateManifest(manifestValue)
    const sourceValue: unknown = source
    if (
      sourceValue === null
      || typeof sourceValue !== "object"
      || typeof (sourceValue as { readonly open?: unknown }).open !== "function"
    )
      throw new TypeError("source.open must be a function.")
    if (this.#registrations.has(manifest.key))
      throw new Error(`Local model "${manifest.key}" is already registered.`)

    const registration: Registration = {
      lifecycle: new AbortController(),
      manifest,
      source,
      state: "registered",
    }
    this.#registrations.set(manifest.key, registration)
    this.#publish()
    let registered = true
    return () => {
      if (!registered) return
      registered = false
      if (this.#registrations.get(manifest.key) !== registration) return
      registration.lifecycle.abort(
        new DOMException("Model registration was disposed.", "AbortError"),
      )
      registration.provision?.controller.abort(
        registration.lifecycle.signal.reason,
      )
      registration.claim?.dispose()
      this.#registrations.delete(manifest.key)
      this.#publish()
    }
  }

  list = (): LocalModelCatalogSnapshot => this.#snapshot()

  subscribe = (listener: LocalModelCatalogListener): ProviderUnsubscribe => {
    this.#assertActive()
    this.#listeners.add(listener)
    try {
      listener(this.#snapshot())
    } catch {
      // Observer failures cannot affect registry state.
    }
    let subscribed = true
    return () => {
      if (!subscribed) return
      subscribed = false
      this.#listeners.delete(listener)
    }
  }

  ensure = (
    modelKey: string,
    signal: AbortSignal,
    onProgress?: LocalModelProgressListener,
  ): Promise<LocalModelCatalogEntry> => {
    this.#assertActive()
    if (signal.aborted) return Promise.reject(abortError(signal))
    const registration = this.#registration(modelKey)
    if (registration.state === "ready")
      return Promise.resolve(entry(registration.manifest, "ready"))

    const operation =
      registration.provision
      ?? this.#startProvision(modelKey, registration, onProgress)
    return this.#joinProvision(operation, signal)
  }

  #startProvision(
    modelKey: string,
    registration: Registration,
    onProgress: LocalModelProgressListener | undefined,
  ): ProvisionOperation {
    const controller = new AbortController()
    const combined = AbortSignal.any([
      controller.signal,
      registration.lifecycle.signal,
    ])
    registration.state = "provisioning"
    this.#publish()

    const work = this.#provision(registration, {
      onProgress,
      signal: combined,
    })
      .then(() => {
        if (this.#registrations.get(modelKey) !== registration)
          throw abortError(registration.lifecycle.signal)
        registration.state = "ready"
        this.#publish()
        return entry(registration.manifest, "ready")
      })
      .catch((error: unknown) => {
        if (this.#registrations.get(modelKey) === registration) {
          registration.state = "failed"
          this.#publish()
        }
        throw error
      })
    const operation: ProvisionOperation = {
      callers: new Set(),
      controller,
      promise: work,
      settled: false,
    }
    const promise = work.finally(() => {
      operation.settled = true
      if (registration.provision === operation)
        registration.provision = undefined
      this.#pending.delete(promise)
    })
    operation.promise = promise
    registration.provision = operation
    this.#pending.add(promise)
    return operation
  }

  #joinProvision(
    operation: ProvisionOperation,
    signal: AbortSignal,
  ): Promise<LocalModelCatalogEntry> {
    return new Promise((resolve, reject) => {
      let attached = true
      let pending = true
      let callerAbort: Error | undefined
      const cleanup = (): void => {
        if (!attached) return
        attached = false
        signal.removeEventListener("abort", caller.onAbort)
        operation.callers.delete(caller)
      }
      const onAbort = (): void => {
        if (!pending) return
        callerAbort = abortError(signal)
        cleanup()
        if (!operation.settled && operation.callers.size === 0) {
          operation.controller.abort(callerAbort)
          return
        }
        pending = false
        reject(callerAbort)
      }
      const caller: ProvisionCaller = { onAbort, signal }

      operation.callers.add(caller)
      signal.addEventListener("abort", caller.onAbort, { once: true })
      if (signal.aborted) {
        caller.onAbort()
        return
      }
      void operation.promise.then(
        (value) => {
          if (!pending) return
          pending = false
          cleanup()
          if (callerAbort === undefined) resolve(value)
          else reject(callerAbort)
        },
        (error: unknown) => {
          if (!pending) return
          pending = false
          cleanup()
          if (callerAbort !== undefined) reject(callerAbort)
          else if (error instanceof Error) reject(error)
          else
            reject(
              new Error("Local-model provisioning failed.", { cause: error }),
            )
        },
      )
    })
  }

  claim = (
    modelKey: string,
    runnerValue: LocalModelRunnerDescriptor,
  ): LocalModelLease => {
    this.#assertActive()
    const registration = this.#registration(modelKey)
    if (registration.state !== "ready")
      throw new Error(`Local model "${modelKey}" is not ready.`)
    const runner = validateRunner(runnerValue)
    assertCompatible(registration.manifest, runner)
    if (registration.claim !== undefined && !registration.claim.released)
      throw new Error(
        `Local model "${modelKey}" already has a live runner claim.`,
      )

    const lease = new Lease({
      filePath: this.#targetPath(registration.manifest),
      manifest: registration.manifest,
      release: () => {
        if (registration.claim === lease) registration.claim = undefined
      },
      runner,
    })
    registration.claim = lease
    return lease
  }

  dispose = (): Promise<void> => {
    this.#disposePromise ??= this.#dispose()
    return this.#disposePromise
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.dispose()
  }

  async #dispose(): Promise<void> {
    this.#disposed = true
    for (const registration of this.#registrations.values()) {
      registration.lifecycle.abort(
        new DOMException("Local-model registry was disposed.", "AbortError"),
      )
      registration.provision?.controller.abort(
        registration.lifecycle.signal.reason,
      )
      registration.claim?.dispose()
    }
    this.#registrations.clear()
    this.#listeners.clear()
    await Promise.allSettled(this.#pending)
  }

  async #provision(
    registration: Registration,
    context: ProvisionContext,
  ): Promise<void> {
    const { manifest } = registration
    const target = this.#targetPath(manifest)
    this.#progress(manifest, context.onProgress, {
      completedBytes: 0,
      phase: "checking",
    })
    try {
      await this.#verifyFile(target, manifest, context.signal)
      this.#progress(manifest, context.onProgress, {
        completedBytes: manifest.expectedBytes,
        phase: "checking",
      })
      return
    } catch (error) {
      assertNotAborted(context.signal)
      if (!isMissingPath(error))
        throw new Error(
          "Existing local model artifact is invalid and was left unchanged. Remove it manually before retrying.",
          { cause: error },
        )
    }

    await mkdir(join(this.modelDirectory, ".staging"), { recursive: true })
    await mkdir(join(this.modelDirectory, manifest.key), { recursive: true })
    const staging = join(
      this.modelDirectory,
      ".staging",
      `${manifest.key}-${randomUUID()}.part`,
    )
    try {
      await this.#download(staging, registration, context)
      this.#progress(manifest, context.onProgress, {
        completedBytes: manifest.expectedBytes,
        phase: "verifying",
      })
      await this.#verifyFile(staging, manifest, context.signal)
      this.#progress(manifest, context.onProgress, {
        completedBytes: manifest.expectedBytes,
        phase: "committing",
      })
      assertNotAborted(context.signal)
      await rename(staging, target)
      await this.#syncDirectory(join(this.modelDirectory, manifest.key))
    } finally {
      await rm(staging, { force: true })
    }
  }

  async #download(
    staging: string,
    registration: Registration,
    context: ProvisionContext,
  ): Promise<void> {
    const handle = await open(staging, "wx", 0o600)
    let completed = 0
    try {
      const sourceValue: unknown = await registration.source.open(
        context.signal,
      )
      if (
        sourceValue === null
        || typeof sourceValue !== "object"
        || !(Symbol.asyncIterator in sourceValue)
      )
        throw new TypeError("source.open must return an async iterable.")
      const source = sourceValue as AsyncIterable<unknown>
      this.#progress(registration.manifest, context.onProgress, {
        completedBytes: 0,
        phase: "downloading",
      })
      for await (const chunk of source) {
        assertNotAborted(context.signal)
        if (!(chunk instanceof Uint8Array))
          throw new TypeError("A local-model source yielded a non-byte chunk.")
        if (completed + chunk.byteLength > registration.manifest.expectedBytes)
          throw new Error("Downloaded model exceeds its expected size.")
        let offset = 0
        while (offset < chunk.byteLength) {
          const { bytesWritten } = await handle.write(
            chunk,
            offset,
            chunk.byteLength - offset,
          )
          if (bytesWritten === 0)
            throw new Error("Local model artifact could not be fully written.")
          offset += bytesWritten
        }
        completed += chunk.byteLength
        this.#progress(registration.manifest, context.onProgress, {
          completedBytes: completed,
          phase: "downloading",
        })
      }
      assertNotAborted(context.signal)
      await handle.sync()
    } finally {
      await handle.close()
    }
  }

  async #verifyFile(
    path: string,
    manifest: LocalModelManifest,
    signal: AbortSignal,
  ): Promise<void> {
    const info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink())
      throw new Error("Local model artifact is not a regular file.")
    if (info.size !== manifest.expectedBytes)
      throw new Error("Local model artifact has an unexpected size.")

    const hash = createHash("sha256")
    const expectedSignature = Buffer.from(manifest.fileSignature.hex, "hex")
    const offset = manifest.fileSignature.offset ?? 0
    const signature = Buffer.alloc(expectedSignature.byteLength)
    let position = 0
    const stream = createReadStream(path) as AsyncIterable<Buffer>
    for await (const chunk of stream) {
      assertNotAborted(signal)
      hash.update(chunk)
      const start = Math.max(offset, position)
      const end = Math.min(
        offset + signature.byteLength,
        position + chunk.length,
      )
      if (start < end)
        chunk.copy(signature, start - offset, start - position, end - position)
      position += chunk.length
    }
    if (hash.digest("hex") !== manifest.sha256)
      throw new Error("Local model artifact failed SHA-256 verification.")
    if (!signature.equals(expectedSignature))
      throw new Error(
        "Local model artifact has an incompatible file signature.",
      )
  }

  async #syncDirectory(path: string): Promise<void> {
    let handle: Awaited<ReturnType<typeof open>> | undefined
    try {
      handle = await open(path, "r")
      await handle.sync()
    } catch (error) {
      if (process.platform !== "win32") throw error
    } finally {
      await handle?.close()
    }
  }

  #progress(
    manifest: LocalModelManifest,
    listener: LocalModelProgressListener | undefined,
    update: {
      readonly completedBytes: number
      readonly phase: LocalModelProvisionPhase
    },
  ): void {
    if (listener === undefined) return
    try {
      listener(
        Object.freeze({
          completedBytes: update.completedBytes,
          modelKey: manifest.key,
          phase: update.phase,
          totalBytes: manifest.expectedBytes,
        }),
      )
    } catch {
      // Progress observer failures cannot interrupt provisioning.
    }
  }

  #registration(modelKey: string): Registration {
    const registration = this.#registrations.get(modelKey)
    if (registration === undefined)
      throw new Error(`Unknown local model "${modelKey}".`)
    return registration
  }

  #targetPath(manifest: LocalModelManifest): string {
    return join(this.modelDirectory, manifest.key, manifest.fileName)
  }

  #snapshot(): LocalModelCatalogSnapshot {
    return Object.freeze({
      models: Object.freeze(
        [...this.#registrations.values()]
          .sort((left, right) =>
            left.manifest.key.localeCompare(right.manifest.key),
          )
          .map((registration) =>
            entry(registration.manifest, registration.state),
          ),
      ),
      revision: this.#revision,
    })
  }

  #publish(): void {
    this.#revision += 1
    const snapshot = this.#snapshot()
    for (const listener of this.#listeners) {
      try {
        listener(snapshot)
      } catch {
        // Observer failures cannot affect registry state.
      }
    }
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error("The local-model registry is disposed.")
  }
}
