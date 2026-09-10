import { assertUsableApiKey } from "@deepseek-ai/dsh-llm"
import z from "@deepseek-ai/schemastery"

export interface OmlxModelDefaults {
  contextWindow?: number
  maxTokens?: number
}

export interface OmlxInstanceConfig {
  baseUrl: string
  apiKey: string
  modelDefaults?: OmlxModelDefaults
}

export interface Config {
  instances: Record<string, OmlxInstanceConfig>
}

const modelDefaults = z.object({
  contextWindow: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER),
  maxTokens: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER),
})

const instance = z.object({
  baseUrl: z.string().required(),
  apiKey: z.string().role("secret").required(),
  modelDefaults,
})

export const Config: z<Config> = z.object({
  instances: z.dict(instance).required(),
})

export interface ResolvedOmlxInstance {
  readonly alias: string
  readonly baseUrl: string
  readonly apiKey: string
  readonly modelDefaults?: Readonly<OmlxModelDefaults>
}

export type ResolvedOmlxInstances = ReadonlyMap<string, ResolvedOmlxInstance>

type UnknownRecord = Record<string, unknown>

function configError(alias: string, field: string, requirement: string): Error {
  return new Error(`omlx: instance "${alias}" ${field} ${requirement}`)
}

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

export function normalizeBaseUrl(alias: string, raw: string): string {
  if (raw.length === 0 || raw !== raw.trim()) {
    throw configError(alias, "baseUrl", "must be a root HTTP(S) URL")
  }

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw configError(alias, "baseUrl", "must be a root HTTP(S) URL")
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw configError(alias, "baseUrl", "must use http or https")
  }
  if (url.username.length > 0 || url.password.length > 0) {
    throw configError(alias, "baseUrl", "must not contain credentials")
  }
  if (url.search.length > 0 || url.hash.length > 0) {
    throw configError(alias, "baseUrl", "must not contain a query or fragment")
  }
  if (url.pathname !== "/") {
    throw configError(alias, "baseUrl", "must not contain a path")
  }

  return url.origin
}

function positiveSafeInteger(
  alias: string,
  field: string,
  value: unknown,
): number | undefined {
  if (value === undefined) return undefined
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw configError(alias, field, "must be a positive safe integer")
  }
  return value as number
}

function instancesFromConfig(config: unknown): UnknownRecord {
  if (!isRecord(config)) {
    throw new Error("omlx: config must be an object")
  }
  if (!isRecord(config.instances)) {
    throw new Error("omlx: instances must be a record")
  }
  if (Object.keys(config.instances).length === 0) {
    throw new Error("omlx: at least one instance must be configured")
  }
  return config.instances
}

function resolveInstance(alias: string, raw: unknown): ResolvedOmlxInstance {
  if (alias.length === 0 || alias !== alias.trim()) {
    throw new Error(
      "omlx: instance aliases must be non-empty and have no surrounding whitespace",
    )
  }
  if (!isRecord(raw)) {
    throw configError(alias, "configuration", "must be an object")
  }
  if (typeof raw.baseUrl !== "string") {
    throw configError(alias, "baseUrl", "must be a root HTTP(S) URL")
  }
  if (typeof raw.apiKey !== "string") {
    throw configError(alias, "apiKey", "must be a string")
  }
  if (raw.modelDefaults !== undefined && !isRecord(raw.modelDefaults)) {
    throw configError(alias, "modelDefaults", "must be an object")
  }

  const defaults = raw.modelDefaults
  const contextWindow = positiveSafeInteger(
    alias,
    "modelDefaults.contextWindow",
    defaults?.contextWindow,
  )
  const maxTokens = positiveSafeInteger(
    alias,
    "modelDefaults.maxTokens",
    defaults?.maxTokens,
  )
  const resolvedDefaults =
    contextWindow === undefined && maxTokens === undefined ?
      undefined
    : {
        ...(contextWindow === undefined ? {} : { contextWindow }),
        ...(maxTokens === undefined ? {} : { maxTokens }),
      }
  return {
    alias,
    baseUrl: normalizeBaseUrl(alias, raw.baseUrl),
    apiKey: assertUsableApiKey(raw.apiKey, "omlx", `instances.${alias}.apiKey`),
    ...(resolvedDefaults === undefined ?
      {}
    : { modelDefaults: resolvedDefaults }),
  }
}

export function resolveConfig(config: unknown): ResolvedOmlxInstances {
  const resolved = new Map<string, ResolvedOmlxInstance>()
  for (const [alias, raw] of Object.entries(instancesFromConfig(config))) {
    resolved.set(alias, resolveInstance(alias, raw))
  }
  return resolved
}
