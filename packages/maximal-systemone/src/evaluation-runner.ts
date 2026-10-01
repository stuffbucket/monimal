import { readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { z } from "zod"

import {
  OLLAMA_EVALUATION_MODELS,
  OLLAMA_EVALUATION_VERSION,
  baselineObservations,
  validateRegressionBaseline,
  type EvaluationModelTag,
  type RegressionBaseline,
} from "./evaluation-baseline.ts"
import {
  SYSTEM_ONE_REGRESSION_CASE_COUNT,
  SYSTEM_ONE_REGRESSION_CORPUS_ID,
  generateSystemOneRegressionCorpus,
  systemOneRegressionCorpusSha256,
  type RegressionCase,
} from "./evaluation-corpus.ts"
import {
  decideRegressionGate,
  evaluateRegression,
  pairedStratifiedBootstrap,
  regressionAnswerSchema,
  selectRegressionLabel,
  type RegressionObservation,
} from "./evaluation.ts"
import {
  ollamaSystemOneRequestSchema,
  ollamaSystemOneResponseSchema,
  type OllamaSystemOneQuestion,
  type OllamaSystemOneRequest,
} from "./profiles.ts"
import { OLLAMA_DEFAULT_BASE_URL } from "./protocol-defaults.ts"
import { validateSystemOneResponse } from "./validation.ts"

export const DEFAULT_OLLAMA_BASE_URL = OLLAMA_DEFAULT_BASE_URL
export const DEFAULT_EVALUATION_KEEP_ALIVE = "30m"

export interface OllamaIdentity {
  readonly version: string
  readonly model: {
    readonly name: string
    readonly digest: string
    readonly architecture: string
    readonly quantization: string
    readonly parameterSize: string
  }
}

const versionResponseSchema = z.looseObject({ version: z.string() })
const tagsResponseSchema = z.looseObject({
  models: z.array(
    z.looseObject({
      name: z.string(),
      digest: z.string(),
      details: z.looseObject({
        family: z.string(),
        quantization_level: z.string(),
        parameter_size: z.string(),
      }),
    }),
  ),
})

export function assertOllamaIdentity(
  versionValue: unknown,
  tagsValue: unknown,
  tag: EvaluationModelTag,
): OllamaIdentity {
  const version = versionResponseSchema.parse(versionValue).version
  if (version !== OLLAMA_EVALUATION_VERSION) {
    throw new Error(
      `Expected Ollama ${OLLAMA_EVALUATION_VERSION}, got ${version}`,
    )
  }
  const models = tagsResponseSchema.parse(tagsValue).models
  const actual = models.find((model) => model.name === tag)
  if (actual === undefined) throw new Error(`Required model ${tag} is absent`)
  const expected = OLLAMA_EVALUATION_MODELS[tag]
  if (
    actual.digest !== expected.digest
    || actual.details.family !== expected.architecture
    || actual.details.quantization_level !== expected.quantization
    || actual.details.parameter_size !== expected.parameterSize
  ) {
    throw new Error(`Installed identity for ${tag} does not match the pin`)
  }
  return {
    version,
    model: {
      name: actual.name,
      digest: actual.digest,
      architecture: actual.details.family,
      quantization: actual.details.quantization_level,
      parameterSize: actual.details.parameter_size,
    },
  }
}

export async function verifyOllamaIdentity(
  baseUrl: string,
  tag: EvaluationModelTag,
  fetcher: typeof fetch = fetch,
): Promise<OllamaIdentity> {
  const base = baseUrl.replace(/\/+$/, "")
  const [versionResponse, tagsResponse] = await Promise.all([
    fetcher(`${base}/api/version`),
    fetcher(`${base}/api/tags`),
  ])
  if (!versionResponse.ok || !tagsResponse.ok) {
    throw new Error("Ollama identity endpoints did not return success")
  }
  return assertOllamaIdentity(
    await versionResponse.json(),
    await tagsResponse.json(),
    tag,
  )
}

interface RunOptions {
  readonly baseUrl: string
  readonly tag: EvaluationModelTag
  readonly keepAlive?: string
  readonly repeatSubset?: number
  readonly fetcher?: typeof fetch
}

interface LiveRun {
  readonly identity: OllamaIdentity
  readonly observations: ReadonlyArray<RegressionObservation>
  readonly answers: ReadonlyMap<string, z.infer<typeof regressionAnswerSchema>>
  readonly selections: ReadonlyMap<string, ReadonlyArray<string>>
  readonly completeRuns: 1 | 3
  readonly repeatStrategy: "complete" | "stratified-subset"
  readonly repeatCaseIds: ReadonlyArray<string>
  readonly durationMs: number
}

function groupedCases(
  cases: ReadonlyArray<RegressionCase>,
): ReadonlyArray<ReadonlyArray<RegressionCase>> {
  const groups = new Map<number, Array<RegressionCase>>()
  for (const testCase of cases) {
    const group = groups.get(testCase.batch) ?? []
    group.push(testCase)
    groups.set(testCase.batch, group)
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left - right)
    .flatMap(([, group]) => {
      const chunks: Array<ReadonlyArray<RegressionCase>> = []
      for (let index = 0; index < group.length; index += 12) {
        chunks.push(group.slice(index, index + 12))
      }
      return chunks
    })
}

function makeRequest(
  cases: ReadonlyArray<RegressionCase>,
  tag: string,
): OllamaSystemOneRequest {
  const first = cases[0]
  if (first === undefined) throw new Error("Cannot create an empty request")
  const questions: Record<string, OllamaSystemOneQuestion> = {}
  for (const testCase of cases) {
    questions[testCase.request.questionName] = testCase.request.question
  }
  const request: OllamaSystemOneRequest = {
    model: tag,
    state: first.request.state,
    questions,
    keep_alive: DEFAULT_EVALUATION_KEEP_ALIVE,
  }
  ollamaSystemOneRequestSchema.parse(request)
  return request
}

async function evaluateBatch(
  cases: ReadonlyArray<RegressionCase>,
  options: RunOptions,
): Promise<ReadonlyArray<RegressionObservation>> {
  const request = makeRequest(cases, options.tag)
  const body = JSON.stringify({
    ...request,
    keep_alive: options.keepAlive ?? DEFAULT_EVALUATION_KEEP_ALIVE,
  })
  if (Buffer.byteLength(body) > 65_536) {
    throw new Error("Evaluation request exceeds Ollama's 64 KiB body limit")
  }
  let response: Response
  try {
    response = await (options.fetcher ?? fetch)(
      `${options.baseUrl.replace(/\/+$/, "")}/v1/systemone`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(300_000),
      },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return cases.map((testCase) => ({
      caseId: testCase.id,
      status: "failure",
      failure: { kind: "transport", message },
    }))
  }
  if (!response.ok) {
    const message = `HTTP ${response.status}: ${await response.text()}`
    return cases.map((testCase) => ({
      caseId: testCase.id,
      status: "failure",
      failure: { kind: "transport", message },
    }))
  }

  let value: unknown
  try {
    value = await response.json()
    const issues = validateSystemOneResponse(request, value)
    if (issues.length > 0) {
      throw new Error(JSON.stringify(issues))
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return cases.map((testCase) => ({
      caseId: testCase.id,
      status: "failure",
      failure: { kind: "schema", message },
    }))
  }

  const answers = ollamaSystemOneResponseSchema.parse(value).answers
  return cases.map((testCase) => {
    const parsed = regressionAnswerSchema.safeParse(
      answers[testCase.request.questionName],
    )
    return parsed.success ?
        {
          caseId: testCase.id,
          status: "success",
          answer: parsed.data,
        }
      : {
          caseId: testCase.id,
          status: "failure",
          failure: {
            kind: "schema",
            message: parsed.error.message,
          },
        }
  })
}

async function runCases(
  cases: ReadonlyArray<RegressionCase>,
  options: RunOptions,
): Promise<ReadonlyArray<RegressionObservation>> {
  const observations: Array<RegressionObservation> = []
  for (const group of groupedCases(cases)) {
    observations.push(...(await evaluateBatch(group, options)))
  }
  return observations
}

export function selectStratifiedRepeatSubset(
  corpus: ReadonlyArray<RegressionCase>,
  count: number,
): ReadonlyArray<RegressionCase> {
  if (
    !Number.isInteger(count)
    || count < 3
    || count > corpus.length
    || count % 3 !== 0
  ) {
    throw new RangeError("Repeat subset must be divisible by three")
  }
  const perPrimitive = count / 3
  return (["noul", "choice", "score"] as const).flatMap((primitive) =>
    corpus
      .filter((testCase) => testCase.primitive === primitive)
      .slice(0, perPrimitive),
  )
}

export async function runLiveRegression(options: RunOptions): Promise<LiveRun> {
  const startedAt = Date.now()
  const corpus = generateSystemOneRegressionCorpus()
  const identity = await verifyOllamaIdentity(
    options.baseUrl,
    options.tag,
    options.fetcher,
  )
  const firstCase = corpus[0]
  if (firstCase === undefined) {
    throw new Error("Regression corpus must contain at least one case")
  }
  const warmup = await runCases([firstCase], options)
  if (warmup[0]?.status !== "success") {
    throw new Error("Ollama warm-up request failed validation")
  }

  const firstRun = await runCases(corpus, options)
  const answers = new Map<string, z.infer<typeof regressionAnswerSchema>>()
  const selections = new Map<string, Array<string>>()
  for (const observation of firstRun) {
    if (observation.status === "success") {
      answers.set(observation.caseId, observation.answer)
      selections.set(observation.caseId, [
        selectRegressionLabel(observation.answer),
      ])
    }
  }

  const repeatCases =
    options.repeatSubset === undefined ?
      corpus
    : selectStratifiedRepeatSubset(corpus, options.repeatSubset)
  for (let repeat = 1; repeat < 3; repeat += 1) {
    const repeatRun = await runCases(repeatCases, options)
    for (const observation of repeatRun) {
      if (observation.status === "failure") {
        throw new Error(
          `Repeat failed for ${observation.caseId}: ${observation.failure.message}`,
        )
      }
      const label = selectRegressionLabel(observation.answer)
      const caseSelections = selections.get(observation.caseId)
      if (caseSelections === undefined || caseSelections[0] !== label) {
        throw new Error(`Unstable selected label for ${observation.caseId}`)
      }
      caseSelections.push(label)
    }
  }

  return {
    identity,
    observations: firstRun,
    answers,
    selections,
    completeRuns: options.repeatSubset === undefined ? 3 : 1,
    repeatStrategy:
      options.repeatSubset === undefined ? "complete" : "stratified-subset",
    repeatCaseIds: repeatCases.map((testCase) => testCase.id),
    durationMs: Date.now() - startedAt,
  }
}

export function liveRunToBaseline(
  live: LiveRun,
  tag: EvaluationModelTag,
): RegressionBaseline {
  if (
    live.observations.some((observation) => observation.status === "failure")
    || live.answers.size !== SYSTEM_ONE_REGRESSION_CASE_COUNT
  ) {
    throw new Error("A baseline requires a complete failure-free first run")
  }
  const identity = OLLAMA_EVALUATION_MODELS[tag]
  return validateRegressionBaseline({
    schemaVersion: 1,
    kind: "maximal-systemone-regression-baseline",
    corpus: {
      id: SYSTEM_ONE_REGRESSION_CORPUS_ID,
      sha256: systemOneRegressionCorpusSha256(),
      caseCount: SYSTEM_ONE_REGRESSION_CASE_COUNT,
    },
    runtime: {
      ollamaVersion: live.identity.version,
      capturedAt: new Date().toISOString(),
      durationMs: live.durationMs,
    },
    model: identity,
    run: {
      completeRuns: live.completeRuns,
      repeatCount: 3,
      repeatStrategy: live.repeatStrategy,
      repeatCaseIds: live.repeatCaseIds,
      unstableLabels: 0,
    },
    cases: generateSystemOneRegressionCorpus().map((testCase) => {
      const answer = live.answers.get(testCase.id)
      const caseSelections = live.selections.get(testCase.id)
      if (answer === undefined || caseSelections === undefined) {
        throw new Error(`Missing live answer for ${testCase.id}`)
      }
      return {
        caseId: testCase.id,
        selectedLabel: caseSelections[0],
        answer,
        selections: caseSelections,
      }
    }),
  })
}

export interface EvaluationCliOptions {
  readonly model: EvaluationModelTag
  readonly baseUrl: string
  readonly baselinePath?: string
  readonly refreshBaselinePath?: string
  readonly overwrite: boolean
  readonly repeatSubset?: number
  readonly resamples: number
  readonly seed: number
}

function parsePositiveInteger(value: string | undefined, flag: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} requires a positive integer`)
  }
  return parsed
}

function isEvaluationModelTag(value: string): value is EvaluationModelTag {
  return Object.hasOwn(OLLAMA_EVALUATION_MODELS, value)
}

// Branches correspond one-to-one with documented CLI flags.
// eslint-disable-next-line complexity
export function parseEvaluationCliArgs(
  argv: ReadonlyArray<string>,
): EvaluationCliOptions {
  let model: EvaluationModelTag | undefined
  let baseUrl = DEFAULT_OLLAMA_BASE_URL
  let baselinePath: string | undefined
  let refreshBaselinePath: string | undefined
  let overwrite = false
  let repeatSubset: number | undefined
  let resamples = 10_000
  let seed = 1_592_639_710
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    const value = argv[index + 1]
    switch (flag) {
      case "--model": {
        if (value === undefined || !isEvaluationModelTag(value)) {
          throw new Error("--model must name a pinned evaluation model")
        }
        model = value
        index += 1
        break
      }
      case "--base-url": {
        if (value === undefined) throw new Error("--base-url requires a URL")
        baseUrl = new URL(value).toString().replace(/\/$/, "")
        index += 1
        break
      }
      case "--baseline": {
        if (value === undefined) throw new Error("--baseline requires a path")
        baselinePath = value
        index += 1
        break
      }
      case "--refresh-baseline": {
        if (value === undefined) {
          throw new Error("--refresh-baseline requires an output path")
        }
        refreshBaselinePath = value
        index += 1
        break
      }
      case "--overwrite": {
        overwrite = true
        break
      }
      case "--repeat-subset": {
        repeatSubset = parsePositiveInteger(value, flag)
        index += 1
        break
      }
      case "--resamples": {
        resamples = parsePositiveInteger(value, flag)
        index += 1
        break
      }
      case "--seed": {
        seed = parsePositiveInteger(value, flag)
        index += 1
        break
      }
      default: {
        throw new Error(`Unknown argument: ${flag}`)
      }
    }
  }
  if (model === undefined) throw new Error("--model is required")
  if (baselinePath !== undefined && refreshBaselinePath !== undefined) {
    throw new Error("--baseline and --refresh-baseline are mutually exclusive")
  }
  if (overwrite && refreshBaselinePath === undefined) {
    throw new Error("--overwrite is only valid with --refresh-baseline")
  }
  if (repeatSubset !== undefined) {
    selectStratifiedRepeatSubset(
      generateSystemOneRegressionCorpus(),
      repeatSubset,
    )
  }
  return {
    model,
    baseUrl,
    ...(baselinePath === undefined ? {} : { baselinePath }),
    ...(refreshBaselinePath === undefined ? {} : { refreshBaselinePath }),
    overwrite,
    ...(repeatSubset === undefined ? {} : { repeatSubset }),
    resamples,
    seed,
  }
}

function defaultBaselinePath(tag: EvaluationModelTag): string {
  const fileName = `${tag.replaceAll(":", "-")}.json`
  return fileURLToPath(
    new URL(`../fixtures/evaluation/${fileName}`, import.meta.url),
  )
}

export async function runEvaluationCli(
  argv: ReadonlyArray<string>,
): Promise<unknown> {
  const options = parseEvaluationCliArgs(argv)
  const live = await runLiveRegression({
    baseUrl: options.baseUrl,
    tag: options.model,
    ...(options.repeatSubset === undefined ?
      {}
    : { repeatSubset: options.repeatSubset }),
  })
  if (options.refreshBaselinePath !== undefined) {
    const baseline = liveRunToBaseline(live, options.model)
    await writeFile(
      options.refreshBaselinePath,
      `${JSON.stringify(baseline, null, 2)}\n`,
      { flag: options.overwrite ? "w" : "wx" },
    )
    return {
      action: "baseline-refreshed",
      path: options.refreshBaselinePath,
      model: options.model,
      corpusSha256: baseline.corpus.sha256,
      durationMs: live.durationMs,
      repeatStrategy: live.repeatStrategy,
    }
  }

  const baselinePath =
    options.baselinePath ?? defaultBaselinePath(options.model)
  const baseline = validateRegressionBaseline(
    JSON.parse(await readFile(baselinePath, "utf8")),
    options.model,
  )
  const corpus = generateSystemOneRegressionCorpus()
  const candidateMetrics = evaluateRegression(corpus, live.observations)
  const bootstrap = pairedStratifiedBootstrap(
    corpus,
    baselineObservations(baseline),
    live.observations,
    { seed: options.seed, resamples: options.resamples },
  )
  return {
    model: options.model,
    baselinePath,
    corpusSha256: systemOneRegressionCorpusSha256(),
    durationMs: live.durationMs,
    ...decideRegressionGate(candidateMetrics, bootstrap),
  }
}
