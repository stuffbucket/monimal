import { isDeepStrictEqual } from "node:util"

import type {
  SystemOneAnswer,
  SystemOneChoiceAnswer,
  SystemOneChoiceQuestion,
  SystemOneQuestions,
  SystemOneRequest,
  SystemOneResponse,
  SystemOneScoreAnswer,
  SystemOneScoreQuestion,
} from "./contract.ts"

import {
  ollamaSystemOneProfile,
  typeSafeSystemOneResponseSchema,
  type SystemOneWireProfile,
} from "./profiles.ts"

export type SystemOneValidationCode =
  | "answer_key_mismatch"
  | "answer_type_mismatch"
  | "choice_not_argmax"
  | "choice_not_in_criteria"
  | "confidence_mismatch"
  | "legend_mismatch"
  | "probability_key_mismatch"
  | "probability_sum_mismatch"
  | "score_expectation_mismatch"
  | "usage_out_of_range"
  | "value_out_of_range"
  | "wire_schema_mismatch"

export interface SystemOneValidationIssue {
  readonly code: SystemOneValidationCode
  readonly path: ReadonlyArray<string | number>
  readonly message: string
}

function sortedKeys(value: Readonly<Record<string, unknown>>): Array<string> {
  return Object.keys(value).sort((left, right) => {
    if (left < right) return -1
    if (left > right) return 1
    return 0
  })
}

function keysEqual(
  left: Readonly<Record<string, unknown>>,
  right: Readonly<Record<string, unknown>>,
): boolean {
  return isDeepStrictEqual(sortedKeys(left), sortedKeys(right))
}

function issue(
  code: SystemOneValidationCode,
  path: ReadonlyArray<string | number>,
  message: string,
): SystemOneValidationIssue {
  return { code, path, message }
}

function validateUnitInterval(
  value: number,
  path: ReadonlyArray<string | number>,
  issues: Array<SystemOneValidationIssue>,
): void {
  if (value < 0 || value > 1) {
    issues.push(
      issue("value_out_of_range", path, "Value must be between 0 and 1"),
    )
  }
}

interface ValidationContext {
  readonly path: ReadonlyArray<string | number>
  readonly issues: Array<SystemOneValidationIssue>
  readonly profile: SystemOneWireProfile
}

const NUMERIC_TOLERANCE = 1e-9

function approximatelyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= NUMERIC_TOLERANCE
}

function validateProbabilities(
  probabilities: Readonly<Record<string, number>>,
  expectedKeys: Readonly<Record<string, unknown>>,
  context: ValidationContext,
): void {
  if (!keysEqual(probabilities, expectedKeys)) {
    context.issues.push(
      issue(
        "probability_key_mismatch",
        context.path,
        "Probability keys must exactly match the question criteria",
      ),
    )
  }
  for (const key of sortedKeys(probabilities)) {
    validateUnitInterval(
      probabilities[key] ?? Number.NaN,
      [...context.path, key],
      context.issues,
    )
  }
  const sum = Object.values(probabilities).reduce(
    (total, probability) => total + probability,
    0,
  )
  if (!approximatelyEqual(sum, 1)) {
    context.issues.push(
      issue(
        "probability_sum_mismatch",
        context.path,
        "Probabilities must sum to 1",
      ),
    )
  }
}

function expectedConfidence(
  probabilities: Readonly<Record<string, number>>,
): number {
  const count = Object.keys(probabilities).length
  if (count <= 1) return 1
  const entropy = Object.values(probabilities).reduce(
    (sum, probability) =>
      probability === 0 ? sum : sum - probability * Math.log(probability),
    0,
  )
  return 1 - entropy / Math.log(count)
}

function validateConfidence(
  confidence: number,
  probabilities: Readonly<Record<string, number>>,
  context: ValidationContext,
): void {
  validateUnitInterval(
    confidence,
    [...context.path, "confidence"],
    context.issues,
  )
  if (
    context.profile.name === "ollama"
    && !approximatelyEqual(confidence, expectedConfidence(probabilities))
  ) {
    context.issues.push(
      issue(
        "confidence_mismatch",
        [...context.path, "confidence"],
        "Confidence must equal one minus normalized probability entropy",
      ),
    )
  }
}

function validateChoiceAnswer(
  question: SystemOneChoiceQuestion,
  answer: SystemOneChoiceAnswer,
  context: ValidationContext,
): void {
  if (!Object.hasOwn(question.criteria, answer.choice)) {
    context.issues.push(
      issue(
        "choice_not_in_criteria",
        [...context.path, "choice"],
        "Selected choice must be a criterion key",
      ),
    )
  }
  validateConfidence(answer.confidence, answer.probabilities, context)
  validateProbabilities(answer.probabilities, question.criteria, {
    ...context,
    path: [...context.path, "probabilities"],
  })
  const maximum = Math.max(...Object.values(answer.probabilities))
  const selectedProbability = answer.probabilities[answer.choice]
  const firstMaximum = Object.keys(question.criteria).find((key) =>
    approximatelyEqual(answer.probabilities[key] ?? Number.NaN, maximum),
  )
  if (
    selectedProbability === undefined
    || !approximatelyEqual(selectedProbability, maximum)
    || (context.profile.name === "ollama" && answer.choice !== firstMaximum)
  ) {
    context.issues.push(
      issue(
        "choice_not_argmax",
        [...context.path, "choice"],
        "Selected choice must be the highest-probability criterion",
      ),
    )
  }
}

function validateScoreAnswer(
  question: SystemOneScoreQuestion,
  answer: SystemOneScoreAnswer,
  context: ValidationContext,
): void {
  validateConfidence(answer.confidence, answer.probabilities, context)
  const expectedLegend = Object.fromEntries(
    question.criteria.map((criterion, index) => [String(index), criterion]),
  )
  if (!isDeepStrictEqual(answer.legend, expectedLegend)) {
    context.issues.push(
      issue(
        "legend_mismatch",
        [...context.path, "legend"],
        "Legend must exactly reproduce the indexed score criteria",
      ),
    )
  }
  validateProbabilities(answer.probabilities, expectedLegend, {
    ...context,
    path: [...context.path, "probabilities"],
  })
  if (answer.score < 0 || answer.score > question.criteria.length - 1) {
    context.issues.push(
      issue(
        "value_out_of_range",
        [...context.path, "score"],
        "Score must be within the question rubric",
      ),
    )
  }
  const expectedScore = Object.entries(answer.probabilities).reduce(
    (sum, [index, probability]) => sum + Number(index) * probability,
    0,
  )
  if (!approximatelyEqual(answer.score, expectedScore)) {
    context.issues.push(
      issue(
        "score_expectation_mismatch",
        [...context.path, "score"],
        "Score must equal the probability-weighted rubric index",
      ),
    )
  }
}

function validateAnswer(
  question: SystemOneQuestions[string],
  answer: SystemOneAnswer,
  context: ValidationContext,
): void {
  if (answer.type !== question.type) {
    context.issues.push(
      issue(
        "answer_type_mismatch",
        [...context.path, "type"],
        `Expected ${question.type} answer`,
      ),
    )
    return
  }

  switch (answer.type) {
    case "choice": {
      if (question.type !== "choice") return
      validateChoiceAnswer(question, answer, context)
      return
    }
    case "noul": {
      validateUnitInterval(
        answer.noul,
        [...context.path, "noul"],
        context.issues,
      )
      return
    }
    case "score": {
      if (question.type !== "score") return
      validateScoreAnswer(question, answer, context)
      return
    }
    default: {
      return
    }
  }
}

export function validateSystemOneResponse<
  TQuestions extends SystemOneQuestions,
>(
  request: SystemOneRequest<TQuestions>,
  value: unknown,
  profile: SystemOneWireProfile = ollamaSystemOneProfile,
): ReadonlyArray<SystemOneValidationIssue> {
  const parsed = profile.response.safeParse(value)
  if (!parsed.success) {
    return parsed.error.issues.map((zodIssue) =>
      issue(
        "wire_schema_mismatch",
        zodIssue.path.map((segment) =>
          typeof segment === "symbol" ? String(segment) : segment,
        ),
        zodIssue.message,
      ),
    )
  }

  const response = typeSafeSystemOneResponseSchema.parse(parsed.data)
  const issues: Array<SystemOneValidationIssue> = []
  if (!keysEqual(response.answers, request.questions)) {
    issues.push(
      issue(
        "answer_key_mismatch",
        ["answers"],
        "Answer keys must exactly match the request question keys",
      ),
    )
  }

  for (const name of sortedKeys(request.questions)) {
    const question = request.questions[name]
    const answer = response.answers[name]
    if (question !== undefined && answer !== undefined) {
      validateAnswer(question, answer, {
        path: ["answers", name],
        issues,
        profile,
      })
    }
  }

  for (const name of ["input_tokens", "output_tokens"] as const) {
    const tokens = response.usage[name]
    if (!Number.isInteger(tokens) || tokens < 0) {
      issues.push(
        issue(
          "usage_out_of_range",
          ["usage", name],
          "Token usage must be a nonnegative integer",
        ),
      )
    }
  }

  return issues
}

export class SystemOneValidationError extends Error {
  readonly issues: ReadonlyArray<SystemOneValidationIssue>

  constructor(issues: ReadonlyArray<SystemOneValidationIssue>) {
    super("System One response failed validation")
    this.name = "SystemOneValidationError"
    this.issues = issues
  }
}

export function parseSystemOneResponse<TQuestions extends SystemOneQuestions>(
  request: SystemOneRequest<TQuestions>,
  value: unknown,
  profile: SystemOneWireProfile = ollamaSystemOneProfile,
): SystemOneResponse<TQuestions> {
  const issues = validateSystemOneResponse(request, value, profile)
  if (issues.length > 0) throw new SystemOneValidationError(issues)
  return value as SystemOneResponse<TQuestions>
}
