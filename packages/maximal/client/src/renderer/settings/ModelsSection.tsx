import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'

import {
  Button,
  ModelCardGrid,
  Note,
  SettingsSection,
  type ModelCard,
} from 'stuffbucket-electron/renderer'

import type {
  ModelsListResponse,
  SettingsCapabilities,
} from './capabilities'
import { describeError } from '../shared/errors'
import { formatTimestamp } from '../shared/format'
import { useSettingsHeaderActions } from './header-actions'
import { ServiceIcon } from './service-icons'

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

function ProviderAvatar({ provider }: { provider: string }): ReactElement {
  return (
    <span
      title={`${provider} provider`}
      aria-label={`${provider} provider`}
      style={{
        alignItems: 'center',
        background: 'var(--surface-raised, transparent)',
        border: '1px solid color-mix(in srgb, currentColor 20%, transparent)',
        borderRadius: '50%',
        display: 'inline-flex',
        height: 30,
        justifyContent: 'center',
        padding: 5,
        width: 30,
      }}
    >
      <ServiceIcon provider={provider} size={20} />
    </span>
  )
}

function ProviderAvatars({ providers }: { providers: string[] }): ReactElement {
  return (
    <span style={{ alignItems: 'center', display: 'inline-flex', gap: 8, padding: '2px 4px' }}>
      {providers.map((provider) => (
        <ProviderAvatar key={provider} provider={provider} />
      ))}
    </span>
  )
}

function modelCards(models: ModelsListResponse['models']): ModelCard[] {
  return models.map((model) => ({
    id: model.id,
    name: model.name,
    kind: modelKind(model.type),
    provider: model.vendor,
    local: isLocalProvider(model.vendor),
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
  }))
}

export function ModelsSection({ capabilities }: ModelsSectionProps): ReactElement {
  const { hasHeader, setActions: setHeaderActions } = useSettingsHeaderActions()
  const [catalogue, setCatalogue] = useState<ModelsListResponse | null>(null)
  const [refreshing, setRefreshing] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const catalogueIsStale = catalogue?.loaded_at
    ? new Date(catalogue.loaded_at).getTime() < performance.timeOrigin
    : false

  const refresh = useCallback(async () => {
    setRefreshing(true)
    setError(null)
    try {
      setCatalogue(await capabilities.models.refresh())
    } catch (cause) {
      setError(describeError(cause))
    } finally {
      setRefreshing(false)
    }
  }, [capabilities])

  useEffect(() => {
    let active = true
    void capabilities.models
      .list()
      .then((next) => {
        if (active) setCatalogue(next)
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

  const { cloudCards, cloudProviders } = useMemo(
    () => {
      const models = catalogue?.models ?? []
      const cloudModels = models.filter((model) => !isLocalProvider(model.vendor))
      return {
        cloudCards: modelCards(cloudModels),
        cloudProviders: [...new Set(cloudModels.map((model) => model.vendor))],
      }
    },
    [catalogue],
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
          <SettingsSection title="Cloud Models">
            <ProviderAvatars providers={cloudProviders} />
            {catalogue.loaded_at ? (
              <span
                title={catalogueIsStale ? 'This catalogue predates the current Maximal session' : undefined}
                style={catalogueIsStale ? {
                  background: 'color-mix(in srgb, #d29922 18%, transparent)',
                  border: '1px solid color-mix(in srgb, #d29922 55%, transparent)',
                  borderRadius: 6,
                  padding: '2px 6px',
                } : undefined}
              >
                <Note>{catalogueIsStale ? 'Stale · ' : ''}Updated {formatTimestamp(catalogue.loaded_at)}</Note>
              </span>
            ) : null}
            {cloudCards.length > 0 ? (
              <ModelCardGrid models={cloudCards} />
            ) : (
              <Note>No cloud models are currently available.</Note>
            )}
            {cloudProviders.some((provider) => providerStatusUrl(provider)) ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
                {cloudProviders.map((provider) => {
                  const statusUrl = providerStatusUrl(provider)
                  return statusUrl ? (
                    <a key={provider} href={statusUrl} rel="noreferrer" target="_blank">
                      {provider} service status
                    </a>
                  ) : null
                })}
              </div>
            ) : null}
          </SettingsSection>
        </>
      )}
    </section>
  )
}
