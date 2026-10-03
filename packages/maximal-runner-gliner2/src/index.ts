import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

import type {
  ModelRunner,
  ModelRunnerCandidateScoreRequest,
  ModelRunnerCandidateScoreResult,
  ModelRunnerExecutionOptions,
  ModelRunnerGenerateRequest,
  ModelRunnerGenerateResult,
  ModelRunnerLabelClassificationRequest,
  ModelRunnerLabelClassificationResult,
  ModelRunnerOperation,
  ModelRunnerRequest,
  ModelRunnerResult,
} from '@maximal/maximal-runner-llama-cpp'

import {
  resolveGliner2Model,
  type Gliner2ModelDefinition,
} from './models.js'
import {
  GLINER2_WORKER_PROTOCOL,
  parseWorkerEvent,
  type Gliner2WorkerEvent,
  type Gliner2WorkerRequest,
} from './protocol.js'

const DEFAULT_STARTUP_TIMEOUT_MS = 30_000
const DEFAULT_WORKER_PATH = fileURLToPath(new URL('../worker.py', import.meta.url))

export type Gliner2Device = 'auto' | 'cpu' | 'mps'

export interface Gliner2ModelRunnerOptions {
  readonly cacheDirectory: string
  readonly device?: Gliner2Device
  readonly pythonExecutable: string
  readonly resolveModel?: (
    model: string,
  ) => Gliner2ModelDefinition | Promise<Gliner2ModelDefinition>
  readonly startupTimeoutMs?: number
  readonly workerEnvironment?: Readonly<Record<string, string>>
  readonly workerPath?: string
}

interface Pending {
  readonly id: string
  readonly reject: (error: Error) => void
  readonly resolve: (result: ModelRunnerLabelClassificationResult) => void
}

function errorFrom(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

export class Gliner2ModelRunner implements ModelRunner {
  readonly operations: ReadonlyArray<ModelRunnerOperation> = Object.freeze([
    'classify-labels',
  ])

  readonly #options: Gliner2ModelRunnerOptions
  readonly #resolveModel: NonNullable<Gliner2ModelRunnerOptions['resolveModel']>
  #child: ChildProcessWithoutNullStreams | undefined
  #pending: Pending | undefined
  #ready: Promise<void> | undefined
  #stderr = ''
  #executing = false

  constructor(options: Gliner2ModelRunnerOptions) {
    if (options.pythonExecutable.trim() === '') {
      throw new TypeError('pythonExecutable must not be empty.')
    }
    if (!isAbsolute(options.pythonExecutable)) {
      throw new TypeError('pythonExecutable must be an absolute path.')
    }
    if (options.cacheDirectory.trim() === '') {
      throw new TypeError('cacheDirectory must not be empty.')
    }
    this.#options = options
    this.#resolveModel = options.resolveModel ?? resolveGliner2Model
  }

  execute(
    request: ModelRunnerGenerateRequest,
    options: ModelRunnerExecutionOptions,
  ): Promise<ModelRunnerGenerateResult>
  execute(
    request: ModelRunnerCandidateScoreRequest,
    options: ModelRunnerExecutionOptions,
  ): Promise<ModelRunnerCandidateScoreResult>
  execute(
    request: ModelRunnerLabelClassificationRequest,
    options: ModelRunnerExecutionOptions,
  ): Promise<ModelRunnerLabelClassificationResult>
  async execute(
    request: ModelRunnerRequest,
    options: ModelRunnerExecutionOptions,
  ): Promise<ModelRunnerResult> {
    if (request.kind !== 'classify-labels') {
      throw new Error(`The GLiNER2 runner does not support ${request.kind}.`)
    }
    if (this.#executing) {
      throw new Error('The GLiNER2 runner is busy.')
    }
    if (options.signal.aborted) throw errorFrom(options.signal.reason)
    this.#executing = true
    try {
      const model = await this.#resolveModel(request.model)
      if (options.signal.aborted) throw errorFrom(options.signal.reason)
      await this.#ensureWorker()
      if (options.signal.aborted) throw errorFrom(options.signal.reason)

      const id = randomUUID()
      const workerRequest: Gliner2WorkerRequest = {
        id,
        kind: 'classify-labels',
        model,
        requestedModel: request.model,
        tasks: request.tasks,
        text: request.text,
      }
      return await new Promise<ModelRunnerLabelClassificationResult>(
        (resolve, reject) => {
          const abort = (): void => {
            const reason = errorFrom(options.signal.reason)
            this.#stopWorker(reason)
          }
          const finishResolve = (
            result: ModelRunnerLabelClassificationResult,
          ): void => {
            options.signal.removeEventListener('abort', abort)
            resolve(result)
          }
          const finishReject = (error: Error): void => {
            options.signal.removeEventListener('abort', abort)
            reject(error)
          }
          this.#pending = {
            id,
            reject: finishReject,
            resolve: finishResolve,
          }
          options.signal.addEventListener('abort', abort, { once: true })

          try {
            this.#child?.stdin.write(`${JSON.stringify(workerRequest)}\n`)
          } catch (error) {
            this.#pending = undefined
            finishReject(errorFrom(error))
          }
        },
      )
    } finally {
      this.#executing = false
    }
  }

  dispose(): Promise<void> {
    this.#stopWorker(new Error('The GLiNER2 runner was disposed.'))
    return Promise.resolve()
  }

  async #ensureWorker(): Promise<void> {
    if (this.#ready !== undefined) return await this.#ready

    const child = spawn(
      this.#options.pythonExecutable,
      [this.#options.workerPath ?? DEFAULT_WORKER_PATH],
      {
        env: {
          ...this.#options.workerEnvironment,
          HF_HOME: this.#options.cacheDirectory,
          MAXIMAL_GLINER2_DEVICE: this.#options.device ?? 'auto',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )
    this.#child = child
    this.#stderr = ''

    this.#ready = new Promise<void>((resolve, reject) => {
      let output = ''
      let settled = false
      const timeout = setTimeout(() => {
        fail(
          new Error(
            `The GLiNER2 worker did not become ready within ${this.#options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS} ms.`,
          ),
        )
      }, this.#options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS)
      const succeed = (): void => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        resolve()
      }
      const fail = (error: Error): void => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        this.#stopWorker(error)
        reject(error)
      }
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => {
        output += chunk
        let newline = output.indexOf('\n')
        while (newline >= 0) {
          const line = output.slice(0, newline).trim()
          output = output.slice(newline + 1)
          if (line !== '') {
            try {
              const event = parseWorkerEvent(line)
              if (event.kind === 'ready') {
                if (event.protocol !== GLINER2_WORKER_PROTOCOL) {
                  fail(
                    new Error(
                      `The GLiNER2 worker protocol is ${event.protocol}; expected ${GLINER2_WORKER_PROTOCOL}.`,
                    ),
                  )
                } else {
                  succeed()
                }
              } else {
                this.#handleEvent(event)
              }
            } catch (error) {
              if (settled) this.#stopWorker(errorFrom(error))
              else fail(errorFrom(error))
            }
          }
          newline = output.indexOf('\n')
        }
      })
      child.stderr.setEncoding('utf8')
      child.stderr.on('data', (chunk: string) => {
        this.#stderr = `${this.#stderr}${chunk}`.slice(-8_192)
      })
      child.on('error', (error) => fail(error))
      child.on('exit', (code, signal) => {
        const detail = this.#stderr.trim()
        const reason = new Error(
          `The GLiNER2 worker exited (code=${String(code)}, signal=${String(signal)})${detail === '' ? '.' : `: ${detail}`}`,
        )
        if (!settled) fail(reason)
        else this.#workerExited(reason)
      })
    })
    return await this.#ready
  }

  #handleEvent(event: Exclude<Gliner2WorkerEvent, { kind: 'ready' }>): void {
    if (event.kind === 'failed' && event.id === undefined) {
      this.#stopWorker(new Error(event.reason))
      return
    }
    if (this.#pending === undefined || this.#pending.id !== event.id) return

    const pending = this.#pending
    this.#pending = undefined
    if (event.kind === 'failed') pending.reject(new Error(event.reason))
    else pending.resolve(event.result)
  }

  #workerExited(reason: Error): void {
    this.#child = undefined
    this.#ready = undefined
    const pending = this.#pending
    this.#pending = undefined
    pending?.reject(reason)
  }

  #stopWorker(reason: Error): void {
    const child = this.#child
    this.#child = undefined
    this.#ready = undefined
    const pending = this.#pending
    this.#pending = undefined
    pending?.reject(reason)
    child?.kill()
  }
}

export {
  GLINER2_MODELS,
  resolveGliner2Model,
  type Gliner2ModelDefinition,
} from './models.js'
export {
  GLINER2_WORKER_PROTOCOL,
  parseWorkerEvent,
  type Gliner2WorkerEvent,
  type Gliner2WorkerFailure,
  type Gliner2WorkerReady,
  type Gliner2WorkerRequest,
  type Gliner2WorkerResult,
} from './protocol.js'
