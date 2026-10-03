export const DECISION_MODEL_FAMILIES = Object.freeze([
  "gliner25",
  "nimble",
  "tev",
] as const)

export type DecisionModelFamily = (typeof DECISION_MODEL_FAMILIES)[number]

export type DecisionModelRunnerOperation =
  "classify-labels" | "score-token-candidates"

export interface DecisionModelDefinition {
  readonly family: DecisionModelFamily
  readonly model: string
  readonly runnerOperation: DecisionModelRunnerOperation
}

export const DECISION_MODELS: ReadonlyArray<DecisionModelDefinition> =
  Object.freeze([
    {
      family: "gliner25",
      model: "fastino/GLiNER2.5-Decide",
      runnerOperation: "classify-labels",
    },
    {
      family: "gliner25",
      model: "fastino/GLiNER2.5-Decide-1B",
      runnerOperation: "classify-labels",
    },
    {
      family: "gliner25",
      model: "fastino/GLiNER2.5-multi-Decide",
      runnerOperation: "classify-labels",
    },
    {
      family: "nimble",
      model: "nimble",
      runnerOperation: "score-token-candidates",
    },
    {
      family: "tev",
      model: "tev1",
      runnerOperation: "score-token-candidates",
    },
    {
      family: "tev",
      model: "tev1:0.8b",
      runnerOperation: "score-token-candidates",
    },
    {
      family: "tev",
      model: "tev1:4b",
      runnerOperation: "score-token-candidates",
    },
  ])

const GLINER25_MODELS = new Set([
  "fastino/gliner2.5-decide",
  "fastino/gliner2.5-decide-1b",
  "fastino/gliner2.5-multi-decide",
  "gliner2.5-decide",
  "gliner2.5-decide-1b",
  "gliner2.5-multi-decide",
  "gliner25",
  "gliner25:340m",
  "gliner25:1b",
  "gliner25:multi",
])

function normalizedModel(model: string): string {
  return model.trim().toLocaleLowerCase("en-US")
}

export function resolveDecisionModel(model: string): DecisionModelDefinition {
  const normalized = normalizedModel(model)
  if (GLINER25_MODELS.has(normalized)) {
    return {
      family: "gliner25",
      model,
      runnerOperation: "classify-labels",
    }
  }
  if (/^nimble(?::latest)?$/u.test(normalized)) {
    return {
      family: "nimble",
      model,
      runnerOperation: "score-token-candidates",
    }
  }
  if (/^tev1?(?::latest|:0\.8b|:4b)?$/u.test(normalized)) {
    return {
      family: "tev",
      model,
      runnerOperation: "score-token-candidates",
    }
  }
  throw new UnsupportedDecisionModelError(model)
}

export class UnsupportedDecisionModelError extends Error {
  readonly model: string

  constructor(model: string) {
    super(`Unsupported decision model "${model}".`)
    this.name = "UnsupportedDecisionModelError"
    this.model = model
  }
}
