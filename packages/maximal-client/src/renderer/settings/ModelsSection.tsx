import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'

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
import { describeError } from '../shared/errors'
import { formatTimestamp } from '../shared/format'
import { useSettingsHeaderActions } from './header-actions'
import { useSettingsNavigation } from './navigation'
import { AccountAvatar } from './service-icons'
import {
  cloudProviderId,
  cloudProviderName,
  type CloudModelProvider,
  useCloudModelProviders,
} from './cloud-model-providers'
import { CloudProviderControls } from './CloudProviderControls'

interface ModelsSectionProps {
  capabilities: SettingsCapabilities
}

const catalogueCache = new WeakMap<SettingsCapabilities, ModelsListResponse>()
const catalogueLoads = new WeakMap<SettingsCapabilities, Promise<ModelsListResponse>>()

function loadCatalogue(capabilities: SettingsCapabilities): Promise<ModelsListResponse> {
  const cached = catalogueCache.get(capabilities)
  if (cached !== undefined) return Promise.resolve(cached)
  const pending = catalogueLoads.get(capabilities)
  if (pending !== undefined) return pending

  const load = capabilities.models.list().then((next) => {
    catalogueCache.set(capabilities, next)
    catalogueLoads.delete(capabilities)
    return next
  }, (cause: unknown) => {
    catalogueLoads.delete(capabilities)
    throw cause
  })
  catalogueLoads.set(capabilities, load)
  return load
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
  providers: ReadonlyMap<string, CloudModelProvider>,
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

function useModelCatalogue(capabilities: SettingsCapabilities) {
  const cachedCatalogue = catalogueCache.get(capabilities) ?? null
  const [catalogue, setCatalogue] = useState<ModelsListResponse | null>(cachedCatalogue)
  const [refreshing, setRefreshing] = useState(cachedCatalogue === null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    setError(null)
    try {
      const next = await capabilities.models.refresh()
      catalogueCache.set(capabilities, next)
      setCatalogue(next)
    } catch (cause) {
      setError(describeError(cause))
    } finally {
      setRefreshing(false)
    }
  }, [capabilities])

  useEffect(() => {
    if (catalogueCache.has(capabilities)) return
    let active = true
    void loadCatalogue(capabilities)
      .then((next) => {
        if (!active) return
        setCatalogue(next)
      })
      .catch((cause: unknown) => {
        if (active) setError(describeError(cause))
      })
      .finally(() => {
        if (active) setRefreshing(false)
      })
    return () => {
      active = false
    }
  }, [capabilities])

  return { catalogue, error, refresh, refreshing }
}

export function ModelsSection({ capabilities }: ModelsSectionProps): ReactElement {
  const navigate = useSettingsNavigation()
  const { hasHeader, setActions: setHeaderActions } = useSettingsHeaderActions()
  const { catalogue, error, refresh, refreshing } = useModelCatalogue(capabilities)
  const providerState = useCloudModelProviders(capabilities, catalogue)
  const [requestedProvider, setRequestedProvider] =
    useState<CloudModelProvider | null>(null)
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

  const { cloudCards, cloudProviders, providerByName } = useMemo(
    () => {
      const models = catalogue?.models ?? []
      const cloudModels = models.filter(
        (model) =>
          model.location === 'cloud'
          || (model.location === undefined && !isLocalProvider(model.vendor)),
      )
      const providerById = new Map(
        providerState.providers.map((provider) => [provider.id, provider]),
      )
      const cards = modelCards(cloudModels, providerById)
      return {
        cloudCards: cards,
        cloudProviders: [...new Set(cards.map((model) => model.provider ?? ''))],
        providerByName: new Map(
          providerState.providers.map((provider) => [provider.name, provider]),
        ),
      }
    },
    [catalogue, providerState.providers],
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
      ) : catalogue === null ? (
        <Note live="polite">Loading model catalogue…</Note>
      ) : (
        <>
          {catalogue.loaded_at ? (
            <Note>
              {catalogueIsStale ? 'Stale · ' : ''}Updated {formatTimestamp(catalogue.loaded_at)}
            </Note>
          ) : null}
          <CloudProviderControls
            providers={providerState.providers}
            updating={providerState.updating}
            error={providerState.error}
            requestedProvider={requestedProvider}
            onRequestedProviderChange={setRequestedProvider}
            onEnabledChange={providerState.setEnabled}
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
        </>
      )}
    </section>
  )
}
