import { useEffect, useMemo, useState, type ReactElement } from 'react'

import {
  Button,
  ModelCardGrid,
  Note,
  SettingsActions,
  type ModelCard,
} from '@maximal/maximal-electron/renderer'

import type {
  ModelsListResponse,
  SettingsCapabilities,
} from './capabilities'
import { formatTimestamp } from '../shared/format'
import { useSettingsHeaderActions } from './header-actions'
import { useSettingsNavigation } from './navigation'
import { AccountAvatar } from './service-icons'
import {
  cloudProviderId,
  cloudProviderName,
} from './cloud-model-providers'
import { CloudProviderControls } from './CloudProviderControls'
import {
  type ModelProviderInventory,
  useModelProviderRegistry,
} from './useModelProviderRegistry'

interface ModelsSectionProps {
  capabilities: SettingsCapabilities
}

function modelKind(type: string): string {
  const normalized = type.trim().toLowerCase()
  if (normalized === 'image') return 'Image models'
  if (normalized === 'video') return 'Video models'
  return normalized || 'Other models'
}

function isLocalProvider(provider: string): boolean {
  const normalized = provider.trim().toLowerCase()
  return normalized === 'local'
    || normalized === 'embedded'
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

function modelCards(
  models: ModelsListResponse['models'],
  providers: ReadonlyMap<string, ModelProviderInventory>,
): ModelCard[] {
  return models.map((model) => {
    const providerId = cloudProviderId(model)
    const provider = providers.get(providerId)
    const disabled = provider !== undefined && (!provider.available || !provider.enabled)
    return {
      id: model.id,
      name: model.name,
      kind: modelKind(model.type),
      provider: cloudProviderName(providerId, model.vendor),
      local: model.location === 'local' || isLocalProvider(model.vendor),
      disabled,
      activationLabel:
        disabled
          ? provider?.available
            ? `Enable ${provider.name} to access ${model.name}`
            : `Set up ${provider?.name ?? model.vendor} to access ${model.name}`
          : undefined,
      preview: model.preview,
      contextWindowTokens: model.context_window_tokens ?? undefined,
      maxOutputTokens: model.max_output_tokens ?? undefined,
      capabilities: {
        vision: model.capabilities.vision,
        imageGeneration: model.capabilities.image_generation,
        videoGeneration: model.capabilities.video_generation,
        toolCalls: model.capabilities.tool_calls,
        streaming: model.capabilities.streaming,
        reasoning: model.capabilities.reasoning,
      },
    }
  })
}

function localModelCards(
  models: NonNullable<ReturnType<typeof useModelProviderRegistry>['local']>['models'],
): ModelCard[] {
  return models.map((model) => ({
    id: `maximal-${model.key}`,
    name: model.displayName,
    kind: 'Chat models',
    provider: 'Maximal',
    local: true,
    disabled: model.state !== 'ready',
    contextWindowTokens: model.context.contextWindow,
    maxOutputTokens: model.context.maxOutputTokens,
    capabilities: {
      vision: model.capabilities.input.includes('image'),
      imageGeneration: model.capabilities.output.includes('image'),
      videoGeneration: model.capabilities.output.includes('video'),
      toolCalls: false,
      streaming: false,
      reasoning: false,
    },
  }))
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
          || (model.location === undefined && !isLocalProvider(model.vendor)),
      )
      const providerById = new Map(
        registry.providers.map((provider) => [provider.id, provider]),
      )
      const cards = modelCards(cloudModels, providerById)
      const localProviderModels = models.filter((model) => model.location === 'local')
      return {
        cloudCards: cards,
        cloudProviders: [...new Set(cards.map((model) => model.provider ?? ''))],
        localCards: [
          ...modelCards(localProviderModels, providerById),
          ...localModelCards(local?.models ?? []),
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
