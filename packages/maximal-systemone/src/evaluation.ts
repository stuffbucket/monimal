import { z } from "zod"

import type {
  RegressionCase,
  RegressionPrimitive,
} from "./evaluation-corpus.ts"

const probabilityRecordSchema = z.record(z.string(), z.number().min(0).max(1))

export const regressionAnswerSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("noul"),
    noul: z.number().min(0).max(1),
  }),
  z.strictObject({
    type: z.literal("choice"),
    choice: z.string().min(1),
    probabilities: probabilityRecordSchema,
    confidence: z.number().min(0).max(1),
  }),
  z.strictObject({
    type: z.literal("score"),
    score: z.number(),
    legend: z.record(z.string(), z.string()),
    probabilities: probabilityRecordSchema,
    confidence: z.number().min(0).max(1),
  }),
])

export type RegressionAnswer = z.infer<typeof regressionAnswerSchema>

export const regressionObservationSchema = z.discriminatedUnion("status", [
  z.strictObject({
    caseId: z.string().min(1),
    status: z.literal("success"),
    answer: regressionAnswerSchema,
  }),
  z.strictObject({
    caseId: z.string().min(1),
    status: z.literal("failure"),
    failure: z.strictObject({
      kind: z.enum(["schema", "transport"]),
      message: z.string().min(1),
    }),
  }),
])

export type RegressionObservation = z.infer<typeof regressionObservationSchema>

export interface WilsonInterval {
  readonly lower: number
  readonly upper: number
}

export interface PrimitiveMetrics {
  readonly total: number
  readonly evaluated: number
  readonly correct: number
  readonly failures: number
  readonly accuracy: number
  readonly brier: number | null
  readonly scoreMae: number | null
  readonly wilson95: WilsonInterval
}

export interface EvaluationMetrics {
  readonly total: number
  readonly evaluated: number
  readonly correct: number
  readonly failures: number
  readonly microAccuracy: number
  readonly macroAccuracy: number
  readonly brier: number | null
  readonly scoreMae: number | null
  readonly wilson95: WilsonInterval
  readonly primitives: Readonly<Record<RegressionPrimitive, PrimitiveMetrics>>
}

interface ScoredCase {
  readonly caseId: string
  readonly primitive: RegressionPrimitive
  readonly correct: number
  readonly brier: number | null
  readonly scoreError: number | null
  readonly failure: number
}

const primitives = ["noul", "choice", "score"] as const
const NOUL_POSITIVE_THRESHOLD = 0.5
const OVERALL_ACCURACY_MARGIN = 0.08
const PRIMITIVE_ACCURACY_MARGIN = 0.12
const SCORE_MAE_MARGIN = 0.2

export function wilson95(successes: number, total: number): WilsonInterval {
  if (
    !Number.isInteger(successes)
    || !Number.isInteger(total)
    || successes < 0
    || total < 0
    || successes > total
  ) {
    throw new RangeError("Wilson counts must be nonnegative integers")
  }
  if (total === 0) return { lower: 0, upper: 1 }
  const z95 = 1.959963984540054
  const proportion = successes / total
  const zSquared = z95 * z95
  const denominator = 1 + zSquared / total
  const center = proportion + zSquared / (2 * total)
  const radius =
    z95
    * Math.sqrt(
      (proportion * (1 - proportion) + zSquared / (4 * total)) / total,
    )
  return {
    lower: Math.max(0, (center - radius) / denominator),
    upper: Math.min(1, (center + radius) / denominator),
  }
}

export function selectRegressionLabel(answer: RegressionAnswer): string {
  if (answer.type === "noul") {
    return answer.noul >= NOUL_POSITIVE_THRESHOLD ? "true" : "false"
  }
  if (answer.type === "choice") return answer.choice

  let selectedIndex = Number.POSITIVE_INFINITY
  let selectedProbability = Number.NEGATIVE_INFINITY
  for (const [key, probability] of Object.entries(answer.probabilities)) {
    const index = Number(key)
    if (
      Number.isInteger(index)
      && (probability > selectedProbability
        || (probability === selectedProbability && index < selectedIndex))
    ) {
      selectedProbability = probability
      selectedIndex = index
    }
  }
  if (!Number.isFinite(selectedIndex)) {
    throw new TypeError("Score probabilities have no numeric index")
  }
  return String(selectedIndex)
}

function brierScore(
  testCase: RegressionCase,
  answer: RegressionAnswer,
): number {
  if (testCase.primitive === "noul" && answer.type === "noul") {
    const expected = testCase.expectedLabel === "true" ? 1 : 0
    return (answer.noul - expected) ** 2
  }
  if (testCase.primitive === "choice" && answer.type === "choice") {
    return Object.entries(answer.probabilities).reduce(
      (sum, [label, probability]) =>
        sum + (probability - (label === testCase.expectedLabel ? 1 : 0)) ** 2,
      0,
    )
  }
  if (testCase.primitive === "score" && answer.type === "score") {
    return Object.entries(answer.probabilities).reduce(
      (sum, [label, probability]) =>
        sum + (probability - (label === testCase.expectedLabel ? 1 : 0)) ** 2,
      0,
    )
  }
  throw new Error(`Answer type does not match ${testCase.id}`)
}

function scoreCases(
  corpus: ReadonlyArray<RegressionCase>,
  observations: ReadonlyArray<RegressionObservation>,
): ReadonlyArray<ScoredCase> {
  if (corpus.length !== observations.length) {
    throw new Error("Corpus and observation counts differ")
  }
  const observationById = new Map(
    observations.map((observation) => [observation.caseId, observation]),
  )
  if (observationById.size !== observations.length) {
    throw new Error("Observation case ids must be unique")
  }

  return corpus.map((testCase) => {
    const observation = observationById.get(testCase.id)
    if (observation === undefined) {
      throw new Error(`Missing observation for ${testCase.id}`)
    }
    if (observation.status === "failure") {
      return {
        caseId: testCase.id,
        primitive: testCase.primitive,
        correct: 0,
        brier: null,
        scoreError: null,
        failure: 1,
      }
    }
    if (observation.answer.type !== testCase.primitive) {
      throw new Error(`Answer type does not match ${testCase.id}`)
    }
    return {
      caseId: testCase.id,
      primitive: testCase.primitive,
      correct:
        selectRegressionLabel(observation.answer) === testCase.expectedLabel ?
          1
        : 0,
      brier: brierScore(testCase, observation.answer),
      scoreError:
        (
          observation.answer.type === "score"
          && testCase.expectedIndex !== undefined
        ) ?
          Math.abs(observation.answer.score - testCase.expectedIndex)
        : null,
      failure: 0,
    }
  })
}

function mean(values: ReadonlyArray<number>): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function primitiveMetrics(rows: ReadonlyArray<ScoredCase>): PrimitiveMetrics {
  const total = rows.length
  const failures = rows.reduce((sum, row) => sum + row.failure, 0)
  const correct = rows.reduce((sum, row) => sum + row.correct, 0)
  return {
    total,
    evaluated: total - failures,
    correct,
    failures,
    accuracy: total === 0 ? 0 : correct / total,
    brier: mean(rows.flatMap((row) => (row.brier === null ? [] : [row.brier]))),
    scoreMae: mean(
      rows.flatMap((row) => (row.scoreError === null ? [] : [row.scoreError])),
    ),
    wilson95: wilson95(correct, total),
  }
}

export function evaluateRegression(
  corpus: ReadonlyArray<RegressionCase>,
  observations: ReadonlyArray<RegressionObservation>,
): EvaluationMetrics {
  const rows = scoreCases(corpus, observations)
  const byPrimitive: Record<RegressionPrimitive, PrimitiveMetrics> = {
    noul: primitiveMetrics(rows.filter((row) => row.primitive === "noul")),
    choice: primitiveMetrics(rows.filter((row) => row.primitive === "choice")),
    score: primitiveMetrics(rows.filter((row) => row.primitive === "score")),
  }
  const total = rows.length
  const correct = rows.reduce((sum, row) => sum + row.correct, 0)
  const failures = rows.reduce((sum, row) => sum + row.failure, 0)
  return {
    total,
    evaluated: total - failures,
    correct,
    failures,
    microAccuracy: total === 0 ? 0 : correct / total,
    macroAccuracy:
      primitives.reduce(
        (sum, primitive) => sum + byPrimitive[primitive].accuracy,
        0,
      ) / primitives.length,
    brier: mean(rows.flatMap((row) => (row.brier === null ? [] : [row.brier]))),
    scoreMae: byPrimitive.score.scoreMae,
    wilson95: wilson95(correct, total),
    primitives: byPrimitive,
  }
}

export interface BootstrapInterval {
  readonly estimate: number
  readonly lower: number
  readonly upper: number
}

export interface PairedBootstrapResult {
  readonly seed: number
  readonly resamples: number
  readonly accuracyDelta: BootstrapInterval
  readonly primitiveAccuracyDelta: Readonly<
    Record<RegressionPrimitive, BootstrapInterval>
  >
  readonly scoreMaeDelta: BootstrapInterval
}

function makePrng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
    return state / 4_294_967_296
  }
}

function percentile(
  sorted: ReadonlyArray<number>,
  probability: number,
): number {
  const index = Math.floor((sorted.length - 1) * probability)
  return sorted[index] ?? 0
}

function interval(estimate: number, samples: Array<number>): BootstrapInterval {
  samples.sort((left, right) => left - right)
  return {
    estimate,
    lower: percentile(samples, 0.025),
    upper: percentile(samples, 0.975),
  }
}

// Separate paired samples prevent accidental comparison of unmatched cases.
// eslint-disable-next-line max-params, max-lines-per-function
export function pairedStratifiedBootstrap(
  corpus: ReadonlyArray<RegressionCase>,
  baseline: ReadonlyArray<RegressionObservation>,
  candidate: ReadonlyArray<RegressionObservation>,
  options: { readonly seed?: number; readonly resamples?: number } = {},
): PairedBootstrapResult {
  const seed = options.seed ?? 1_592_639_710
  const resamples = options.resamples ?? 10_000
  if (!Number.isInteger(resamples) || resamples < 1) {
    throw new RangeError("Bootstrap resamples must be a positive integer")
  }
  const baselineRows = scoreCases(corpus, baseline)
  const candidateRows = scoreCases(corpus, candidate)
  const pairsFor = (
    primitive: RegressionPrimitive,
  ): Array<{ baseline: ScoredCase; candidate: ScoredCase }> =>
    baselineRows.flatMap((baseline, index) => {
      const candidate = candidateRows[index]
      return baseline.primitive === primitive && candidate !== undefined ?
          [{ baseline, candidate }]
        : []
    })
  const pairsByPrimitive: Record<
    RegressionPrimitive,
    Array<{ baseline: ScoredCase; candidate: ScoredCase }>
  > = {
    noul: pairsFor("noul"),
    choice: pairsFor("choice"),
    score: pairsFor("score"),
  }
  const random = makePrng(seed)
  const accuracySamples: Array<number> = []
  const primitiveSamples: Record<RegressionPrimitive, Array<number>> = {
    noul: [],
    choice: [],
    score: [],
  }
  const scoreMaeSamples: Array<number> = []

  for (let sample = 0; sample < resamples; sample += 1) {
    let baselineCorrect = 0
    let candidateCorrect = 0
    for (const primitive of primitives) {
      const pairs = pairsByPrimitive[primitive]
      let stratumBaselineCorrect = 0
      let stratumCandidateCorrect = 0
      let baselineError = 0
      let candidateError = 0
      for (let index = 0; index < pairs.length; index += 1) {
        const pair = pairs[Math.floor(random() * pairs.length)]
        if (pair === undefined) continue
        stratumBaselineCorrect += pair.baseline.correct
        stratumCandidateCorrect += pair.candidate.correct
        if (primitive === "score") {
          baselineError += pair.baseline.scoreError ?? 0
          candidateError += pair.candidate.scoreError ?? 0
        }
      }
      baselineCorrect += stratumBaselineCorrect
      candidateCorrect += stratumCandidateCorrect
      primitiveSamples[primitive].push(
        (stratumCandidateCorrect - stratumBaselineCorrect) / pairs.length,
      )
      if (primitive === "score") {
        scoreMaeSamples.push((candidateError - baselineError) / pairs.length)
      }
    }
    accuracySamples.push(
      (candidateCorrect - baselineCorrect) / baselineRows.length,
    )
  }

  const baselineMetrics = evaluateRegression(corpus, baseline)
  const candidateMetrics = evaluateRegression(corpus, candidate)
  return {
    seed,
    resamples,
    accuracyDelta: interval(
      candidateMetrics.microAccuracy - baselineMetrics.microAccuracy,
      accuracySamples,
    ),
    primitiveAccuracyDelta: {
      noul: interval(
        candidateMetrics.primitives.noul.accuracy
          - baselineMetrics.primitives.noul.accuracy,
        primitiveSamples.noul,
      ),
      choice: interval(
        candidateMetrics.primitives.choice.accuracy
          - baselineMetrics.primitives.choice.accuracy,
        primitiveSamples.choice,
      ),
      score: interval(
        candidateMetrics.primitives.score.accuracy
          - baselineMetrics.primitives.score.accuracy,
        primitiveSamples.score,
      ),
    },
    scoreMaeDelta: interval(
      (candidateMetrics.scoreMae ?? 0) - (baselineMetrics.scoreMae ?? 0),
      scoreMaeSamples,
    ),
  }
}

export type RegressionGateStatus = "PASS" | "FAIL" | "INCONCLUSIVE"

export interface RegressionGateResult {
  readonly status: RegressionGateStatus
  readonly reasons: ReadonlyArray<string>
  readonly candidate: EvaluationMetrics
  readonly bootstrap: PairedBootstrapResult
}

function lowerBoundDecision(
  lower: number,
  upper: number,
  threshold: number,
): RegressionGateStatus {
  if (lower >= threshold) return "PASS"
  if (upper < threshold) return "FAIL"
  return "INCONCLUSIVE"
}

function upperBoundDecision(
  lower: number,
  upper: number,
  threshold: number,
): RegressionGateStatus {
  if (upper <= threshold) return "PASS"
  if (lower > threshold) return "FAIL"
  return "INCONCLUSIVE"
}

export function decideRegressionGate(
  candidate: EvaluationMetrics,
  bootstrap: PairedBootstrapResult,
): RegressionGateResult {
  const checks: Array<{ status: RegressionGateStatus; reason: string }> = []
  checks.push(
    {
      status: candidate.failures === 0 ? "PASS" : "FAIL",
      reason: `schema/transport failures: ${candidate.failures}`,
    },
    {
      status: candidate.wilson95.lower >= 0.7 ? "PASS" : "FAIL",
      reason: `overall Wilson 95% interval [${candidate.wilson95.lower}, ${candidate.wilson95.upper}] requires lower >= 0.70`,
    },
    {
      status: lowerBoundDecision(
        bootstrap.accuracyDelta.lower,
        bootstrap.accuracyDelta.upper,
        -OVERALL_ACCURACY_MARGIN,
      ),
      reason: `overall accuracy delta interval [${bootstrap.accuracyDelta.lower}, ${bootstrap.accuracyDelta.upper}] requires lower >= -${OVERALL_ACCURACY_MARGIN}`,
    },
  )
  for (const primitive of primitives) {
    const delta = bootstrap.primitiveAccuracyDelta[primitive]
    checks.push({
      status: lowerBoundDecision(
        delta.lower,
        delta.upper,
        -PRIMITIVE_ACCURACY_MARGIN,
      ),
      reason: `${primitive} accuracy delta interval [${delta.lower}, ${delta.upper}] requires lower >= -${PRIMITIVE_ACCURACY_MARGIN}`,
    })
  }
  checks.push({
    status: upperBoundDecision(
      bootstrap.scoreMaeDelta.lower,
      bootstrap.scoreMaeDelta.upper,
      SCORE_MAE_MARGIN,
    ),
    reason: `score MAE delta interval [${bootstrap.scoreMaeDelta.lower}, ${bootstrap.scoreMaeDelta.upper}] requires upper <= ${SCORE_MAE_MARGIN}`,
  })
  let status: RegressionGateStatus = "INCONCLUSIVE"
  if (checks.some((check) => check.status === "FAIL")) status = "FAIL"
  else if (checks.every((check) => check.status === "PASS")) status = "PASS"
  return {
    status,
    reasons: checks
      .filter((check) => check.status !== "PASS")
      .map((check) => `${check.status}: ${check.reason}`),
    candidate,
    bootstrap,
  }
}
