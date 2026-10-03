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

import assert from "node:assert/strict"
import test from "node:test"

import {
  UnsupportedDecisionModelError,
  DECISION_MODELS,
  handleSystemOneDecisionRequest,
  resolveDecisionModel,
  runSystemOneDecision,
  validateSystemOneResponse,
} from "../src/index.ts"

const request = {
  model: "nimble",
  state: { ticket: "The payment failed and payroll closes today." },
  questions: {
    route: {
      type: "choice",
      instructions: "Where should this ticket go?",
      criteria: {
        engineering: "Software and infrastructure",
        finance: "Payments and payroll",
      },
    },
    refund: {
      type: "noul",
      instructions: "Is a refund requested?",
    },
    urgency: {
      type: "score",
      instructions: "How urgent is this?",
      criteria: ["Routine", "Soon", "Immediate"],
    },
  },
} as const

class RecordingRunner implements ModelRunner {
  readonly operations: ReadonlyArray<ModelRunnerOperation>
  readonly requests: Array<ModelRunnerRequest> = []

  constructor(operations: ReadonlyArray<ModelRunnerOperation>) {
    this.operations = operations
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
    _options: ModelRunnerExecutionOptions,
  ): Promise<ModelRunnerResult> {
    this.requests.push(request)
    if (request.kind === "generate") {
      return Promise.resolve({
        kind: "generate",
        model: request.model,
        text: "",
        usage: { inputTokens: 0, outputTokens: 0 },
      })
    }
    if (request.kind === "score-token-candidates") {
      return Promise.resolve({
        kind: "score-token-candidates",
        model: request.model,
        probabilities: [
          [0.02, 0.98],
          [0.88, 0.12],
          [0.09, 0.24, 0.67],
        ],
        usage: { inputTokens: 40, outputTokens: 3 },
      })
    }
    return Promise.resolve({
      kind: "classify-labels",
      model: request.model,
      tasks: [
        {
          name: "route",
          probabilities: { engineering: 0.2, finance: 0.8 },
        },
        {
          name: "refund",
          probabilities: { false: 3, true: 1 },
        },
        {
          name: "urgency",
          probabilities: { 0: 1, 1: 2, 2: 1 },
        },
      ],
      usage: { inputTokens: 25, outputTokens: 0 },
    })
  }
}

void test("resolves GLiNER2.5, Nimble, and Tev model families", () => {
  assert.deepEqual(
    new Set(DECISION_MODELS.map(({ family }) => family)),
    new Set(["gliner25", "nimble", "tev"]),
  )
  assert.deepEqual(resolveDecisionModel("fastino/GLiNER2.5-Decide"), {
    family: "gliner25",
    model: "fastino/GLiNER2.5-Decide",
    runnerOperation: "classify-labels",
  })
  assert.equal(resolveDecisionModel("nimble:latest").family, "nimble")
  assert.equal(resolveDecisionModel("tev1:0.8b").family, "tev")
  assert.ok(DECISION_MODELS.some(({ model }) => model === "tev1:4b"))
  assert.throws(
    () => resolveDecisionModel("unrelated-model"),
    UnsupportedDecisionModelError,
  )
})

void test("compiles Nimble and Tev into candidate-token scoring", async () => {
  const runner = new RecordingRunner(["score-token-candidates"])
  const response = await runSystemOneDecision(
    request,
    runner,
    new AbortController().signal,
  )

  assert.equal(runner.requests.length, 1)
  const runnerRequest = runner.requests[0]
  if (!runnerRequest || runnerRequest.kind !== "score-token-candidates") {
    throw new TypeError("Expected a candidate-token scoring request.")
  }
  assert.deepEqual(
    runnerRequest.rows.map(({ candidates }) => candidates),
    [
      ["A", "B"],
      ["A", "B"],
      ["A", "B", "C"],
    ],
  )
  assert.match(
    runnerRequest.rows[0]?.messages[0]?.content ?? "",
    /Requested field: "route"$/u,
  )
  const route = response.answers.route
  const refund = response.answers.refund
  const urgency = response.answers.urgency
  assert.ok(route && route.type === "choice")
  assert.equal(route.choice, "finance")
  assert.ok(refund && refund.type === "noul")
  assert.ok(refund.noul < 0.13)
  assert.ok(urgency && urgency.type === "score")
  assert.ok(urgency.score > 1.5)
  assert.deepEqual(response.usage, {
    input_tokens: 40,
    output_tokens: 3,
  })
  assert.deepEqual(validateSystemOneResponse(request, response), [])
})

void test("compiles GLiNER2.5 into one multi-head classification pass", async () => {
  const runner = new RecordingRunner(["classify-labels"])
  const response = await runSystemOneDecision(
    {
      ...request,
      model: "fastino/GLiNER2.5-Decide",
    },
    runner,
    new AbortController().signal,
  )

  const runnerRequest = runner.requests[0]
  if (!runnerRequest || runnerRequest.kind !== "classify-labels") {
    throw new TypeError("Expected a label-classification request.")
  }
  assert.equal(runnerRequest.text, JSON.stringify(request.state))
  assert.deepEqual(
    runnerRequest.tasks.map(({ name, ordered }) => ({ name, ordered })),
    [
      { name: "route", ordered: undefined },
      { name: "refund", ordered: undefined },
      { name: "urgency", ordered: true },
    ],
  )
  assert.deepEqual(runnerRequest.tasks[1]?.labels, [
    { value: "false", description: "No" },
    { value: "true", description: "Yes" },
  ])
  const route = response.answers.route
  const refund = response.answers.refund
  const urgency = response.answers.urgency
  assert.ok(route && route.type === "choice")
  assert.equal(route.choice, "finance")
  assert.ok(refund && refund.type === "noul")
  assert.equal(refund.noul, 0.25)
  assert.ok(urgency && urgency.type === "score")
  assert.equal(urgency.score, 1)
  assert.deepEqual(response.usage, {
    input_tokens: 25,
    output_tokens: 0,
  })
  assert.deepEqual(
    validateSystemOneResponse(
      { ...request, model: "fastino/GLiNER2.5-Decide" },
      response,
    ),
    [],
  )
})

void test("rejects a model when the runner lacks its required operation", async () => {
  const runner = new RecordingRunner(["classify-labels"])
  await assert.rejects(
    runSystemOneDecision(request, runner, new AbortController().signal),
    /does not support score-token-candidates/u,
  )
  assert.deepEqual(runner.requests, [])
})

void test("serves the decision provider over the System One HTTP contract", async () => {
  const runner = new RecordingRunner(["score-token-candidates"])
  const response = await handleSystemOneDecisionRequest(
    new Request("http://decision.test/v1/systemone", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    }),
    runner,
  )
  assert.equal(response.status, 200)
  assert.equal(response.headers.get("content-type"), "application/json")
  const payload: unknown = await response.json()
  assert.ok(payload !== null && typeof payload === "object")
  assert.ok("model" in payload)
  assert.equal(payload.model, "nimble")

  const missing = await handleSystemOneDecisionRequest(
    new Request("http://decision.test/v1/systemone", {
      method: "POST",
      body: JSON.stringify({ ...request, model: "unknown" }),
    }),
    runner,
  )
  assert.equal(missing.status, 404)
})
