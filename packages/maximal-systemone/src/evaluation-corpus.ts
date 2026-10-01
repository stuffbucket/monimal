import { createHash } from "node:crypto"
import { z } from "zod"

import type { OllamaSystemOneQuestion } from "./profiles.ts"

export const SYSTEM_ONE_REGRESSION_CORPUS_ID = "maximal-systemone-regression-v1"
export const SYSTEM_ONE_REGRESSION_CASE_COUNT = 600
export const SYSTEM_ONE_REGRESSION_BATCH_COUNT = 10
export const SYSTEM_ONE_REGRESSION_CORPUS_SHA256 =
  "557a91a7278fa31a37ee56b99603843e5e87b8502a071eea33c345122c73cb28"

export type RegressionPrimitive = "noul" | "choice" | "score"

export interface RegressionDerivation {
  readonly rule: "index-modulo"
  readonly input: number
  readonly modulus: 2 | 4
  readonly remainder: number
  readonly labels: ReadonlyArray<string>
}

export interface RegressionCase {
  readonly id: string
  readonly family:
    "explicit-boolean-state" | "explicit-choice-state" | "explicit-score-state"
  readonly primitive: RegressionPrimitive
  readonly batch: number
  readonly request: {
    readonly state: string
    readonly questionName: string
    readonly question: OllamaSystemOneQuestion
  }
  readonly expectedLabel: string
  readonly expectedIndex?: number
  readonly derivation: RegressionDerivation
}

const corpusQuestionSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("noul"),
    instructions: z.string().min(1),
    criteria: z.strictObject({
      false: z.string().min(1),
      true: z.string().min(1),
    }),
  }),
  z.strictObject({
    type: z.literal("choice"),
    instructions: z.string().min(1),
    criteria: z.record(z.string().min(1), z.string().min(1)),
  }),
  z.strictObject({
    type: z.literal("score"),
    instructions: z.string().min(1),
    criteria: z.array(z.string().min(1)).min(2).max(26),
  }),
])

export const regressionCaseSchema = z.strictObject({
  id: z.string().regex(/^(?:noul|choice|score)-\d{3}$/),
  family: z.enum([
    "explicit-boolean-state",
    "explicit-choice-state",
    "explicit-score-state",
  ]),
  primitive: z.enum(["noul", "choice", "score"]),
  batch: z
    .number()
    .int()
    .min(0)
    .max(SYSTEM_ONE_REGRESSION_BATCH_COUNT - 1),
  request: z.strictObject({
    state: z.string().min(1),
    questionName: z.string().regex(/^[ncs]\d{3}$/),
    question: corpusQuestionSchema,
  }),
  expectedLabel: z.string(),
  expectedIndex: z.number().int().min(0).max(3).optional(),
  derivation: z.strictObject({
    rule: z.literal("index-modulo"),
    input: z.number().int().min(0),
    modulus: z.union([z.literal(2), z.literal(4)]),
    remainder: z.number().int().min(0).max(3),
    labels: z.array(z.string()).min(2).max(4),
  }),
})

export const regressionCorpusSchema = z
  .array(regressionCaseSchema)
  .length(SYSTEM_ONE_REGRESSION_CASE_COUNT)

const choiceLabels = ["north", "east", "south", "west"] as const
const scoreLabels = ["zero", "one", "two", "three"] as const
const booleanLabels = ["false", "true"] as const

function pad(value: number): string {
  return String(value).padStart(3, "0")
}

function labelAt(labels: ReadonlyArray<string>, index: number): string {
  const label = labels[index]
  if (label === undefined) throw new RangeError("Label index is out of range")
  return label
}

function makeBatchState(batch: number): string {
  const lines = ["Use only these explicit records. Each record is independent."]
  for (let slot = 0; slot < 20; slot += 1) {
    const index = batch * 20 + slot
    lines.push(
      `N${pad(index)} flag is ${index % 2 === 0 ? "DISABLED" : "ENABLED"}.`,
      `C${pad(index)} selected direction is ${choiceLabels[index % 4]}.`,
      `S${pad(index)} measured band index is ${index % 4}.`,
    )
  }
  return lines.join("\n")
}

function makeNoulCase(
  index: number,
  batch: number,
  state: string,
): RegressionCase {
  const remainder = index % 2
  return {
    id: `noul-${pad(index)}`,
    family: "explicit-boolean-state",
    primitive: "noul",
    batch,
    request: {
      state,
      questionName: `n${pad(index)}`,
      question: {
        type: "noul",
        instructions: `Return true exactly when record N${pad(index)} says its flag is ENABLED.`,
        criteria: {
          false: "The record says DISABLED.",
          true: "The record says ENABLED.",
        },
      },
    },
    expectedLabel: labelAt(booleanLabels, remainder),
    derivation: {
      rule: "index-modulo",
      input: index,
      modulus: 2,
      remainder,
      labels: booleanLabels,
    },
  }
}

function makeChoiceCase(
  index: number,
  batch: number,
  state: string,
): RegressionCase {
  const remainder = index % 4
  return {
    id: `choice-${pad(index)}`,
    family: "explicit-choice-state",
    primitive: "choice",
    batch,
    request: {
      state,
      questionName: `c${pad(index)}`,
      question: {
        type: "choice",
        instructions: `Select the direction explicitly stated for record C${pad(index)}.`,
        criteria: {
          north: "The record says north.",
          east: "The record says east.",
          south: "The record says south.",
          west: "The record says west.",
        },
      },
    },
    expectedLabel: labelAt(choiceLabels, remainder),
    expectedIndex: remainder,
    derivation: {
      rule: "index-modulo",
      input: index,
      modulus: 4,
      remainder,
      labels: choiceLabels,
    },
  }
}

function makeScoreCase(
  index: number,
  batch: number,
  state: string,
): RegressionCase {
  const remainder = index % 4
  return {
    id: `score-${pad(index)}`,
    family: "explicit-score-state",
    primitive: "score",
    batch,
    request: {
      state,
      questionName: `s${pad(index)}`,
      question: {
        type: "score",
        instructions: `Score record S${pad(index)} using its explicitly stated measured band index.`,
        criteria: [
          "Measured band index is 0.",
          "Measured band index is 1.",
          "Measured band index is 2.",
          "Measured band index is 3.",
        ],
      },
    },
    expectedLabel: String(remainder),
    expectedIndex: remainder,
    derivation: {
      rule: "index-modulo",
      input: index,
      modulus: 4,
      remainder,
      labels: scoreLabels,
    },
  }
}

export function generateSystemOneRegressionCorpus(): ReadonlyArray<RegressionCase> {
  const cases: Array<RegressionCase> = []
  for (let batch = 0; batch < SYSTEM_ONE_REGRESSION_BATCH_COUNT; batch += 1) {
    const state = makeBatchState(batch)
    for (let slot = 0; slot < 20; slot += 1) {
      const index = batch * 20 + slot
      cases.push(
        makeNoulCase(index, batch, state),
        makeChoiceCase(index, batch, state),
        makeScoreCase(index, batch, state),
      )
    }
  }
  return cases
}

export function deriveExpectedLabel(testCase: RegressionCase): string {
  const { derivation } = testCase
  if (
    derivation.input % derivation.modulus !== derivation.remainder
    || derivation.remainder >= derivation.labels.length
  ) {
    throw new Error(`Invalid derivation for ${testCase.id}`)
  }
  if (testCase.primitive === "score") return String(derivation.remainder)
  return derivation.labels[derivation.remainder] ?? ""
}

export function canonicalCorpusJson(
  corpus: ReadonlyArray<RegressionCase> = generateSystemOneRegressionCorpus(),
): string {
  return JSON.stringify(corpus)
}

export function systemOneRegressionCorpusSha256(
  corpus: ReadonlyArray<RegressionCase> = generateSystemOneRegressionCorpus(),
): string {
  return createHash("sha256").update(canonicalCorpusJson(corpus)).digest("hex")
}
