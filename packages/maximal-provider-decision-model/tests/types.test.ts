import assert from "node:assert/strict"
import test from "node:test"

import type {
  OllamaSystemOneResponse,
  TypeSafeSystemOneResponse,
} from "../src/index.ts"

void test("keeps union-valued Ollama response answers distributive", () => {
  type UnionQuestions = {
    readonly answer:
      | {
          readonly type: "choice"
          readonly instructions: "Choose"
          readonly criteria: {
            readonly yes: "Yes"
            readonly no: "No"
          }
        }
      | {
          readonly type: "noul"
          readonly instructions: "Decide"
        }
  }
  const response: OllamaSystemOneResponse<UnionQuestions> = {
    model: "nimble",
    answers: {
      answer: { type: "noul", noul: 1 },
    },
    usage: { input_tokens: 1, output_tokens: 1 },
  }
  assert.equal(response.model, "nimble")
  assert.equal(response.answers.answer.type, "noul")
  assert.equal(response.answers.answer.noul, 1)
  assert.deepEqual(response.usage, { input_tokens: 1, output_tokens: 1 })
})

void test("derives exact TypeSafe score indices and legend values", () => {
  const _questions = {
    urgency: {
      type: "score",
      criteria: [null, "high"],
    },
  } as const
  const response: TypeSafeSystemOneResponse<typeof _questions> = {
    model: "jev-1.13.0",
    answers: {
      urgency: {
        type: "score",
        score: 1,
        confidence: 1,
        legend: { 0: null, 1: "high" },
        probabilities: { 0: 0, 1: 1 },
      },
    },
    usage: { input_tokens: 1, output_tokens: 1 },
  }
  const invalidLegend: TypeSafeSystemOneResponse<typeof _questions> = {
    ...response,
    answers: {
      urgency: {
        ...response.answers.urgency,
        legend: {
          0: null,
          // @ts-expect-error Legend values preserve the literal score rubric.
          1: "wrong",
        },
      },
    },
  }
  const invalidProbabilities: TypeSafeSystemOneResponse<typeof _questions> = {
    ...response,
    answers: {
      urgency: {
        ...response.answers.urgency,
        probabilities: {
          0: 0,
          1: 1,
          // @ts-expect-error Score probability keys are tuple indices.
          2: 0,
        },
      },
    },
  }
  assert.equal(invalidLegend.answers.urgency.legend[0], null)
  assert.equal(invalidLegend.answers.urgency.legend[1], "wrong")
  assert.equal(
    Object.keys(invalidProbabilities.answers.urgency.probabilities).includes(
      "2",
    ),
    true,
  )
})
