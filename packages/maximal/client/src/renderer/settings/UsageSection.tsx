import { useCallback, useEffect, useState, type ReactElement } from 'react'

import { Button, Note } from 'stuffbucket-electron/renderer'

import type {
  SettingsCapabilities,
  TokenUsagePeriod,
  TokenUsageSummary,
} from './capabilities'
import { describeError } from './format'

interface UsageSectionProps {
  capabilities: SettingsCapabilities
}

const PERIODS: readonly TokenUsagePeriod[] = ['day', 'week', 'month']

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value)
}

export function UsageSection({ capabilities }: UsageSectionProps): ReactElement {
  const [period, setPeriod] = useState<TokenUsagePeriod>('day')
  const [summary, setSummary] = useState<TokenUsageSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setSummary(await capabilities.usage.get(period))
    } catch (cause) {
      setError(describeError(cause))
    } finally {
      setLoading(false)
    }
  }, [capabilities, period])

  useEffect(() => {
    let active = true
    void capabilities.usage
      .get(period)
      .then((next) => {
        if (active) setSummary(next)
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
  }, [capabilities, period])

  return (
    <section className="settings-section" aria-labelledby="settings-usage-heading">
      <div className="settings-section__title-row">
        <h1 id="settings-usage-heading" className="settings-section__heading">
          Usage
        </h1>
        <div className="settings-periods" aria-label="Usage period">
          {PERIODS.map((value) => (
            <Button
              key={value}
              size="sm"
              aria-pressed={period === value}
              onClick={() => {
                setLoading(true)
                setError(null)
                setPeriod(value)
              }}
            >
              {value[0]?.toUpperCase()}{value.slice(1)}
            </Button>
          ))}
        </div>
      </div>
      {error ? (
        <div className="settings-field">
          <Note status="failed" live="assertive">
            {error}
          </Note>
          <Button onClick={() => void load()}>Try again</Button>
        </div>
      ) : loading && summary === null ? (
        <Note live="polite">Loading measured usage…</Note>
      ) : summary === null ? (
        <Note>Usage is unavailable.</Note>
      ) : (
        <>
          <dl className="settings-metrics">
            <div><dt>Requests</dt><dd>{formatNumber(summary.totals.request_count)}</dd></div>
            <div><dt>Input tokens</dt><dd>{formatNumber(summary.totals.input_tokens)}</dd></div>
            <div><dt>Output tokens</dt><dd>{formatNumber(summary.totals.output_tokens)}</dd></div>
            <div><dt>Total tokens</dt><dd>{formatNumber(summary.totals.total_tokens)}</dd></div>
          </dl>
          {summary.totals.request_count === 0 ? (
            <Note>No measured requests in this period.</Note>
          ) : null}
          <div className="settings-table-wrap" role="region" aria-label="Usage by model" tabIndex={0}>
            <table className="settings-table">
              <caption>Usage by model</caption>
              <thead><tr><th scope="col">Model</th><th scope="col" className="settings-table__number">Requests</th><th scope="col" className="settings-table__number">Tokens</th></tr></thead>
              <tbody>
                {summary.byModel.map((row) => (
                  <tr key={row.model}><th scope="row">{row.model}</th><td className="settings-table__number">{formatNumber(row.request_count)}</td><td className="settings-table__number">{formatNumber(row.total_tokens)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="settings-table-wrap" role="region" aria-label="Usage by provider" tabIndex={0}>
            <table className="settings-table">
              <caption>Usage by provider</caption>
              <thead><tr><th scope="col">Provider</th><th scope="col" className="settings-table__number">Requests</th><th scope="col" className="settings-table__number">Tokens</th></tr></thead>
              <tbody>
                {summary.byProvider.map((row) => (
                  <tr key={`${row.source}:${row.provider}`}><th scope="row">{row.provider_name ?? row.provider}</th><td className="settings-table__number">{formatNumber(row.request_count)}</td><td className="settings-table__number">{formatNumber(row.total_tokens)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
