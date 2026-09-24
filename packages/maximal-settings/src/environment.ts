import deepmerge from "deepmerge"
import { z } from "zod"

export interface SettingField {
  name: string
  path: Array<string>
  schema: z.ZodType
}

export function settingsFields(
  schema: z.ZodType,
  prefix: string,
  path: Array<string> = [],
): Array<SettingField> {
  if (!/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/.test(prefix))
    throw new Error("Invalid environment prefix")
  let value = schema
  while (
    value instanceof z.ZodOptional
    || value instanceof z.ZodNullable
    || value instanceof z.ZodDefault
  ) {
    const child = value.unwrap()
    if (!(child instanceof z.ZodType))
      throw new TypeError("Settings require a Zod schema")
    value = child
  }
  if (value instanceof z.ZodObject) {
    return Object.entries<z.ZodType>(value.shape).flatMap(([key, child]) => {
      if (["__proto__", "constructor", "prototype"].includes(key))
        throw new Error("Unsafe setting name")
      return settingsFields(child, prefix, [...path, key])
    })
  }
  const name = path
    .map((key) => key.replaceAll(/([a-z\d])([A-Z])/gu, "$1_$2").toUpperCase())
    .join("_")
  return [{ name: `${prefix}_${name}`, path, schema }]
}

export function parseSetting(
  field: SettingField,
  raw: string,
  source: string,
): unknown {
  const invalid = () =>
    new Error(`Invalid ${source} override for ${field.path.join(".")}`)
  let result = field.schema.safeParse(raw)
  if (!result.success) {
    let decoded: unknown
    try {
      decoded = JSON.parse(raw)
    } catch {
      throw invalid()
    }
    result = field.schema.safeParse(decoded)
  }
  if (!result.success) throw invalid()
  return result.data
}

export function setSetting(
  target: Record<string, unknown>,
  path: Array<string>,
  value: unknown,
): void {
  let current = target
  for (const part of path.slice(0, -1)) {
    const child = z.record(z.string(), z.unknown()).parse(current[part] ?? {})
    current[part] = child
    current = child
  }
  const key = path.at(-1)
  if (key === undefined) throw new Error("Settings schema must be an object")
  current[key] = value
}

export function environmentLayer(
  fields: Array<SettingField>,
  environment: Readonly<Record<string, string | undefined>>,
) {
  const names = new Set<string>()
  const next: Record<string, unknown> = {}
  for (const field of fields) {
    if (names.has(field.name))
      throw new Error(`Ambiguous setting environment name: ${field.name}`)
    names.add(field.name)
    const raw = environment[field.name]
    if (raw !== undefined)
      setSetting(next, field.path, parseSetting(field, raw, field.name))
  }
  return next
}

export function resolveSettingsEnvironment<Settings>(
  schema: z.ZodType<Settings>,
  stored: Settings,
  environment: {
    prefix: string
    values: Readonly<Record<string, string | undefined>>
  },
): Settings {
  const next = z.record(z.string(), z.unknown()).parse(structuredClone(stored))
  const fields = settingsFields(schema, environment.prefix)
  const layer = environmentLayer(fields, environment.values)
  const result = schema.safeParse(
    deepmerge(next, layer, {
      arrayMerge: (_target: Array<unknown>, source: Array<unknown>) => source,
    }),
  )
  if (!result.success) throw new Error("Invalid settings document")
  return result.data
}
