import assert from "node:assert/strict"
import { readFile, readdir } from "node:fs/promises"
import { test } from "node:test"

import {
  OLLAMA_DEFAULT_BASE_URL,
  OLLAMA_EVALUATION_MODELS,
  SYSTEM_ONE_REGRESSION_CASE_COUNT,
  SYSTEM_ONE_REGRESSION_CORPUS_ID,
  SYSTEM_ONE_REGRESSION_CORPUS_SHA256,
  assertOllamaIdentity,
  baselineObservations,
  decideRegressionGate,
  deriveExpectedLabel,
  evaluateRegression,
  generateSystemOneRegressionCorpus,
  ollamaSystemOneRequestSchema,
  pairedStratifiedBootstrap,
  parseEvaluationCliArgs,
  regressionCorpusSchema,
  selectRegressionLabel,
  systemOneRegressionCorpusSha256,
  validateRegressionBaseline,
  wilson95,
  type RegressionAnswer,
  type RegressionBaseline,
  type RegressionCase,
  type RegressionObservation,
} from "../src/index.ts"

const corpus = generateSystemOneRegressionCorpus()

function answerFor(testCase: RegressionCase): RegressionAnswer {
  if (testCase.primitive === "noul") {
    return {
      type: "noul",
      noul: testCase.expectedLabel === "true" ? 0.9 : 0.1,
    }
  }
  if (testCase.primitive === "choice") {
    const criteria =
      testCase.request.question.type === "choice" ?
        Object.keys(testCase.request.question.criteria)
      : []
    return {
      type: "choice",
      choice: testCase.expectedLabel,
      probabilities: Object.fromEntries(
        criteria.map((label) => [
          label,
          label === testCase.expectedLabel ? 0.97 : 0.01,
        ]),
      ),
      confidence: 0.95,
    }
  }
  const question = testCase.request.question
  assert.equal(question.type, "score")
  return {
    type: "score",
    score: testCase.expectedIndex as number,
    legend: Object.fromEntries(
      question.criteria.map((label, index) => [String(index), label]),
    ),
    probabilities: Object.fromEntries(
      question.criteria.map((_, index) => [
        String(index),
        index === testCase.expectedIndex ? 0.97 : 0.01,
      ]),
    ),
    confidence: 0.95,
  }
}

function perfectObservations(): ReadonlyArray<RegressionObservation> {
  return corpus.map((testCase) => ({
    caseId: testCase.id,
    status: "success",
    answer: answerFor(testCase),
  }))
}

function syntheticBaseline(): RegressionBaseline {
  return {
    schemaVersion: 1,
    kind: "maximal-systemone-regression-baseline",
    corpus: {
      id: SYSTEM_ONE_REGRESSION_CORPUS_ID,
      sha256: SYSTEM_ONE_REGRESSION_CORPUS_SHA256,
      caseCount: SYSTEM_ONE_REGRESSION_CASE_COUNT,
    },
    runtime: {
      ollamaVersion: "0.35.0",
      capturedAt: "2026-09-30T00:00:00.000Z",
      durationMs: 1,
    },
    model: OLLAMA_EVALUATION_MODELS["nimble:latest"],
    run: {
      completeRuns: 3,
      repeatCount: 3,
      repeatStrategy: "complete",
      repeatCaseIds: corpus.map((testCase) => testCase.id),
      unstableLabels: 0,
    },
    cases: corpus.map((testCase) => {
      const answer = answerFor(testCase)
      const selectedLabel = selectRegressionLabel(answer)
      return {
        caseId: testCase.id,
        selectedLabel,
        answer,
        selections: [selectedLabel, selectedLabel, selectedLabel],
      }
    }),
  }
}

void test("regression corpus is canonical, balanced, and executable", () => {
  assert.equal(corpus.length, 600)
  assert.equal(regressionCorpusSchema.safeParse(corpus).success, true)
  assert.equal(new Set(corpus.map((testCase) => testCase.id)).size, 600)
  assert.equal(
    systemOneRegressionCorpusSha256(),
    SYSTEM_ONE_REGRESSION_CORPUS_SHA256,
  )

  for (const primitive of ["noul", "choice", "score"] as const) {
    assert.equal(
      corpus.filter((testCase) => testCase.primitive === primitive).length,
      200,
    )
  }
  assert.deepEqual(
    Object.fromEntries(
      ["false", "true"].map((label) => [
        label,
        corpus.filter(
          (testCase) =>
            testCase.primitive === "noul" && testCase.expectedLabel === label,
        ).length,
      ]),
    ),
    { false: 100, true: 100 },
  )
  for (const primitive of ["choice", "score"] as const) {
    const counts = corpus
      .filter((testCase) => testCase.primitive === primitive)
      .reduce<Record<string, number>>((result, testCase) => {
        result[testCase.expectedLabel] =
          (result[testCase.expectedLabel] ?? 0) + 1
        return result
      }, {})
    assert.deepEqual(Object.values(counts), [50, 50, 50, 50])
  }
  for (const testCase of corpus) {
    assert.equal(deriveExpectedLabel(testCase), testCase.expectedLabel)
  }
})

void test("every corpus batch is a valid bounded Ollama request", () => {
  for (let batch = 0; batch < 10; batch += 1) {
    const cases = corpus.filter((testCase) => testCase.batch === batch)
    const request = {
      model: "nimble:latest",
      state: cases[0]?.request.state,
      questions: Object.fromEntries(
        cases.map((testCase) => [
          testCase.request.questionName,
          testCase.request.question,
        ]),
      ),
      keep_alive: "30m",
    }
    assert.equal(cases.length, 60)
    assert.equal(ollamaSystemOneRequestSchema.safeParse(request).success, true)
    assert.ok(Buffer.byteLength(JSON.stringify(request)) < 65_536)
  }
})

void test("prediction rules, metric goldens, and Wilson interval are exact", () => {
  assert.equal(selectRegressionLabel({ type: "noul", noul: 0.5 }), "true")
  assert.equal(
    selectRegressionLabel({
      type: "choice",
      choice: "east",
      probabilities: { north: 0.99, east: 0.01 },
      confidence: 0,
    }),
    "east",
  )
  assert.equal(
    selectRegressionLabel({
      type: "score",
      score: 1,
      legend: { "0": "a", "1": "b" },
      probabilities: { "1": 0.5, "0": 0.5 },
      confidence: 0,
    }),
    "0",
  )

  const sample = corpus.slice(0, 3)
  const observations: ReadonlyArray<RegressionObservation> = [
    {
      caseId: sample[0]?.id as string,
      status: "success",
      answer: { type: "noul", noul: 0.25 },
    },
    {
      caseId: sample[1]?.id as string,
      status: "success",
      answer: {
        type: "choice",
        choice: "north",
        probabilities: { north: 0.7, east: 0.1, south: 0.1, west: 0.1 },
        confidence: 0.8,
      },
    },
    {
      caseId: sample[2]?.id as string,
      status: "success",
      answer: {
        type: "score",
        score: 0.4,
        legend: { "0": "a", "1": "b", "2": "c", "3": "d" },
        probabilities: { "0": 0.6, "1": 0.2, "2": 0.1, "3": 0.1 },
        confidence: 0.5,
      },
    },
  ]
  const metrics = evaluateRegression(sample, observations)
  assert.equal(metrics.microAccuracy, 1)
  assert.ok(
    Math.abs((metrics.brier as number) - 0.134_166_666_666_666_68) < 1e-12,
  )
  assert.equal(metrics.scoreMae, 0.4)
  assert.ok(Math.abs(wilson95(10, 10).lower - 0.722_467_200_137_110_9) < 1e-12)
  assert.ok(Math.abs(wilson95(10, 10).upper - 1) < 1e-12)
  assert.equal(wilson95(0, 10).lower, 0)
  assert.ok(Math.abs(wilson95(0, 10).upper - 0.277_532_799_862_889_15) < 1e-12)
})

void test("paired bootstrap is stratified and reproducible", () => {
  const baseline = perfectObservations()
  const candidate = baseline.map((observation, index) => {
    if (index % 11 !== 0 || observation.status === "failure") return observation
    const testCase = corpus[index] as RegressionCase
    const answer = observation.answer
    if (answer.type === "noul") {
      return {
        ...observation,
        answer: { type: "noul" as const, noul: answer.noul >= 0.5 ? 0.1 : 0.9 },
      }
    }
    if (answer.type === "choice") {
      const labels = Object.keys(answer.probabilities)
      return {
        ...observation,
        answer: {
          ...answer,
          choice: labels.find(
            (label) => label !== testCase.expectedLabel,
          ) as string,
        },
      }
    }
    const wrongIndex = (Number(testCase.expectedLabel) + 1) % 4
    return {
      ...observation,
      answer: {
        ...answer,
        probabilities: Object.fromEntries(
          Object.keys(answer.probabilities).map((label) => [
            label,
            Number(label) === wrongIndex ? 0.97 : 0.01,
          ]),
        ),
      },
    }
  })
  const first = pairedStratifiedBootstrap(corpus, baseline, candidate, {
    seed: 1234,
    resamples: 200,
  })
  const second = pairedStratifiedBootstrap(corpus, baseline, candidate, {
    seed: 1234,
    resamples: 200,
  })
  const differentSeed = pairedStratifiedBootstrap(corpus, baseline, candidate, {
    seed: 4321,
    resamples: 200,
  })
  assert.deepEqual(first, second)
  assert.notDeepEqual(first, differentSeed)
  assert.ok(first.accuracyDelta.estimate < 0)
})

void test("non-inferiority gate reports pass, fail, and inconclusive", () => {
  const observations = perfectObservations()
  const metrics = evaluateRegression(corpus, observations)
  const bootstrap = pairedStratifiedBootstrap(
    corpus,
    observations,
    observations,
    { resamples: 50 },
  )
  assert.equal(decideRegressionGate(metrics, bootstrap).status, "PASS")
  assert.equal(
    decideRegressionGate({ ...metrics, failures: 1 }, bootstrap).status,
    "FAIL",
  )
  assert.equal(
    decideRegressionGate(metrics, {
      ...bootstrap,
      scoreMaeDelta: { estimate: 0.2, lower: 0.1, upper: 0.3 },
    }).status,
    "INCONCLUSIVE",
  )
  const atMargins = {
    ...bootstrap,
    accuracyDelta: { estimate: -0.08, lower: -0.08, upper: -0.08 },
    primitiveAccuracyDelta: {
      noul: { estimate: -0.12, lower: -0.12, upper: -0.12 },
      choice: { estimate: -0.12, lower: -0.12, upper: -0.12 },
      score: { estimate: -0.12, lower: -0.12, upper: -0.12 },
    },
    scoreMaeDelta: { estimate: 0.2, lower: 0.2, upper: 0.2 },
  }
  assert.equal(decideRegressionGate(metrics, atMargins).status, "PASS")
  assert.equal(
    decideRegressionGate(metrics, {
      ...atMargins,
      accuracyDelta: {
        estimate: -0.08,
        lower: -0.0805,
        upper: -0.0795,
      },
    }).status,
    "INCONCLUSIVE",
  )
  assert.equal(
    decideRegressionGate(metrics, {
      ...atMargins,
      primitiveAccuracyDelta: {
        ...atMargins.primitiveAccuracyDelta,
        choice: { estimate: -0.12, lower: -0.1205, upper: -0.1195 },
      },
    }).status,
    "INCONCLUSIVE",
  )
  assert.equal(
    decideRegressionGate(metrics, {
      ...atMargins,
      scoreMaeDelta: { estimate: 0.2, lower: 0.1995, upper: 0.2005 },
    }).status,
    "INCONCLUSIVE",
  )
  assert.equal(
    decideRegressionGate(
      { ...metrics, wilson95: { lower: 0.699, upper: 0.8 } },
      bootstrap,
    ).status,
    "FAIL",
  )
})

void test("failures count against accuracy and remain explicit", () => {
  const observations = [...perfectObservations()]
  observations[0] = {
    caseId: corpus[0]?.id as string,
    status: "failure",
    failure: { kind: "schema", message: "mutated response" },
  }
  const metrics = evaluateRegression(corpus, observations)
  assert.equal(metrics.failures, 1)
  assert.equal(metrics.evaluated, 599)
  assert.equal(metrics.correct, 599)
  assert.equal(metrics.microAccuracy, 599 / 600)
  assert.equal(metrics.primitives.noul.failures, 1)
})

void test("baseline schema enforces corpus, metadata, identity, and selections", () => {
  const baseline = syntheticBaseline()
  assert.equal(validateRegressionBaseline(baseline).cases.length, 600)
  assert.equal(baselineObservations(baseline).length, 600)
  assert.throws(() =>
    validateRegressionBaseline({
      ...baseline,
      model: { ...baseline.model, digest: "0".repeat(64) },
    }),
  )
  assert.throws(() =>
    validateRegressionBaseline({
      ...baseline,
      unexpected: true,
    }),
  )
})

void test("CLI parsing and Ollama identity guard are network-free", () => {
  assert.deepEqual(
    parseEvaluationCliArgs(["--model", "tev1:4b", "--resamples", "99"]),
    {
      model: "tev1:4b",
      baseUrl: OLLAMA_DEFAULT_BASE_URL,
      overwrite: false,
      resamples: 99,
      seed: 1_592_639_710,
    },
  )
  assert.throws(() => parseEvaluationCliArgs(["--model", "unknown"]))
  assert.throws(() =>
    parseEvaluationCliArgs(["--model", "nimble:latest", "--overwrite"]),
  )

  const expected = OLLAMA_EVALUATION_MODELS["tev1:0.8b"]
  const tags = {
    models: [
      {
        name: expected.tag,
        digest: expected.digest,
        details: {
          family: expected.architecture,
          quantization_level: expected.quantization,
          parameter_size: expected.parameterSize,
        },
      },
    ],
  }
  assert.equal(
    assertOllamaIdentity({ version: "0.35.0" }, tags, expected.tag).model
      .digest,
    expected.digest,
  )
  assert.throws(() =>
    assertOllamaIdentity({ version: "0.34.0" }, tags, expected.tag),
  )
  assert.throws(() =>
    assertOllamaIdentity(
      { version: "0.35.0" },
      {
        models: [
          {
            ...tags.models[0],
            digest: "0".repeat(64),
          },
        ],
      },
      expected.tag,
    ),
  )
  for (const details of [
    { family: "mutated" },
    { quantization_level: "Q4_0" },
    { parameter_size: "1B" },
  ]) {
    assert.throws(() =>
      assertOllamaIdentity(
        { version: "0.35.0" },
        {
          models: [
            {
              ...tags.models[0],
              details: { ...tags.models[0]?.details, ...details },
            },
          ],
        },
        expected.tag,
      ),
    )
  }
})

void test("committed baselines strictly validate and replay offline", async () => {
  const directory = new URL("../fixtures/evaluation/", import.meta.url)
  const files = (await readdir(directory))
    .filter((file) => file.endsWith(".json"))
    .sort()
  assert.deepEqual(files, [
    "nimble-latest.json",
    "tev1-0.8b.json",
    "tev1-4b.json",
  ])
  for (const file of files) {
    const value = JSON.parse(
      await readFile(new URL(file, directory), "utf8"),
    ) as unknown
    const baseline = validateRegressionBaseline(value)
    const metrics = evaluateRegression(corpus, baselineObservations(baseline))
    assert.equal(metrics.total, 600)
    assert.equal(metrics.failures, 0)
  }
})
