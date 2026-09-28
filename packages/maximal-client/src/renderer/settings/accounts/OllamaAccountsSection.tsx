import type { ReactElement } from 'react'

import {
  Note,
  SettingsGroup,
  SettingsSection,
} from '@maximal/maximal-electron/renderer'

import type { SettingsCapabilities } from '../capabilities'
import { useSettingsNavigation } from '../navigation'
import { OllamaApiKeySettings } from './OllamaApiKeySettings'
import { OllamaLocalSettings } from './OllamaLocalSettings'
import { useOllamaAccounts } from './useOllamaAccounts'

interface OllamaAccountsSectionProps {
  capabilities: SettingsCapabilities
}

export function OllamaAccountsSection({
  capabilities,
}: OllamaAccountsSectionProps): ReactElement {
  const state = useOllamaAccounts(capabilities)
  const { list, settings, saving, error, runtimePreferences } = state
  const navigate = useSettingsNavigation()
  const cloudAccount = list?.accounts.find(
    (account) =>
      account.provider === 'ollama-cloud',
  )
  const cloudAvailable = cloudAccount?.availability === 'available'

  return (
    <SettingsSection title="Ollama">
      {settings && runtimePreferences ? (
        <SettingsGroup>
          <OllamaApiKeySettings
            settings={settings}
            apiKey={state.apiKey}
            saving={saving}
            keyError={state.keyError}
            keyMessage={state.keyMessage}
            available={cloudAvailable}
            statusChecked={list !== null}
            statusErrorCode={cloudAccount?.error_code ?? null}
            onApiKeyChange={state.updateApiKey}
            onSave={() => void state.saveApiKey()}
            onRemove={() => void state.removeApiKey()}
            onManageKeys={() => void capabilities.openExternal('https://ollama.com/settings/keys')}
            onOpenCloudModels={() => navigate('settings-models-heading')}
            onOpenSearch={() => navigate('settings-search-heading')}
            onOpenPrivacy={() => void capabilities.openExternal('https://ollama.com/privacy')}
            onOpenCloudSettings={() => void capabilities.openExternal('https://docs.ollama.com/faq#how-do-i-disable-ollama-cloud-features')}
          />
        </SettingsGroup>
      ) : null}

      {settings && runtimePreferences ? (
        <SettingsGroup>
          <OllamaLocalSettings
            settings={settings}
            runtime={state.runtime}
            preferences={runtimePreferences}
            endpoint={state.endpoint}
            endpointError={state.endpointError}
            endpointMessage={state.endpointMessage}
            suggestedEndpoint={state.suggestedEndpoint}
            startPromptOpen={state.startPromptOpen}
            saving={saving}
            onEndpointChange={state.updateEndpoint}
            onSaveEndpoint={(endpoint) => void state.saveEndpoint(endpoint)}
            onDismissEndpointSuggestion={state.dismissEndpointSuggestion}
            onStartPromptOpenChange={state.setStartPromptOpen}
            onLaunch={() => void state.launchOllama()}
            onUpdatePreferences={(input) => void state.updateRuntimePreferences(input)}
            onOpenDownload={() => void capabilities.openExternal('https://ollama.com/download')}
            onOpenLocalModels={() => navigate('settings-local-models-heading')}
          />
        </SettingsGroup>
      ) : null}
      {error ? (
        <Note status="failed" live="assertive">
          {error}
        </Note>
      ) : null}
    </SettingsSection>
  )
}