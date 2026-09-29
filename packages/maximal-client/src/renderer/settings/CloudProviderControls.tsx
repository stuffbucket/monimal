import { useState, type ReactElement } from 'react'

import {
  Button,
  Dialog,
  Note,
  SettingsActions,
  SettingsGroup,
  SettingsItem,
  SettingsSection,
  Switch,
} from '@maximal/maximal-electron/renderer'

import type { ModelProviderInventory } from './useModelProviderRegistry'
import { AccountAvatar } from './service-icons'

interface CloudProviderControlsProps {
  providers: ModelProviderInventory[]
  updating: string | null
  error: string | null
  requestedProvider: ModelProviderInventory | null
  onRequestedProviderChange: (provider: ModelProviderInventory | null) => void
  onEnabledChange: (providerId: string, enabled: boolean) => Promise<void>
  onSetupProvider: () => void
}

function providerToggleLabel(provider: ModelProviderInventory): string {
  const name = provider.id === 'ollama' ? 'Ollama Cloud' : provider.name
  return `${provider.enabled ? 'Disable' : 'Enable'} ${name}`
}

function providerSetupDescription(provider: ModelProviderInventory): string {
  if (provider.id === 'github-copilot') {
    return 'GitHub Copilot needs a signed-in GitHub account before its cloud models can be enabled. Go to Accounts to sign in now?'
  }
  if (provider.id === 'ollama') {
    return 'Ollama Cloud needs an API key or a signed-in local Ollama application before its cloud models can be enabled. Go to Accounts to set it up now?'
  }
  return `${provider.name} needs a configured account or API key before its cloud models can be enabled. Go to Accounts to set it up now?`
}

function providerInventoryDescription(provider: ModelProviderInventory): string {
  const details = [
    provider.description,
    provider.active ? 'Active' : 'Inactive',
  ]
  if (!provider.description.startsWith(provider.enabled ? 'Enabled ·' : 'Disabled ·')) {
    details.push(provider.enabled ? 'Enabled' : 'Disabled')
  }
  if (!provider.description.startsWith(provider.available ? 'Available ·' : 'Unavailable ·')) {
    details.push(provider.available ? 'Available' : 'Unavailable')
  }
  details.push(
    `${provider.modelCount} ${provider.modelCount === 1 ? 'model' : 'models'}`,
    `${provider.state} inventory`,
  )
  return details.join(' · ')
}

export function CloudProviderControls({
  providers,
  updating,
  error,
  requestedProvider,
  onRequestedProviderChange,
  onEnabledChange,
  onSetupProvider,
}: CloudProviderControlsProps): ReactElement {
  const [confirming, setConfirming] = useState(false)

  const enableRequestedProvider = async () => {
    if (requestedProvider === null) return
    setConfirming(true)
    await onEnabledChange(requestedProvider.id, true)
    setConfirming(false)
    onRequestedProviderChange(null)
  }

  const setupRequestedProvider = () => {
    onRequestedProviderChange(null)
    onSetupProvider()
  }

  return (
    <>
      <SettingsSection title="Model providers" as="h2">
        <SettingsGroup dividers={false}>
          {providers.map((provider) => {
            const toggleLabel = providerToggleLabel(provider)
            return (
              <SettingsItem
                key={provider.id}
                title={provider.name}
                description={providerInventoryDescription(provider)}
                control={(
                  <AccountAvatar
                    account={{ provider: provider.name, login: provider.name }}
                    size={30}
                  />
                )}
                actions={(
                  <Switch
                    label={toggleLabel}
                    displayLabel={null}
                    tooltip={toggleLabel}
                    checked={provider.enabled}
                    disabled={
                      !provider.configurable
                      || updating !== null
                    }
                    onChange={(enabled) => {
                      if (enabled && !provider.available) {
                        onRequestedProviderChange(provider)
                        return
                      }
                      void onEnabledChange(provider.id, enabled)
                    }}
                    testId={`cloud-provider-${provider.id}`}
                  />
                )}
              />
            )
          })}
        </SettingsGroup>
        {error ? <Note status="failed" live="assertive">{error}</Note> : null}
      </SettingsSection>

      <Dialog
        open={requestedProvider !== null}
        onOpenChange={(open) => {
          if (!open && !confirming) onRequestedProviderChange(null)
        }}
        title={
          requestedProvider?.available === false
            ? `Set up ${requestedProvider.name}?`
            : `Enable ${requestedProvider?.name ?? 'provider'}?`
        }
        description={
          requestedProvider?.available === false
            ? providerSetupDescription(requestedProvider)
            : `Enable ${requestedProvider?.name ?? 'this provider'} to gain access to its models.`
        }
        showTitle
        showDescription
        testId="enable-cloud-provider-dialog"
      >
        <SettingsActions>
          <Button
            onClick={() => onRequestedProviderChange(null)}
            disabled={confirming}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={
              requestedProvider?.available === false
                ? setupRequestedProvider
                : () => void enableRequestedProvider()
            }
            disabled={confirming}
          >
            {requestedProvider?.available === false
              ? 'Go to Accounts'
              : confirming
                ? 'Enabling…'
                : 'Enable provider'}
          </Button>
        </SettingsActions>
      </Dialog>
    </>
  )
}
