import { z } from "zod"

import {
  SYSTEM_ONE_REGRESSION_CASE_COUNT,
  SYSTEM_ONE_REGRESSION_CORPUS_ID,
  SYSTEM_ONE_REGRESSION_CORPUS_SHA256,
  generateSystemOneRegressionCorpus,
  systemOneRegressionCorpusSha256,
} from "./evaluation-corpus.ts"
import {
  regressionAnswerSchema,
  selectRegressionLabel,
  type RegressionObservation,
} from "./evaluation.ts"

export const OLLAMA_EVALUATION_VERSION = "0.35.0"

export const OLLAMA_EVALUATION_MODELS = {
  "nimble:latest": {
    tag: "nimble:latest",
    digest: "24e550a16a7081881be2f1f0d91e8cc13a597472735c04119f035a0a85c67e0c",
    architecture: "qwen35",
    quantization: "Q8_0",
    parameterSize: "9.0B",
  },
  "tev1:4b": {
    tag: "tev1:4b",
    digest: "cef45ef93cf6df8bf32bdd689b0a8fd01f88ae9034d33ce890c54f77e4cd981e",
    architecture: "qwen35",
    quantization: "Q8_0",
    parameterSize: "4.2B",
  },
  "tev1:0.8b": {
    tag: "tev1:0.8b",
    digest: "d45e875d63fed9465390a4eb9e55f51f470390a446667b55d0a075a15e0336bf",
    architecture: "qwen35",
    quantization: "Q8_0",
    parameterSize: "752.39M",
  },
} as const

export type EvaluationModelTag = keyof typeof OLLAMA_EVALUATION_MODELS

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)

export const regressionBaselineCaseSchema = z.strictObject({
  caseId: z.string().min(1),
  selectedLabel: z.string(),
  answer: regressionAnswerSchema,
  selections: z.array(z.string()).min(1).max(3),
})

export const regressionBaselineSchema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal("maximal-systemone-regression-baseline"),
  corpus: z.strictObject({
    id: z.literal(SYSTEM_ONE_REGRESSION_CORPUS_ID),
    sha256: sha256Schema,
    caseCount: z.literal(SYSTEM_ONE_REGRESSION_CASE_COUNT),
  }),
  runtime: z.strictObject({
    ollamaVersion: z.literal(OLLAMA_EVALUATION_VERSION),
    capturedAt: z.iso.datetime({ offset: true }),
    durationMs: z.number().int().nonnegative(),
  }),
  model: z.strictObject({
    tag: z.enum(["nimble:latest", "tev1:4b", "tev1:0.8b"]),
    digest: sha256Schema,
    architecture: z.string().min(1),
    quantization: z.string().min(1),
    parameterSize: z.string().min(1),
  }),
  run: z.strictObject({
    completeRuns: z.union([z.literal(1), z.literal(3)]),
    repeatCount: z.literal(3),
    repeatStrategy: z.enum(["complete", "stratified-subset"]),
    repeatCaseIds: z.array(z.string()),
    unstableLabels: z.literal(0),
  }),
  cases: z
    .array(regressionBaselineCaseSchema)
    .length(SYSTEM_ONE_REGRESSION_CASE_COUNT),
})

export type RegressionBaseline = z.infer<typeof regressionBaselineSchema>

function assertBaselineIdentity(
  baseline: RegressionBaseline,
  expectedTag: EvaluationModelTag | undefined,
): void {
  if (
    baseline.corpus.sha256 !== SYSTEM_ONE_REGRESSION_CORPUS_SHA256
    || systemOneRegressionCorpusSha256() !== SYSTEM_ONE_REGRESSION_CORPUS_SHA256
  ) {
    throw new Error("Baseline corpus SHA-256 does not match generated corpus")
  }
  const identity = OLLAMA_EVALUATION_MODELS[baseline.model.tag]
  if (
    baseline.model.digest !== identity.digest
    || baseline.model.architecture !== identity.architecture
    || baseline.model.quantization !== identity.quantization
    || baseline.model.parameterSize !== identity.parameterSize
  ) {
    throw new Error(
      `Baseline model identity mismatch for ${baseline.model.tag}`,
    )
  }
  if (expectedTag !== undefined && baseline.model.tag !== expectedTag) {
    throw new Error(
      `Expected baseline for ${expectedTag}, got ${baseline.model.tag}`,
    )
  }
}

function assertBaselineCases(baseline: RegressionBaseline): void {
  const expectedCases = new Map(
    generateSystemOneRegressionCorpus().map((testCase) => [
      testCase.id,
      testCase,
    ]),
  )
  const ids = new Set<string>()
  for (const entry of baseline.cases) {
    if (ids.has(entry.caseId))
      throw new Error("Baseline case ids must be unique")
    ids.add(entry.caseId)
    if (
      entry.selectedLabel !== selectRegressionLabel(entry.answer)
      || entry.selections.some((selection) => selection !== entry.selectedLabel)
    ) {
      throw new Error(`Baseline selection mismatch for ${entry.caseId}`)
    }
    const expected = expectedCases.get(entry.caseId)
    if (expected === undefined || expected.primitive !== entry.answer.type) {
      throw new Error(`Baseline case identity mismatch for ${entry.caseId}`)
    }
  }
  if (ids.size !== expectedCases.size) {
    throw new Error("Baseline cases do not exactly cover the corpus")
  }
}

function assertRepeatMetadata(baseline: RegressionBaseline): void {
  if (
    baseline.run.repeatStrategy === "complete"
    && (baseline.run.completeRuns !== 3
      || baseline.run.repeatCaseIds.length !== SYSTEM_ONE_REGRESSION_CASE_COUNT
      || baseline.cases.some((entry) => entry.selections.length !== 3))
  ) {
    throw new Error("Complete-repeat metadata is inconsistent")
  }
  if (
    baseline.run.repeatStrategy === "stratified-subset"
    && baseline.run.completeRuns !== 1
  ) {
    throw new Error("Subset-repeat metadata is inconsistent")
  }
  const repeated = new Set(baseline.run.repeatCaseIds)
  if (
    repeated.size !== baseline.run.repeatCaseIds.length
    || [...repeated].some(
      (caseId) => !baseline.cases.some((entry) => entry.caseId === caseId),
    )
  ) {
    throw new Error("Repeat case ids must be unique corpus case ids")
  }
  for (const entry of baseline.cases) {
    const expectedSelections = repeated.has(entry.caseId) ? 3 : 1
    if (entry.selections.length !== expectedSelections) {
      throw new Error(`Repeat metadata mismatch for ${entry.caseId}`)
    }
  }
}

export function validateRegressionBaseline(
  value: unknown,
  expectedTag?: EvaluationModelTag,
): RegressionBaseline {
  const baseline = regressionBaselineSchema.parse(value)
  assertBaselineIdentity(baseline, expectedTag)
  assertBaselineCases(baseline)
  assertRepeatMetadata(baseline)
  return baseline
}

export function baselineObservations(
  baseline: RegressionBaseline,
): ReadonlyArray<RegressionObservation> {
  return baseline.cases.map((entry) => ({
    caseId: entry.caseId,
    status: "success",
    answer: entry.answer,
  }))
}
