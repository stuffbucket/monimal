import { useCallback, useEffect, useState, type ReactElement } from 'react'

import { Button, CopyButton, Note } from 'stuffbucket-electron/renderer'

import type {
  AppsListResponse,
  ConnectorSettingField,
  ConnectorSettingValue,
  ConnectionsListResponse,
  DiagnosticsResponse,
  ModelsListResponse,
  SearchSettingsResponse,
  SettingsCapabilities,
} from './capabilities'
import { describeError } from './format'

interface DiagnosticsSectionProps {
  capabilities: SettingsCapabilities
}

interface DiagnosticsSnapshot {
  diagnostics: DiagnosticsResponse
  models: ModelsListResponse
  apps: AppsListResponse
  connections: ConnectionsListResponse
  search: SearchSettingsResponse
}

function present(value: string | number | boolean | null): string {
  if (value === null) return 'Not available'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

function formatUptime(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1_000)
  const units: Array<[string, number]> = [
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
    ['second', 1],
  ]
  const parts: string[] = []
  let remainder = seconds

  for (const [name, value] of units) {
    const amount = Math.floor(remainder / value)
    if (amount === 0) continue
    parts.push(`${amount} ${name}${amount === 1 ? '' : 's'}`)
    remainder %= value
    if (parts.length === 2) break
  }

  return parts.join(' ') || 'Less than a second'
}

function modelSummary(models: ModelsListResponse): string {
  const vendors = [...new Set(models.models.map((model) => model.vendor.trim()).filter(Boolean))]
  const description = vendors.length === 0 ? 'No providers reported' : vendors.join(', ')
  return `${models.count} cached; ${description}`
}

function configuredSearchProviders(search: SearchSettingsResponse): string {
  const providers = search.manifest.providers
    .filter((provider) => search.providers[provider.id]?.enabled)
    .map((provider) => provider.label)
  return providers.length === 0 ? 'None enabled' : providers.join(', ')
}

function formatSettingValue(value: ConnectorSettingValue): string {
  return Array.isArray(value) ? value.join(', ') : String(value)
}

function nonSecretSettings(
  fields: readonly ConnectorSettingField[],
  settings: Readonly<Record<string, ConnectorSettingValue>>,
): string[] {
  return fields.flatMap((field) => {
    if (field.type === 'secret' || settings[field.key] === undefined) return []
    return [`${field.label}: ${formatSettingValue(settings[field.key])}`]
  })
}

function configuredSearchSettings(search: SearchSettingsResponse): string {
  const settings = nonSecretSettings(search.manifest.fields, search.settings)
  for (const provider of search.manifest.providers) {
    const configured = search.providers[provider.id]
    if (!configured?.enabled) continue
    settings.push(
      ...nonSecretSettings(provider.settings ?? [], configured.settings).map(
        (setting) => `${provider.label} ${setting}`,
      ),
    )
  }
  return settings.join('; ') || 'No non-secret settings configured'
}

function copyReport(snapshot: DiagnosticsSnapshot): string {
  return JSON.stringify({
    diagnostics: snapshot.diagnostics,
    models: modelSummary(snapshot.models),
    apps: snapshot.apps.apps.map(({ name, enabled, status }) => ({
      name,
      status: enabled ? 'enabled' : status,
    })),
    connections: snapshot.connections.clients.map(({ name, status }) => ({
      name,
      status,
    })),
    require_known_keys: snapshot.connections.require_known_keys,
    search_providers: configuredSearchProviders(snapshot.search),
    search_settings: configuredSearchSettings(snapshot.search),
  }, undefined, 2)
}

export function DiagnosticsSection({
  capabilities,
}: DiagnosticsSectionProps): ReactElement {
  const [snapshot, setSnapshot] = useState<DiagnosticsSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadSnapshot = useCallback(
    async (): Promise<DiagnosticsSnapshot> => {
      const [diagnostics, models, apps, connections, search] = await Promise.all([
        capabilities.diagnostics.get(),
        capabilities.models.list(),
        capabilities.apps.list(),
        capabilities.connections.list(),
        capabilities.search.get(),
      ])
      return { diagnostics, models, apps, connections, search }
    },
    [capabilities],
  )

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setSnapshot(await loadSnapshot())
    } catch (cause) {
      setError(describeError(cause))
    } finally {
      setLoading(false)
    }
  }, [loadSnapshot])

  useEffect(() => {
    let active = true
    void loadSnapshot()
      .then((next) => {
        if (active) setSnapshot(next)
      })
      .catch((cause: unknown) => {
        if (active) setError(describeError(cause))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [loadSnapshot])

  const rows: Array<[string, string | number | boolean | null]> = snapshot
    ? [
        ['Version', snapshot.diagnostics.version],
        ['Revision', snapshot.diagnostics.source_revision],
        ['Source branch', snapshot.diagnostics.source_branch],
        ['Launch kind', snapshot.diagnostics.launch_kind],
        ['Launch path', snapshot.diagnostics.launch_path],
        ['Process ID', snapshot.diagnostics.pid],
        ['Uptime', formatUptime(snapshot.diagnostics.uptime_ms)],
        ['Account type', snapshot.diagnostics.account_type],
        ['Models', modelSummary(snapshot.models)],
        ['Configured apps', snapshot.apps.apps.map((app) => (
          `${app.name}: ${app.enabled ? 'enabled' : app.status}`
        )).join('; ') || 'None'],
        ['Client connections', snapshot.connections.clients.map((client) => (
          `${client.name}: ${client.status}`
        )).join('; ') || 'None'],
        ['Known API keys required', snapshot.connections.require_known_keys],
        ['Search providers', configuredSearchProviders(snapshot.search)],
        ['Search configuration', configuredSearchSettings(snapshot.search)],
        ['Web search mode', snapshot.diagnostics.web_search.kind],
        ['Web search detail', snapshot.diagnostics.web_search.detail],
        ['GitHub token present', snapshot.diagnostics.tokens.github_token_present],
        ['Copilot token present', snapshot.diagnostics.tokens.copilot_token_present],
        ['Copilot refresh health', snapshot.diagnostics.copilot_refresh?.health ?? null],
        ['Refresh failures', snapshot.diagnostics.copilot_refresh?.consecutive_failures ?? null],
        ['Rate-limit interval (seconds)', snapshot.diagnostics.rate_limit.interval_seconds],
        ['Wait when throttled', snapshot.diagnostics.rate_limit.wait_when_throttled],
        ['Copilot upstream', snapshot.diagnostics.copilot_service?.upstream_host ?? null],
        ['GitHub API base URL', snapshot.diagnostics.copilot_service?.github_api_base_url ?? null],
        ['Copilot token endpoint', snapshot.diagnostics.copilot_service?.token_endpoint ?? null],
        ['Enterprise domain', snapshot.diagnostics.copilot_service?.enterprise_domain ?? null],
      ]
    : []

  return (
    <section className="settings-section">
      <div className="settings-section__actions">
        {snapshot ? (
          <CopyButton
            text={copyReport(snapshot)}
            label="Copy report"
            about="the diagnostics report"
          />
        ) : null}
        <Button size="sm" onClick={() => void refresh()} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>
      <Note>
        This report includes runtime status and credential presence, never
        credential values.
      </Note>
      {error ? (
        <Note status="failed" live="assertive">
          {error}
        </Note>
      ) : snapshot === null ? (
        <Note live="polite">Loading diagnostics…</Note>
      ) : (
        <dl className="settings-details">
          {rows.map(([label, value]) => (
            <div key={label} className="settings-details__row">
              <dt>{label}</dt>
              <dd>{present(value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}
