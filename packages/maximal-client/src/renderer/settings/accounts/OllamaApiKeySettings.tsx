import { Button } from '@maximal/maximal-design-system'
import type { ReactElement } from 'react'

import {
  SettingsActions,
  SettingsItem,
} from '@maximal/maximal-electron/renderer'

import type { OllamaSettingsResponse } from '../capabilities'
import { SettingsTextInput } from '../SettingsTextInput'

interface OllamaApiKeySettingsProps {
  settings: OllamaSettingsResponse
  apiKey: string
  saving: boolean
  keyError: string | null
  keyMessage: string | null
  available: boolean
  statusChecked: boolean
  statusChecking: boolean
  statusErrorCode: string | null
  onApiKeyChange: (value: string) => void
  onSave: () => void
  onRefreshStatus: () => void
  onRemove: () => void
  onManageKeys: () => void
  onOpenCloudModels: () => void
  onOpenSearch: () => void
  onOpenPrivacy: () => void
  onOpenCloudSettings: () => void
}

function savedKeyStatus(
  statusChecked: boolean,
  statusChecking: boolean,
  available: boolean,
  errorCode: string | null,
): string {
  if (statusChecking || !statusChecked) return 'Checking the saved API key…'
  if (available) return 'API key is saved and working.'
  if (errorCode === null || errorCode === 'UNKNOWN') {
    return 'API key is saved, but Ollama Cloud could not be checked because no error code was returned.'
  }
  if (errorCode.startsWith('HTTP ')) {
    return `API key is saved, but Ollama Cloud returned ${errorCode}.`
  }
  return `API key is saved, but Ollama Cloud could not be reached (${errorCode}).`
}

export function OllamaApiKeySettings({
  settings,
  apiKey,
  saving,
  keyError,
  keyMessage,
  available,
  statusChecked,
  statusChecking,
  statusErrorCode,
  onApiKeyChange,
  onSave,
  onRefreshStatus,
  onRemove,
  onManageKeys,
  onOpenCloudModels,
  onOpenSearch,
  onOpenPrivacy,
  onOpenCloudSettings,
}: OllamaApiKeySettingsProps): ReactElement {
  const statusMessage = settings.has_api_key
    ? savedKeyStatus(
        statusChecked,
        statusChecking,
        available,
        statusErrorCode,
      )
    : keyMessage
  const keyChanged = apiKey.trim() !== (settings.api_key ?? '')

  return (
    <>
      <SettingsItem
        title="Direct Cloud API key"
        description="Use an API key to send requests directly to Ollama.com."
        actions={
          <>
            <Button onClick={onManageKeys}>
              API keys
            </Button>
            {settings.has_api_key ? (
              <>
                <Button
                  onClick={onRefreshStatus}
                  disabled={saving || statusChecking}
                >
                  {statusChecking ? 'Checking…' : 'Check key'}
                </Button>
                <Button onClick={onRemove} disabled={saving}>
                  Remove saved key
                </Button>
              </>
            ) : null}
          </>
        }
      >
        <span className="settings-credential-field">
          <span className="settings-credential-input">
            <SettingsTextInput
              available={available}
              data-testid="ollama-api-key"
              description={statusMessage
                ? <span aria-live="polite">{statusMessage}</span>
                : undefined}
              disabled={saving}
              error={keyError ?? undefined}
              label="Ollama API key"
              onValueChange={onApiKeyChange}
              placeholder="Enter an API key for direct Ollama Cloud access."
              revealLabel="Ollama API key"
              secret
              value={apiKey}
            />
          </span>
          <Button
            variant="primary"
            onClick={onSave}
            disabled={
              saving
              || apiKey.trim().length === 0
              || !keyChanged
              || keyError !== null
            }
          >
            {saving ? 'Saving…' : 'Save API Key'}
          </Button>
        </span>
        <SettingsActions>
          <Button onClick={onOpenCloudModels}>
            Cloud models
          </Button>
          <Button onClick={onOpenSearch}>
            Ollama search providers
          </Button>
          <Button onClick={onOpenPrivacy}>
            Privacy policy
          </Button>
          <Button onClick={onOpenCloudSettings}>
            Cloud settings
          </Button>
        </SettingsActions>
      </SettingsItem>

    </>
  )
}