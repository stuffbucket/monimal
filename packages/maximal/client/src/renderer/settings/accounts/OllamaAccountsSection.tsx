import type { ReactElement } from 'react'

import {
  Note,
  SettingsGroup,
  SettingsItem,
  SettingsSection,
  Switch,
} from 'stuffbucket-electron/renderer'

import type { OllamaAccountsListResponse, SettingsCapabilities } from '../capabilities'
import { OllamaApiKeySettings } from './OllamaApiKeySettings'
import { useOllamaAccounts } from './useOllamaAccounts'

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
  const state = useOllamaAccounts(capabilities)
  const { list, settings, saving, error } = state

  return (
    <SettingsSection title="Ollama">
      {settings ? (
        <SettingsGroup>
          <OllamaApiKeySettings
            settings={settings}
            apiKey={state.apiKey}
            saving={saving}
            confirmOpen={state.confirmOpen}
            dialogError={state.dialogError}
            keyError={state.keyError}
            keyMessage={state.keyMessage}
            onApiKeyChange={state.updateApiKey}
            onApiKeyBlur={state.blurApiKey}
            onConfirmOpenChange={(open) => {
              if (!open && !saving) state.discardApiKey()
            }}
            onDiscard={state.discardApiKey}
            onSave={() => void state.saveApiKey()}
            onRemove={() => void state.removeApiKey()}
            onCreate={() => void capabilities.openExternal('https://ollama.com/settings/keys')}
          />

          <SettingsItem
            title="Prefer local Ollama models"
            description="When local and cloud advertise the same model, use the local copy first."
            control={
              <Switch
                label="Prefer local Ollama models"
                displayLabel={null}
                checked={settings.prefer_local_models}
                disabled={saving}
                onChange={(next) => void state.updatePreference(next)}
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