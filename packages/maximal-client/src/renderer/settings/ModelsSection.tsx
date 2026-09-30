import { useEffect, useMemo, useState, type ReactElement } from 'react'

import {
  Button,
  ModelCardGrid,
  Note,
  SettingsActions,
  type ModelCard,
} from '@maximal/maximal-electron/renderer'
import {
  reconcileModelInventory,
  type ModelCatalogIndex,
  type ModelInventoryEntry,
  type RuntimeModelObservation,
} from '@maximal/maximal-model-catalog'

import type { SettingsCapabilities } from './capabilities'
import { formatTimestamp } from '../shared/format'
import { useSettingsHeaderActions } from './header-actions'
import { useSettingsNavigation } from './navigation'
import { AccountAvatar } from './service-icons'
import { CloudProviderControls } from './CloudProviderControls'
import {
  cloudModelObservations,
  isLocalModelProvider,
  localModelObservations,
  modelFeatureEnabled,
} from './model-inventory'
import {
  type ModelProviderInventory,
  useModelProviderRegistry,
} from './useModelProviderRegistry'

interface ModelsSectionProps {
  capabilities: SettingsCapabilities
}

function providerStatusUrl(provider: string): string | null {
  const normalized = provider.trim().toLowerCase()
  if (normalized.includes('github') || normalized.includes('copilot')) {
    return 'https://www.githubstatus.com/'
  }
  if (normalized.includes('openai')) return 'https://status.openai.com/'
  if (normalized.includes('anthropic')) return 'https://status.anthropic.com/'
  if (normalized.includes('google') || normalized.includes('gemini')) {
    return 'https://status.cloud.google.com/'
  }
  return null
}

function modelCard(
  model: ModelInventoryEntry,
  providers: ReadonlyMap<string, ModelProviderInventory>,
): ModelCard {
  const provider = providers.get(model.provider.id)
  const disabled = model.availability !== 'available'
  return {
    id:
      model.provider.id === 'maximal-local'
        ? `maximal-${model.instanceId}`
        : model.id,
    name: model.name,
    kind: model.kind,
    provider: model.provider.name,
    local: model.location === 'local',
    disabled,
    activationLabel:
      disabled && provider !== undefined
        ? provider.available
          ? `Enable ${provider.name} to access ${model.name}`
          : `Set up ${provider.name} to access ${model.name}`
        : undefined,
    preview: model.preview,
    contextWindowTokens: model.limits.contextTokens.value ?? undefined,
    maxOutputTokens: model.limits.outputTokens.value ?? undefined,
    capabilities: {
      vision: modelFeatureEnabled(model, 'vision'),
      imageGeneration: modelFeatureEnabled(model, 'imageGeneration'),
      videoGeneration: modelFeatureEnabled(model, 'videoGeneration'),
      toolCalls: modelFeatureEnabled(model, 'toolCalls'),
      streaming: modelFeatureEnabled(model, 'streaming'),
      reasoning: modelFeatureEnabled(model, 'reasoning'),
    },
  }
}

function modelCards(
  catalog: ModelCatalogIndex | null,
  observations: ReadonlyArray<RuntimeModelObservation>,
  providers: ReadonlyMap<string, ModelProviderInventory>,
): ModelCard[] {
  return reconcileModelInventory(catalog, observations).models.map((model) =>
    modelCard(model, providers),
  )
}

export function ModelsSection({ capabilities }: ModelsSectionProps): ReactElement {
  const navigate = useSettingsNavigation()
  const { hasHeader, setActions: setHeaderActions } = useSettingsHeaderActions()
  const registry = useModelProviderRegistry(capabilities)
  const {
    catalogue,
    error,
    inventoryState,
    local,
    refresh,
    refreshing,
  } = registry
  const [requestedProvider, setRequestedProvider] =
    useState<ModelProviderInventory | null>(null)
  const catalogueIsStale = catalogue?.loaded_at
    ? new Date(catalogue.loaded_at).getTime() < performance.timeOrigin
    : false

  useEffect(() => {
    setHeaderActions(
      <Button
        variant="primary"
        size="sm"
        onClick={() => void refresh()}
        disabled={refreshing}
      >
        {refreshing ? 'Refreshing…' : 'Refresh'}
      </Button>,
    )
    return () => setHeaderActions(null)
  }, [refresh, refreshing, setHeaderActions])

  const { cloudCards, cloudProviders, localCards, providerByName } = useMemo(
    () => {
      const models = catalogue?.models ?? []
      const cloudModels = models.filter(
        (model) =>
          model.location === 'cloud'
          || (
            model.location === undefined
            && !isLocalModelProvider(model.vendor)
          ),
      )
      const providerById = new Map(
        registry.providers.map((provider) => [provider.id, provider]),
      )
      const cards = modelCards(
        null,
        cloudModelObservations(cloudModels, providerById),
        providerById,
      )
      const localProviderModels = models.filter((model) => model.location === 'local')
      return {
        cloudCards: cards,
        cloudProviders: [...new Set(cards.map((model) => model.provider ?? ''))],
        localCards: [
          ...modelCards(
            null,
            cloudModelObservations(localProviderModels, providerById),
            providerById,
          ),
          ...modelCards(
            null,
            localModelObservations(local?.models ?? []),
            providerById,
          ),
        ],
        providerByName: new Map(
          registry.providers.map((provider) => [provider.name, provider]),
        ),
      }
    },
    [catalogue, local?.models, registry.providers],
  )

  return (
    <section className="settings-section">
      {!hasHeader ? (
        <div className="settings-section__actions">
          <Button
            variant="primary"
            size="sm"
            onClick={() => void refresh()}
            disabled={refreshing}
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      ) : null}
      {error ? (
        <Note status="failed" live="assertive">
          {error}
        </Note>
      ) : null}
      {catalogue === null ? (
        <Note live="polite">Loading model catalogue…</Note>
      ) : (
        <>
          {catalogue.loaded_at ? (
            <Note>
              {catalogueIsStale || inventoryState === 'stale' ? 'Stale · ' : ''}
              Updated {formatTimestamp(catalogue.loaded_at)}
            </Note>
          ) : inventoryState === 'stale' ? (
            <Note>Stale · Showing last-known model inventory</Note>
          ) : null}
          <CloudProviderControls
            providers={registry.providers}
            updating={registry.updating}
            error={null}
            requestedProvider={requestedProvider}
            onRequestedProviderChange={setRequestedProvider}
            onEnabledChange={registry.setEnabled}
            onSetupProvider={() => navigate('settings-account-heading')}
          />
          {cloudCards.length > 0 ? (
            <ModelCardGrid
              models={cloudCards}
              onModelActivate={(model) => {
                const provider = model.provider
                  ? providerByName.get(model.provider)
                  : undefined
                if (provider !== undefined && !provider.enabled) {
                  setRequestedProvider(provider)
                }
              }}
              renderProviderAvatar={(provider) => (
                <AccountAvatar
                  account={{ provider, login: provider }}
                  size={30}
                  title={provider}
                  testId={`model-provider-${provider.toLowerCase().replaceAll(' ', '-')}`}
                />
              )}
            />
          ) : (
            <Note>No cloud models are currently available.</Note>
          )}
          {cloudProviders.some((provider) => providerStatusUrl(provider)) ? (
            <SettingsActions>
              {cloudProviders.map((provider) => {
                const statusUrl = providerStatusUrl(provider)
                return statusUrl ? (
                  <a key={provider} href={statusUrl} rel="noreferrer" target="_blank">
                    {provider} service status
                  </a>
                ) : null
              })}
            </SettingsActions>
          ) : null}
          {localCards.length > 0 ? (
            <>
              <h2 className="settings__section-title">Local provider models</h2>
              <ModelCardGrid models={localCards} />
            </>
          ) : (
            <Note>No local provider models are currently registered.</Note>
          )}
        </>
      )}
    </section>
  )
}
