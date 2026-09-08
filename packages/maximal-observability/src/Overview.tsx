import {
  Button,
  Field,
  FieldList,
  InspectorPanel,
  StatusChip,
} from "@stuffbucket/maximal-electron/renderer"

import { TokenSeriesChart } from "./charts/TokenSeries.tsx"
import { TrafficFlowChart } from "./charts/TrafficFlow.tsx"
import { ObservabilityFilters } from "./Filters.tsx"
import { formatCount, formatDuration, formatTimestamp } from "./format.ts"
import { RequestTable } from "./RequestTable.tsx"
import { useObservability } from "./state.tsx"

export function OverviewRail() {
  return <ObservabilityFilters title="Overview filters" />
}

export function OverviewMain() {
  const { overview, requestItems, refresh } = useObservability()
  return (
    <main className="mo-main" aria-labelledby="mo-overview-title">
      <header className="mo-page-heading">
        <div>
          <p className="mo-eyebrow">Observability</p>
          <h1 id="mo-overview-title">Traffic overview</h1>
        </div>
        <Button size="sm" onClick={() => void refresh()}>
          Refresh
        </Button>
      </header>
      {overview.status === "loading" && (
        <p className="mo-state" role="status" aria-live="polite">
          Loading traffic overview…
        </p>
      )}
      {overview.status === "error" && (
        <ErrorState message={overview.message} onRetry={refresh} />
      )}
      {overview.status === "unsupported" && (
        <UnsupportedState message={overview.message} />
      )}
      {overview.status === "empty" && (
        <p className="mo-state">No traffic matched these filters.</p>
      )}
      {overview.status === "ready" && (
        <>
          <section className="mo-metrics" aria-label="Headline traffic metrics">
            <Metric
              label="Requests"
              value={formatCount(overview.data.totals.requests)}
            />
            <Metric
              label="Active"
              value={formatCount(overview.data.totals.active)}
            />
            <Metric
              label="Success rate"
              value={successRate(
                overview.data.totals.succeeded,
                overview.data.totals.requests,
              )}
            />
            <Metric
              label="Total tokens"
              value={formatCount(overview.data.totals.totalTokens)}
            />
            <Metric
              label="P95 duration"
              value={formatDuration(overview.data.latency.total.p95Ms)}
            />
          </section>
          <TrafficFlowChart flow={overview.data.flow} />
          <TokenSeriesChart series={overview.data.tokens} />
          <section className="mo-section" aria-labelledby="mo-recent-title">
            <header className="mo-section-heading">
              <div>
                <h2 id="mo-recent-title">Recent traffic</h2>
                <p>The latest requests in the selected range.</p>
              </div>
            </header>
            {requestItems.length > 0 ?
              <RequestTable
                requests={requestItems.slice(0, 10)}
                caption="Ten most recent requests"
              />
            : <p className="mo-state">No recent requests are available.</p>}
          </section>
        </>
      )}
    </main>
  )
}

export function OverviewInspector() {
  const { overview } = useObservability()
  return (
    <aside className="mo-inspector" aria-label="Overview details">
      <InspectorPanel title="Overview details">
        {overview.status === "ready" || overview.status === "empty" ?
          <FieldList>
            <Field
              label="Range begins"
              value={formatTimestamp(overview.data.range.from)}
            />
            <Field
              label="Range ends"
              value={formatTimestamp(overview.data.range.to)}
            />
            <Field
              label="Queue p95"
              value={formatDuration(overview.data.latency.queue.p95Ms)}
            />
            <Field
              label="First response p95"
              value={formatDuration(
                overview.data.latency.timeToFirstResponse.p95Ms,
              )}
            />
            <Field
              label="Total p99"
              value={formatDuration(overview.data.latency.total.p99Ms)}
            />
            <Field
              label="Failed"
              value={formatCount(overview.data.totals.failed)}
            />
            <Field
              label="Cancelled"
              value={formatCount(overview.data.totals.cancelled)}
            />
          </FieldList>
        : <p className="mo-state">
            Details appear when the overview is available.
          </p>
        }
      </InspectorPanel>
    </aside>
  )
}

export function OverviewStatus() {
  const { live, overview } = useObservability()
  const summary =
    overview.status === "ready" || overview.status === "empty" ?
      `${formatCount(overview.data.totals.requests)} requests · updated ${formatTimestamp(overview.data.generatedAt)}`
    : "Traffic overview unavailable"
  return (
    <div className="mo-status" role="status" aria-live="polite">
      <StatusChip
        status={live ? "live" : "paused"}
        label={live ? "Live" : "Paused"}
      />
      <span>{summary}</span>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="mo-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function successRate(succeeded: number, requests: number): string {
  if (requests === 0) return "Not available"
  return `${String(Math.round((succeeded / requests) * 100))}%`
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => Promise<void>
}) {
  return (
    <div className="mo-state" role="alert">
      <strong>Traffic could not be loaded.</strong>
      <span>{message}</span>
      <Button size="sm" onClick={() => void onRetry()}>
        Try again
      </Button>
    </div>
  )
}

function UnsupportedState({ message }: { message: string }) {
  return (
    <div className="mo-state" role="status">
      <strong>Observability is not supported.</strong>
      <span>{message}</span>
    </div>
  )
}
