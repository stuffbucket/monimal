import { z } from "zod"

import type { SystemOneContent } from "./contract.ts"

import { SYSTEM_ONE_MAX_QUESTIONS } from "./profiles.ts"
import { preservingJsonSchema, preservingRecordSchema } from "./schemas.ts"

export { ollamaSystemOneResponseSchema as portableSystemOneResponseSchema } from "./profiles.ts"

export const PORTABLE_SYSTEM_ONE_MAX_CHOICE_CRITERIA = 26
export const PORTABLE_SYSTEM_ONE_MAX_SCORE_CRITERIA = 10
export const PORTABLE_SYSTEM_ONE_MIN_CRITERIA = 2

const nonBlankStringSchema = z.string().regex(/\S/)
const contentSchema = z.union([
  nonBlankStringSchema,
  preservingRecordSchema(z.string(), preservingJsonSchema),
  z.array(preservingJsonSchema),
])

function hasPropertyCount(
  value: Readonly<Record<string, unknown>>,
  minimum: number,
  maximum: number,
): boolean {
  const count = Object.keys(value).length
  return count >= minimum && count <= maximum
}

export const portableSystemOneChoiceQuestionSchema = z.strictObject({
  type: z.literal("choice"),
  instructions: contentSchema,
  criteria: preservingRecordSchema(
    nonBlankStringSchema,
    z.string().nullable(),
  ).refine((value) =>
    hasPropertyCount(
      value,
      PORTABLE_SYSTEM_ONE_MIN_CRITERIA,
      PORTABLE_SYSTEM_ONE_MAX_CHOICE_CRITERIA,
    ),
  ),
})

export const portableSystemOneNoulQuestionSchema = z.strictObject({
  type: z.literal("noul"),
  instructions: contentSchema,
  criteria: z
    .strictObject({
      false: z.string().optional(),
      true: z.string().optional(),
    })
    .optional(),
})

export const portableSystemOneScoreQuestionSchema = z.strictObject({
  type: z.literal("score"),
  instructions: contentSchema,
  criteria: z
    .array(z.string())
    .min(PORTABLE_SYSTEM_ONE_MIN_CRITERIA)
    .max(PORTABLE_SYSTEM_ONE_MAX_SCORE_CRITERIA),
})

export const portableSystemOneQuestionSchema = z.discriminatedUnion("type", [
  portableSystemOneChoiceQuestionSchema,
  portableSystemOneNoulQuestionSchema,
  portableSystemOneScoreQuestionSchema,
])

export const portableSystemOneQuestionsSchema = preservingRecordSchema(
  nonBlankStringSchema,
  portableSystemOneQuestionSchema,
).refine((value) => hasPropertyCount(value, 1, SYSTEM_ONE_MAX_QUESTIONS))

export const portableSystemOneRequestSchema = z.strictObject({
  model: nonBlankStringSchema,
  state: contentSchema,
  questions: portableSystemOneQuestionsSchema,
})

export interface PortableSystemOneChoiceQuestion {
  readonly type: "choice"
  readonly instructions: SystemOneContent
  readonly criteria: Readonly<Record<string, string | null>>
}

export interface PortableSystemOneNoulQuestion {
  readonly type: "noul"
  readonly instructions: SystemOneContent
  readonly criteria?: {
    readonly false?: string
    readonly true?: string
  }
}

export interface PortableSystemOneScoreQuestion {
  readonly type: "score"
  readonly instructions: SystemOneContent
  readonly criteria: ReadonlyArray<string>
}

export type PortableSystemOneQuestion =
  | PortableSystemOneChoiceQuestion
  | PortableSystemOneNoulQuestion
  | PortableSystemOneScoreQuestion
export type PortableSystemOneQuestions = Readonly<
  Record<string, PortableSystemOneQuestion>
>

export interface PortableSystemOneRequest<
  TQuestions extends PortableSystemOneQuestions = PortableSystemOneQuestions,
> {
  readonly model: string
  readonly state: SystemOneContent
  readonly questions: TQuestions
}

export interface PortableSystemOneChoiceAnswer {
  readonly type: "choice"
  readonly choice: string
  readonly probabilities: Readonly<Record<string, number>>
  readonly confidence: number
}

export interface PortableSystemOneNoulAnswer {
  readonly type: "noul"
  readonly noul: number
}

export interface PortableSystemOneScoreAnswer {
  readonly type: "score"
  readonly score: number
  readonly legend: Readonly<Record<string, string>>
  readonly probabilities: Readonly<Record<string, number>>
  readonly confidence: number
}

export type PortableSystemOneAnswerForQuestion<
  TQuestion extends PortableSystemOneQuestion,
> =
  TQuestion extends PortableSystemOneChoiceQuestion ?
    PortableSystemOneChoiceAnswer
  : TQuestion extends PortableSystemOneNoulQuestion ?
    PortableSystemOneNoulAnswer
  : TQuestion extends PortableSystemOneScoreQuestion ?
    PortableSystemOneScoreAnswer
  : never

export type PortableSystemOneAnswers<
  TQuestions extends PortableSystemOneQuestions,
> = {
  readonly [TName in keyof TQuestions]: PortableSystemOneAnswerForQuestion<
    TQuestions[TName]
  >
}

export interface PortableSystemOneResponse<
  TQuestions extends PortableSystemOneQuestions = PortableSystemOneQuestions,
> {
  readonly model: string
  readonly answers: PortableSystemOneAnswers<TQuestions>
  readonly usage: {
    readonly input_tokens: number
    readonly output_tokens: number
  }
}

export function definePortableSystemOneRequest<
  const TQuestions extends PortableSystemOneQuestions,
>(
  request: PortableSystemOneRequest<TQuestions>,
): PortableSystemOneRequest<TQuestions> {
  return request
}
