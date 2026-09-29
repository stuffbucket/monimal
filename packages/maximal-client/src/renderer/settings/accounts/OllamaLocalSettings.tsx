import type { ReactElement } from 'react'

import {
  Button,
  Dialog,
  FormField,
  SettingsActions,
  SettingsItem,
  Switch,
  TextInput,
} from '@maximal/maximal-electron/renderer'

import type {
  OllamaRuntimePreferences,
  OllamaRuntimeStatus,
  OllamaSettingsResponse,
  SettingsCapabilities,
} from '../capabilities'

interface OllamaLocalSettingsProps {
  settings: OllamaSettingsResponse
  runtime: OllamaRuntimeStatus | null
  preferences: OllamaRuntimePreferences
  endpoint: string
  endpointError: string | null
  endpointMessage: string | null
  suggestedEndpoint: string | null
  startPromptOpen: boolean
  saving: boolean
  onEndpointChange: (value: string) => void
  onSaveEndpoint: (endpoint?: string) => void
  onDismissEndpointSuggestion: () => void
  onStartPromptOpenChange: (open: boolean) => void
  onLaunch: () => void
  onUpdatePreferences: (
    input: Parameters<SettingsCapabilities['ollamaRuntime']['updatePreferences']>[0],
  ) => void
  onOpenDownload: () => void
  onOpenLocalModels: () => void
}

function EndpointSuggestionDialog({
  runtime,
  suggestedEndpoint,
  saving,
  onSave,
  onDismiss,
}: Pick<
  OllamaLocalSettingsProps,
  'runtime' | 'suggestedEndpoint' | 'saving'
> & {
  onSave: (endpoint?: string) => void
  onDismiss: () => void
}): ReactElement {
  return (
    <Dialog
      open={suggestedEndpoint !== null}
      onOpenChange={(open) => {
        if (!open) onDismiss()
      }}
      title="Use the detected Ollama port?"
      description={
        runtime?.process_id === null || runtime?.process_id === undefined
          ? `Ollama is responding at ${suggestedEndpoint ?? ''}.`
          : `Ollama process ${String(runtime.process_id)} is responding at ${suggestedEndpoint ?? ''}.`
      }
      showTitle
      showDescription
      className="dialog unsaved-changes-dialog"
      testId="ollama-endpoint-suggestion-dialog"
    >
      <div className="unsaved-changes-dialog__actions">
        <Button onClick={onDismiss} disabled={saving}>
          Keep current location
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            if (suggestedEndpoint !== null) onSave(suggestedEndpoint)
          }}
          disabled={saving || suggestedEndpoint === null}
        >
          Use detected port
        </Button>
      </div>
    </Dialog>
  )
}

function StartOllamaDialog({
  open,
  saving,
  onOpenChange,
  onLaunch,
}: {
  open: boolean
  saving: boolean
  onOpenChange: (open: boolean) => void
  onLaunch: () => void
}): ReactElement {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Start Ollama now?"
      description="Maximal could not find a running Ollama process. Start the installed Ollama application now?"
      showTitle
      showDescription
      className="dialog unsaved-changes-dialog"
      testId="ollama-start-dialog"
    >
      <div className="unsaved-changes-dialog__actions">
        <Button onClick={() => onOpenChange(false)} disabled={saving}>
          Not now
        </Button>
        <Button variant="primary" onClick={onLaunch} disabled={saving}>
          {saving ? 'Starting…' : 'Start Ollama'}
        </Button>
      </div>
    </Dialog>
  )
}

function localStatus(
  runtime: OllamaRuntimeStatus | null,
  endpoint: string,
): string {
  if (runtime === null) return 'Checking the configured Ollama location…'
  return runtime.running
    ? `Ollama is available.`
    : `Ollama is not responding.`
}

function localApplicationAction(
  runtime: OllamaRuntimeStatus | null,
  saving: boolean,
  onLaunch: () => void,
  onOpenDownload: () => void,
): ReactElement | undefined {
  if (runtime === null || runtime.running) return undefined
  if (!runtime.installed) {
    return <Button size="sm" onClick={onOpenDownload}>Get Ollama</Button>
  }
  return (
    <Button variant="primary" size="sm" onClick={onLaunch} disabled={saving}>
      {saving ? 'Starting…' : 'Start Ollama'}
    </Button>
  )
}

export function OllamaLocalSettings({
  settings,
  runtime,
  preferences,
  endpoint,
  endpointError,
  endpointMessage,
  suggestedEndpoint,
  startPromptOpen,
  saving,
  onEndpointChange,
  onSaveEndpoint,
  onDismissEndpointSuggestion,
  onStartPromptOpenChange,
  onLaunch,
  onUpdatePreferences,
  onOpenDownload,
  onOpenLocalModels,
}: OllamaLocalSettingsProps): ReactElement {
  const available = runtime?.running === true
  const endpointChanged = endpoint.trim() !== settings.local_endpoint

  return (
    <>
      <SettingsItem
        title="Local Application"
        description="Connect to an Ollama application running on this computer or another host."
        actions={localApplicationAction(
          runtime,
          saving,
          onLaunch,
          onOpenDownload,
        )}
      >
        <FormField
          label="Ollama Application URL"
          hint={
            <span aria-live="polite">
              {endpointMessage ?? localStatus(runtime, settings.local_endpoint)}
            </span>
          }
          error={endpointError ?? undefined}
        >
          {(control) => (
            <span className="settings-credential-field">
              <span className="settings-credential-input">
                <TextInput
                  {...control}
                  value={endpoint}
                  placeholder={settings.local_endpoint}
                  disabled={saving}
                  active={available}
                  title={endpointError ?? undefined}
                  testId="ollama-endpoint"
                  onChange={onEndpointChange}
                />
              </span>
              <Button
                variant="primary"
                size="sm"
                onClick={() => onSaveEndpoint()}
                disabled={saving || !endpointChanged || endpointError !== null}
              >
                {saving ? 'Saving…' : 'Save location'}
              </Button>
            </span>
          )}
        </FormField>
        <div className="settings-field">
          <Switch
            label="Start Ollama when Maximal starts"
            displayLabel="Ollama starts when Maximal starts"
            checked={preferences.start_on_maximal_launch}
            disabled={saving}
            onChange={(next) => onUpdatePreferences({
              start_on_maximal_launch: next,
            })}
            testId="ollama-start-on-launch"
          />
        </div>
        <div className="settings-field">
          <Switch
            label="Access cloud models via local Ollama application"
            displayLabel="Access Ollama Cloud via the local Ollama application"
            checked={!preferences.cloud_disabled}
            disabled={saving}
            onChange={(next) => onUpdatePreferences({
              cloud_disabled: !next,
            })}
            testId="ollama-disable-cloud"
          />
        </div>
        {runtime?.installed ? (
          <SettingsActions>
            <Button size="sm" onClick={onOpenLocalModels}>
              Local models
            </Button>
          </SettingsActions>
        ) : null}
      </SettingsItem>

      <EndpointSuggestionDialog
        runtime={runtime}
        suggestedEndpoint={suggestedEndpoint}
        saving={saving}
        onSave={onSaveEndpoint}
        onDismiss={onDismissEndpointSuggestion}
      />
      <StartOllamaDialog
        open={startPromptOpen}
        saving={saving}
        onOpenChange={onStartPromptOpenChange}
        onLaunch={onLaunch}
      />
    </>
  )
}
