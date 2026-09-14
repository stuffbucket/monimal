import { useEffect, useState, type ReactElement } from 'react'

import {
  Button,
  FormField,
  Note,
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
  const [saving, setSaving] = useState(false)
  const [keyError, setKeyError] = useState<string | null>(null)
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

  const saveApiKey = async () => {
    setSaving(true)
    setKeyError(null)
    try {
      const next = await capabilities.ollamaSettings.update({ api_key: apiKey })
      setSettings(next)
      setApiKey('')
      setList(await capabilities.ollamaAccounts.list())
    } catch (cause) {
      setKeyError(describeError(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="settings-subsection">
      <h2 className="settings-section__subheading">Ollama</h2>
      {settings ? (
        <>
          <div className="settings-field">
            <Switch
              label="Prefer local Ollama models"
              checked={settings.prefer_local_models}
              disabled={saving}
              onChange={(next) => void updatePreference(next)}
              testId="ollama-prefer-local"
            />
            <span className="settings-list__detail">
              When local and cloud advertise the same model, use the local copy
              first.
            </span>
          </div>
          <FormField
            label="Ollama API key"
            hint={
              settings.has_api_key
                ? `A key is configured from ${settings.credential_source}. Enter a replacement, or leave empty to stop using the saved cloud key.`
                : 'Optional. Leave empty to use localhost only.'
            }
            error={keyError ?? undefined}
            labelAction={
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
            }
          >
            {(control) => (
              <div className="settings-section__actions">
                <TextInput
                  {...control}
                  value={apiKey}
                  type="password"
                  revealLabel="Ollama API key"
                  disabled={saving}
                  title={keyError ?? undefined}
                  testId="ollama-api-key"
                  onChange={setApiKey}
                />
                <Button
                  variant="primary"
                  disabled={saving}
                  onClick={() => void saveApiKey()}
                >
                  {saving ? 'Validating…' : 'Save'}
                </Button>
              </div>
            )}
          </FormField>
        </>
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
        <ul className="settings-accounts-list">
          {list.accounts.map((account) => (
            <li key={account.provider} className="settings-accounts-list__row">
              <div className="settings-accounts-list__identity">
                <span className="settings-accounts-list__login">
                  {account.provider}
                </span>
                <span className="settings-accounts-list__meta">
                  {accountDescription(account)}
                </span>
                <span className="settings-accounts-list__meta">
                  {account.endpoint} · {account.availability}
                  {account.model_count === null
                    ? ''
                    : ` · ${account.model_count} ${account.model_count === 1 ? 'model' : 'models'}`}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
