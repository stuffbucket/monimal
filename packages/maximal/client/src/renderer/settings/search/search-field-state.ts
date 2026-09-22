import { settingValueError } from '@stuffbucket/maximal-harness'

import type {
  ConnectorSettingField,
  ConnectorSettingValue,
} from '../capabilities'

interface SettingValidationContext {
  overridden?: boolean
  secretSource?: 'environment' | 'settings'
}

function isEmpty(value: ConnectorSettingValue): boolean {
  return typeof value === 'string'
    ? value.trim() === ''
    : Array.isArray(value) && value.length === 0
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
  const message = settingValueError(field, value)
  return message === undefined ? undefined : (
    field.emptyDescription && isEmpty(value)
      ? `${message} ${field.emptyDescription}`
      : message
  )
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