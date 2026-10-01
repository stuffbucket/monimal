import assert from "node:assert/strict"
import test from "node:test"

import {
  SYSTEM_ONE_MAX_CRITERIA,
  SYSTEM_ONE_MAX_QUESTIONS,
  SYSTEM_ONE_METHOD,
  SYSTEM_ONE_PATH,
  systemOneOperation,
  systemOneRequestSchema,
  systemOneResponseSchema,
  type SystemOneRequest,
  type SystemOneResponse,
} from "../src/index.ts"

const questions = {
  label: {
    type: "choice",
    instructions: "Which label fits this ticket?",
    criteria: {
      billing: "Payments and refunds",
      bug: "Software errors",
      account: "Login and account access",
    },
  },
  refund: {
    type: "noul",
    instructions: "Is the customer requesting a refund?",
  },
  urgency: {
    type: "score",
    instructions: "How urgently does this ticket need a response?",
    criteria: ["Routine", "Soon", "Immediate"],
  },
} as const

const request = {
  model: "nimble",
  state: { ticket: "The checkout returned a 500 error." },
  questions,
  keep_alive: "5m",
} satisfies SystemOneRequest<typeof questions>

const response = {
  model: request.model,
  answers: {
    label: {
      type: "choice",
      choice: "bug",
      probabilities: { billing: 0.01, bug: 0.98, account: 0.01 },
      confidence: 0.9,
    },
    refund: {
      type: "noul",
      noul: 0.1,
    },
    urgency: {
      type: "score",
      score: 1.5,
      legend: { 0: "Routine", 1: "Soon", 2: "Immediate" },
      probabilities: { 0: 0.1, 1: 0.3, 2: 0.6 },
      confidence: 0.4,
    },
  },
  usage: {
    input_tokens: 174,
    output_tokens: 3,
  },
} satisfies SystemOneResponse<typeof questions>

void test("exports the canonical HTTP operation", () => {
  assert.equal(SYSTEM_ONE_METHOD, "POST")
  assert.equal(SYSTEM_ONE_PATH, "/v1/systemone")
  assert.equal(systemOneOperation.request, systemOneRequestSchema)
  assert.deepEqual(Object.keys(systemOneOperation.responses), [
    "200",
    "400",
    "404",
    "413",
    "500",
  ])
})

void test("accepts every official question and answer variant", () => {
  assert.deepEqual(systemOneRequestSchema.parse(request), request)
  assert.deepEqual(systemOneResponseSchema.parse(response), response)
})

void test("applies noul criterion defaults", () => {
  const parsed = systemOneRequestSchema.parse({
    model: "nimble",
    state: "A customer requested a refund.",
    questions: {
      refund: {
        type: "noul",
        instructions: "Is a refund requested?",
        criteria: {},
      },
    },
  })

  assert.deepEqual(parsed.questions.refund, {
    type: "noul",
    instructions: "Is a refund requested?",
    criteria: { false: "No", true: "Yes" },
  })
})

void test("permits extension fields except in noul criteria", () => {
  assert.equal(
    systemOneRequestSchema.safeParse({
      ...request,
      extension: true,
    }).success,
    true,
  )
  assert.equal(
    systemOneRequestSchema.safeParse({
      model: "nimble",
      state: "A customer requested a refund.",
      questions: {
        refund: {
          type: "noul",
          instructions: "Is a refund requested?",
          criteria: { maybe: "Unknown" },
        },
      },
    }).success,
    false,
  )
})

void test("rejects blank content and out-of-range cardinalities", () => {
  assert.equal(
    systemOneRequestSchema.safeParse({
      model: " ",
      state: "ticket",
      questions: { label: questions.label },
    }).success,
    false,
  )
  assert.equal(
    systemOneRequestSchema.safeParse({
      model: "nimble",
      state: "ticket",
      questions: Object.fromEntries(
        Array.from({ length: SYSTEM_ONE_MAX_QUESTIONS + 1 }, (_, index) => [
          `question-${index}`,
          questions.refund,
        ]),
      ),
    }).success,
    false,
  )
  assert.equal(
    systemOneRequestSchema.safeParse({
      model: "nimble",
      state: "ticket",
      questions: {
        score: {
          ...questions.urgency,
          criteria: Array.from(
            { length: SYSTEM_ONE_MAX_CRITERIA + 1 },
            (_, index) => `level-${index}`,
          ),
        },
      },
    }).success,
    false,
  )
})

void test("rejects response probabilities outside zero to one", () => {
  assert.equal(
    systemOneResponseSchema.safeParse({
      ...response,
      answers: {
        ...response.answers,
        refund: { type: "noul", noul: 1.1 },
      },
    }).success,
    false,
  )
})
