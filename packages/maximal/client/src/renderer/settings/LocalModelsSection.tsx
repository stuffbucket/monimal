import { useCallback, useEffect, useState, type ReactElement } from 'react'

import {
  Button,
  CopyButton,
  Field,
  FieldList,
  FormField,
  Note,
  SettingsGroup,
  SettingsItem,
  SettingsSection,
  Switch,
} from 'stuffbucket-electron/renderer'

import type {
  LocalModelCatalogEntry,
  LocalModelCatalogSnapshot,
  LocalModelOperationEvent,
  OllamaRuntimeStatus,
} from '../../shared/bridge-types'
import type { SettingsCapabilities } from './capabilities'
import type { OllamaSettingsResponse } from './capabilities'
import { describeError } from './format'
import { useSettingsNavigation } from './navigation'

interface LocalModelsSectionProps {
  capabilities: SettingsCapabilities
}

interface ActiveOperation {
  operationId: string
  completedBytes?: number
  phase?: string
  totalBytes?: number
}

function formatBytes(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
    style: 'unit',
    unit: 'byte',
    unitDisplay: 'narrow',
  }).format(value)
}

function publicationLabel(model: LocalModelCatalogEntry): string {
  if (model.publication === 'aggregate') return 'Published in aggregate catalogues'
  if (model.publication === 'provider') return 'Published by its configured provider'
  return 'Not published in model catalogues'
}

function progressLabel(operation: ActiveOperation): string | null {
  if (operation.phase === undefined) return null
  const phase = `${operation.phase[0]?.toUpperCase() ?? ''}${operation.phase.slice(1)}`
  if (
    operation.completedBytes === undefined ||
    operation.totalBytes === undefined ||
    operation.totalBytes === 0
  ) {
    return `${phase}…`
  }
  return `${phase} ${formatBytes(operation.completedBytes)} of ${formatBytes(operation.totalBytes)}`
}

function replaceModel(
  snapshot: LocalModelCatalogSnapshot | null,
  model: LocalModelCatalogEntry,
): LocalModelCatalogSnapshot {
  const models = snapshot?.models ?? []
  const index = models.findIndex(({ key }) => key === model.key)
  return {
    revision: snapshot?.revision ?? 0,
    models:
      index === -1
        ? [...models, model]
        : models.map((candidate) => (candidate.key === model.key ? model : candidate)),
  }
}

export function LocalModelsSection({
  capabilities,
}: LocalModelsSectionProps): ReactElement {
  const [catalogue, setCatalogue] = useState<LocalModelCatalogSnapshot | null>(null)
  const [ollamaSettings, setOllamaSettings] =
    useState<OllamaSettingsResponse | null>(null)
  const [ollamaRuntime, setOllamaRuntime] =
    useState<OllamaRuntimeStatus | null>(null)
  const [launchingOllama, setLaunchingOllama] = useState(false)
  const [savingContextLength, setSavingContextLength] = useState(false)
  const [contextLength, setContextLength] = useState('')
  const [operations, setOperations] = useState<Record<string, ActiveOperation>>({})
  const [error, setError] = useState<string | null>(null)
  const navigate = useSettingsNavigation()

  const refresh = useCallback(async () => {
    try {
      setCatalogue(await capabilities.localModels.list())
    } catch (cause) {
      setError(describeError(cause))
    }
  }, [capabilities])

  useEffect(() => {
    let active = true
    const unsubscribe = capabilities.localModels.subscribe(
      (event: LocalModelOperationEvent) => {
        if (!active) return
        if (event.type === 'catalog') {
          setCatalogue(event.snapshot)
          return
        }
        if (event.type === 'progress') {
          setOperations((current) => ({
            ...current,
            [event.progress.modelKey]: {
              operationId: event.operationId,
              phase: event.progress.phase,
              completedBytes: event.progress.completedBytes,
              totalBytes: event.progress.totalBytes,
            },
          }))
          return
        }
        if (event.type === 'completed') {
          setCatalogue((current) => replaceModel(current, event.model))
          setOperations((current) => {
            const next = { ...current }
            delete next[event.model.key]
            return next
          })
          return
        }

        setOperations((current) =>
          Object.fromEntries(
            Object.entries(current).filter(
              ([, operation]) => operation.operationId !== event.operationId,
            ),
          ),
        )
        if (event.type === 'failed') setError(event.error.message)
        void refresh()
      },
    )

    void Promise.all([
      capabilities.localModels.list(),
      capabilities.ollamaSettings.get(),
      capabilities.ollamaRuntime.status(),
    ])
      .then(([snapshot, settings, runtime]) => {
        if (active) {
          setCatalogue(snapshot)
          setOllamaSettings(settings)
          setOllamaRuntime(runtime)
          setContextLength(
            runtime.context_length === null ? '' : String(runtime.context_length),
          )
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(describeError(cause))
      })

    return () => {
      active = false
      unsubscribe()
    }
  }, [capabilities, refresh])

  useEffect(() => {
    const interval = window.setInterval(() => {
      void capabilities.ollamaRuntime
        .status()
        .then(setOllamaRuntime)
        .catch((cause: unknown) => setError(describeError(cause)))
    }, 5000)
    return () => window.clearInterval(interval)
  }, [capabilities])

  const openFolder = useCallback(async () => {
    setError(null)
    try {
      await capabilities.localModels.openFolder()
    } catch (cause) {
      setError(describeError(cause))
    }
  }, [capabilities])

  const ensure = useCallback(
    async (modelKey: string) => {
      setError(null)
      try {
        const result = await capabilities.localModels.ensure(modelKey)
        setOperations((current) => ({
          ...current,
          [modelKey]: { operationId: result.operationId },
        }))
      } catch (cause) {
        setError(describeError(cause))
      }
    },
    [capabilities],
  )

  const cancel = useCallback(
    async (modelKey: string, operationId: string) => {
      try {
        await capabilities.localModels.cancel(operationId)
        setOperations((current) => {
          const next = { ...current }
          delete next[modelKey]
          return next
        })
      } catch (cause) {
        setError(describeError(cause))
      }
    },
    [capabilities],
  )

  const updateOllamaPreference = useCallback(
    async (preferLocalModels: boolean) => {
      setError(null)
      try {
        setOllamaSettings(
          await capabilities.ollamaSettings.update({
            prefer_local_models: preferLocalModels,
          }),
        )
      } catch (cause) {
        setError(describeError(cause))
      }
    },
    [capabilities],
  )

  const updateOllamaEnabled = useCallback(
    async (localEnabled: boolean) => {
      setError(null)
      try {
        setOllamaSettings(
          await capabilities.ollamaSettings.update({
            local_enabled: localEnabled,
          }),
        )
      } catch (cause) {
        setError(describeError(cause))
      }
    },
    [capabilities],
  )

  const launchOllama = useCallback(async () => {
    setLaunchingOllama(true)
    setError(null)
    try {
      setOllamaRuntime(await capabilities.ollamaRuntime.launch())
    } catch (cause) {
      setError(describeError(cause))
    } finally {
      setLaunchingOllama(false)
    }
  }, [capabilities])

  const saveContextLength = useCallback(async () => {
    const value = Number(contextLength)
    if (!Number.isSafeInteger(value)) {
      setError('Context length must be a whole number.')
      return
    }
    setSavingContextLength(true)
    setError(null)
    try {
      const runtime = await capabilities.ollamaRuntime.updateContextLength(value)
      setOllamaRuntime(runtime)
      setContextLength(
        runtime.context_length === null ? '' : String(runtime.context_length),
      )
    } catch (cause) {
      setError(describeError(cause))
    } finally {
      setSavingContextLength(false)
    }
  }, [capabilities, contextLength])

  const ollamaStatus =
    ollamaRuntime === null ? 'Checking installation…'
    : ollamaRuntime.running ? 'Running'
    : ollamaRuntime.installed ? 'Installed, not running'
    : 'Not installed'

  return (
    <section className="settings-section">
      {error ? (
        <Note status="failed" live="assertive">
          <div>
            <strong>Local model action failed</strong>
            <div>{error}</div>
          </div>
          <Button size="sm" onClick={() => setError(null)}>
            Dismiss
          </Button>
        </Note>
      ) : null}

      <SettingsSection title="Ollama">
        <SettingsGroup>
          <SettingsItem
            title="Ollama runtime"
            description={ollamaStatus}
            control={
              <Switch
                label={`${
                  ollamaSettings?.local_enabled === false ? 'Enable' : 'Disable'
                } local Ollama provider`}
                displayLabel={null}
                tooltip={
                  ollamaSettings?.local_enabled === false ? 'Disabled' : 'Enabled'
                }
                layout="compact"
                checked={ollamaSettings?.local_enabled ?? true}
                disabled={ollamaSettings === null}
                testId="local-models-ollama-enabled"
                onChange={(enabled) => void updateOllamaEnabled(enabled)}
              />
            }
          >
            <FieldList>
              <Field
                label="Application"
                value={
                  ollamaRuntime?.application_path ? (
                    <>
                      <code>{ollamaRuntime.application_path}</code>
                      <CopyButton
                        text={ollamaRuntime.application_path}
                        about="the Ollama application path"
                      />
                    </>
                  ) : (
                    'Not detected'
                  )
                }
              />
              <Field
                label="Endpoint"
                value={
                  ollamaRuntime ? (
                    <>
                      <code>{ollamaRuntime.endpoint}</code>
                      <CopyButton
                        text={ollamaRuntime.endpoint}
                        about="the Ollama endpoint"
                      />
                    </>
                  ) : (
                    'Checking…'
                  )
                }
              />
              <Field
                label="Server configuration"
                value={
                  ollamaRuntime ? (
                    <>
                      <code>{ollamaRuntime.server_configuration_path}</code>
                      <CopyButton
                        text={ollamaRuntime.server_configuration_path}
                        about="the Ollama server configuration path"
                      />
                    </>
                  ) : (
                    'Checking…'
                  )
                }
              />
              <Field
                label="Desktop settings"
                value={
                  ollamaRuntime?.desktop_settings_path ? (
                    <>
                      <code>{ollamaRuntime.desktop_settings_path}</code>
                      <CopyButton
                        text={ollamaRuntime.desktop_settings_path}
                        about="the Ollama desktop settings path"
                      />
                    </>
                  ) : (
                    'Not available'
                  )
                }
              />
            </FieldList>
            {ollamaRuntime !== null && ollamaRuntime.context_length !== null ? (
              <FormField
                label="Context window"
                hint="Ollama applies this setting to newly loaded models. Larger values use more memory."
              >
                {(control) => (
                  <div className="settings__row">
                    <input
                      {...control}
                      className="input"
                      type="number"
                      min={512}
                      step={512}
                      value={contextLength}
                      disabled={savingContextLength}
                      onChange={(event) => setContextLength(event.target.value)}
                    />
                    <Button
                      size="sm"
                      disabled={savingContextLength}
                      onClick={() => void saveContextLength()}
                    >
                      {savingContextLength ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
                )}
              </FormField>
            ) : null}
            <div className="settings-field">
              {ollamaRuntime?.installed ? (
                <span className="settings-list__detail">
                  Detected the Ollama{' '}
                  {ollamaRuntime.installation === 'application'
                    ? 'desktop app'
                    : 'command-line tool'}.
                </span>
              ) : ollamaRuntime === null ? null : (
                <span className="settings-list__detail">
                  Ollama may still be available on another device or endpoint.
                </span>
              )}
            </div>
          </SettingsItem>
          {ollamaSettings ? (
            <SettingsItem
              title="Prefer local Ollama models"
              description="When Ollama offers the same model locally and in the cloud, use the local copy first."
              control={
                <Switch
                  label="Prefer local Ollama models"
                  displayLabel={null}
                  checked={ollamaSettings.prefer_local_models}
                  onChange={(next) => void updateOllamaPreference(next)}
                  testId="local-models-prefer-ollama-local"
                />
              }
            />
          ) : null}
          <SettingsItem
            title="Ollama actions"
            actions={
              <>
                <Button
                  size="sm"
                  onClick={() => navigate('settings-account-heading')}
                >
                  Edit account…
                </Button>
                {ollamaRuntime?.can_launch ? (
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={launchingOllama}
                    onClick={() => void launchOllama()}
                  >
                    {launchingOllama
                      ? 'Opening…'
                      : ollamaRuntime.can_manage
                        ? 'Open Ollama'
                        : 'Start Ollama'}
                  </Button>
                ) : ollamaRuntime?.installed === false ? (
                  <Button
                    size="sm"
                    onClick={() =>
                      void capabilities.openExternal('https://ollama.com/download')
                    }
                  >
                    Get Ollama
                  </Button>
                ) : null}
              </>
            }
          />
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection
        title="Models hosted by Maximal"
        description="Bundled providers store their model files on this device until you remove them from the models folder."
      >
        {catalogue === null ? (
          <Note live="polite">Loading local models…</Note>
        ) : catalogue.models.length === 0 ? (
          <Note>No bundled local models are configured.</Note>
        ) : (
          <SettingsGroup>
            {catalogue.models.map((model) => {
              const operation = operations[model.key]
              const progress = operation === undefined ? null : progressLabel(operation)
              const canEnsure =
                operation === undefined &&
                (model.state === 'registered' || model.state === 'failed')
              return (
                <SettingsItem
                  key={model.key}
                  title={model.displayName}
                  description={model.state}
                  actions={
                    operation !== undefined ? (
                      <Button
                        size="sm"
                        onClick={() => void cancel(model.key, operation.operationId)}
                      >
                        Cancel
                      </Button>
                    ) : canEnsure ? (
                      <Button variant="primary" size="sm" onClick={() => void ensure(model.key)}>
                        Download
                      </Button>
                    ) : undefined
                  }
                >
                    <code>{model.modelId}</code>
                    <span className="settings-list__meta">
                      {model.format.toUpperCase()} · {formatBytes(model.expectedBytes)}
                    </span>
                    <span className="settings-list__detail">
                      {publicationLabel(model)}
                    </span>
                    {progress ? (
                      <span className="settings-list__detail" aria-live="polite">
                        {progress}
                      </span>
                    ) : null}
                </SettingsItem>
              )
            })}
          </SettingsGroup>
        )}
        <Button size="sm" onClick={() => void openFolder()}>
          Open models folder
        </Button>
      </SettingsSection>
    </section>
  )
}
