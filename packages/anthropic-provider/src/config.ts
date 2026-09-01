import Schema from "@deepseek-ai/schemastery"

export const AUTH_TYPES = ["x-api-key", "authorization"] as const
export type AuthType = (typeof AUTH_TYPES)[number]

export const REASONING_EFFORTS = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const
export type AnthropicReasoningEffort = (typeof REASONING_EFFORTS)[number]

export interface ModelDefaults {
  contextWindow?: number
  maxTokens?: number
  reasoningEffort?: AnthropicReasoningEffort
  temperature?: number
  topK?: number
  topP?: number
}

export interface ModelConfig extends ModelDefaults {
  description?: string
  name?: string
}

export interface InstanceConfig {
  adjustInputTokens?: boolean
  aliases: Array<string>
  apiKey: string
  authType?: AuthType
  baseURL: string
  displayName?: string
  modelDefaults?: ModelDefaults
  models?: Record<string, ModelConfig>
}

export interface Config {
  instances: Array<InstanceConfig>
}

export interface ResolvedModelDefaults {
  contextWindow?: number
  maxTokens: number
  reasoningEffort?: AnthropicReasoningEffort
  temperature?: number
  topK?: number
  topP?: number
}

export interface ResolvedInstanceConfig {
  adjustInputTokens: boolean
  aliases: ReadonlyArray<string>
  apiKey: string
  authType: AuthType
  baseURL: string
  displayName: string
  modelDefaults: ResolvedModelDefaults
  models: Readonly<Record<string, Readonly<ModelConfig>>>
}

export interface ResolvedConfig {
  instances: ReadonlyArray<ResolvedInstanceConfig>
}

const positiveInteger = () => Schema.natural().min(1)
const probability = () => Schema.number().min(0).max(1)
const effortSchema = Schema.union(
  REASONING_EFFORTS.map((value) => Schema.const(value)),
)

const modelDefaultsSchema = Schema.object({
  contextWindow: positiveInteger(),
  maxTokens: positiveInteger(),
  reasoningEffort: effortSchema,
  temperature: probability(),
  topK: positiveInteger(),
  topP: probability(),
})

const modelSchema = Schema.intersect([
  modelDefaultsSchema,
  Schema.object({
    description: Schema.string(),
    name: Schema.string().min(1),
  }),
])

const instanceSchema = Schema.object({
  adjustInputTokens: Schema.boolean().default(false),
  aliases: Schema.array(Schema.string().pattern(/^[A-Z0-9][\w.-]*$/i))
    .min(1)
    .required(),
  apiKey: Schema.string()
    .pattern(/^[\x21-\x7E]+$/)
    .role("secret")
    .required(),
  authType: Schema.union(
    AUTH_TYPES.map((value) => Schema.const(value)),
  ).default("x-api-key"),
  baseURL: Schema.string().required(),
  displayName: Schema.string().min(1),
  modelDefaults: modelDefaultsSchema,
  models: Schema.dict(modelSchema),
})

const rawConfigSchema = Schema.object({
  instances: Schema.array(instanceSchema).min(1).required(),
})

export const Config = rawConfigSchema as unknown as Schema<Config>

export function resolveConfig(config: Config): ResolvedConfig {
  const aliases = new Set<string>()
  const instances = config.instances.map((instance, index) => {
    const baseURL = normalizeRootBaseURL(instance.baseURL)
    const uniqueAliases: Array<string> = []
    for (const alias of instance.aliases) {
      if (aliases.has(alias)) {
        throw new TypeError(
          `anthropic-provider: provider alias at instances[${index}] is duplicated`,
        )
      }
      aliases.add(alias)
      uniqueAliases.push(alias)
    }

    const models = resolveModels(instance.models, index)
    const modelDefaults = resolveModelDefaults(instance.modelDefaults)
    return Object.freeze({
      adjustInputTokens: instance.adjustInputTokens ?? false,
      aliases: Object.freeze(uniqueAliases),
      apiKey: instance.apiKey.trim(),
      authType: instance.authType ?? "x-api-key",
      baseURL,
      displayName: instance.displayName ?? "Anthropic",
      modelDefaults,
      models,
    })
  })
  return Object.freeze({ instances: Object.freeze(instances) })
}

function normalizeRootBaseURL(raw: string): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new TypeError(
      "anthropic-provider: baseURL must be a valid root HTTP(S) URL",
    )
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:")
    || url.username.length > 0
    || url.password.length > 0
    || url.pathname !== "/"
    || url.search.length > 0
    || url.hash.length > 0
  ) {
    throw new TypeError(
      "anthropic-provider: baseURL must be a root HTTP(S) URL without credentials, path, query, or fragment",
    )
  }
  return url.origin
}

function resolveModels(
  models: Record<string, ModelConfig> | undefined,
  instanceIndex: number,
): Readonly<Record<string, Readonly<ModelConfig>>> {
  const result: Record<string, Readonly<ModelConfig>> = {}
  for (const [id, model] of Object.entries(models ?? {})) {
    if (id.length === 0 || id.trim() !== id) {
      throw new TypeError(
        `anthropic-provider: model id at instances[${instanceIndex}] must be non-empty and unpadded`,
      )
    }
    result[id] = Object.freeze({ ...model })
  }
  return Object.freeze(result)
}

function resolveModelDefaults(
  defaults: ModelDefaults | undefined,
): ResolvedModelDefaults {
  return Object.freeze({
    ...defaults,
    maxTokens: defaults?.maxTokens ?? 16_000,
  })
}
