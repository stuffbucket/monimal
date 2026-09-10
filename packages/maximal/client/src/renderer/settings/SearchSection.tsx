import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from 'react'
import { Info } from 'lucide-react'

import {
  Button,
  FormField,
  IconButton,
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
import { useUnsavedChangesController } from '../unsaved-changes'
import { describeError } from './format'
import {
  displayedInteger,
  displayedIntegerBound,
  formatStringList,
  parseStringList,
  persistedInteger,
  settingFieldError,
  textSettingUpdate,
} from './search-field-state'

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
  error?: string
  labelAction?: ReactNode
  tooltip?: ReactNode
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
  const details = [field.description, field.emptyDescription]
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

function providerEnabled(
  snapshot: SearchSettingsResponse,
  updates: SearchSettingsUpdateRequest,
  providerId: string,
): boolean {
  return updates.providers?.[providerId]?.enabled
    ?? snapshot.providers[providerId]?.enabled
    ?? true
}

function providerFieldError(
  snapshot: SearchSettingsResponse,
  updates: SearchSettingsUpdateRequest,
  providerId: string,
  field: ConnectorSettingField,
): string | undefined {
  const configured = snapshot.providers[providerId] ?? {
    enabled: true,
    settings: {},
    secret_sources: {},
  }
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

function providerRequiredError(
  snapshot: SearchSettingsResponse,
  updates: SearchSettingsUpdateRequest,
  providerId: string,
): string | undefined {
  const provider = snapshot.manifest.providers.find(({ id }) => id === providerId)
  return provider?.settings
    ?.filter(({ required }) => required)
    .map((field) => providerFieldError(snapshot, updates, providerId, field))
    .find((message) => message !== undefined)
}

function hasBlockingValidationError(
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

const INCOMPLETE_PROVIDER_DISABLE_DELAY_MS = 1200

function SettingControl({
  field,
  testId,
  value,
  disabled,
  secretSource,
  clearing = false,
  error,
  labelAction,
  tooltip,
  onChange,
}: SettingControlProps): ReactElement {
  const hint = fieldHint({ field, secretSource, clearing })
  if (field.type === 'boolean') {
    return (
      <div className="settings-field">
        <Switch
          label={field.label}
          displayLabel={
            tooltip === undefined
              ? undefined
              : (
                  <span className="search-behavior__switch-label">
                    {field.label}
                    <Info size={13} aria-hidden="true" />
                  </span>
                )
          }
          tooltip={tooltip}
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
    <FormField
      label={field.label}
      labelAction={labelAction}
      hint={hint}
      error={error}
    >
      {(control) => {
        if (field.type === 'integer') {
          return (
            <input
              {...control}
              className="input"
              type="number"
              value={displayedInteger(field, value)}
              min={displayedIntegerBound(field, field.min)}
              max={displayedIntegerBound(field, field.max)}
              step={1}
              disabled={disabled}
              title={error}
              data-testid={testId}
              onChange={(event) => {
                const next = event.target.value
                onChange(persistedInteger(field, next))
              }}
            />
          )
        }
        if (field.type === 'string-list') {
          return (
            <StringListControl
              control={control}
              value={Array.isArray(value) ? value : []}
              disabled={disabled}
              testId={testId}
              onChange={onChange}
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
            title={error}
            testId={testId}
            onChange={(next) => onChange(textSettingUpdate(field, next))}
          />
        )
      }}
    </FormField>
  )
}

function StringListControl({
  control,
  value,
  disabled,
  testId,
  onChange,
}: {
  control: {
    id: string
    'aria-describedby': string | undefined
    'aria-invalid': boolean | undefined
  }
  value: readonly string[]
  disabled: boolean
  testId: string
  onChange: (value: ConnectorSettingValue | null) => void
}): ReactElement {
  const [text, setText] = useState(() => formatStringList(value))
  const [previousValue, setPreviousValue] = useState(value)
  if (previousValue !== value) {
    setPreviousValue(value)
    if (!sameItems(parseStringList(text), value)) {
      setText(formatStringList(value))
    }
  }

  return (
    <Textarea
      {...control}
      value={text}
      rows={3}
      disabled={disabled}
      testId={testId}
      onChange={(next) => {
        setText(next)
        onChange(parseStringList(next))
      }}
      onBlur={() => setText(formatStringList(parseStringList(text)))}
    />
  )
}

const DOMAIN_HELP: Record<string, string> = {
  allowedDomains:
    'When this list has entries, search results must come from one of these domains. Subdomains are included, and a request can narrow the list further. Leave it empty to allow any domain that is not blocked.',
  blockedDomains:
    'Results from these domains are removed from every provider. Subdomains are included, and this list still applies when a request supplies its own filters. If a domain appears in both lists, blocked wins.',
}

const FALLBACK_HELP =
  'On a timeout, network or server error, or rate limit, Maximal tries the next provider. The failed provider is skipped for 30 seconds, then returns to its normal place in the order.'

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

  const incompleteEnabledProviderIds = snapshot === null
    ? []
    : snapshot.manifest.providers
      .filter(
        ({ id }) =>
          providerEnabled(snapshot, updates, id)
          && providerRequiredError(snapshot, updates, id) !== undefined,
      )
      .map(({ id }) => id)
  const incompleteProviders = snapshot === null
    ? []
    : snapshot.manifest.providers.flatMap((provider) => {
      const message = providerRequiredError(snapshot, updates, provider.id)
      return message === undefined ? [] : [{ provider, message }]
    })
  const incompleteProviderKey = incompleteEnabledProviderIds.join('\0')

  useEffect(() => {
    if (snapshot === null || incompleteProviderKey === '') return undefined
    const providerIds = incompleteProviderKey.split('\0')
    const timeout = globalThis.setTimeout(() => {
      setUpdates((previous) => {
        const providers = { ...previous.providers }
        for (const providerId of providerIds) {
          providers[providerId] = {
            ...providers[providerId],
            enabled: false,
          }
        }
        return { ...previous, providers }
      })
    }, INCOMPLETE_PROVIDER_DISABLE_DELAY_MS)
    return () => globalThis.clearTimeout(timeout)
  }, [incompleteProviderKey, snapshot])

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
  const blockingValidationError = snapshot !== null
    && hasBlockingValidationError(snapshot, updates)

  const saveChanges = useCallback(async (): Promise<boolean> => {
    if (!hasUpdates) return true
    if (blockingValidationError) return false
    setBusy(true)
    setError(null)
    try {
      setSnapshot(await capabilities.search.update(updates))
      setUpdates({})
      return true
    } catch (cause) {
      setError(describeError(cause))
      return false
    } finally {
      setBusy(false)
    }
  }, [blockingValidationError, capabilities, hasUpdates, updates])

  const discardChanges = useCallback(() => setUpdates({}), [])
  const unsavedChanges = useMemo(
    () => ({
      hasChanges: () => hasUpdates,
      canSave: () => !busy && !blockingValidationError,
      save: saveChanges,
      discard: discardChanges,
    }),
    [blockingValidationError, busy, discardChanges, hasUpdates, saveChanges],
  )
  useUnsavedChangesController(unsavedChanges)

  const save = (event: FormEvent): void => {
    event.preventDefault()
    void saveChanges()
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
        <form className="settings-connector-form" onSubmit={save}>
          <Note>{snapshot.manifest.description}</Note>
          {incompleteProviders.map(({ provider, message }) => (
            <Note
              key={provider.id}
              status="needs-approval"
              live="assertive"
              testId={`search-provider-required-${provider.id}`}
            >
              {provider.label}{' '}
              {providerEnabled(snapshot, updates, provider.id)
                ? 'will be disabled unless its required information is completed'
                : 'cannot be enabled until its required information is completed'}
              : {message}
            </Note>
          ))}
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
              const items = providers.map((provider) => {
                const requiredError = providerRequiredError(
                  snapshot,
                  updates,
                  provider.id,
                )
                return {
                  id: provider.id,
                  label: provider.label,
                  description: provider.description,
                  toggleDisabled: requiredError !== undefined,
                  toggleTooltip:
                    requiredError === undefined
                      ? undefined
                      : `Unavailable: ${requiredError}`,
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
              return (
                <PartitionedSortableList
                  enabledItems={enabledItems}
                  disabledItems={disabledItems}
                  disabled={busy}
                  requestedExpandedItemId={incompleteEnabledProviderIds[0]}
                  onChange={setProviderLayout}
                  renderDetails={(item) => {
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
                          const value = fieldValue(
                            field,
                            configured.settings,
                            providerUpdate?.settings,
                          )
                          const validationError = settingFieldError(field, value, {
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
                              <SettingControl
                                field={field}
                                testId={`search-setting-${provider.id}-${field.key}`}
                                value={value}
                                disabled={busy}
                                secretSource={source}
                                clearing={pending === null}
                                error={validationError}
                                onChange={(value) =>
                                  setProviderSetting(provider.id, field.key, value)
                                }
                              />
                              {field.type === 'secret' && source === 'settings' ? (
                                <Button
                                  onClick={() => setProviderSetting(provider.id, field.key, null)}
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
                  }}
                />
              )
            })()}
            {snapshot.manifest.fields
              .filter((field) => field.key === 'fallback')
              .map((field) => (
                <SettingControl
                  key={field.key}
                  field={field}
                  testId={`search-setting-global-${field.key}`}
                  value={fieldValue(field, snapshot.settings, updates.settings)}
                  disabled={busy}
                  error={settingFieldError(
                    field,
                    fieldValue(field, snapshot.settings, updates.settings),
                  )}
                  tooltip={FALLBACK_HELP}
                  onChange={(value) => setGlobal(field.key, value)}
                />
              ))}
          </SettingsSection>

          <SettingsSection
            title="Domain filtering"
            description="Allow only selected sites or remove unwanted sites from every provider's results."
          >
            <div className="search-behavior">
              <div className="search-behavior__domains">
                {snapshot.manifest.fields
                  .filter(
                    (field) =>
                      field.key === 'allowedDomains' || field.key === 'blockedDomains',
                  )
                  .map((field) => (
                    <div className="search-behavior__field" key={field.key}>
                      <SettingControl
                        field={field}
                        testId={`search-setting-global-${field.key}`}
                        value={fieldValue(field, snapshot.settings, updates.settings)}
                        disabled={busy}
                        error={settingFieldError(
                          field,
                          fieldValue(field, snapshot.settings, updates.settings),
                        )}
                        labelAction={
                          <IconButton
                            label={`About ${field.label.toLowerCase()}`}
                            tooltip={DOMAIN_HELP[field.key]}
                            className="search-behavior__help"
                          >
                            <Info size={13} />
                          </IconButton>
                        }
                        onChange={(value) => setGlobal(field.key, value)}
                      />
                    </div>
                  ))}
              </div>
            </div>
          </SettingsSection>

          <div className="settings-section__actions">
            <span className="settings-section__save-note">
              Changes take effect after you save.
            </span>
            <div className="settings-section__action-buttons">
              <Button
                type="submit"
                variant="primary"
                disabled={
                  busy
                  || !hasUpdates
                  || blockingValidationError
                }
              >
                {busy ? 'Saving…' : 'Save changes'}
              </Button>
              <Button
                type="button"
                disabled={busy || !hasUpdates}
                onClick={discardChanges}
              >
                Reset changes
              </Button>
            </div>
          </div>
        </form>
      )}
    </section>
  )
}
