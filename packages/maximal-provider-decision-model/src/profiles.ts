import { z } from "zod"

import type {
  SystemOneAnswers,
  SystemOneChoiceAnswer,
  SystemOneContent,
  SystemOneNoulAnswer,
  SystemOneQuestions,
  SystemOneResponse,
  SystemOneScoreAnswer,
} from "./contract.ts"

import { preservingJsonSchema, preservingRecordSchema } from "./schemas.ts"

export const SYSTEM_ONE_PATH = "/v1/systemone" as const
export const SYSTEM_ONE_METHOD = "POST" as const
export const SYSTEM_ONE_MEDIA_TYPE = "application/json" as const

const jsonObjectSchema = preservingRecordSchema(
  z.string(),
  preservingJsonSchema,
)
const jsonArraySchema = z.array(preservingJsonSchema)
const stringContentSchema = z.string()
const nonBlankStringSchema = z.string().regex(/\S/)

function propertyCount(
  minimum: number,
  maximum?: number,
): (value: Readonly<Record<string, unknown>>) => boolean {
  return (value) => {
    const count = Object.keys(value).length
    return count >= minimum && (maximum === undefined || count <= maximum)
  }
}

export const typeSafeSystemOneContentSchema = z.union([
  stringContentSchema,
  jsonObjectSchema,
  jsonArraySchema,
])
const typeSafeNullableContentSchema = typeSafeSystemOneContentSchema.nullable()

const typeSafeOptionalContentSchema = typeSafeNullableContentSchema.optional()

export const typeSafeSystemOneChoiceQuestionSchema = z.looseObject({
  type: z.literal("choice"),
  instructions: typeSafeOptionalContentSchema,
  criteria: preservingRecordSchema(
    z.string(),
    typeSafeNullableContentSchema,
  ).refine(
    propertyCount(1, 255),
    "Choice criteria must contain 1 to 255 entries",
  ),
})

export const typeSafeSystemOneNoulQuestionSchema = z.looseObject({
  type: z.literal("noul"),
  instructions: typeSafeOptionalContentSchema,
  criteria: z
    .looseObject({
      false: typeSafeOptionalContentSchema,
      true: typeSafeOptionalContentSchema,
    })
    .nullable()
    .optional(),
})

export const typeSafeSystemOneScoreQuestionSchema = z.looseObject({
  type: z.literal("score"),
  instructions: typeSafeOptionalContentSchema,
  criteria: z.array(typeSafeNullableContentSchema).min(2).max(10),
})

export const typeSafeSystemOneQuestionSchema = z.discriminatedUnion("type", [
  typeSafeSystemOneChoiceQuestionSchema,
  typeSafeSystemOneNoulQuestionSchema,
  typeSafeSystemOneScoreQuestionSchema,
])

export const typeSafeSystemOneQuestionsSchema = preservingRecordSchema(
  z.string(),
  typeSafeSystemOneQuestionSchema,
).refine(propertyCount(1), "At least one question is required")

export const typeSafeSystemOneRequestSchema = z.looseObject({
  state: typeSafeNullableContentSchema,
  model: z.string(),
  questions: typeSafeSystemOneQuestionsSchema,
})

export const typeSafeSystemOneProbabilitiesSchema = preservingRecordSchema(
  z.string(),
  z.number(),
)
export const typeSafeSystemOneChoiceAnswerSchema = z.looseObject({
  type: z.literal("choice"),
  choice: z.string(),
  confidence: z.number(),
  probabilities: typeSafeSystemOneProbabilitiesSchema,
})
export const typeSafeSystemOneNoulAnswerSchema = z.looseObject({
  type: z.literal("noul"),
  noul: z.number(),
})
export const typeSafeSystemOneScoreAnswerSchema = z.looseObject({
  type: z.literal("score"),
  score: z.number(),
  confidence: z.number(),
  legend: preservingRecordSchema(z.string(), typeSafeNullableContentSchema),
  probabilities: typeSafeSystemOneProbabilitiesSchema,
})

export const typeSafeSystemOneAnswerSchema = z.discriminatedUnion("type", [
  typeSafeSystemOneChoiceAnswerSchema,
  typeSafeSystemOneNoulAnswerSchema,
  typeSafeSystemOneScoreAnswerSchema,
])

export const typeSafeSystemOneUsageSchema = z.looseObject({
  input_tokens: z.number().int(),
  output_tokens: z.number().int(),
})

export const typeSafeSystemOneResponseSchema = z.looseObject({
  model: z.string(),
  answers: preservingRecordSchema(
    z.string(),
    typeSafeSystemOneAnswerSchema,
  ).refine(propertyCount(1), "At least one answer is required"),
  usage: typeSafeSystemOneUsageSchema,
})

export const typeSafeSystemOneValidationErrorSchema = z.looseObject({
  loc: z.array(z.union([z.string(), z.number()])),
  msg: z.string(),
  type: z.string(),
  input: z.unknown().optional(),
  ctx: z.record(z.string(), z.unknown()).nullable().optional(),
})

export const typeSafeSystemOneErrorResponseSchema = z.looseObject({
  detail: z.array(typeSafeSystemOneValidationErrorSchema).nullable().optional(),
})

export const typeSafeSystemOneServiceErrorResponseSchema = z.looseObject({
  detail: z.string(),
})

export const TYPE_SAFE_SYSTEM_ONE_RESPONSE_STATUSES = [
  200, 401, 422, 429, 529,
] as const

export const typeSafeSystemOneResponseSchemas = {
  200: typeSafeSystemOneResponseSchema,
  401: typeSafeSystemOneServiceErrorResponseSchema,
  422: typeSafeSystemOneErrorResponseSchema,
  429: typeSafeSystemOneServiceErrorResponseSchema,
  529: typeSafeSystemOneServiceErrorResponseSchema,
} as const

export interface TypeSafeSystemOneRequest<
  TQuestions extends SystemOneQuestions = SystemOneQuestions,
> {
  readonly state: SystemOneContent | null
  readonly model: string
  readonly questions: TQuestions
}

export type TypeSafeSystemOneResponse<
  TQuestions extends SystemOneQuestions = SystemOneQuestions,
> = SystemOneResponse<TQuestions>

export type TypeSafeSystemOneChoiceAnswer = SystemOneChoiceAnswer
export type TypeSafeSystemOneNoulAnswer = SystemOneNoulAnswer
export type TypeSafeSystemOneScoreAnswer = SystemOneScoreAnswer
export type TypeSafeSystemOneUsage = z.infer<
  typeof typeSafeSystemOneUsageSchema
>
export type TypeSafeSystemOneErrorResponse = z.infer<
  typeof typeSafeSystemOneErrorResponseSchema
>
export type TypeSafeSystemOneServiceErrorResponse = z.infer<
  typeof typeSafeSystemOneServiceErrorResponseSchema
>
export type TypeSafeSystemOneResponseStatus =
  (typeof TYPE_SAFE_SYSTEM_ONE_RESPONSE_STATUSES)[number]
export type TypeSafeSystemOneQuestion = SystemOneQuestions[string]
export type TypeSafeSystemOneQuestions = SystemOneQuestions

export function defineTypeSafeSystemOneRequest<
  const TQuestions extends TypeSafeSystemOneQuestions,
>(
  request: TypeSafeSystemOneRequest<TQuestions>,
): TypeSafeSystemOneRequest<TQuestions> {
  return request
}

export const SYSTEM_ONE_MAX_REQUEST_BYTES = 64 * 1024
export const SYSTEM_ONE_MAX_QUESTIONS = 64
export const SYSTEM_ONE_MIN_CRITERIA = 2
export const SYSTEM_ONE_MAX_CRITERIA = 26

export const ollamaSystemOneContentSchema = z.union([
  nonBlankStringSchema,
  jsonObjectSchema,
  jsonArraySchema,
])

export const ollamaSystemOneChoiceQuestionSchema = z.looseObject({
  type: z.literal("choice"),
  instructions: ollamaSystemOneContentSchema,
  criteria: preservingRecordSchema(
    nonBlankStringSchema,
    z.string().nullable(),
  ).refine(
    propertyCount(SYSTEM_ONE_MIN_CRITERIA, SYSTEM_ONE_MAX_CRITERIA),
    `Choice criteria must contain ${SYSTEM_ONE_MIN_CRITERIA} to ${SYSTEM_ONE_MAX_CRITERIA} entries`,
  ),
})

export const ollamaSystemOneNoulQuestionSchema = z.looseObject({
  type: z.literal("noul"),
  instructions: ollamaSystemOneContentSchema,
  criteria: z
    .strictObject({
      false: z.string().default("No"),
      true: z.string().default("Yes"),
    })
    .partial()
    .optional(),
})

export const ollamaSystemOneScoreQuestionSchema = z.looseObject({
  type: z.literal("score"),
  instructions: ollamaSystemOneContentSchema,
  criteria: z
    .array(z.string())
    .min(SYSTEM_ONE_MIN_CRITERIA)
    .max(SYSTEM_ONE_MAX_CRITERIA),
})

export const ollamaSystemOneQuestionSchema = z.discriminatedUnion("type", [
  ollamaSystemOneChoiceQuestionSchema,
  ollamaSystemOneNoulQuestionSchema,
  ollamaSystemOneScoreQuestionSchema,
])

export const ollamaSystemOneQuestionsSchema = preservingRecordSchema(
  nonBlankStringSchema,
  ollamaSystemOneQuestionSchema,
).refine(
  propertyCount(1, SYSTEM_ONE_MAX_QUESTIONS),
  `Questions must contain 1 to ${SYSTEM_ONE_MAX_QUESTIONS} entries`,
)

export const ollamaSystemOneRequestSchema = z.looseObject({
  model: nonBlankStringSchema,
  state: ollamaSystemOneContentSchema,
  questions: ollamaSystemOneQuestionsSchema,
  keep_alive: z.union([z.string(), z.number()]).optional(),
})

export const ollamaSystemOneProbabilitiesSchema = preservingRecordSchema(
  z.string(),
  z.number().min(0).max(1),
)
export const ollamaSystemOneConfidenceSchema = z.number().min(0).max(1)

export const ollamaSystemOneChoiceAnswerSchema = z.looseObject({
  type: z.literal("choice"),
  choice: z.string(),
  probabilities: ollamaSystemOneProbabilitiesSchema,
  confidence: ollamaSystemOneConfidenceSchema,
})
export const ollamaSystemOneNoulAnswerSchema = z.looseObject({
  type: z.literal("noul"),
  noul: z.number().min(0).max(1),
})
export const ollamaSystemOneScoreAnswerSchema = z.looseObject({
  type: z.literal("score"),
  score: z.number().min(0).max(25),
  legend: preservingRecordSchema(z.string(), z.string()),
  probabilities: ollamaSystemOneProbabilitiesSchema,
  confidence: ollamaSystemOneConfidenceSchema,
})

export const ollamaSystemOneAnswerSchema = z.discriminatedUnion("type", [
  ollamaSystemOneChoiceAnswerSchema,
  ollamaSystemOneNoulAnswerSchema,
  ollamaSystemOneScoreAnswerSchema,
])

export const ollamaSystemOneUsageSchema = z.looseObject({
  input_tokens: z.number().int().min(0),
  output_tokens: z.number().int().min(0),
})

export const ollamaSystemOneResponseSchema = z.looseObject({
  model: z.string(),
  answers: preservingRecordSchema(z.string(), ollamaSystemOneAnswerSchema),
  usage: ollamaSystemOneUsageSchema,
})

export const ollamaSystemOneErrorResponseSchema = z.looseObject({
  error: z.string(),
})

export const OLLAMA_SYSTEM_ONE_RESPONSE_STATUSES = [
  200, 400, 404, 413, 500,
] as const

export const ollamaSystemOneResponseSchemas = {
  200: ollamaSystemOneResponseSchema,
  400: ollamaSystemOneErrorResponseSchema,
  404: ollamaSystemOneErrorResponseSchema,
  413: ollamaSystemOneErrorResponseSchema,
  500: ollamaSystemOneErrorResponseSchema,
} as const

export interface OllamaSystemOneChoiceQuestion {
  readonly type: "choice"
  readonly instructions: SystemOneContent
  readonly criteria: Readonly<Record<string, string | null>>
}
export interface OllamaSystemOneNoulQuestion {
  readonly type: "noul"
  readonly instructions: SystemOneContent
  readonly criteria?: {
    readonly false?: string
    readonly true?: string
  }
}
export interface OllamaSystemOneScoreQuestion {
  readonly type: "score"
  readonly instructions: SystemOneContent
  readonly criteria: ReadonlyArray<string>
}
export type OllamaSystemOneQuestion =
  | OllamaSystemOneChoiceQuestion
  | OllamaSystemOneNoulQuestion
  | OllamaSystemOneScoreQuestion
export type OllamaSystemOneQuestions = Readonly<
  Record<string, OllamaSystemOneQuestion>
>

export interface OllamaSystemOneRequest<
  TQuestions extends OllamaSystemOneQuestions = OllamaSystemOneQuestions,
> {
  readonly model: string
  readonly state: SystemOneContent
  readonly questions: TQuestions
  readonly keep_alive?: string | number
}

type OllamaStringKeyOf<T> = Extract<keyof T, string>
type OllamaTupleIndex<T extends ReadonlyArray<unknown>> =
  number extends T["length"] ? `${number}`
  : Extract<Exclude<keyof T, keyof ReadonlyArray<unknown>>, string>

export interface OllamaSystemOneChoiceAnswer<
  TQuestion extends OllamaSystemOneChoiceQuestion =
    OllamaSystemOneChoiceQuestion,
> {
  readonly type: "choice"
  readonly choice: OllamaStringKeyOf<TQuestion["criteria"]>
  readonly probabilities: Readonly<{
    [TChoice in OllamaStringKeyOf<TQuestion["criteria"]>]: number
  }>
  readonly confidence: number
}
export interface OllamaSystemOneNoulAnswer {
  readonly type: "noul"
  readonly noul: number
}
export interface OllamaSystemOneScoreAnswer<
  TQuestion extends OllamaSystemOneScoreQuestion = OllamaSystemOneScoreQuestion,
> {
  readonly type: "score"
  readonly score: number
  readonly legend: Readonly<{
    [
      TIndex in OllamaTupleIndex<TQuestion["criteria"]>
    ]: TQuestion["criteria"][TIndex & keyof TQuestion["criteria"]]
  }>
  readonly probabilities: Readonly<{
    [TIndex in OllamaTupleIndex<TQuestion["criteria"]>]: number
  }>
  readonly confidence: number
}

export type OllamaSystemOneAnswerForQuestion<
  TQuestion extends OllamaSystemOneQuestion,
> =
  TQuestion extends OllamaSystemOneChoiceQuestion ?
    OllamaSystemOneChoiceAnswer<TQuestion>
  : TQuestion extends OllamaSystemOneNoulQuestion ? OllamaSystemOneNoulAnswer
  : TQuestion extends OllamaSystemOneScoreQuestion ?
    OllamaSystemOneScoreAnswer<TQuestion>
  : never

export type OllamaSystemOneAnswers<
  TQuestions extends OllamaSystemOneQuestions,
> = {
  readonly [TName in keyof TQuestions]: OllamaSystemOneAnswerForQuestion<
    TQuestions[TName]
  >
}

export interface OllamaSystemOneResponse<
  TQuestions extends OllamaSystemOneQuestions = OllamaSystemOneQuestions,
> {
  readonly model: string
  readonly answers: OllamaSystemOneAnswers<TQuestions>
  readonly usage: {
    readonly input_tokens: number
    readonly output_tokens: number
  }
}

export function defineOllamaSystemOneRequest<
  const TQuestions extends OllamaSystemOneQuestions,
>(
  request: OllamaSystemOneRequest<TQuestions>,
): OllamaSystemOneRequest<TQuestions> {
  return request
}

export interface SystemOneWireProfile {
  readonly name: "typesafe-jev" | "ollama"
  readonly path: typeof SYSTEM_ONE_PATH
  readonly method: typeof SYSTEM_ONE_METHOD
  readonly mediaType: typeof SYSTEM_ONE_MEDIA_TYPE
  readonly maxRequestBytes?: number
  readonly invalidRequestStatus: 400 | 422
  readonly request: z.ZodType
  readonly response: z.ZodType
  readonly responses: Readonly<Record<number, z.ZodType>>
}

export const typeSafeSystemOneProfile = {
  name: "typesafe-jev",
  path: SYSTEM_ONE_PATH,
  method: SYSTEM_ONE_METHOD,
  mediaType: SYSTEM_ONE_MEDIA_TYPE,
  invalidRequestStatus: 422,
  request: typeSafeSystemOneRequestSchema,
  response: typeSafeSystemOneResponseSchema,
  responses: typeSafeSystemOneResponseSchemas,
} as const satisfies SystemOneWireProfile

export const ollamaSystemOneProfile = {
  name: "ollama",
  path: SYSTEM_ONE_PATH,
  method: SYSTEM_ONE_METHOD,
  mediaType: SYSTEM_ONE_MEDIA_TYPE,
  maxRequestBytes: SYSTEM_ONE_MAX_REQUEST_BYTES,
  invalidRequestStatus: 400,
  request: ollamaSystemOneRequestSchema,
  response: ollamaSystemOneResponseSchema,
  responses: ollamaSystemOneResponseSchemas,
} as const satisfies SystemOneWireProfile

export type SystemOneResponseStatus =
  (typeof OLLAMA_SYSTEM_ONE_RESPONSE_STATUSES)[number]
export type OllamaSystemOneResponseStatus = SystemOneResponseStatus
export type SystemOneErrorResponse = z.infer<
  typeof ollamaSystemOneErrorResponseSchema
>
export type OllamaSystemOneErrorResponse = SystemOneErrorResponse
export type SystemOneProbabilities = z.infer<
  typeof ollamaSystemOneProbabilitiesSchema
>

export type TypeSafeSystemOneAnswers<TQuestions extends SystemOneQuestions> =
  SystemOneAnswers<TQuestions>

export type SystemOneResponseBodyByStatus<
  TQuestions extends OllamaSystemOneQuestions = OllamaSystemOneQuestions,
> = {
  readonly 200: OllamaSystemOneResponse<TQuestions>
  readonly 400: OllamaSystemOneErrorResponse
  readonly 404: OllamaSystemOneErrorResponse
  readonly 413: OllamaSystemOneErrorResponse
  readonly 500: OllamaSystemOneErrorResponse
}

export type TypeSafeSystemOneResponseBodyByStatus<
  TQuestions extends TypeSafeSystemOneQuestions = TypeSafeSystemOneQuestions,
> = {
  readonly 200: TypeSafeSystemOneResponse<TQuestions>
  readonly 401: TypeSafeSystemOneServiceErrorResponse
  readonly 422: TypeSafeSystemOneErrorResponse
  readonly 429: TypeSafeSystemOneServiceErrorResponse
  readonly 529: TypeSafeSystemOneServiceErrorResponse
}
