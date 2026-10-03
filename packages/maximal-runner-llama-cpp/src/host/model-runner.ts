import { randomUUID } from 'node:crypto'

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
} from '../runner-contract.js'

import { listen, send } from './llama-host.js'

function errorFrom(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

export interface LlamaCppResolvedModel {
  readonly contextSize: number
  readonly modelPath: string
  readonly systemPrompt?: string
}

export interface LlamaCppModelRunnerOptions {
  readonly resolveModel: (
    model: string,
  ) => LlamaCppResolvedModel | Promise<LlamaCppResolvedModel>
}

export class LlamaCppModelRunner implements ModelRunner {
  readonly operations: ReadonlyArray<ModelRunnerOperation> = Object.freeze([
    'score-token-candidates',
  ])

  readonly #resolveModel: LlamaCppModelRunnerOptions['resolveModel']

  constructor(options: LlamaCppModelRunnerOptions) {
    this.#resolveModel = options.resolveModel
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
    if (request.kind !== 'score-token-candidates') {
      throw new Error(`The llama.cpp runner does not support ${request.kind}.`)
    }
    if (options.signal.aborted) {
      throw errorFrom(options.signal.reason)
    }

    const resolved = await this.#resolveModel(request.model)
    if (options.signal.aborted) {
      throw errorFrom(options.signal.reason)
    }
    const id = randomUUID()
    return await new Promise<ModelRunnerCandidateScoreResult>(
      (resolve, reject) => {
        let settled = false
        const finish = (operation: () => void): void => {
          if (settled) return
          settled = true
          stop()
          options.signal.removeEventListener('abort', abort)
          operation()
        }
        const abort = (): void => {
          try {
            send({ kind: 'abort' })
          } finally {
            finish(() => reject(errorFrom(options.signal.reason)))
          }
        }
        const stop = listen(id, (event) => {
          if (event.kind === 'candidate-scores') {
            finish(() =>
              resolve({
                kind: 'score-token-candidates',
                model: request.model,
                probabilities: event.probabilities,
                usage: {
                  inputTokens: event.inputTokens,
                  outputTokens: event.outputTokens,
                },
              }),
            )
          } else if (event.kind === 'failed') {
            finish(() => reject(new Error(event.reason)))
          }
        })
        options.signal.addEventListener('abort', abort, { once: true })

        try {
          send({
            kind: 'score-token-candidates',
            id,
            modelPath: resolved.modelPath,
            contextSize: resolved.contextSize,
            ...(resolved.systemPrompt === undefined
              ? {}
              : { systemPrompt: resolved.systemPrompt }),
            rows: request.rows,
          })
        } catch (error) {
          finish(() => reject(errorFrom(error)))
        }
      },
    )
  }
}
