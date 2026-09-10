import { useEffect, useState, type FormEvent, type ReactElement } from 'react'

import {
  Button,
  FormField,
  Note,
  PartitionedSortableList,
  Select,
  SettingsSection,
  Switch,
  Textarea,
  TextInput,
  type PartitionedSortableItem,
} from 'stuffbucket-electron/renderer'

import type {
  ConnectorSettingField,
  ConnectorSettingValue,
  SearchSettingsResponse,
  SearchSettingsUpdateRequest,
  SettingsCapabilities,
} from './capabilities'
import { describeError } from './format'

interface SearchSectionProps {
  capabilities: SettingsCapabilities
}

interface SettingControlProps {
  field: ConnectorSettingField
  testId: string
  value: ConnectorSettingValue
  disabled: boolean
  secretSource?: 'environment' | 'settings'
  clearing?: boolean
  onChange: (value: ConnectorSettingValue | null) => void
}

function initialValue(field: ConnectorSettingField): ConnectorSettingValue {
  if (field.default !== undefined) return field.default
  if (field.type === 'boolean') return false
  if (field.type === 'integer') return field.min ?? 0
  if (field.type === 'string-list') return []
  if (field.type === 'select') return field.options[0]?.value ?? ''
  return ''
}

function fieldValue(
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

function fieldHint({
  field,
  secretSource,
  clearing,
}: Pick<SettingControlProps, 'field' | 'secretSource' | 'clearing'>): string | undefined {
  const details = [field.description]
  if (secretSource === 'environment') {
    details.push('Provided by the environment until you save an override.')
  } else if (secretSource === 'settings') {
    details.push('A value is stored in settings.')
  }
  if (clearing) details.push('The stored value will be cleared when you save.')
  return details.filter(Boolean).join(' ') || undefined
}

function sameItems(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length
    && left.every((item, index) => item === right[index])
}

function SettingControl({
  field,
  testId,
  value,
  disabled,
  secretSource,
  clearing = false,
  onChange,
}: SettingControlProps): ReactElement {
  const hint = fieldHint({ field, secretSource, clearing })
  if (field.type === 'boolean') {
    return (
      <div className="settings-field">
        <Switch
          label={field.label}
          checked={value === true}
          disabled={disabled}
          onChange={onChange}
          testId={testId}
        />
        {hint ? <span className="settings-list__detail">{hint}</span> : null}
      </div>
    )
  }

  return (
    <FormField label={field.label} hint={hint}>
      {(control) => {
        if (field.type === 'integer') {
          return (
            <input
              {...control}
              className="input"
              type="number"
              value={typeof value === 'number' ? value : ''}
              min={field.min}
              max={field.max}
              disabled={disabled}
              data-testid={testId}
              onChange={(event) => {
                const next = event.target.value
                onChange(next === '' ? null : Number(next))
              }}
            />
          )
        }
        if (field.type === 'string-list') {
          return (
            <Textarea
              {...control}
              value={Array.isArray(value) ? value.join('\n') : ''}
              rows={3}
              disabled={disabled}
              testId={testId}
              onChange={(next) =>
                onChange(
                  next
                    .split('\n')
                    .map((item) => item.trim())
                    .filter(Boolean),
                )
              }
            />
          )
        }
        if (field.type === 'select') {
          return (
            <Select
              {...control}
              value={typeof value === 'string' ? value : ''}
              options={field.options}
              disabled={disabled}
              testId={testId}
              onChange={onChange}
            />
          )
        }
        return (
          <TextInput
            {...control}
            value={typeof value === 'string' ? value : ''}
            type={field.type === 'secret' ? 'password' : 'text'}
            placeholder={field.placeholder}
            disabled={disabled}
            testId={testId}
            onChange={onChange}
          />
        )
      }}
    </FormField>
  )
}

export function SearchSection({
  capabilities,
}: SearchSectionProps): ReactElement {
  const [snapshot, setSnapshot] = useState<SearchSettingsResponse | null>(null)
  const [updates, setUpdates] = useState<SearchSettingsUpdateRequest>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void capabilities.search
      .get()
      .then((next) => {
        if (active) setSnapshot(next)
      })
      .catch((cause: unknown) => {
        if (active) setError(describeError(cause))
      })
    return () => {
      active = false
    }
  }, [capabilities])

  const setGlobal = (
    key: string,
    value: ConnectorSettingValue | null,
  ): void => {
    setUpdates((previous) => ({
      ...previous,
      settings: { ...previous.settings, [key]: value },
    }))
  }

  const setProviderLayout = (
    enabledItems: PartitionedSortableItem[],
    disabledItems: PartitionedSortableItem[],
  ): void => {
    if (snapshot === null) return
    const priority = [...enabledItems, ...disabledItems].map(({ id }) => id)
    const configuredPriority = snapshot.settings.priority
    const originalPriority = Array.isArray(configuredPriority)
      ? configuredPriority.filter((item): item is string => typeof item === 'string')
      : snapshot.manifest.providers.map(({ id }) => id)

    setUpdates((previous) => {
      const settings = { ...previous.settings }
      if (sameItems(priority, originalPriority)) delete settings.priority
      else settings.priority = priority

      const providers = { ...previous.providers }
      const enabledIds = new Set(enabledItems.map(({ id }) => id))
      for (const provider of snapshot.manifest.providers) {
        const configured = snapshot.providers[provider.id]?.enabled ?? true
        const enabled = enabledIds.has(provider.id)
        const providerUpdate = { ...providers[provider.id] }
        if (enabled === configured) delete providerUpdate.enabled
        else providerUpdate.enabled = enabled
        if (Object.keys(providerUpdate).length === 0) delete providers[provider.id]
        else providers[provider.id] = providerUpdate
      }

      return {
        ...(Object.keys(settings).length > 0 ? { settings } : {}),
        ...(Object.keys(providers).length > 0 ? { providers } : {}),
      }
    })
  }

  const setProviderSetting = (
    providerId: string,
    key: string,
    value: ConnectorSettingValue | null,
  ): void => {
    setUpdates((previous) => ({
      ...previous,
      providers: {
        ...previous.providers,
        [providerId]: {
          ...previous.providers?.[providerId],
          settings: {
            ...previous.providers?.[providerId]?.settings,
            [key]: value,
          },
        },
      },
    }))
  }

  const hasUpdates =
    Object.keys(updates.settings ?? {}).length > 0
    || Object.keys(updates.providers ?? {}).length > 0

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (!hasUpdates) return
    setBusy(true)
    setError(null)
    try {
      setSnapshot(await capabilities.search.update(updates))
      setUpdates({})
    } catch (cause) {
      setError(describeError(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="settings-section" aria-labelledby="settings-search-heading">
      <h1 id="settings-search-heading" className="settings-section__heading">
        Search
      </h1>
      {error ? (
        <Note status="failed" live="assertive">
          {error}
        </Note>
      ) : null}
      {snapshot === null ? (
        <Note live="polite">Loading search settings…</Note>
      ) : (
        <form className="settings-connector-form" onSubmit={(event) => void save(event)}>
          <Note>{snapshot.manifest.description}</Note>
          <SettingsSection
            title="Provider order"
            description="Set fallback priority, availability, and provider options."
          >
            {(() => {
              const priorityField = snapshot.manifest.fields.find(
                (field) => field.key === 'priority' && field.type === 'string-list',
              )
              const configuredPriority = priorityField
                ? fieldValue(priorityField, snapshot.settings, updates.settings)
                : []
              const priority = Array.isArray(configuredPriority)
                ? configuredPriority.filter(
                    (item): item is string => typeof item === 'string',
                  )
                : []
              const providers = [...snapshot.manifest.providers].sort((left, right) => {
                const leftIndex = priority.indexOf(left.id)
                const rightIndex = priority.indexOf(right.id)
                return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex)
                  - (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex)
              })
              const items = providers.map((provider) => ({
                id: provider.id,
                label: provider.label,
                description: provider.description,
              }))
              const enabledItems = items.filter(({ id }) =>
                updates.providers?.[id]?.enabled
                ?? snapshot.providers[id]?.enabled
                ?? true,
              )
              const disabledItems = items.filter(
                ({ id }) => !enabledItems.some((item) => item.id === id),
              )
              return (
                <PartitionedSortableList
                  enabledItems={enabledItems}
                  disabledItems={disabledItems}
                  disabled={busy}
                  onChange={setProviderLayout}
                  renderDetails={(item, enabled) => {
                    const provider = snapshot.manifest.providers.find(
                      ({ id }) => id === item.id,
                    )
                    if (provider === undefined) return null
                    const configured = snapshot.providers[provider.id] ?? {
                      enabled: true,
                      settings: {},
                      secret_sources: {},
                    }
                    const providerUpdate = updates.providers?.[provider.id]
                    return (
                      <div className="settings-connector-fields">
                        {(provider.settings ?? []).map((field) => {
                          const source = configured.secret_sources[field.key]
                          const pending = providerUpdate?.settings?.[field.key]
                          return (
                            <div className="settings-connector-field" key={field.key}>
                              <SettingControl
                                field={field}
                                testId={`search-setting-${provider.id}-${field.key}`}
                                value={fieldValue(
                                  field,
                                  configured.settings,
                                  providerUpdate?.settings,
                                )}
                                disabled={busy || !enabled}
                                secretSource={source}
                                clearing={pending === null}
                                onChange={(value) =>
                                  setProviderSetting(provider.id, field.key, value)
                                }
                              />
                              {field.type === 'secret' && source === 'settings' ? (
                                <Button
                                  onClick={() => setProviderSetting(provider.id, field.key, null)}
                                  disabled={busy || !enabled}
                                >
                                  Clear stored value
                                </Button>
                              ) : null}
                            </div>
                          )
                        })}
                      </div>
                    )
                  }}
                />
              )
            })()}
          </SettingsSection>

          <SettingsSection title="Search behavior">
            <div className="search-behavior">
              <div className="search-behavior__controls">
                {snapshot.manifest.fields
                  .filter((field) => field.key !== 'priority' && field.type !== 'string-list')
                  .map((field) => (
                    <div className="search-behavior__field" key={field.key}>
                      <SettingControl
                        field={field}
                        testId={`search-setting-global-${field.key}`}
                        value={fieldValue(field, snapshot.settings, updates.settings)}
                        disabled={busy}
                        onChange={(value) => setGlobal(field.key, value)}
                      />
                    </div>
                  ))}
              </div>
              <div className="search-behavior__domains">
                {snapshot.manifest.fields
                  .filter((field) => field.key !== 'priority' && field.type === 'string-list')
                  .map((field) => (
                    <div className="search-behavior__field" key={field.key}>
                      <SettingControl
                        field={field}
                        testId={`search-setting-global-${field.key}`}
                        value={fieldValue(field, snapshot.settings, updates.settings)}
                        disabled={busy}
                        onChange={(value) => setGlobal(field.key, value)}
                      />
                    </div>
                  ))}
              </div>
            </div>
          </SettingsSection>

          <div className="settings-section__actions">
            <Button type="submit" variant="primary" disabled={busy || !hasUpdates}>
              {busy ? 'Saving…' : 'Save changes'}
            </Button>
            <Button
              type="button"
              disabled={busy || !hasUpdates}
              onClick={() => setUpdates({})}
            >
              Reset changes
            </Button>
          </div>
        </form>
      )}
    </section>
  )
}
