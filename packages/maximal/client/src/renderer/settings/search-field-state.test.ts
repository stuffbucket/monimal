import { describe, expect, it } from 'vitest'

import type { ConnectorSettingField } from './capabilities'
import {
  displayedInteger,
  displayedIntegerBound,
  formatStringList,
  parseStringList,
  persistedInteger,
  settingFieldError,
  textSettingUpdate,
} from './search-field-state'

const timeoutField: ConnectorSettingField = {
  key: 'timeoutMs',
  type: 'integer',
  label: 'Timeout (s)',
  default: 300_000,
  min: 1_000,
  max: 600_000,
  unit: 'seconds',
  emptyDescription: 'Uses 300 seconds when empty.',
}

describe('search field state', () => {
  it('presents seconds while preserving milliseconds', () => {
    expect(displayedInteger(timeoutField, 300_000)).toBe(300)
    expect(displayedIntegerBound(timeoutField, timeoutField.min)).toBe(1)
    expect(displayedIntegerBound(timeoutField, timeoutField.max)).toBe(600)
    expect(persistedInteger(timeoutField, '12')).toBe(12_000)
    expect(persistedInteger(timeoutField, '')).toBeNull()
  })

  it('restores known defaults when text inputs are cleared', () => {
    const field: ConnectorSettingField = {
      key: 'baseUrl',
      type: 'string',
      label: 'Base URL',
      default: 'https://ollama.com/api',
    }
    expect(textSettingUpdate(field, '')).toBeNull()
    expect(textSettingUpdate(field, 'https://example.test')).toBe(
      'https://example.test',
    )
  })

  it('returns useful required and URL errors from Zod validation', () => {
    const field: ConnectorSettingField = {
      key: 'baseUrl',
      type: 'string',
      label: 'Base URL',
      required: true,
      format: 'url',
      emptyDescription: 'Enter the provider endpoint.',
    }
    expect(settingFieldError(field, '')).toBe(
      'Base URL is required. Enter the provider endpoint.',
    )
    expect(settingFieldError(field, 'ftp://example.test')).toBe(
      'Base URL must be a valid HTTP or HTTPS URL.',
    )
    expect(settingFieldError(field, 'https://example.test')).toBeUndefined()
  })

  it('validates every manifest field shape and required lists', () => {
    const requiredList: ConnectorSettingField = {
      key: 'priority',
      type: 'string-list',
      label: 'Provider priority',
      required: true,
    }
    const integer: ConnectorSettingField = {
      key: 'limit',
      type: 'integer',
      label: 'Limit',
      min: 1,
      max: 10,
    }
    const select: ConnectorSettingField = {
      key: 'mode',
      type: 'select',
      label: 'Mode',
      options: [{ label: 'Fast', value: 'fast' }],
    }
    const toggle: ConnectorSettingField = {
      key: 'fallback',
      type: 'boolean',
      label: 'Fallback',
    }

    expect(settingFieldError(requiredList, [])).toBe(
      'Provider priority is required.',
    )
    expect(settingFieldError(requiredList, ['ollama'])).toBeUndefined()
    expect(settingFieldError(integer, 0)).toBe('Limit must be at least 1.')
    expect(settingFieldError(integer, 11)).toBe('Limit must be at most 10.')
    expect(settingFieldError(integer, 1.5)).toBe('Limit must be a whole number.')
    expect(settingFieldError(select, 'missing')).toBe('Choose an available mode.')
    expect(settingFieldError(select, 'fast')).toBeUndefined()
    expect(settingFieldError(toggle, true)).toBeUndefined()
  })

  it('treats an untouched environment secret as complete', () => {
    const field: ConnectorSettingField = {
      key: 'apiKey',
      type: 'secret',
      label: 'API key',
      required: true,
    }
    expect(
      settingFieldError(field, '', { secretSource: 'environment' }),
    ).toBeUndefined()
    expect(
      settingFieldError(field, '', {
        secretSource: 'environment',
        overridden: true,
      }),
    ).toBeUndefined()
  })

  it('normalizes sensible string-list delimiters to one item per line', () => {
    const parsed = parseStringList(
      'example.com, docs.example.com;\nstatus.example.com\tapi.example.com',
    )

    expect(parsed).toEqual([
      'example.com',
      'docs.example.com',
      'status.example.com',
      'api.example.com',
    ])
    expect(formatStringList(parsed)).toBe(
      'example.com\ndocs.example.com\nstatus.example.com\napi.example.com',
    )
  })
})