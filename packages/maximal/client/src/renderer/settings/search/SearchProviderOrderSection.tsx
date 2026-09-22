import { type ReactElement } from 'react'

import {
  Button,
  Note,
  PartitionedSortableList,
  SettingsSection,
  type PartitionedSortableItem,
} from 'stuffbucket-electron/renderer'

import type {
  ConnectorSettingValue,
  SearchSettingsResponse,
  SearchSettingsUpdateRequest,
} from '../capabilities'
import { settingFieldError } from './search-field-state'
import { SearchSettingControl } from './SearchSettingControl'
import {
  configuredProvider,
  fieldValue,
  providerValidationError,
  type ProviderCheckState,
} from './search-settings-helpers'

const FALLBACK_HELP =
  'On a timeout, network or server error, or rate limit, Maximal tries the next provider. The failed provider is skipped for 30 seconds, then returns to its normal place in the order.'

interface SearchProviderOrderSectionProps {
  snapshot: SearchSettingsResponse
  updates: SearchSettingsUpdateRequest
  busy: boolean
  providerChecks: Record<string, ProviderCheckState>
  onGlobalChange: (key: string, value: ConnectorSettingValue | null) => void
  onProviderLayoutChange: (
    enabledItems: PartitionedSortableItem[],
    disabledItems: PartitionedSortableItem[],
  ) => void
  onProviderSettingChange: (
    providerId: string,
    key: string,
    value: ConnectorSettingValue | null,
  ) => void
  onValidateProvider: (providerId: string) => Promise<boolean>
}

function priorityOrder(
  snapshot: SearchSettingsResponse,
  updates: SearchSettingsUpdateRequest,
): string[] {
  const priorityField = snapshot.manifest.fields.find(
    (field) => field.key === 'priority' && field.type === 'string-list',
  )
  const configuredPriority = priorityField
    ? fieldValue(priorityField, snapshot.settings, updates.settings)
    : []
  return Array.isArray(configuredPriority)
    ? configuredPriority.filter((item): item is string => typeof item === 'string')
    : []
}

function providerItems(
  snapshot: SearchSettingsResponse,
  updates: SearchSettingsUpdateRequest,
  providerChecks: Record<string, ProviderCheckState>,
  onValidateProvider: (providerId: string) => Promise<boolean>,
): {
  enabledItems: PartitionedSortableItem[]
  disabledItems: PartitionedSortableItem[]
} {
  const priority = priorityOrder(snapshot, updates)
  const providers = [...snapshot.manifest.providers].sort((left, right) => {
    const leftIndex = priority.indexOf(left.id)
    const rightIndex = priority.indexOf(right.id)
    return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex)
      - (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex)
  })
  const items = providers.map((provider) => {
    const localValidationError = providerValidationError(
      snapshot,
      updates,
      provider.id,
    )
    const remoteValidation = providerChecks[provider.id]
    const validationError = localValidationError
      ?? Object.values(remoteValidation?.fieldErrors ?? {})[0]
    return {
      id: provider.id,
      label: provider.label,
      description: provider.description,
      toggleBlocked: validationError !== undefined,
      beforeEnable: () => onValidateProvider(provider.id),
      toggleTooltip:
        validationError === undefined
          ? undefined
          : `Unavailable: ${validationError}`,
    }
  })
  const enabledItems = items.filter(({ id }) =>
    updates.providers?.[id]?.enabled
    ?? snapshot.providers[id]?.enabled
    ?? true,
  )
  const disabledItems = items.filter(
    ({ id }) => !enabledItems.some((item) => item.id === id),
  )
  return { enabledItems, disabledItems }
}

function ProviderSettingsDetails({
  snapshot,
  updates,
  providerId,
  busy,
  providerChecks,
  onProviderSettingChange,
}: {
  snapshot: SearchSettingsResponse
  updates: SearchSettingsUpdateRequest
  providerId: string
  busy: boolean
  providerChecks: Record<string, ProviderCheckState>
  onProviderSettingChange: (
    providerId: string,
    key: string,
    value: ConnectorSettingValue | null,
  ) => void
}): ReactElement | null {
  const provider = snapshot.manifest.providers.find(({ id }) => id === providerId)
  if (provider === undefined) return null

  const configured = configuredProvider(snapshot, provider.id)
  const providerUpdate = updates.providers?.[provider.id]
  const remoteValidation = providerChecks[provider.id]

  return (
    <div className="settings-connector-fields">
      {remoteValidation?.message ? (
        <Note status="failed" live="assertive">
          {remoteValidation.message}
        </Note>
      ) : null}
      {(provider.settings ?? []).map((field) => {
        const source = configured.secret_sources[field.key]
        const pending = providerUpdate?.settings?.[field.key]
        const value = fieldValue(field, configured.settings, providerUpdate?.settings)
        const validationError = remoteValidation?.fieldErrors[field.key]
          ?? settingFieldError(field, value, {
            secretSource: source,
            overridden:
              providerUpdate?.settings !== undefined
              && Object.hasOwn(providerUpdate.settings, field.key),
          })
        return (
          <div
            className="settings-connector-field"
            data-layout={field.layout}
            key={field.key}
          >
            <SearchSettingControl
              field={field}
              testId={`search-setting-${provider.id}-${field.key}`}
              value={value}
              disabled={busy}
              secretSource={source}
              clearing={pending === null}
              error={validationError}
              onChange={(next) =>
                onProviderSettingChange(provider.id, field.key, next)
              }
            />
            {field.type === 'secret' && source === 'settings' ? (
              <Button
                onClick={() => onProviderSettingChange(provider.id, field.key, null)}
                disabled={busy}
              >
                Clear stored value
              </Button>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export function SearchProviderOrderSection({
  snapshot,
  updates,
  busy,
  providerChecks,
  onGlobalChange,
  onProviderLayoutChange,
  onProviderSettingChange,
  onValidateProvider,
}: SearchProviderOrderSectionProps): ReactElement {
  const { enabledItems, disabledItems } = providerItems(
    snapshot,
    updates,
    providerChecks,
    onValidateProvider,
  )

  return (
    <SettingsSection
      title="Provider order"
      description="Set fallback priority, availability, and provider options."
    >
      <PartitionedSortableList
        enabledItems={enabledItems}
        disabledItems={disabledItems}
        disabled={busy}
        onChange={onProviderLayoutChange}
        renderDetails={(item) => (
          <ProviderSettingsDetails
            snapshot={snapshot}
            updates={updates}
            providerId={item.id}
            busy={busy}
            providerChecks={providerChecks}
            onProviderSettingChange={onProviderSettingChange}
          />
        )}
      />
      {snapshot.manifest.fields
        .filter((field) => field.key === 'fallback')
        .map((field) => {
          const value = fieldValue(field, snapshot.settings, updates.settings)
          return (
            <div className="search-provider-order__fallback" key={field.key}>
              <SearchSettingControl
                field={field}
                testId={`search-setting-global-${field.key}`}
                value={value}
                disabled={busy}
                error={settingFieldError(field, value)}
                tooltip={FALLBACK_HELP}
                onChange={(next) => onGlobalChange(field.key, next)}
              />
            </div>
          )
        })}
    </SettingsSection>
  )
}