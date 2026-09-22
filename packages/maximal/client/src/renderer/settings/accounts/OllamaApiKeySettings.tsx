import type { FocusEvent, ReactElement } from 'react'

import {
  Button,
  Dialog,
  FormField,
  SettingsItem,
  TextInput,
} from 'stuffbucket-electron/renderer'

import type { OllamaSettingsResponse } from '../capabilities'

interface OllamaApiKeySettingsProps {
  settings: OllamaSettingsResponse
  apiKey: string
  saving: boolean
  confirmOpen: boolean
  dialogError: string | null
  keyError: string | null
  keyMessage: string | null
  onApiKeyChange: (value: string) => void
  onApiKeyBlur: (event: FocusEvent<HTMLInputElement>) => void
  onConfirmOpenChange: (open: boolean) => void
  onDiscard: () => void
  onSave: () => void
  onRemove: () => void
  onCreate: () => void
}

export function OllamaApiKeySettings({
  settings,
  apiKey,
  saving,
  confirmOpen,
  dialogError,
  keyError,
  keyMessage,
  onApiKeyChange,
  onApiKeyBlur,
  onConfirmOpenChange,
  onDiscard,
  onSave,
  onRemove,
  onCreate,
}: OllamaApiKeySettingsProps): ReactElement {
  const description = settings.has_api_key
    ? `A key is configured from ${settings.credential_source}. Enter a replacement, or leave empty to stop using the saved cloud key.`
    : 'Use an API key with an Ollama cloud subscription, or use Ollama on this machine with or without a key.'

  return (
    <>
      <SettingsItem
        title="Ollama Cloud API"
        description={description}
        actions={
          settings.has_api_key ? (
            <Button size="sm" onClick={onRemove} disabled={saving}>
              Remove saved key
            </Button>
          ) : (
            <Button size="sm" onClick={onCreate}>
              Create API key
            </Button>
          )
        }
      >
        <FormField
          label="Ollama API key"
          hint={keyMessage ? <span aria-live="polite">{keyMessage}</span> : undefined}
          error={keyError ?? undefined}
        >
          {(control) => (
            <span className="settings-credential-field">
              <TextInput
                {...control}
                value={apiKey}
                type="password"
                placeholder="Enter an Ollama API key to use Ollama Cloud models."
                revealLabel="Ollama API key"
                disabled={saving}
                title={keyError ?? undefined}
                testId="ollama-api-key"
                onChange={onApiKeyChange}
                onBlur={onApiKeyBlur}
              />
            </span>
          )}
        </FormField>
      </SettingsItem>

      <Dialog
        open={confirmOpen}
        onOpenChange={onConfirmOpenChange}
        title="Update Ollama API key?"
        description="Would you like to verify and save this API key to your Ollama configuration?"
        showTitle
        showDescription
        className="dialog unsaved-changes-dialog"
        testId="ollama-key-dialog"
      >
        {dialogError ? (
          <p className="unsaved-changes-dialog__error" role="alert">
            {dialogError}
          </p>
        ) : null}
        <div className="unsaved-changes-dialog__actions">
          <Button onClick={onDiscard} disabled={saving}>
            No, discard
          </Button>
          <Button variant="primary" onClick={onSave} disabled={saving}>
            {saving ? 'Verifying…' : 'Yes, update key'}
          </Button>
        </div>
      </Dialog>
    </>
  )
}