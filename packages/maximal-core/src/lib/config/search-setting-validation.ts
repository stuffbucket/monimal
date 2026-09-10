import type {
  ConnectorSettingField,
  ConnectorSettingValue,
  SearchProvider,
  SearchProviderConfig,
} from "@stuffbucket/maximal-harness"

import { z } from "zod"

export function searchSettingError(
  field: ConnectorSettingField,
  value: ConnectorSettingValue | null,
  path: string,
): string | undefined {
  if (value === null) {
    return field.required ? `${path}: ${field.label} is required.` : undefined
  }
  if (field.required && Array.isArray(value) && value.length === 0) {
    return `${path}: ${field.label} is required.`
  }
  const parsed = settingSchema(field).safeParse(value)
  return parsed.success ? undefined : (
      `${path}: ${parsed.error.issues[0]?.message ?? "Invalid value"}`
    )
}

export function enabledProviderError(
  provider: SearchProvider,
  settings: SearchProviderConfig["settings"],
  env: NodeJS.ProcessEnv,
): string | undefined {
  for (const field of provider.settings ?? []) {
    if (!field.required) continue
    const environmentSecret =
      provider.id === "ollama"
      && field.key === "apiKey"
      && Boolean(env.OLLAMA_API_KEY)
    if (environmentSecret) continue
    const value = settings?.[field.key] ?? field.default ?? null
    const error = searchSettingError(
      field,
      value,
      `${provider.id}.${field.key}`,
    )
    if (error !== undefined) {
      return `${provider.label} cannot be enabled: ${error} ${field.emptyDescription ?? "Complete the required field."}`
    }
  }
  return undefined
}

function settingSchema(field: ConnectorSettingField): z.ZodType {
  switch (field.type) {
    case "boolean": {
      return z.boolean({ error: `${field.label} must be on or off.` })
    }
    case "integer": {
      let schema = z
        .number({ error: `${field.label} must be a number.` })
        .int({ error: `${field.label} must be a whole number.` })
      if (field.min !== undefined) {
        schema = schema.min(field.min, {
          error: `${field.label} must be at least ${displayBound(field, field.min)}.`,
        })
      }
      if (field.max !== undefined) {
        schema = schema.max(field.max, {
          error: `${field.label} must be at most ${displayBound(field, field.max)}.`,
        })
      }
      return schema
    }
    case "string-list": {
      return z.array(
        z
          .string({ error: `${field.label} entries must be text.` })
          .trim()
          .min(1, { error: `${field.label} entries cannot be empty.` }),
        { error: `${field.label} must be a list.` },
      )
    }
    case "select": {
      return z
        .string({ error: `${field.label} must be text.` })
        .refine(
          (candidate) => field.options.some(({ value }) => value === candidate),
          { error: `Choose an available ${field.label.toLowerCase()}.` },
        )
    }
    default: {
      let schema = z.string({ error: `${field.label} must be text.` })
      if (field.required) {
        schema = schema.trim().min(1, { error: `${field.label} is required.` })
      }
      if (field.format === "url") {
        schema = schema.refine(isHttpUrl, {
          error: `${field.label} must be a valid HTTP or HTTPS URL.`,
        })
      }
      if (field.validation !== undefined) {
        schema = schema.refine(
          (candidate) => matchesUrlShape(candidate, field.validation?.url),
          { error: field.validation.message },
        )
      }
      return schema
    }
  }
}

function displayBound(field: ConnectorSettingField, value: number): string {
  return field.unit === "seconds" ?
      `${String(value / 1000)} seconds`
    : String(value)
}

function isHttpUrl(candidate: string): boolean {
  try {
    const url = new URL(candidate)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

function matchesUrlShape(
  candidate: string,
  shape: { protocols: ReadonlyArray<string>; pathname: string } | undefined,
): boolean {
  if (shape === undefined) return true
  try {
    const url = new URL(candidate)
    return (
      shape.protocols.includes(url.protocol)
      && url.pathname === shape.pathname
      && url.search === ""
      && url.hash === ""
      && url.username === ""
      && url.password === ""
    )
  } catch {
    return false
  }
}
