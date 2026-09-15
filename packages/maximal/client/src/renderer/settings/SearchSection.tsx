import {
  useCallback,
  useEffect,
  useMemo,
  useState,
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

interface ProviderCheckState {
  fieldErrors: Record<string, string>
  message?: string
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
}: Pick<SettingControlProps, 'field' | 'secretSource' | 'clearing'>): ReactNode | undefined {
  const details = [field.description, field.emptyDescription]
  if (secretSource === 'environment') {
    details.push('Provided by the environment until you save an override.')
  } else if (secretSource === 'settings') {
    details.push('A value is stored in settings.')
  }
  if (clearing) details.push('The stored value will be cleared when you save.')
  const text = details.filter(Boolean).join(' ')
  if (field.helpLink === undefined) return text || undefined
  return (
    <>
      {text ? `${text} ` : null}
      <a href={field.helpLink.url} target="_blank" rel="noreferrer">
        {field.helpLink.label}
      </a>
      .
    </>
  )
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

function providerValidationError(
  snapshot: SearchSettingsResponse,
  updates: SearchSettingsUpdateRequest,
  providerId: string,
): string | undefined {
  const provider = snapshot.manifest.providers.find(({ id }) => id === providerId)
  return provider?.settings
    ?.map((field) => providerFieldError(snapshot, updates, providerId, field))
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
            revealLabel={field.label}
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
  const [providerChecks, setProviderChecks] = useState<Record<string, ProviderCheckState>>({})

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
    setProviderChecks((previous) => {
      if (previous[providerId] === undefined) return previous
      const next = { ...previous }
      delete next[providerId]
      return next
    })
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

  const validateProviderForEnable = useCallback(async (
    providerId: string,
  ): Promise<boolean> => {
    try {
      const settings = updates.providers?.[providerId]?.settings
      const result = await capabilities.search.validateProvider({
        providerId,
        ...(settings === undefined ? {} : { settings }),
      })
      if (result.status === 'valid') {
        setProviderChecks((previous) => {
          const next = { ...previous }
          delete next[providerId]
          return next
        })
        return true
      }
      setProviderChecks((previous) => ({
        ...previous,
        [providerId]: {
          fieldErrors: result.fieldErrors,
          ...(result.message === undefined ? {} : { message: result.message }),
        },
      }))
      return false
    } catch (cause) {
      setProviderChecks((previous) => ({
        ...previous,
        [providerId]: {
          fieldErrors: {},
          message: describeError(cause),
        },
      }))
      return false
    }
  }, [capabilities, updates])

  const hasUpdates =
    Object.keys(updates.settings ?? {}).length > 0
    || Object.keys(updates.providers ?? {}).length > 0
  const blockingValidationError = snapshot !== null
    && (
      hasBlockingValidationError(snapshot, updates)
      || Object.values(providerChecks).some(
        ({ fieldErrors }) => Object.keys(fieldErrors).length > 0,
      )
    )

  const saveChanges = useCallback(async (): Promise<boolean> => {
    if (!hasUpdates) return true
    if (blockingValidationError) return false
    setBusy(true)
    setError(null)
    try {
      if (snapshot !== null) {
        const changedEnabledProviderIds = Object.entries(updates.providers ?? {})
          .filter(
            ([providerId, update]) =>
              update.settings !== undefined
              && Object.keys(update.settings).length > 0
              && providerEnabled(snapshot, updates, providerId),
          )
          .map(([providerId]) => providerId)
        for (const providerId of changedEnabledProviderIds) {
          if (!await validateProviderForEnable(providerId)) return false
        }
      }
      setSnapshot(await capabilities.search.update(updates))
      setUpdates({})
      setProviderChecks({})
      return true
    } catch (cause) {
      setError(describeError(cause))
      return false
    } finally {
      setBusy(false)
    }
  }, [
    blockingValidationError,
    capabilities,
    hasUpdates,
    snapshot,
    updates,
    validateProviderForEnable,
  ])

  const discardChanges = useCallback(() => {
    setUpdates({})
    setProviderChecks({})
  }, [])
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

  return (
    <section className="settings-section">
      {error ? (
        <Note status="failed" live="assertive">
          {error}
        </Note>
      ) : null}
      {snapshot === null ? (
        <Note live="polite">Loading search settings…</Note>
      ) : (
        <div className="settings-connector-form">
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
                  beforeEnable: () => validateProviderForEnable(provider.id),
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
              return (
                <PartitionedSortableList
                  enabledItems={enabledItems}
                  disabledItems={disabledItems}
                  disabled={busy}
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
                          const value = fieldValue(
                            field,
                            configured.settings,
                            providerUpdate?.settings,
                          )
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
                <div className="search-provider-order__fallback" key={field.key}>
                  <SettingControl
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
                </div>
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
        </div>
      )}
    </section>
  )
}
