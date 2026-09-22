import type {
  ConnectorSettingField,
  ConnectorSettingValue,
  SearchSettingsResponse,
  SearchSettingsUpdateRequest,
} from '../capabilities'
import { settingFieldError } from './search-field-state'

export interface ProviderCheckState {
  fieldErrors: Record<string, string>
  message?: string
}

const EMPTY_PROVIDER_SETTINGS: SearchSettingsResponse['providers'][string] = {
  enabled: true,
  settings: {},
  secret_sources: {},
}

export function initialValue(field: ConnectorSettingField): ConnectorSettingValue {
  if (field.default !== undefined) return field.default
  if (field.type === 'boolean') return false
  if (field.type === 'integer') return field.min ?? 0
  if (field.type === 'string-list') return []
  if (field.type === 'select') return field.options[0]?.value ?? ''
  return ''
}

export function fieldValue(
  field: ConnectorSettingField,
  configured: Record<string, ConnectorSettingValue>,
  updates: Record<string, ConnectorSettingValue | null> | undefined,
): ConnectorSettingValue {
  if (updates && Object.hasOwn(updates, field.key)) {
    return updates[field.key] ?? initialValue(field)
  }
  if (field.type === 'secret') return ''
  return configured[field.key] ?? initialValue(field)
}

export function sameItems(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length
    && left.every((item, index) => item === right[index])
}

export function configuredProvider(
  snapshot: SearchSettingsResponse,
  providerId: string,
): SearchSettingsResponse['providers'][string] {
  return snapshot.providers[providerId] ?? EMPTY_PROVIDER_SETTINGS
}

export function providerEnabled(
  snapshot: SearchSettingsResponse,
  updates: SearchSettingsUpdateRequest,
  providerId: string,
): boolean {
  return updates.providers?.[providerId]?.enabled
    ?? snapshot.providers[providerId]?.enabled
    ?? true
}

export function providerFieldError(
  snapshot: SearchSettingsResponse,
  updates: SearchSettingsUpdateRequest,
  providerId: string,
  field: ConnectorSettingField,
): string | undefined {
  const configured = configuredProvider(snapshot, providerId)
  const settingUpdates = updates.providers?.[providerId]?.settings
  return settingFieldError(
    field,
    fieldValue(field, configured.settings, settingUpdates),
    {
      secretSource: configured.secret_sources[field.key],
      overridden:
        settingUpdates !== undefined && Object.hasOwn(settingUpdates, field.key),
    },
  )
}

export function providerValidationError(
  snapshot: SearchSettingsResponse,
  updates: SearchSettingsUpdateRequest,
  providerId: string,
): string | undefined {
  const provider = snapshot.manifest.providers.find(({ id }) => id === providerId)
  return provider?.settings
    ?.map((field) => providerFieldError(snapshot, updates, providerId, field))
    .find((message) => message !== undefined)
}

export function hasBlockingValidationError(
  snapshot: SearchSettingsResponse,
  updates: SearchSettingsUpdateRequest,
): boolean {
  const invalidGlobal = snapshot.manifest.fields.some((field) =>
    settingFieldError(field, fieldValue(field, snapshot.settings, updates.settings)),
  )
  if (invalidGlobal) return true

  return snapshot.manifest.providers.some((provider) =>
    (provider.settings ?? []).some((field) => {
      const settings = updates.providers?.[provider.id]?.settings
      const changed = settings !== undefined && Object.hasOwn(settings, field.key)
      return Boolean(
        (providerEnabled(snapshot, updates, provider.id) || changed)
        && providerFieldError(snapshot, updates, provider.id, field),
      )
    }),
  )
}