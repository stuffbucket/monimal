export type SystemOneJsonValue =
  | boolean
  | number
  | string
  | null
  | ReadonlyArray<SystemOneJsonValue>
  | { readonly [key: string]: SystemOneJsonValue }

export type SystemOneContent =
  | string
  | ReadonlyArray<SystemOneJsonValue>
  | { readonly [key: string]: SystemOneJsonValue }

type StringKeyOf<T> = Extract<keyof T, string>
type TupleIndex<T extends ReadonlyArray<unknown>> =
  number extends T["length"] ? `${number}`
  : Extract<Exclude<keyof T, keyof ReadonlyArray<unknown>>, string>

export interface SystemOneChoiceQuestion {
  readonly type: "choice"
  readonly instructions?: SystemOneContent | null
  readonly criteria: Readonly<Record<string, SystemOneContent | null>>
}

export interface SystemOneNoulQuestion {
  readonly type: "noul"
  readonly instructions?: SystemOneContent | null
  readonly criteria?: {
    readonly false?: SystemOneContent | null
    readonly true?: SystemOneContent | null
  } | null
}

export interface SystemOneScoreQuestion {
  readonly type: "score"
  readonly instructions?: SystemOneContent | null
  readonly criteria: ReadonlyArray<SystemOneContent | null>
}

export type SystemOneQuestion =
  SystemOneChoiceQuestion | SystemOneNoulQuestion | SystemOneScoreQuestion

export type SystemOneQuestions = Readonly<Record<string, SystemOneQuestion>>

export interface SystemOneRequest<
  TQuestions extends SystemOneQuestions = SystemOneQuestions,
> {
  readonly model: string
  readonly state: SystemOneContent | null
  readonly questions: TQuestions
  readonly keep_alive?: string | number
}

export interface SystemOneChoiceAnswer<
  TQuestion extends SystemOneChoiceQuestion = SystemOneChoiceQuestion,
> {
  readonly type: "choice"
  readonly choice: StringKeyOf<TQuestion["criteria"]>
  readonly probabilities: Readonly<{
    [TChoice in StringKeyOf<TQuestion["criteria"]>]: number
  }>
  readonly confidence: number
}

export interface SystemOneNoulAnswer {
  readonly type: "noul"
  readonly noul: number
}

export interface SystemOneScoreAnswer<
  TQuestion extends SystemOneScoreQuestion = SystemOneScoreQuestion,
> {
  readonly type: "score"
  readonly score: number
  readonly legend: Readonly<{
    [TIndex in TupleIndex<TQuestion["criteria"]>]: TQuestion["criteria"][TIndex
      & keyof TQuestion["criteria"]]
  }>
  readonly probabilities: Readonly<{
    [TIndex in TupleIndex<TQuestion["criteria"]>]: number
  }>
  readonly confidence: number
}

export type SystemOneAnswer =
  SystemOneChoiceAnswer | SystemOneNoulAnswer | SystemOneScoreAnswer

export type SystemOneAnswerForQuestion<TQuestion extends SystemOneQuestion> =
  TQuestion extends SystemOneChoiceQuestion ? SystemOneChoiceAnswer<TQuestion>
  : TQuestion extends SystemOneNoulQuestion ? SystemOneNoulAnswer
  : TQuestion extends SystemOneScoreQuestion ? SystemOneScoreAnswer<TQuestion>
  : never

export type SystemOneAnswers<TQuestions extends SystemOneQuestions> = {
  readonly [TName in keyof TQuestions]: SystemOneAnswerForQuestion<
    TQuestions[TName]
  >
}

export interface SystemOneUsage {
  readonly input_tokens: number
  readonly output_tokens: number
}

export interface SystemOneResponse<
  TQuestions extends SystemOneQuestions = SystemOneQuestions,
> {
  readonly model: string
  readonly answers: SystemOneAnswers<TQuestions>
  readonly usage: SystemOneUsage
}

export function defineSystemOneRequest<
  const TQuestions extends SystemOneQuestions,
>(request: SystemOneRequest<TQuestions>): SystemOneRequest<TQuestions> {
  return request
}
