export const MODEL_RUNNER_OPERATIONS = Object.freeze([
  'generate',
  'score-token-candidates',
  'classify-labels',
] as const)

export type ModelRunnerOperation = (typeof MODEL_RUNNER_OPERATIONS)[number]

export interface ModelRunnerMessage {
  readonly role: 'assistant' | 'system' | 'user'
  readonly content: string
}

export interface ModelRunnerUsage {
  readonly inputTokens: number
  readonly outputTokens: number
}

export interface ModelRunnerGenerateRequest {
  readonly kind: 'generate'
  readonly model: string
  readonly messages: ReadonlyArray<ModelRunnerMessage>
  readonly maxOutputTokens: number
}

export interface ModelRunnerGenerateResult {
  readonly kind: 'generate'
  readonly model: string
  readonly text: string
  readonly usage: ModelRunnerUsage
}

export interface ModelRunnerCandidateRow {
  readonly messages: ReadonlyArray<ModelRunnerMessage>
  readonly candidates: ReadonlyArray<string>
}

export interface ModelRunnerCandidateScoreRequest {
  readonly kind: 'score-token-candidates'
  readonly model: string
  readonly rows: ReadonlyArray<ModelRunnerCandidateRow>
}

export interface ModelRunnerCandidateScoreResult {
  readonly kind: 'score-token-candidates'
  readonly model: string
  readonly probabilities: ReadonlyArray<ReadonlyArray<number>>
  readonly usage: ModelRunnerUsage
}

export interface ModelRunnerLabel {
  readonly value: string
  readonly description?: string
}

export interface ModelRunnerLabelTask {
  readonly name: string
  readonly labels: ReadonlyArray<ModelRunnerLabel>
  readonly prompt?: string
  readonly ordered?: boolean
}

export interface ModelRunnerLabelClassificationRequest {
  readonly kind: 'classify-labels'
  readonly model: string
  readonly text: string
  readonly tasks: ReadonlyArray<ModelRunnerLabelTask>
}

export interface ModelRunnerLabelClassification {
  readonly name: string
  readonly probabilities: Readonly<Record<string, number>>
}

export interface ModelRunnerLabelClassificationResult {
  readonly kind: 'classify-labels'
  readonly model: string
  readonly tasks: ReadonlyArray<ModelRunnerLabelClassification>
  readonly usage: ModelRunnerUsage
}

export type ModelRunnerRequest =
  | ModelRunnerGenerateRequest
  | ModelRunnerCandidateScoreRequest
  | ModelRunnerLabelClassificationRequest

export type ModelRunnerResult =
  | ModelRunnerGenerateResult
  | ModelRunnerCandidateScoreResult
  | ModelRunnerLabelClassificationResult

export type ModelRunnerResultFor<TRequest extends ModelRunnerRequest> =
  TRequest extends ModelRunnerGenerateRequest ? ModelRunnerGenerateResult
  : TRequest extends ModelRunnerCandidateScoreRequest ?
    ModelRunnerCandidateScoreResult
  : TRequest extends ModelRunnerLabelClassificationRequest ?
    ModelRunnerLabelClassificationResult
  : never

export interface ModelRunnerExecutionOptions {
  readonly signal: AbortSignal
  readonly onText?: (text: string) => void
}

export interface ModelRunner {
  readonly operations: ReadonlyArray<ModelRunnerOperation>
  execute<TRequest extends ModelRunnerRequest>(
    request: TRequest,
    options: ModelRunnerExecutionOptions,
  ): Promise<ModelRunnerResultFor<TRequest>>
}
