import type {
  ModelRunnerExecutionOptions,
  ModelRunnerGenerateRequest,
} from "@maximal/maximal-runner-llama-cpp"

import { runSystemOneDecision } from "@maximal/maximal-provider-decision-model"
import assert from "node:assert/strict"
import test from "node:test"
import { z } from "zod"

import {
  Gliner25Provider,
  Gliner25ProviderError,
  type Gliner25ProviderFetch,
} from "../src/index.ts"

const classifyRequest = {
  kind: "classify-labels",
  model: "gliner25:340m",
  text: "The duplicate invoice needs a refund.",
  tasks: [
    {
      name: "route",
      prompt: "Where should this request go?",
      labels: [
        { value: "finance", description: "Billing and refunds" },
        { value: "other", description: "Every other request" },
      ],
    },
    {
      name: "urgency",
      prompt: "How urgent is this?",
      ordered: true,
      labels: [
        { value: "0", description: "Routine" },
        { value: "1", description: "Urgent" },
      ],
    },
  ],
} as const

function jsonRequest(init?: RequestInit): Readonly<Record<string, unknown>> {
  if (typeof init?.body !== "string") {
    throw new TypeError("Expected a JSON request body.")
  }
  return z.record(z.string(), z.unknown()).parse(JSON.parse(init.body))
}

function provider(
  fetchImplementation: Gliner25ProviderFetch,
): Gliner25Provider {
  return new Gliner25Provider({
    backend: "pytorch",
    baseUrl: "https://gliner.test/",
    fetch: fetchImplementation,
    precision: "fp16",
    resolveRunnerModel: () => "decide-340m",
  })
}

void test("adapts classify-labels to the standalone runner", async () => {
  let captured: Readonly<Record<string, unknown>> | undefined
  const runner = provider((input, init) => {
    assert.equal(typeof input, "string")
    assert.equal(input, "https://gliner.test/v1/infer")
    assert.ok(init)
    assert.equal(init.method, "POST")
    assert.ok(init.signal instanceof AbortSignal)
    captured = jsonRequest(init)
    return Promise.resolve(
      Response.json({
        request_id: z.uuid().parse(captured.request_id),
        model: "decide-340m",
        backend: "pytorch",
        precision: "fp16",
        output: {
          route: {
            value: "finance",
            probabilities: { finance: 0.9, other: 0.1 },
          },
          urgency: {
            value: "1",
            probabilities: { 0: 0.25, 1: 0.75 },
          },
          _meta: { exact: true },
        },
        error: null,
        timing: { queue_ms: 1, inference_ms: 12 },
        usage: { inputTokens: 47, outputTokens: 0 },
      }),
    )
  })

  const result = await runner.execute(classifyRequest, {
    signal: new AbortController().signal,
  })

  const sent = captured
  assert.ok(sent)
  assert.equal(sent.model, "decide-340m")
  assert.equal(sent.operation, "classify")
  const schema = sent.schema
  assert.ok(schema !== null && typeof schema === "object")
  const tasks = (schema as { readonly tasks?: unknown }).tasks
  assert.ok(tasks !== null && typeof tasks === "object")
  assert.deepEqual((tasks as Record<string, unknown>).route, {
    labels: ["finance", "other"],
    label_descriptions: {
      finance: "Billing and refunds",
      other: "Every other request",
    },
    instruction: "Where should this request go?",
  })
  assert.deepEqual((tasks as Record<string, unknown>).urgency, {
    labels: ["0", "1"],
    label_descriptions: { 0: "Routine", 1: "Urgent" },
    ordered: true,
    instruction: "How urgent is this?",
  })
  assert.deepEqual(result, {
    kind: "classify-labels",
    model: "gliner25:340m",
    tasks: [
      {
        name: "route",
        probabilities: { finance: 0.9, other: 0.1 },
      },
      {
        name: "urgency",
        probabilities: { 0: 0.25, 1: 0.75 },
      },
    ],
    usage: { inputTokens: 47, outputTokens: 0 },
  })
})

void test("rejects unsupported operations before transport", async () => {
  let calls = 0
  const runner = provider(() => {
    calls += 1
    return Promise.resolve(Response.json({}))
  })
  const request: ModelRunnerGenerateRequest = {
    kind: "generate",
    model: "gliner25:340m",
    messages: [{ role: "user", content: "hello" }],
    maxOutputTokens: 1,
  }
  const options: ModelRunnerExecutionOptions = {
    signal: new AbortController().signal,
  }
  await assert.rejects(
    runner.execute(request, options),
    (error: unknown) =>
      error instanceof Gliner25ProviderError
      && error.code === "unsupported_operation",
  )
  assert.equal(calls, 0)
})

void test("rejects non-GLiNER decision models before transport", async () => {
  let calls = 0
  const runner = provider(() => {
    calls += 1
    return Promise.resolve(Response.json({}))
  })
  await assert.rejects(
    runner.execute(
      { ...classifyRequest, model: "nimble" },
      { signal: new AbortController().signal },
    ),
    /not a GLiNER2\.5 decision model/u,
  )
  assert.equal(calls, 0)
})

void test("preserves structured runner errors", async () => {
  const runner = provider(() =>
    Promise.resolve(
      Response.json(
        {
          detail: {
            code: "queue_full",
            message: "The model queue is full.",
            retryable: true,
          },
        },
        { status: 429 },
      ),
    ),
  )
  await assert.rejects(
    runner.execute(classifyRequest, {
      signal: new AbortController().signal,
    }),
    (error: unknown) =>
      error instanceof Gliner25ProviderError
      && error.status === 429
      && error.code === "queue_full"
      && error.retryable,
  )
})

void test("rejects incomplete classification output", async () => {
  const runner = provider((_input, init) =>
    Promise.resolve(
      Response.json({
        request_id: z.uuid().parse(jsonRequest(init).request_id),
        model: "decide-340m",
        backend: "pytorch",
        precision: "fp16",
        output: {
          route: {
            probabilities: { finance: 1 },
          },
          urgency: {
            probabilities: { 0: 0.25, 1: 0.75 },
          },
        },
        error: null,
        timing: { queue_ms: 1, inference_ms: 12 },
        usage: { inputTokens: 47, outputTokens: 0 },
      }),
    ),
  )
  await assert.rejects(
    runner.execute(classifyRequest, {
      signal: new AbortController().signal,
    }),
    /unexpected labels/u,
  )
})

void test("integrates with the System One decision provider", async () => {
  const runner = provider((_input, init) => {
    const sent = z
      .looseObject({
        request_id: z.uuid(),
        model: z.string(),
        schema: z.object({
          tasks: z.record(z.string(), z.unknown()),
        }),
      })
      .parse(jsonRequest(init))
    assert.deepEqual(Object.keys(sent.schema.tasks), [
      "route",
      "refund",
      "urgency",
    ])
    return Promise.resolve(
      Response.json({
        request_id: sent.request_id,
        model: sent.model,
        backend: "pytorch",
        precision: "fp16",
        output: {
          route: {
            value: "finance",
            probabilities: { engineering: 0.1, finance: 0.9 },
          },
          refund: {
            value: "true",
            probabilities: { false: 0.2, true: 0.8 },
          },
          urgency: {
            value: "2",
            probabilities: { 0: 0.1, 1: 0.2, 2: 0.7 },
          },
        },
        error: null,
        timing: { queue_ms: 1, inference_ms: 12 },
        usage: { inputTokens: 81, outputTokens: 0 },
      }),
    )
  })

  const result = await runSystemOneDecision(
    {
      model: "fastino/GLiNER2.5-Decide",
      state: { ticket: "Refund the duplicate payroll charge today." },
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
    },
    runner,
    new AbortController().signal,
  )

  assert.deepEqual(result, {
    model: "fastino/GLiNER2.5-Decide",
    answers: {
      route: {
        type: "choice",
        choice: "finance",
        probabilities: { engineering: 0.1, finance: 0.9 },
        confidence: 0.5310044064107189,
      },
      refund: { type: "noul", noul: 0.8 },
      urgency: {
        type: "score",
        score: 1.5999999999999999,
        legend: { 0: "Routine", 1: "Soon", 2: "Immediate" },
        probabilities: { 0: 0.1, 1: 0.2, 2: 0.7 },
        confidence: 0.27015330083790234,
      },
    },
    usage: { input_tokens: 81, output_tokens: 0 },
  })
})
