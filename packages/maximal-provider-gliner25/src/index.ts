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
} from "@maximal/maximal-runner-llama-cpp"

import {
  resolveDecisionModel,
  UnsupportedDecisionModelError,
} from "@maximal/maximal-provider-decision-model"
import { randomUUID } from "node:crypto"
import { z } from "zod"

const gliner25BackendSchema = z.enum(["pytorch", "mlx", "onnx"])
const gliner25PrecisionSchema = z.enum(["fp32", "fp16", "bf16", "int8", "int4"])
const runnerUsageSchema = z
  .object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.literal(0),
  })
  .strict()
const runnerErrorSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
  })
  .strict()
const runnerResponseSchema = z
  .object({
    request_id: z.uuid(),
    model: z.string(),
    backend: gliner25BackendSchema,
    precision: gliner25PrecisionSchema,
    output: z.record(z.string(), z.unknown()).nullable(),
    error: runnerErrorSchema.nullable(),
    timing: z
      .object({
        queue_ms: z.number().nonnegative(),
        inference_ms: z.number().nonnegative(),
      })
      .strict(),
    usage: runnerUsageSchema,
  })
  .strict()
  .refine((value) => (value.output === null) !== (value.error === null), {
    message: "exactly one of output or error must be present",
  })
const apiErrorSchema = z.looseObject({
  detail: runnerErrorSchema,
})
const taskOutputSchema = z.looseObject({
  probabilities: z.record(z.string(), z.number().nonnegative()),
})

export type Gliner25Backend = z.infer<typeof gliner25BackendSchema>
export type Gliner25Precision = z.infer<typeof gliner25PrecisionSchema>

export type Gliner25ProviderFetch = (
  input: string | URL | globalThis.Request,
  init?: RequestInit,
) => Promise<Response>

export interface Gliner25ProviderOptions {
  readonly backend: Gliner25Backend
  readonly baseUrl: string
  readonly fetch?: Gliner25ProviderFetch
  readonly headers?: Readonly<Record<string, string>>
  readonly precision: Gliner25Precision
  readonly resolveRunnerModel?: (model: string) => string
}

export class Gliner25ProviderError extends Error {
  readonly code: string
  readonly retryable: boolean
  readonly status: number

  constructor(
    message: string,
    options: {
      readonly code: string
      readonly retryable?: boolean
      readonly status: number
    },
  ) {
    super(message)
    this.name = "Gliner25ProviderError"
    this.code = options.code
    this.retryable = options.retryable ?? false
    this.status = options.status
  }
}

function withoutTrailingSlashes(value: string): string {
  let end = value.length
  while (end > 0 && value.codePointAt(end - 1) === 47) end -= 1
  return value.slice(0, end)
}

function normalizedBaseUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch (error) {
    throw new TypeError(
      `baseUrl must be an absolute URL: ${errorFrom(error).message}`,
      { cause: error },
    )
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("baseUrl must use HTTP or HTTPS.")
  }
  if (url.username !== "" || url.password !== "") {
    throw new TypeError("baseUrl must not contain credentials.")
  }
  if (url.search !== "" || url.hash !== "") {
    throw new TypeError("baseUrl must not contain a query or fragment.")
  }
  return withoutTrailingSlashes(url.href)
}

function endpoint(baseUrl: string): string {
  return `${baseUrl}/v1/infer`
}

function ownRecord<T>(
  entries: ReadonlyArray<readonly [string, T]>,
): Record<string, T> {
  const result: Record<string, T> = {}
  for (const [key, value] of entries) {
    Object.defineProperty(result, key, {
      configurable: true,
      enumerable: true,
      value,
      writable: true,
    })
  }
  return result
}

function errorFrom(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

function requireGliner25Model(model: string): void {
  let definition: ReturnType<typeof resolveDecisionModel>
  try {
    definition = resolveDecisionModel(model)
  } catch (error) {
    if (!(error instanceof UnsupportedDecisionModelError)) throw error
    throw new Gliner25ProviderError(error.message, {
      code: "unsupported_model",
      status: 400,
    })
  }
  if (definition.family !== "gliner25") {
    throw new Gliner25ProviderError(
      `Model "${model}" is not a GLiNER2.5 decision model.`,
      { code: "unsupported_model", status: 400 },
    )
  }
}

function runnerTask(
  task: ModelRunnerLabelClassificationRequest["tasks"][number],
): Readonly<Record<string, unknown>> {
  if (task.labels.length === 0) {
    throw new TypeError(`Classification task "${task.name}" has no labels.`)
  }
  const values = task.labels.map(({ value }) => value)
  if (new Set(values).size !== values.length) {
    throw new TypeError(
      `Classification task "${task.name}" has duplicate labels.`,
    )
  }
  const descriptions = task.labels.flatMap(({ value, description }) =>
    description === undefined ? [] : [[value, description] as const],
  )
  return {
    labels: values,
    ...(descriptions.length === 0 ?
      {}
    : { label_descriptions: ownRecord(descriptions) }),
    ...(task.ordered === undefined ? {} : { ordered: task.ordered }),
    ...(task.prompt === undefined ? {} : { instruction: task.prompt }),
  }
}

interface RunnerRequestInput {
  readonly options: Gliner25ProviderOptions
  readonly request: ModelRunnerLabelClassificationRequest
  readonly requestId: string
  readonly runnerModel: string
}

function runnerRequest({
  request,
  options,
  requestId,
  runnerModel,
}: RunnerRequestInput): Readonly<Record<string, unknown>> {
  if (request.tasks.length === 0) {
    throw new TypeError(
      "A GLiNER2.5 classification requires at least one task.",
    )
  }
  const names = request.tasks.map(({ name }) => name)
  if (new Set(names).size !== names.length) {
    throw new TypeError("GLiNER2.5 classification task names must be unique.")
  }
  return {
    request_id: requestId,
    model: runnerModel,
    backend: options.backend,
    precision: options.precision,
    operation: "classify",
    text: request.text,
    schema: {
      kind: "classification",
      tasks: ownRecord(
        request.tasks.map((task) => [task.name, runnerTask(task)] as const),
      ),
    },
    options: {
      include_confidence: true,
      output_format: "native",
    },
  }
}

interface ClassificationResultInput {
  readonly request: ModelRunnerLabelClassificationRequest
  readonly requestId: string
  readonly runnerModel: string
  readonly value: z.infer<typeof runnerResponseSchema>
}

function classificationResult({
  request,
  requestId,
  runnerModel,
  value,
}: ClassificationResultInput): ModelRunnerLabelClassificationResult {
  if (value.request_id !== requestId) {
    throw new Gliner25ProviderError(
      `gliner-runner returned request "${value.request_id}" for "${requestId}".`,
      { code: "request_mismatch", status: 502 },
    )
  }
  if (value.model !== runnerModel) {
    throw new Gliner25ProviderError(
      `gliner-runner returned model "${value.model}" for "${runnerModel}".`,
      { code: "model_mismatch", status: 502 },
    )
  }
  if (value.error !== null) {
    throw new Gliner25ProviderError(value.error.message, {
      code: value.error.code,
      retryable: value.error.retryable,
      status: 502,
    })
  }
  if (value.output === null) {
    throw new Gliner25ProviderError(
      "gliner-runner returned neither output nor an error.",
      { code: "invalid_response", status: 502 },
    )
  }
  const tasks = request.tasks.map((requestedTask) => {
    const parsed = taskOutputSchema.safeParse(
      value.output?.[requestedTask.name],
    )
    if (!parsed.success) {
      throw new Gliner25ProviderError(
        `gliner-runner omitted classification task "${requestedTask.name}".`,
        { code: "invalid_response", status: 502 },
      )
    }
    const expected = new Set(requestedTask.labels.map(({ value }) => value))
    const actual = Object.keys(parsed.data.probabilities)
    if (
      actual.length !== expected.size
      || actual.some((label) => !expected.has(label))
    ) {
      throw new Gliner25ProviderError(
        `gliner-runner returned unexpected labels for task "${requestedTask.name}".`,
        { code: "invalid_response", status: 502 },
      )
    }
    return {
      name: requestedTask.name,
      probabilities: ownRecord(
        requestedTask.labels.map(({ value: label }) => [
          label,
          parsed.data.probabilities[label] ?? 0,
        ]),
      ),
    }
  })
  return {
    kind: "classify-labels",
    model: request.model,
    tasks,
    usage: {
      inputTokens: value.usage.inputTokens,
      outputTokens: value.usage.outputTokens,
    },
  }
}

async function responseBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (text === "") {
    throw new Gliner25ProviderError(
      `gliner-runner returned HTTP ${String(response.status)} with no body.`,
      { code: "invalid_response", status: response.status },
    )
  }
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Gliner25ProviderError(
      `gliner-runner returned a non-JSON response: ${errorFrom(error).message}`,
      { code: "invalid_response", status: response.status },
    )
  }
}

function httpError(status: number, body: unknown): Gliner25ProviderError {
  const parsed = apiErrorSchema.safeParse(body)
  if (parsed.success) {
    return new Gliner25ProviderError(parsed.data.detail.message, {
      code: parsed.data.detail.code,
      retryable: parsed.data.detail.retryable,
      status,
    })
  }
  return new Gliner25ProviderError(
    `gliner-runner returned HTTP ${String(status)} without a valid error envelope.`,
    { code: "invalid_error_response", status },
  )
}

export class Gliner25Provider implements ModelRunner {
  readonly operations: ReadonlyArray<ModelRunnerOperation> = Object.freeze([
    "classify-labels",
  ])

  readonly #baseUrl: string
  readonly #fetch: Gliner25ProviderFetch
  readonly #options: Gliner25ProviderOptions

  constructor(options: Gliner25ProviderOptions) {
    if (options.baseUrl.trim() === "") {
      throw new TypeError("baseUrl must not be empty.")
    }
    this.#options = options
    this.#baseUrl = normalizedBaseUrl(options.baseUrl)
    this.#fetch = options.fetch ?? fetch
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
  execute(
    request: ModelRunnerRequest,
    options: ModelRunnerExecutionOptions,
  ): Promise<ModelRunnerResult>
  async execute(
    request: ModelRunnerRequest,
    options: ModelRunnerExecutionOptions,
  ): Promise<ModelRunnerResult> {
    if (request.kind !== "classify-labels") {
      throw new Gliner25ProviderError(
        `The GLiNER2.5 provider does not support ${request.kind}.`,
        { code: "unsupported_operation", status: 400 },
      )
    }
    requireGliner25Model(request.model)
    if (options.signal.aborted) throw errorFrom(options.signal.reason)

    const runnerModel =
      this.#options.resolveRunnerModel?.(request.model) ?? request.model
    if (runnerModel.trim() === "") {
      throw new TypeError(
        "resolveRunnerModel returned an empty model identity.",
      )
    }
    const requestId = randomUUID()
    const headers = new Headers(this.#options.headers)
    headers.set("accept", "application/json")
    headers.set("content-type", "application/json")
    const response = await this.#fetch(endpoint(this.#baseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify(
        runnerRequest({
          request,
          options: this.#options,
          requestId,
          runnerModel,
        }),
      ),
      signal: options.signal,
    })
    const body = await responseBody(response)
    if (!response.ok) throw httpError(response.status, body)
    const parsed = runnerResponseSchema.safeParse(body)
    if (!parsed.success) {
      throw new Gliner25ProviderError(
        "gliner-runner returned an invalid inference response.",
        { code: "invalid_response", status: 502 },
      )
    }
    if (
      parsed.data.backend !== this.#options.backend
      || parsed.data.precision !== this.#options.precision
    ) {
      throw new Gliner25ProviderError(
        "gliner-runner returned a different backend or precision.",
        { code: "profile_mismatch", status: 502 },
      )
    }
    return classificationResult({
      request,
      requestId,
      runnerModel,
      value: parsed.data,
    })
  }
}
