import type { ReactElement } from 'react'

import {
  Button,
  FormField,
  SettingsItem,
  TextInput,
} from '@maximal/maximal-electron/renderer'

import type { OllamaSettingsResponse } from '../capabilities'

interface OllamaApiKeySettingsProps {
  settings: OllamaSettingsResponse
  apiKey: string
  saving: boolean
  keyError: string | null
  keyMessage: string | null
  available: boolean
  statusChecked: boolean
  statusErrorCode: string | null
  onApiKeyChange: (value: string) => void
  onSave: () => void
  onRemove: () => void
  onManageKeys: () => void
  onOpenCloudModels: () => void
  onOpenSearch: () => void
  onOpenPrivacy: () => void
  onOpenCloudSettings: () => void
}

export function OllamaApiKeySettings({
  settings,
  apiKey,
  saving,
  keyError,
  keyMessage,
  available,
  statusChecked,
  statusErrorCode,
  onApiKeyChange,
  onSave,
  onRemove,
  onManageKeys,
  onOpenCloudModels,
  onOpenSearch,
  onOpenPrivacy,
  onOpenCloudSettings,
}: OllamaApiKeySettingsProps): ReactElement {
  const description = settings.has_api_key
    ? `A direct Cloud API key is configured from ${settings.credential_source}. Enter a replacement, or leave empty to keep the current key.`
    : 'Use an API key to send requests directly to Ollama.com.'
  const statusMessage = settings.has_api_key
    ? (
        !statusChecked
          ? 'Checking the saved API key…'
          : available
            ? 'API key is saved and working.'
            : `API key is saved but there is an error (${statusErrorCode ?? 'UNKNOWN'}).`
      )
    : keyMessage
  const keyChanged = apiKey.trim() !== (settings.api_key ?? '')

  return (
    <>
      <SettingsItem
        title="Direct Cloud API key"
        description={description}
        actions={
          <>
            <Button size="sm" onClick={onManageKeys}>
              API keys
            </Button>
            {settings.has_api_key ? (
              <Button size="sm" onClick={onRemove} disabled={saving}>
                Remove saved key
              </Button>
            ) : null}
          </>
        }
      >
        <FormField
          label="Ollama API key"
          hint={
            statusMessage
              ? <span aria-live="polite">{statusMessage}</span>
              : undefined
          }
          error={keyError ?? undefined}
        >
          {(control) => (
            <span className="settings-credential-field">
              <span className="settings-credential-input">
                <TextInput
                  {...control}
                  value={apiKey}
                  type="password"
                  placeholder="Enter an API key for direct Ollama Cloud access."
                  revealLabel="Ollama API key"
                  disabled={saving}
                  active={available}
                  title={keyError ?? undefined}
                  testId="ollama-api-key"
                  onChange={onApiKeyChange}
                />
              </span>
              <Button
                variant="primary"
                size="sm"
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
          )}
        </FormField>
        <div className="settings-device-code__actions">
          <Button size="sm" onClick={onOpenCloudModels}>
            Cloud models
          </Button>
          <Button size="sm" onClick={onOpenSearch}>
            Ollama search providers
          </Button>
          <Button size="sm" onClick={onOpenPrivacy}>
            Privacy policy
          </Button>
          <Button size="sm" onClick={onOpenCloudSettings}>
            Cloud settings
          </Button>
        </div>
      </SettingsItem>

    </>
  )
}