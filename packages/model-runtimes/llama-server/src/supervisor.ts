import type { LocalModelLease } from "@stuffbucket/local-model-registry"

import { spawn as nodeSpawn } from "node:child_process"
import { randomBytes } from "node:crypto"
import { createServer } from "node:net"

const LOOPBACK_HOST = "127.0.0.1"
const HEALTH_PATH = "/health"
const HEALTH_POLL_MS = 25
const API_KEY_BYTES = 32

export interface SupervisedProcess {
  readonly stdout: NodeJS.ReadableStream | null
  readonly stderr: NodeJS.ReadableStream | null
  kill(signal?: NodeJS.Signals | number): boolean
  once(event: "error", listener: (error: Error) => void): this
  once(
    event: "exit",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): this
}

export type ProcessSpawn = (
  executable: string,
  arguments_: ReadonlyArray<string>,
) => SupervisedProcess

export interface SupervisorDependencies {
  readonly createApiKey?: () => string
  readonly fetch?: typeof fetch
  readonly reservePort?: (signal: AbortSignal) => Promise<number>
  readonly spawn?: ProcessSpawn
}

export interface SupervisorConfig {
  readonly executablePath: string
  readonly serverArguments: ReadonlyArray<string>
  readonly maxRestarts: number
  readonly startupTimeoutMs: number
  readonly shutdownTimeoutMs: number
}

interface Launch {
  readonly apiKey: string
  readonly child: SupervisedProcess
  readonly origin: string
  readonly exited: Promise<void>
  alive: boolean
}

export class LlamaServerProcessError extends Error {
  constructor(message: string) {
    super(`llama-server: ${message}`)
    this.name = "LlamaServerProcessError"
  }
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ?
      signal.reason
    : new DOMException("Operation was aborted.", "AbortError")
}

function errorReason(error: unknown): Error {
  return error instanceof Error ? error : new Error("Operation failed.")
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortReason(signal)
}

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  assertNotAborted(signal)
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(done, milliseconds)
    timeout.unref()
    signal.addEventListener("abort", aborted, { once: true })
    function cleanup(): void {
      clearTimeout(timeout)
      signal.removeEventListener("abort", aborted)
    }
    function done(): void {
      cleanup()
      resolve()
    }
    function aborted(): void {
      cleanup()
      reject(abortReason(signal))
    }
  })
}

async function defaultReservePort(signal: AbortSignal): Promise<number> {
  assertNotAborted(signal)
  return await new Promise((resolve, reject) => {
    const server = createServer()
    const aborted = (): void => {
      server.close()
      reject(abortReason(signal))
    }
    signal.addEventListener("abort", aborted, { once: true })
    server.once("error", (error) => {
      signal.removeEventListener("abort", aborted)
      reject(error)
    })
    server.listen({ host: LOOPBACK_HOST, port: 0, exclusive: true }, () => {
      const address = server.address()
      if (address === null || typeof address === "string") {
        server.close()
        signal.removeEventListener("abort", aborted)
        reject(new Error("No TCP port was allocated."))
        return
      }
      const { port } = address
      server.close((error) => {
        signal.removeEventListener("abort", aborted)
        if (error === undefined) resolve(port)
        else reject(error)
      })
    })
  })
}

function defaultCreateApiKey(): string {
  return randomBytes(API_KEY_BYTES).toString("base64url")
}

function authenticatedHeaders(
  headersValue: RequestInit["headers"],
  apiKey: string,
): Headers {
  const headers = new Headers(headersValue)
  headers.set("authorization", `Bearer ${apiKey}`)
  return headers
}

function defaultSpawn(
  executable: string,
  arguments_: ReadonlyArray<string>,
): SupervisedProcess {
  return nodeSpawn(executable, arguments_, {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  })
}

function drain(stream: NodeJS.ReadableStream | null): void {
  if (stream === null) return
  stream.on("data", () => undefined)
  stream.on("error", () => undefined)
  stream.resume()
}

function privateOrigin(port: number): string {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new LlamaServerProcessError("ephemeral port allocation failed")
  }
  return `http://${LOOPBACK_HOST}:${port}`
}

async function waitForCaller<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  assertNotAborted(signal)
  return await new Promise((resolve, reject) => {
    const aborted = (): void => reject(abortReason(signal))
    signal.addEventListener("abort", aborted, { once: true })
    void promise.then(
      (value) => {
        signal.removeEventListener("abort", aborted)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener("abort", aborted)
        reject(errorReason(error))
      },
    )
  })
}

/** Owns one private, lazily started llama.cpp server process. */
export class LlamaServerSupervisor implements AsyncDisposable {
  readonly #lease: LocalModelLease
  readonly #config: SupervisorConfig
  readonly #createApiKey: () => string
  readonly #fetch: typeof fetch
  readonly #reservePort: (signal: AbortSignal) => Promise<number>
  readonly #spawn: ProcessSpawn
  readonly #lifecycle = new AbortController()
  #current: Launch | undefined
  #starting: Promise<Launch> | undefined
  #launches = 0
  #disposed = false
  #disposePromise: Promise<void> | undefined

  constructor(
    lease: LocalModelLease,
    config: SupervisorConfig,
    dependencies: SupervisorDependencies = {},
  ) {
    this.#lease = lease
    this.#config = config
    this.#createApiKey = dependencies.createApiKey ?? defaultCreateApiKey
    this.#fetch = dependencies.fetch ?? fetch
    this.#reservePort = dependencies.reservePort ?? defaultReservePort
    this.#spawn = dependencies.spawn ?? defaultSpawn
  }

  async request(
    path: string,
    init: RequestInit,
    signal: AbortSignal,
  ): Promise<Response> {
    if (!path.startsWith("/") || path.startsWith("//")) {
      throw new TypeError("llama-server request path must be absolute")
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      assertNotAborted(signal)
      const launch = await waitForCaller(this.#start(), signal)
      try {
        return await this.#fetch(`${launch.origin}${path}`, {
          ...init,
          headers: authenticatedHeaders(init.headers, launch.apiKey),
          signal: AbortSignal.any([signal, this.#lifecycle.signal]),
        })
      } catch {
        assertNotAborted(signal)
        if (this.#disposed || this.#lifecycle.signal.aborted) {
          throw new LlamaServerProcessError("process supervisor is disposed")
        }
        await this.#retire(launch)
      }
    }
    throw new LlamaServerProcessError(
      "private server request failed after the bounded restart attempt",
    )
  }

  dispose(): Promise<void> {
    this.#disposePromise ??= this.#dispose()
    return this.#disposePromise
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.dispose()
  }

  async #start(): Promise<Launch> {
    if (this.#disposed) {
      throw new LlamaServerProcessError("process supervisor is disposed")
    }
    if (this.#current?.alive === true) return this.#current
    this.#starting ??= this.#launch().finally(() => {
      this.#starting = undefined
    })
    return await this.#starting
  }

  async #launch(): Promise<Launch> {
    if (this.#launches >= this.#config.maxRestarts + 1) {
      throw new LlamaServerProcessError("process restart limit was reached")
    }
    this.#launches += 1
    const signal = this.#lifecycle.signal
    let port: number
    try {
      port = await this.#reservePort(signal)
    } catch {
      assertNotAborted(signal)
      throw new LlamaServerProcessError("ephemeral port allocation failed")
    }
    assertNotAborted(signal)
    const origin = privateOrigin(port)
    let apiKey: string
    try {
      apiKey = this.#createApiKey()
      if (apiKey.length === 0 || /\s|\0/u.test(apiKey)) throw new Error()
    } catch {
      throw new LlamaServerProcessError(
        "could not initialize private server authentication",
      )
    }
    let child: SupervisedProcess
    try {
      child = this.#spawn(this.#config.executablePath, [
        ...this.#config.serverArguments,
        "--model",
        this.#lease.filePath,
        "--host",
        LOOPBACK_HOST,
        "--port",
        String(port),
        "--api-key",
        apiKey,
      ])
    } catch {
      throw new LlamaServerProcessError(
        "could not launch the configured executable",
      )
    }
    drain(child.stdout)
    drain(child.stderr)
    let settleExit: (() => void) | undefined
    const launch: Launch = {
      apiKey,
      child,
      origin,
      alive: true,
      exited: new Promise((resolve) => {
        settleExit = resolve
      }),
    }
    const exited = (): void => {
      if (!launch.alive) return
      launch.alive = false
      settleExit?.()
      if (this.#current === launch) this.#current = undefined
    }
    child.once("exit", exited)
    child.once("error", exited)
    this.#current = launch
    try {
      await this.#ready(launch)
      return launch
    } catch (error) {
      await this.#stop(launch)
      if (signal.aborted) throw abortReason(signal)
      if (error instanceof LlamaServerProcessError) throw error
      throw new LlamaServerProcessError("private server did not become ready")
    }
  }

  async #ready(launch: Launch): Promise<void> {
    const signal = this.#lifecycle.signal
    const deadline = Date.now() + this.#config.startupTimeoutMs
    while (Date.now() < deadline) {
      assertNotAborted(signal)
      if (!launch.alive) {
        throw new LlamaServerProcessError(
          "private server exited during startup",
        )
      }
      try {
        const response = await this.#fetch(`${launch.origin}${HEALTH_PATH}`, {
          method: "GET",
          headers: authenticatedHeaders(undefined, launch.apiKey),
          signal,
        })
        if (response.body !== null) {
          void response.body.cancel("llama-server health response consumed")
        }
        if (response.ok) return
      } catch {
        assertNotAborted(signal)
      }
      await wait(HEALTH_POLL_MS, signal)
    }
    throw new LlamaServerProcessError("private server startup timed out")
  }

  async #retire(launch: Launch): Promise<void> {
    if (this.#current === launch) this.#current = undefined
    await this.#stop(launch)
  }

  async #stop(launch: Launch): Promise<void> {
    if (!launch.alive) return
    launch.child.kill("SIGTERM")
    const stopped = await Promise.race([
      launch.exited.then(() => true),
      wait(
        this.#config.shutdownTimeoutMs,
        AbortSignal.timeout(this.#config.shutdownTimeoutMs + 1),
      ).then(() => false),
    ]).catch(() => false)
    if (!stopped) {
      launch.child.kill("SIGKILL")
      await Promise.race([
        launch.exited,
        wait(
          this.#config.shutdownTimeoutMs,
          AbortSignal.timeout(this.#config.shutdownTimeoutMs + 1),
        ),
      ]).catch(() => undefined)
    }
  }

  async #dispose(): Promise<void> {
    if (this.#disposed) return
    this.#disposed = true
    this.#lifecycle.abort(
      new DOMException("llama-server supervisor disposed", "AbortError"),
    )
    const starting = this.#starting
    if (starting !== undefined) await starting.catch(() => undefined)
    const launch = this.#current
    this.#current = undefined
    if (launch !== undefined) await this.#stop(launch)
  }
}
