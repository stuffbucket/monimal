import { useCallback, useEffect, useState, type ReactElement } from 'react'

import {
  Button,
  CopyButton,
  Field,
  FieldList,
  Note,
  SettingsGroup,
  SettingsItem,
  SettingsSection,
} from 'stuffbucket-electron/renderer'

import type {
  DiagnosticsResponse,
  SettingsCapabilities,
} from './capabilities'
import { describeError } from './format'

interface DiagnosticsSectionProps {
  capabilities: SettingsCapabilities
}

function present(value: string | number | boolean | null): string {
  if (value === null) return 'Not available'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

export function DiagnosticsSection({
  capabilities,
}: DiagnosticsSectionProps): ReactElement {
  const [report, setReport] = useState<DiagnosticsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setReport(await capabilities.diagnostics.get())
    } catch (cause) {
      setError(describeError(cause))
    } finally {
      setLoading(false)
    }
  }, [capabilities])

  useEffect(() => {
    let active = true
    void capabilities.diagnostics
      .get()
      .then((next) => {
        if (active) setReport(next)
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
  }, [capabilities])

  const rows: Array<[string, string | number | boolean | null]> = report
    ? [
        ['Version', report.version],
        ['Revision', report.source_revision],
        ['Launch kind', report.launch_kind],
        ['Process ID', report.pid],
        ['Uptime (ms)', report.uptime_ms],
        ['Account type', report.account_type],
        ['Models cached', report.models_cached],
        ['GitHub token present', report.tokens.github_token_present],
        ['Copilot token present', report.tokens.copilot_token_present],
        ['Refresh health', report.copilot_refresh?.health ?? null],
        ['Web search', report.web_search.kind],
      ]
    : []

  return (
    <section className="settings-section">
      <SettingsSection
        title="Runtime diagnostics"
        description="This report includes runtime status and credential presence, never credential values."
      >
        <SettingsGroup>
          <SettingsItem
            title="Diagnostic report"
            description={report ? 'Current runtime information.' : 'Loading diagnostics…'}
            actions={
              <>
                {report ? (
                  <CopyButton
                    text={JSON.stringify(report, undefined, 2)}
                    label="Copy report"
                    about="the diagnostics report"
                  />
                ) : null}
                <Button size="sm" onClick={() => void refresh()} disabled={loading}>
                  {loading ? 'Refreshing…' : 'Refresh'}
                </Button>
              </>
            }
          >
            {error ? (
              <Note status="failed" live="assertive">
                {error}
              </Note>
            ) : report ? (
              <FieldList>
                {rows.map(([label, value]) => (
                  <Field key={label} label={label} value={present(value)} />
                ))}
              </FieldList>
            ) : null}
          </SettingsItem>
        </SettingsGroup>
      </SettingsSection>
    </section>
  )
}
