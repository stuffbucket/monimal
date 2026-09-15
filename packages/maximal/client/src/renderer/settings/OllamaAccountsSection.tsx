import {
  useEffect,
  useState,
  type FocusEvent,
  type ReactElement,
} from 'react'

import {
  Button,
  Dialog,
  FormField,
  Note,
  SettingsGroup,
  SettingsItem,
  SettingsSection,
  Switch,
  TextInput,
} from 'stuffbucket-electron/renderer'

import type {
  OllamaAccountsListResponse,
  OllamaSettingsResponse,
  SettingsCapabilities,
} from './capabilities'
import { describeError } from './format'

const POLL_MS = 5000
const MIN_OLLAMA_KEY_LENGTH = 8

interface OllamaAccountsSectionProps {
  capabilities: SettingsCapabilities
}

function accountDescription(
  account: OllamaAccountsListResponse['accounts'][number],
): string {
  if (account.account_state === 'authenticated') {
    return 'An authenticated Ollama account is configured.'
  }
  if (account.scope === 'localhost') {
    return account.availability === 'available'
      ? 'No account set. Using Ollama on this computer.'
      : 'No account set. Local Ollama is not currently available.'
  }
  return 'No account set. Using the configured endpoint without authentication.'
}

export function OllamaAccountsSection({
  capabilities,
}: OllamaAccountsSectionProps): ReactElement {
  const [list, setList] = useState<OllamaAccountsListResponse | null>(null)
  const [settings, setSettings] = useState<OllamaSettingsResponse | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [apiKeyDirty, setApiKeyDirty] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [keyError, setKeyError] = useState<string | null>(null)
  const [keyMessage, setKeyMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let settled = false
    const refresh = async () => {
      try {
        const [next, nextSettings] = await Promise.all([
          capabilities.ollamaAccounts.list(),
          capabilities.ollamaSettings.get(),
        ])
        if (!settled) {
          setList(next)
          setSettings(nextSettings)
          setError(null)
        }
      } catch (cause) {
        if (!settled) setError(describeError(cause))
      }
    }

    void refresh()
    const poll = setInterval(() => void refresh(), POLL_MS)
    return () => {
      settled = true
      clearInterval(poll)
    }
  }, [capabilities])

  const updatePreference = async (preferLocalModels: boolean) => {
    setError(null)
    try {
      setSettings(
        await capabilities.ollamaSettings.update({
          prefer_local_models: preferLocalModels,
        }),
      )
    } catch (cause) {
      setError(describeError(cause))
    }
  }

  const updateApiKeyInput = (next: string) => {
    setApiKey(next)
    setApiKeyDirty(true)
    setKeyError(null)
    setKeyMessage(null)
    setDialogError(null)
  }

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    const nextTarget = event.relatedTarget as HTMLElement | null
    if (nextTarget && event.currentTarget.parentElement?.contains(nextTarget)) {
      return
    }
    if (!apiKeyDirty) return
    const candidate = apiKey.trim()
    if (candidate.length === 0) {
      setApiKey('')
      setApiKeyDirty(false)
      return
    }
    setConfirmOpen(true)
    setDialogError(null)
  }

  const handleDiscard = () => {
    setApiKey('')
    setApiKeyDirty(false)
    setConfirmOpen(false)
    setDialogError(null)
  }

  const handleConfirmSave = async () => {
    const candidate = apiKey.trim()
    if (candidate.length < MIN_OLLAMA_KEY_LENGTH) {
      setDialogError('API key is too short to be valid.')
      return
    }

    setSaving(true)
    setDialogError(null)
    try {
      const next = await capabilities.ollamaSettings.update({
        api_key: candidate,
      })
      setSettings(next)
      setApiKey('')
      setApiKeyDirty(false)
      setConfirmOpen(false)
      setKeyError(null)
      setKeyMessage('Ollama API key verified and saved.')
      try {
        setList(await capabilities.ollamaAccounts.list())
      } catch (cause) {
        setError(describeError(cause))
      }
    } catch (cause) {
      setDialogError(describeError(cause))
    } finally {
      setSaving(false)
    }
  }

  const handleRemoveSavedKey = async () => {
    setSaving(true)
    setKeyError(null)
    setKeyMessage(null)
    try {
      const next = await capabilities.ollamaSettings.update({
        api_key: '',
      })
      setSettings(next)
      setApiKey('')
      setApiKeyDirty(false)
      setKeyMessage('Saved API key removed.')
      try {
        setList(await capabilities.ollamaAccounts.list())
      } catch (cause) {
        setError(describeError(cause))
      }
    } catch (cause) {
      setKeyError(describeError(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsSection title="Ollama">
      {settings ? (
        <SettingsGroup>
          <SettingsItem
            title="Ollama Cloud API"
            description={
              settings.has_api_key
                ? `A key is configured from ${settings.credential_source}. Enter a replacement, or leave empty to stop using the saved cloud key.`
                : 'Use an API key with an Ollama cloud subscription, or use Ollama on this machine with or without a key.'
            }
            actions={
              settings.has_api_key ? (
                <Button
                  size="sm"
                  onClick={() => void handleRemoveSavedKey()}
                  disabled={saving}
                >
                  Remove saved key
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() =>
          void capabilities.openExternal(
            'https://ollama.com/settings/keys',
          )
                  }
                >
                  Create API key
                </Button>
              )
            }
          >
            <FormField
              label="Ollama API key"
              hint={
                keyMessage ? (
                  <span aria-live="polite">{keyMessage}</span>
                ) : undefined
              }
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
                    onChange={updateApiKeyInput}
                    onBlur={handleBlur}
                  />
                </span>
              )}
            </FormField>
          </SettingsItem>

          <Dialog
            open={confirmOpen}
            onOpenChange={(next) => {
              if (!next && !saving) handleDiscard()
            }}
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
              <Button onClick={handleDiscard} disabled={saving}>
                No, discard
              </Button>
              <Button
                variant="primary"
                onClick={() => void handleConfirmSave()}
                disabled={saving}
              >
                {saving ? 'Verifying…' : 'Yes, update key'}
              </Button>
            </div>
          </Dialog>

          <SettingsItem
            title="Prefer local Ollama models"
            description="When local and cloud advertise the same model, use the local copy first."
            control={
              <Switch
                label="Prefer local Ollama models"
                displayLabel={null}
                checked={settings.prefer_local_models}
                disabled={saving}
                onChange={(next) => void updatePreference(next)}
                testId="ollama-prefer-local"
              />
            }
          />
        </SettingsGroup>
      ) : null}
      {error ? (
        <Note status="failed" live="assertive">
          {error}
        </Note>
      ) : list === null ? (
        <Note live="polite">Checking Ollama…</Note>
      ) : list.accounts.length === 0 ? (
        <Note>Ollama is disabled in the provider configuration.</Note>
      ) : (
        <SettingsGroup>
          {list.accounts.map((account) => (
            <SettingsItem
              key={account.provider}
              title={account.provider}
              description={accountDescription(account)}
            >
              <span className="settings-list__detail">
                {account.endpoint} · {account.availability}
                {account.model_count === null
                  ? ''
                  : ` · ${account.model_count} ${account.model_count === 1 ? 'model' : 'models'}`}
              </span>
            </SettingsItem>
          ))}
        </SettingsGroup>
      )}
    </SettingsSection>
  )
}
