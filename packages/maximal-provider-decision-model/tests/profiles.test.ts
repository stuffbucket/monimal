import assert from "node:assert/strict"
import test from "node:test"

import {
  ollamaSystemOneProfile,
  ollamaSystemOneRequestSchema,
  ollamaSystemOneResponseSchema,
  parseSystemOneResponse,
  portableSystemOneRequestSchema,
  SystemOneValidationError,
  TYPE_SAFE_SYSTEM_ONE_RESPONSE_STATUSES,
  typeSafeSystemOneProfile,
  typeSafeSystemOneRequestSchema,
  typeSafeSystemOneResponseSchema,
  validateSystemOneResponse,
  type SystemOneRequest,
  type SystemOneResponse,
  type OllamaSystemOneResponse,
} from "../src/index.ts"

const dialectCases = [
  {
    name: "nullable TypeSafe state and score levels",
    request: {
      model: "jev-latest",
      state: null,
      questions: {
        score: {
          type: "score",
          instructions: null,
          criteria: [null, "high"],
        },
      },
    },
    typeSafe: true,
    ollama: false,
  },
  {
    name: "optional instructions",
    request: {
      model: "jev-latest",
      state: "",
      questions: {
        signal: { type: "noul" },
      },
    },
    typeSafe: true,
    ollama: false,
  },
  {
    name: "structured choice criteria",
    request: {
      model: "jev-latest",
      state: "ticket",
      questions: {
        team: {
          type: "choice",
          criteria: { billing: { description: "Billing" } },
        },
      },
    },
    typeSafe: true,
    ollama: false,
  },
  {
    name: "structured score levels",
    request: {
      model: "jev-latest",
      state: "ticket",
      questions: {
        urgency: {
          type: "score",
          criteria: [{ level: "routine" }, { level: "urgent" }],
        },
      },
    },
    typeSafe: true,
    ollama: false,
  },
  {
    name: "27 choices",
    request: {
      model: "jev-latest",
      state: "ticket",
      questions: {
        label: {
          type: "choice",
          criteria: Object.fromEntries(
            Array.from({ length: 27 }, (_, index) => [`choice-${index}`, null]),
          ),
        },
      },
    },
    typeSafe: true,
    ollama: false,
  },
  {
    name: "11 score levels",
    request: {
      model: "nimble",
      state: "ticket",
      questions: {
        score: {
          type: "score",
          instructions: "Score this",
          criteria: Array.from({ length: 11 }, (_, index) => `level-${index}`),
        },
      },
    },
    typeSafe: false,
    ollama: true,
  },
  {
    name: "Ollama criterion defaults",
    request: {
      model: "nimble",
      state: "ticket",
      questions: {
        signal: {
          type: "noul",
          instructions: "Is this actionable?",
          criteria: {},
        },
      },
    },
    typeSafe: true,
    ollama: true,
  },
] as const

void test("preserves the TypeSafe/JEV and Ollama request dialect matrix", async (t) => {
  for (const dialectCase of dialectCases) {
    await t.test(dialectCase.name, () => {
      assert.equal(
        typeSafeSystemOneRequestSchema.safeParse(dialectCase.request).success,
        dialectCase.typeSafe,
      )
      assert.equal(
        ollamaSystemOneRequestSchema.safeParse(dialectCase.request).success,
        dialectCase.ollama,
      )
    })
  }
})

void test("preserves response dialect differences", () => {
  const response = {
    model: "jev-1.13",
    answers: {
      urgency: {
        type: "score",
        score: 0,
        confidence: 2,
        legend: { 0: { level: "routine" } },
        probabilities: { 0: 2 },
      },
    },
    usage: { input_tokens: -1, output_tokens: -1 },
  }

  assert.equal(
    typeSafeSystemOneResponseSchema.safeParse(response).success,
    true,
  )
  assert.equal(ollamaSystemOneResponseSchema.safeParse(response).success, false)
})

void test("models TypeSafe service statuses and the portable intersection", () => {
  assert.deepEqual(
    TYPE_SAFE_SYSTEM_ONE_RESPONSE_STATUSES,
    [200, 401, 422, 429, 529],
  )
  assert.equal(
    portableSystemOneRequestSchema.safeParse({
      model: "jev-latest",
      state: "ticket",
      questions: {
        score: {
          type: "score",
          instructions: "Score this",
          criteria: ["low", "high"],
        },
      },
    }).success,
    true,
  )
  assert.equal(
    portableSystemOneRequestSchema.safeParse(dialectCases[0].request).success,
    false,
    "portable instructions cannot be omitted",
  )
  assert.equal(
    portableSystemOneRequestSchema.safeParse(dialectCases[1].request).success,
    false,
    "portable criteria descriptions cannot be structured",
  )
  assert.equal(
    portableSystemOneRequestSchema.safeParse(dialectCases[4].request).success,
    false,
    "portable score rubrics stop at the shared limit",
  )
})

void test("validates cross-field semantics in deterministic order", () => {
  const request = {
    model: "jev-latest",
    state: "ticket",
    questions: {
      category: {
        type: "choice",
        criteria: { bug: null, billing: null },
      },
      urgency: {
        type: "score",
        criteria: ["low", "high"],
      },
    },
  } as const satisfies SystemOneRequest
  const response = {
    model: "jev-latest",
    answers: {
      category: {
        type: "choice",
        choice: "other",
        confidence: 0.5,
        probabilities: { other: 1 },
      },
      urgency: {
        type: "score",
        score: 3,
        confidence: 0.5,
        legend: { 0: "low", 1: "wrong" },
        probabilities: { 0: 0.5, 2: 0.5 },
      },
    },
    usage: { input_tokens: 1, output_tokens: 1 },
  }

  assert.deepEqual(
    validateSystemOneResponse(request, response, typeSafeSystemOneProfile).map(
      ({ code, path }) => [code, path],
    ),
    [
      ["choice_not_in_criteria", ["answers", "category", "choice"]],
      ["probability_key_mismatch", ["answers", "category", "probabilities"]],
      ["legend_mismatch", ["answers", "urgency", "legend"]],
      ["probability_key_mismatch", ["answers", "urgency", "probabilities"]],
      ["value_out_of_range", ["answers", "urgency", "score"]],
      ["score_expectation_mismatch", ["answers", "urgency", "score"]],
    ],
  )
  assert.throws(
    () => parseSystemOneResponse(request, response, typeSafeSystemOneProfile),
    SystemOneValidationError,
  )
})

void test("rejects semantically impossible probability results", () => {
  const request = {
    model: "nimble",
    state: "ticket",
    questions: {
      category: {
        type: "choice",
        instructions: "Classify",
        criteria: { bug: null, billing: null },
      },
      urgency: {
        type: "score",
        instructions: "Score",
        criteria: ["low", "high"],
      },
    },
  } as const satisfies SystemOneRequest
  const response = {
    model: "nimble",
    answers: {
      category: {
        type: "choice",
        choice: "bug",
        confidence: 0,
        probabilities: { bug: 0.2, billing: 0.6 },
      },
      urgency: {
        type: "score",
        score: 0,
        confidence: 0,
        legend: { 0: "low", 1: "high" },
        probabilities: { 0: 0.25, 1: 0.75 },
      },
    },
    usage: { input_tokens: 1, output_tokens: 1 },
  }

  assert.deepEqual(
    validateSystemOneResponse(request, response, typeSafeSystemOneProfile).map(
      ({ code }) => code,
    ),
    [
      "probability_sum_mismatch",
      "choice_not_argmax",
      "score_expectation_mismatch",
    ],
  )
})

void test("validates Ollama tie selection and entropy confidence", () => {
  const request = {
    model: "nimble",
    state: "ticket",
    questions: {
      category: {
        type: "choice",
        instructions: "Classify",
        criteria: { first: null, second: null },
      },
    },
  } as const satisfies SystemOneRequest
  const response = {
    model: "nimble",
    answers: {
      category: {
        type: "choice",
        choice: "second",
        confidence: 1,
        probabilities: { first: 0.5, second: 0.5 },
      },
    },
    usage: { input_tokens: 1, output_tokens: 1 },
  }

  assert.deepEqual(
    validateSystemOneResponse(request, response, ollamaSystemOneProfile).map(
      ({ code }) => code,
    ),
    ["confidence_mismatch", "choice_not_argmax"],
  )
})

void test("accepts probability and weighted-score floating-point tolerance", () => {
  const request = {
    model: "jev-latest",
    state: "ticket",
    questions: {
      urgency: {
        type: "score",
        criteria: ["low", "high"],
      },
    },
  } as const satisfies SystemOneRequest
  const response = {
    model: "jev-1.13.0",
    answers: {
      urgency: {
        type: "score",
        score: 0.7 + 5e-10,
        confidence: 0.5,
        legend: { 0: "low", 1: "high" },
        probabilities: { 0: 0.3, 1: 0.7 + 5e-10 },
      },
    },
    usage: { input_tokens: 1, output_tokens: 1 },
  }

  assert.deepEqual(
    validateSystemOneResponse(request, response, typeSafeSystemOneProfile),
    [],
  )
})

void test("preserves prototype-named request and response keys", () => {
  const request = JSON.parse(`{
    "model":"jev-latest",
    "state":{"__proto__":"state"},
    "questions":{
      "__proto__":{"type":"noul","instructions":null},
      "ordinary":{"type":"noul"}
    }
  }`) as unknown
  const parsedRequest = typeSafeSystemOneRequestSchema.parse(request)
  assert.equal(Object.hasOwn(parsedRequest.questions, "__proto__"), true)
  assert.equal(Object.hasOwn(parsedRequest.state as object, "__proto__"), true)

  const response = JSON.parse(`{
    "model":"jev-1.13.0",
    "answers":{
      "__proto__":{"type":"noul","noul":1},
      "ordinary":{"type":"noul","noul":0}
    },
    "usage":{"input_tokens":1,"output_tokens":1}
  }`) as unknown
  const parsedResponse = typeSafeSystemOneResponseSchema.parse(response)
  assert.equal(Object.hasOwn(parsedResponse.answers, "__proto__"), true)

  const ollamaRequest = JSON.parse(`{
    "model":"nimble",
    "state":"ticket",
    "questions":{
      "__proto__":{"type":"noul","instructions":"Decide"},
      "ordinary":{"type":"noul","instructions":"Decide"}
    }
  }`) as unknown
  const parsedOllamaRequest = ollamaSystemOneRequestSchema.parse(ollamaRequest)
  assert.equal(Object.hasOwn(parsedOllamaRequest.questions, "__proto__"), true)

  const ollamaResponse = JSON.parse(`{
    "model":"nimble",
    "answers":{
      "__proto__":{"type":"noul","noul":1},
      "ordinary":{"type":"noul","noul":0}
    },
    "usage":{"input_tokens":1,"output_tokens":1}
  }`) as unknown
  const parsedOllamaResponse =
    ollamaSystemOneResponseSchema.parse(ollamaResponse)
  assert.equal(Object.hasOwn(parsedOllamaResponse.answers, "__proto__"), true)
})

void test("retains the exact response type from request questions", () => {
  const request = {
    model: "nimble",
    state: "ticket",
    questions: {
      category: {
        type: "choice",
        instructions: "Classify",
        criteria: { bug: null, billing: null },
      },
      refund: {
        type: "noul",
        instructions: "Refund?",
      },
    },
  } as const satisfies SystemOneRequest

  const response: SystemOneResponse<typeof request.questions> = {
    model: "nimble",
    answers: {
      category: {
        type: "choice",
        choice: "bug",
        confidence: 1,
        probabilities: { bug: 1, billing: 0 },
      },
      refund: { type: "noul", noul: 0 },
    },
    usage: { input_tokens: 1, output_tokens: 1 },
  }
  assert.equal(request.model, "nimble")
  assert.equal(response.answers.category.type, "choice")
  assert.equal(response.answers.refund.type, "noul")
  const invalidChoice: SystemOneResponse<typeof request.questions> = {
    ...response,
    answers: {
      ...response.answers,
      category: {
        ...response.answers.category,
        // @ts-expect-error Choice values are derived from request criteria.
        choice: "unknown",
      },
    },
  }
  const invalidProbabilities: SystemOneResponse<typeof request.questions> = {
    ...response,
    answers: {
      ...response.answers,
      category: {
        ...response.answers.category,
        probabilities: {
          bug: 1,
          billing: 0,
          // @ts-expect-error Probability keys are derived from request criteria.
          unknown: 0,
        },
      },
    },
  }
  // @ts-expect-error The generic map must not widen a choice answer to noul.
  assert.equal(response.answers.category.noul, undefined)
  const incomplete: SystemOneResponse<typeof request.questions> = {
    ...response,
    // @ts-expect-error Every named request question requires an answer.
    answers: { refund: response.answers.refund },
  }
  assert.equal(invalidChoice.answers.category.choice, "unknown")
  assert.equal(
    Object.keys(invalidProbabilities.answers.category.probabilities).includes(
      "unknown",
    ),
    true,
  )
  assert.deepEqual(Object.keys(incomplete.answers), ["refund"])
})

void test("keeps default Ollama response answers distributive", () => {
  const response: OllamaSystemOneResponse = {
    model: "nimble",
    answers: {
      answer: { type: "noul", noul: 1 },
    },
    usage: { input_tokens: 1, output_tokens: 1 },
  }
  assert.equal(response.model, "nimble")
  const answer = response.answers.answer
  assert.ok(answer)
  assert.equal(answer.type, "noul")
  assert.equal(answer.noul, 1)
  assert.equal(response.usage.input_tokens, 1)
  assert.equal(response.usage.output_tokens, 1)
})
