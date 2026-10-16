import { Button, Dialog, Switch } from '@maximal/maximal-design-system'
import type { ReactElement } from 'react'

import { SettingsActions, SettingsItem } from '@maximal/maximal-electron/renderer'

import type {
  OllamaRuntimePreferences,
  OllamaRuntimeStatus,
  OllamaSettingsResponse,
  SettingsCapabilities,
} from '../capabilities'
import { SettingsTextInput } from '../SettingsTextInput'
import { shellOverlayContainer } from '../../shell-overlay-container'

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
      className="unsaved-changes-dialog"
      popupProps={{ 'data-testid': 'ollama-endpoint-suggestion-dialog' }}
      container={shellOverlayContainer}
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
      className="unsaved-changes-dialog"
      popupProps={{ 'data-testid': 'ollama-start-dialog' }}
      container={shellOverlayContainer}
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

function localStatus(runtime: OllamaRuntimeStatus | null): string {
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
    return <Button onClick={onOpenDownload}>Get Ollama</Button>
  }
  return (
    <Button variant="primary" onClick={onLaunch} disabled={saving}>
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
        <span className="settings-credential-field">
          <span className="settings-credential-input">
            <SettingsTextInput
              available={available}
              data-testid="ollama-endpoint"
              description={
                <span aria-live="polite">
                  {endpointMessage ?? localStatus(runtime)}
                </span>
              }
              disabled={saving}
              error={endpointError ?? undefined}
              label="Ollama Application URL"
              onValueChange={onEndpointChange}
              placeholder={settings.local_endpoint}
              value={endpoint}
            />
          </span>
          <Button
            variant="primary"
            onClick={() => onSaveEndpoint()}
            disabled={saving || !endpointChanged || endpointError !== null}
          >
            {saving ? 'Saving…' : 'Save location'}
          </Button>
        </span>
        <div className="settings-field">
          <Switch
            aria-label="Start Ollama when Maximal starts"
            label="Ollama starts when Maximal starts"
            checked={preferences.start_on_maximal_launch}
            disabled={saving}
            onCheckedChange={(next) => onUpdatePreferences({
              start_on_maximal_launch: next,
            })}
            data-testid="ollama-start-on-launch"
          />
        </div>
        <div className="settings-field">
          <Switch
            aria-label="Access cloud models via local Ollama application"
            label="Access Ollama Cloud via the local Ollama application"
            checked={!preferences.cloud_disabled}
            disabled={saving}
            onCheckedChange={(next) => onUpdatePreferences({
              cloud_disabled: !next,
            })}
            data-testid="ollama-disable-cloud"
          />
        </div>
        {runtime?.installed ? (
          <SettingsActions>
            <Button onClick={onOpenLocalModels}>
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
