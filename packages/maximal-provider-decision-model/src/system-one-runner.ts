import type {
  ModelRunner,
  ModelRunnerCandidateScoreRequest,
  ModelRunnerLabelClassificationRequest,
  ModelRunnerUsage,
} from "@maximal/maximal-runner-llama-cpp"

import { z, ZodError } from "zod"

import {
  UnsupportedDecisionModelError,
  resolveDecisionModel,
  type DecisionModelDefinition,
} from "./decision-models.ts"
import {
  SYSTEM_ONE_MAX_REQUEST_BYTES,
  SYSTEM_ONE_MEDIA_TYPE,
  SYSTEM_ONE_METHOD,
  SYSTEM_ONE_PATH,
  ollamaSystemOneRequestSchema,
  ollamaSystemOneResponseSchema,
  type OllamaSystemOneResponse,
} from "./profiles.ts"

interface CompiledChoice {
  readonly code: string
  readonly value: string
  readonly description: string
}

interface CompiledQuestion {
  readonly choices: ReadonlyArray<CompiledChoice>
  readonly description: string
  readonly name: string
  readonly type: ParsedSystemOneQuestion["type"]
}

type ParsedSystemOneRequest = z.infer<typeof ollamaSystemOneRequestSchema>
type ParsedSystemOneQuestion = ParsedSystemOneRequest["questions"][string]
type ParsedSystemOneContent = ParsedSystemOneRequest["state"]

function content(value: ParsedSystemOneContent): string {
  if (typeof value === "string") return value
  return JSON.stringify(value)
}

function choices(question: ParsedSystemOneQuestion): ReadonlyArray<{
  readonly value: string
  readonly description: string
}> {
  if (question.type === "noul") {
    return [
      { value: "false", description: question.criteria?.false ?? "No" },
      { value: "true", description: question.criteria?.true ?? "Yes" },
    ]
  }
  if (question.type === "choice") {
    return Object.entries(question.criteria).map(([value, description]) => ({
      value,
      description: description ?? value,
    }))
  }
  return question.criteria.map((description, index) => ({
    value: String(index),
    description,
  }))
}

function compileQuestions(
  request: ParsedSystemOneRequest,
): ReadonlyArray<CompiledQuestion> {
  return Object.entries(request.questions).map(([name, question]) => ({
    choices: choices(question).map(({ value, description }, index) => ({
      code: String.fromCodePoint(65 + index),
      value,
      description,
    })),
    description: content(question.instructions),
    name,
    type: question.type,
  }))
}

function candidateRequest(
  request: ParsedSystemOneRequest,
  fields: ReadonlyArray<CompiledQuestion>,
): ModelRunnerCandidateScoreRequest {
  const schema = fields.map((field) => ({
    name: field.name,
    description: field.description,
    choices: field.choices,
  }))
  const data = JSON.stringify({
    context: content(request.state),
    schema,
  })
  return {
    kind: "score-token-candidates",
    model: request.model,
    rows: fields.map((field) => ({
      candidates: field.choices.map(({ code }) => code),
      messages: [
        {
          role: "user",
          content: `${data}\n\nRequested field: ${JSON.stringify(field.name)}`,
        },
      ],
    })),
  }
}

function classificationRequest(
  request: ParsedSystemOneRequest,
  fields: ReadonlyArray<CompiledQuestion>,
): ModelRunnerLabelClassificationRequest {
  return {
    kind: "classify-labels",
    model: request.model,
    text: content(request.state),
    tasks: fields.map((field) => ({
      name: field.name,
      prompt: field.description,
      labels: field.choices.map(({ value, description }) => ({
        value,
        description,
      })),
      ...(field.type === "score" ? { ordered: true } : {}),
    })),
  }
}

function finite(value: number, field: string): number {
  if (!Number.isFinite(value)) {
    throw new TypeError(
      `The runner returned a non-finite value for "${field}".`,
    )
  }
  return value
}

function normalizeProbabilities(
  values: ReadonlyArray<number>,
  field: string,
): Array<number> {
  const checked = values.map((value) => {
    finite(value, field)
    if (value < 0) {
      throw new Error(
        `The runner returned a negative probability for "${field}".`,
      )
    }
    return value
  })
  const total = checked.reduce((sum, value) => sum + value, 0)
  if (total <= 0) {
    throw new Error(`The runner returned no probability mass for "${field}".`)
  }
  return checked.map((value) => value / total)
}

function record<T>(
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

function confidence(probabilities: ReadonlyArray<number>): number {
  if (probabilities.length <= 1) return 1
  const entropy = probabilities.reduce(
    (sum, probability) =>
      probability > 0 ? sum - probability * Math.log(probability) : sum,
    0,
  )
  return Math.max(0, Math.min(1, 1 - entropy / Math.log(probabilities.length)))
}

function answer(
  field: CompiledQuestion,
  probabilities: ReadonlyArray<number>,
): unknown {
  if (probabilities.length !== field.choices.length) {
    throw new Error(
      `The runner returned ${String(probabilities.length)} values for `
        + `"${field.name}", expected ${String(field.choices.length)}.`,
    )
  }
  if (field.type === "noul") {
    return {
      type: "noul",
      noul: probabilities[1],
    }
  }
  const mapped = record(
    field.choices.map(
      ({ value }, index) => [value, probabilities[index] ?? 0] as const,
    ),
  )
  if (field.type === "choice") {
    let winner = 0
    for (let index = 1; index < probabilities.length; index += 1) {
      if ((probabilities[index] ?? 0) > (probabilities[winner] ?? 0)) {
        winner = index
      }
    }
    return {
      type: "choice",
      choice: field.choices[winner]?.value,
      probabilities: mapped,
      confidence: confidence(probabilities),
    }
  }
  const score = probabilities.reduce(
    (sum, probability, index) => sum + index * probability,
    0,
  )
  return {
    type: "score",
    score,
    legend: record(
      field.choices.map(
        ({ value, description }) => [value, description] as const,
      ),
    ),
    probabilities: mapped,
    confidence: confidence(probabilities),
  }
}

interface ResponseInput {
  readonly fields: ReadonlyArray<CompiledQuestion>
  readonly request: ParsedSystemOneRequest
  readonly rows: ReadonlyArray<ReadonlyArray<number>>
  readonly usage: ModelRunnerUsage
}

function response({
  request,
  fields,
  rows,
  usage,
}: ResponseInput): OllamaSystemOneResponse {
  if (rows.length !== fields.length) {
    throw new Error(
      `The runner returned ${String(rows.length)} rows for `
        + `${String(fields.length)} System One questions.`,
    )
  }
  const answers = record(
    fields.map(
      (field, index) => [field.name, answer(field, rows[index] ?? [])] as const,
    ),
  )
  return ollamaSystemOneResponseSchema.parse({
    model: request.model,
    answers,
    usage: {
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
    },
  })
}

function requireOperation(
  runner: ModelRunner,
  definition: DecisionModelDefinition,
): void {
  if (!runner.operations.includes(definition.runnerOperation)) {
    throw new Error(
      `Runner does not support ${definition.runnerOperation} required by `
        + `${definition.family} model "${definition.model}".`,
    )
  }
}

export async function runSystemOneDecision(
  value: unknown,
  runner: ModelRunner,
  signal: AbortSignal,
): Promise<OllamaSystemOneResponse> {
  const request = ollamaSystemOneRequestSchema.parse(value)
  const definition = resolveDecisionModel(request.model)
  requireOperation(runner, definition)
  const fields = compileQuestions(request)

  if (definition.runnerOperation === "score-token-candidates") {
    const result = await runner.execute(candidateRequest(request, fields), {
      signal,
    })
    if (result.model !== request.model) {
      throw new Error(
        `The runner returned model "${result.model}" for `
          + `"${request.model}".`,
      )
    }
    const rows = result.probabilities.map((probabilities, index) =>
      normalizeProbabilities(
        probabilities,
        fields[index]?.name ?? String(index),
      ),
    )
    return response({ request, fields, rows, usage: result.usage })
  }

  const result = await runner.execute(classificationRequest(request, fields), {
    signal,
  })
  if (result.model !== request.model) {
    throw new Error(
      `The runner returned model "${result.model}" for "${request.model}".`,
    )
  }
  if (result.tasks.length !== fields.length) {
    throw new Error(
      `The runner returned ${String(result.tasks.length)} classification `
        + `tasks for ${String(fields.length)} System One questions.`,
    )
  }
  const byName = new Map(result.tasks.map((task) => [task.name, task]))
  if (byName.size !== result.tasks.length) {
    throw new Error("The runner returned duplicate classification task names.")
  }
  const rows = fields.map((field) => {
    const task = byName.get(field.name)
    if (!task) {
      throw new Error(
        `The runner did not return classification task "${field.name}".`,
      )
    }
    if (Object.keys(task.probabilities).length !== field.choices.length) {
      throw new Error(
        `The runner returned the wrong number of labels for "${field.name}".`,
      )
    }
    return normalizeProbabilities(
      field.choices.map(({ value }) => {
        const probability = task.probabilities[value]
        if (probability === undefined) {
          throw new Error(
            `The runner omitted label "${value}" for "${field.name}".`,
          )
        }
        return probability
      }),
      field.name,
    )
  })
  return response({ request, fields, rows, usage: result.usage })
}

function errorResponse(error: string, status: number): Response {
  return Response.json(
    { error },
    {
      status,
      headers: { "content-type": SYSTEM_ONE_MEDIA_TYPE },
    },
  )
}

export async function handleSystemOneDecisionRequest(
  request: Request,
  runner: ModelRunner,
): Promise<Response> {
  const url = new URL(request.url)
  if (url.pathname !== SYSTEM_ONE_PATH) {
    return errorResponse("Not found.", 404)
  }
  if (request.method !== SYSTEM_ONE_METHOD) {
    return new Response(null, {
      status: 405,
      headers: { allow: SYSTEM_ONE_METHOD },
    })
  }
  const body = await request.text()
  if (
    new TextEncoder().encode(body).byteLength > SYSTEM_ONE_MAX_REQUEST_BYTES
  ) {
    return errorResponse("System One request exceeds 64 KiB.", 413)
  }
  let value: unknown
  try {
    value = JSON.parse(body)
  } catch (error) {
    if (error instanceof SyntaxError) {
      return errorResponse("Request body must be valid JSON.", 400)
    }
    throw error
  }
  try {
    const result = await runSystemOneDecision(value, runner, request.signal)
    return Response.json(result, {
      headers: { "content-type": SYSTEM_ONE_MEDIA_TYPE },
    })
  } catch (error) {
    if (error instanceof UnsupportedDecisionModelError) {
      return errorResponse(error.message, 404)
    }
    if (error instanceof ZodError) {
      return errorResponse(
        "Request body does not match the System One schema.",
        400,
      )
    }
    throw error
  }
}
