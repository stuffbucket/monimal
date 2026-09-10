import { z } from 'zod'

import type {
  ConnectorSettingField,
  ConnectorSettingValue,
} from './capabilities'

interface SettingValidationContext {
  overridden?: boolean
  secretSource?: 'environment' | 'settings'
}

function settingSchema(field: ConnectorSettingField): z.ZodType {
  switch (field.type) {
    case 'boolean':
      return z.boolean({ error: `${field.label} must be on or off.` })
    case 'integer': {
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
    case 'string-list':
      return z.array(
        z.string().trim().min(1, {
          error: `${field.label} entries cannot be empty.`,
        }),
        { error: `${field.label} must be a list.` },
      )
    case 'select':
      return z.string().refine(
        (candidate) => field.options.some(({ value }) => value === candidate),
        { error: `Choose an available ${field.label.toLowerCase()}.` },
      )
    default: {
      let schema = z.string({ error: `${field.label} must be text.` })
      if (field.required) {
        schema = schema.trim().min(1, {
          error: `${field.label} is required.`,
        })
      }
      if (field.format === 'url') {
        return schema.refine(isHttpUrl, {
          error: `${field.label} must be a valid HTTP or HTTPS URL.`,
        })
      }
      return schema
    }
  }
}

function isHttpUrl(candidate: string): boolean {
  try {
    const url = new URL(candidate)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isEmpty(value: ConnectorSettingValue): boolean {
  return typeof value === 'string'
    ? value.trim() === ''
    : Array.isArray(value) && value.length === 0
}

function displayBound(field: ConnectorSettingField, value: number): string {
  return field.unit === 'seconds'
    ? `${String(value / 1000)} seconds`
    : String(value)
}

export function settingFieldError(
  field: ConnectorSettingField,
  value: ConnectorSettingValue,
  context: SettingValidationContext = {},
): string | undefined {
  if (
    field.type === 'secret'
    && context.secretSource !== undefined
    && (context.secretSource === 'environment' || !context.overridden)
  ) {
    return undefined
  }
  if (field.required && isEmpty(value)) {
    const message = `${field.label} is required.`
    return field.emptyDescription
      ? `${message} ${field.emptyDescription}`
      : message
  }
  const parsed = settingSchema(field).safeParse(value)
  if (parsed.success) return undefined
  const message = parsed.error.issues[0]?.message ?? `Invalid ${field.label}.`
  return field.emptyDescription && isEmpty(value)
    ? `${message} ${field.emptyDescription}`
    : message
}

export function displayedInteger(
  field: ConnectorSettingField,
  value: ConnectorSettingValue,
): number | '' {
  if (typeof value !== 'number') return ''
  return field.unit === 'seconds' ? value / 1000 : value
}

export function displayedIntegerBound(
  field: ConnectorSettingField,
  value: number | undefined,
): number | undefined {
  if (value === undefined) return undefined
  return field.unit === 'seconds' ? value / 1000 : value
}

export function persistedInteger(
  field: ConnectorSettingField,
  value: string,
): number | null {
  if (value === '') return null
  const numeric = Number(value)
  return field.unit === 'seconds' ? numeric * 1000 : numeric
}

export function textSettingUpdate(
  field: ConnectorSettingField,
  value: string,
): string | null {
  return value.trim() === '' && field.default !== undefined ? null : value
}

export function parseStringList(value: string): string[] {
  return value
    .split(/[\s,;]+/u)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function formatStringList(value: readonly string[]): string {
  return value.join('\n')
}