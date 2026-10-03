import type {
  ModelRunnerLabelClassificationRequest,
  ModelRunnerLabelClassificationResult,
} from '@maximal/maximal-runner-llama-cpp'

import type { Gliner2ModelDefinition } from './models.js'

export const GLINER2_WORKER_PROTOCOL = 1

export interface Gliner2WorkerRequest {
  readonly id: string
  readonly kind: 'classify-labels'
  readonly model: Gliner2ModelDefinition
  readonly requestedModel: string
  readonly tasks: ModelRunnerLabelClassificationRequest['tasks']
  readonly text: string
}

export interface Gliner2WorkerReady {
  readonly kind: 'ready'
  readonly protocol: number
  readonly versions: Readonly<Record<string, string>>
}

export interface Gliner2WorkerResult {
  readonly id: string
  readonly kind: 'classification'
  readonly result: ModelRunnerLabelClassificationResult
}

export interface Gliner2WorkerFailure {
  readonly id?: string
  readonly kind: 'failed'
  readonly reason: string
}

export type Gliner2WorkerEvent =
  | Gliner2WorkerFailure
  | Gliner2WorkerReady
  | Gliner2WorkerResult

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ?
      Object.fromEntries(Object.entries(value))
    : undefined
}

function classificationResult(
  value: unknown,
): ModelRunnerLabelClassificationResult | undefined {
  const result = record(value)
  if (
    result?.kind !== 'classify-labels'
    || typeof result.model !== 'string'
    || !Array.isArray(result.tasks)
  ) {
    return undefined
  }
  const usage = record(result.usage)
  if (
    typeof usage?.inputTokens !== 'number'
    || typeof usage.outputTokens !== 'number'
  ) {
    return undefined
  }
  const tasks: ModelRunnerLabelClassificationResult['tasks'][number][] = []
  for (const taskValue of result.tasks) {
    const task = record(taskValue)
    const rawProbabilities = record(task?.probabilities)
    if (
      typeof task?.name !== 'string'
      || rawProbabilities === undefined
      || Object.values(rawProbabilities).some(
        (probability) => typeof probability !== 'number',
      )
    ) {
      return undefined
    }
    tasks.push({
      name: task.name,
      probabilities: Object.fromEntries(
        Object.entries(rawProbabilities).map(([label, probability]) => [
          label,
          typeof probability === 'number' ? probability : Number.NaN,
        ]),
      ),
    })
  }
  return {
    kind: 'classify-labels',
    model: result.model,
    tasks,
    usage: {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    },
  }
}

export function parseWorkerEvent(line: string): Gliner2WorkerEvent {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch (error) {
    throw new Error(
      `The GLiNER2 worker emitted invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    )
  }
  const value = record(parsed)
  if (value === undefined || typeof value.kind !== 'string') {
    throw new Error('The GLiNER2 worker emitted an invalid event.')
  }
  if (value.kind === 'ready') {
    if (typeof value.protocol !== 'number' || record(value.versions) === undefined) {
      throw new Error('The GLiNER2 worker emitted an invalid ready event.')
    }
    return {
      kind: 'ready',
      protocol: value.protocol,
      versions: Object.fromEntries(
        Object.entries(record(value.versions) ?? {}).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      ),
    }
  }
  if (value.kind === 'failed') {
    if (typeof value.reason !== 'string') {
      throw new Error('The GLiNER2 worker emitted an invalid failure event.')
    }
    return {
      kind: 'failed',
      reason: value.reason,
      ...(typeof value.id === 'string' ? { id: value.id } : {}),
    }
  }
  const result = classificationResult(value.result)
  if (value.kind !== 'classification' || typeof value.id !== 'string' || result === undefined) {
    throw new Error('The GLiNER2 worker emitted an invalid result event.')
  }
  return {
    id: value.id,
    kind: 'classification',
    result,
  }
}
