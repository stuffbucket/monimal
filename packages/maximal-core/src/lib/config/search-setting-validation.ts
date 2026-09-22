import {
  settingValueError,
  type ConnectorSettingField,
  type ConnectorSettingValue,
  type SearchProvider,
  type SearchProviderConfig,
} from "@stuffbucket/maximal-harness"

export function searchSettingError(
  field: ConnectorSettingField,
  value: ConnectorSettingValue | null,
  path: string,
): string | undefined {
  const message = settingValueError(field, value)
  return message === undefined ? undefined : `${path}: ${message}`
}

export function enabledProviderError(
  provider: SearchProvider,
  settings: SearchProviderConfig["settings"],
): string | undefined {
  for (const field of provider.settings ?? []) {
    if (!field.required) continue
    const configured = settings?.[field.key] ?? field.default
    const value =
      provider.effectiveSetting?.(field.key, configured) ?? configured ?? null
    const error = searchSettingError(
      field,
      value,
      `${provider.id}.${field.key}`,
    )
    if (error !== undefined) {
      return `${provider.label} cannot be enabled: ${error}`
    }
  }
  return undefined
}
