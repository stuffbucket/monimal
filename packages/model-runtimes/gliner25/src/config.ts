import type {
  Gliner25Backend,
  Gliner25Precision,
  Gliner25ProviderOptions,
} from "@maximal/maximal-provider-gliner25"

import Schema from "@deepseek-ai/schemastery"
import {
  MAXIMAL_GLINER25_PROVIDER_ID,
  MAXIMAL_MODEL_CATALOG,
} from "@maximal/maximal-model-catalog"
import { resolveDecisionModel } from "@maximal/maximal-provider-decision-model"

export interface Config {
  readonly backend: Gliner25Backend
  readonly baseUrl: string
  readonly headers?: Readonly<Record<string, string>>
  readonly modelMapping?: Readonly<Record<string, string>>
  readonly precision: Gliner25Precision
  readonly provider: string
}

const stringRecord = Schema.dict(Schema.string())
const backend = Schema.union([
  Schema.const("pytorch"),
  Schema.const("mlx"),
  Schema.const("onnx"),
])
const precision = Schema.union([
  Schema.const("fp32"),
  Schema.const("fp16"),
  Schema.const("bf16"),
  Schema.const("int8"),
  Schema.const("int4"),
])

export const Config: Schema<Config> = Schema.object({
  backend: backend.required(),
  baseUrl: Schema.string().required(),
  headers: stringRecord,
  modelMapping: stringRecord,
  precision: precision.required(),
  provider: Schema.string().required(),
})

const BACKENDS = new Set<Gliner25Backend>(["pytorch", "mlx", "onnx"])
const PRECISIONS = new Set<Gliner25Precision>([
  "fp32",
  "fp16",
  "bf16",
  "int8",
  "int4",
])

export const GLINER25_MODELS: ReadonlyArray<string> = Object.freeze([
  "gliner25:340m",
  "gliner25:1b",
  "gliner25:multi",
] as const)

const offerings = new Map(
  GLINER25_MODELS.map((model) => {
    const offering = MAXIMAL_MODEL_CATALOG.offering(
      MAXIMAL_GLINER25_PROVIDER_ID,
      model,
    )
    if (offering === undefined) {
      throw new Error(`The model catalog does not define "${model}".`)
    }
    const canonicalModelId = offering.canonicalModelId
    if (canonicalModelId === null) {
      throw new Error(`The model catalog does not map "${model}".`)
    }
    const definition = resolveDecisionModel(canonicalModelId)
    if (definition.family !== "gliner25") {
      throw new Error(
        `The model catalog maps "${model}" to a non-GLiNER2.5 model.`,
      )
    }
    return [
      model,
      Object.freeze({ canonicalModelId, name: offering.name }),
    ] as const
  }),
)
const canonicalModels = new Set(
  [...offerings.values()].map(({ canonicalModelId }) => canonicalModelId),
)

export interface ResolvedConfig {
  readonly models: ReadonlyArray<{
    readonly family: "gliner25"
    readonly id: string
    readonly name: string
  }>
  readonly provider: string
  readonly providerOptions: Gliner25ProviderOptions
}

function record(
  value: unknown,
  field: string,
): Readonly<Record<string, string>> | undefined {
  if (value === undefined) return undefined
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`gliner25: ${field} must be a string record`)
  }
  const result: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (key.length === 0 || key !== key.trim() || typeof entry !== "string") {
      throw new TypeError(
        `gliner25: ${field} must contain non-empty keys and string values`,
      )
    }
    if (entry.length === 0 || entry !== entry.trim()) {
      throw new TypeError(
        `gliner25: ${field}.${key} must be non-empty and have no surrounding whitespace`,
      )
    }
    Object.defineProperty(result, key, {
      configurable: true,
      enumerable: true,
      value: entry,
      writable: true,
    })
  }
  return Object.freeze(result)
}

function configRecord(config: unknown): Record<string, unknown> {
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    throw new TypeError("gliner25: config must be an object")
  }
  const value = config as Record<string, unknown>
  const allowed = new Set([
    "backend",
    "baseUrl",
    "headers",
    "modelMapping",
    "precision",
    "provider",
  ])
  const unknown = Object.keys(value).filter((key) => !allowed.has(key))
  if (unknown.length > 0) {
    throw new TypeError(`gliner25: unknown config field "${unknown[0]}"`)
  }
  return value
}

function providerAlias(value: unknown): string {
  if (value !== MAXIMAL_GLINER25_PROVIDER_ID) {
    throw new TypeError(
      `gliner25: provider must equal "${MAXIMAL_GLINER25_PROVIDER_ID}"`,
    )
  }
  return MAXIMAL_GLINER25_PROVIDER_ID
}

export function resolveConfig(config: unknown): ResolvedConfig {
  const value = configRecord(config)
  const provider = providerAlias(value.provider)
  if (typeof value.baseUrl !== "string" || value.baseUrl.length === 0) {
    throw new TypeError("gliner25: baseUrl must be an explicit HTTP(S) URL")
  }
  if (
    typeof value.backend !== "string"
    || !BACKENDS.has(value.backend as Gliner25Backend)
  ) {
    throw new TypeError("gliner25: backend is not supported")
  }
  if (
    typeof value.precision !== "string"
    || !PRECISIONS.has(value.precision as Gliner25Precision)
  ) {
    throw new TypeError("gliner25: precision is not supported")
  }
  const headers = record(value.headers, "headers")
  if (headers !== undefined) new Headers(headers)
  const modelMapping = record(value.modelMapping, "modelMapping")
  if (modelMapping !== undefined) {
    for (const model of Object.keys(modelMapping)) {
      const definition = resolveDecisionModel(model)
      if (definition.family !== "gliner25" || !canonicalModels.has(model)) {
        throw new TypeError(
          `gliner25: modelMapping key "${model}" is not a canonical GLiNER2.5 model`,
        )
      }
    }
  }
  const resolveRunnerModel = (model: string): string => {
    const offering = offerings.get(model)
    if (offering === undefined) {
      throw new TypeError(
        `gliner25: model "${model}" is not a reviewed GLiNER2.5 offering`,
      )
    }
    return (
      modelMapping?.[offering.canonicalModelId] ?? offering.canonicalModelId
    )
  }
  return Object.freeze({
    models: Object.freeze(
      GLINER25_MODELS.map((id) => {
        const offering = offerings.get(id)
        if (offering === undefined) {
          throw new Error(`The model catalog does not define "${id}".`)
        }
        return Object.freeze({
          family: "gliner25" as const,
          id,
          name: offering.name,
        })
      }),
    ),
    provider,
    providerOptions: Object.freeze({
      backend: value.backend as Gliner25Backend,
      baseUrl: value.baseUrl,
      ...(headers === undefined ? {} : { headers }),
      precision: value.precision as Gliner25Precision,
      resolveRunnerModel,
    }),
  })
}
