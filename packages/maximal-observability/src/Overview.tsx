import {
  Button,
  Field,
  FieldList,
  FormField,
  InspectorPanel,
  Select,
  StatusChip,
} from "@stuffbucket/maximal-electron/renderer"
import { useState } from "react"

import { TokenSeriesChart } from "./charts/TokenSeries.tsx"
import { TrafficFlowChart } from "./charts/TrafficFlow.tsx"
import {
  CONTEXT_CELL_COUNT,
  deriveContextCells,
  deriveContextSessions,
  type ContextCells,
} from "./context-window.ts"
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
  const { requestItems, requests } = useObservability()
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  )
  const sessions = deriveContextSessions(requestItems)
  const session =
    sessions.find(({ id }) => id === selectedSessionId) ?? sessions[0]

  return (
    <aside className="mo-inspector" aria-label="Context window">
      <InspectorPanel title="Context window">
        {requests.status === "loading" && (
          <p className="mo-state" role="status" aria-live="polite">
            Loading session context…
          </p>
        )}
        {requests.status === "error" && (
          <p className="mo-state" role="alert">
            Session context could not be loaded. {requests.message}
          </p>
        )}
        {requests.status === "unsupported" && (
          <p className="mo-state">
            Session context is not supported. {requests.message}
          </p>
        )}
        {(requests.status === "ready" || requests.status === "empty")
          && !session && (
            <p className="mo-state">
              No session-scoped traffic is available for these filters.
            </p>
          )}
        {session && (
          <ContextSessionInspector
            session={session}
            sessionIds={sessions.map(({ id }) => id)}
            onSelectSession={setSelectedSessionId}
          />
        )}
      </InspectorPanel>
    </aside>
  )
}

function ContextSessionInspector({
  session,
  sessionIds,
  onSelectSession,
}: {
  session: ReturnType<typeof deriveContextSessions>[number]
  sessionIds: Array<string>
  onSelectSession: (sessionId: string) => void
}) {
  const latest = session.turns.at(-1)
  if (!latest) return null
  const contextWindow = latest.context.contextWindowTokens
  const outputWindow = latest.context.requestedMaxOutputTokens
  const inputWindow =
    contextWindow === null || outputWindow === null ?
      null
    : Math.max(0, contextWindow - outputWindow)
  const model =
    latest.dispatch.resolvedModel
    ?? latest.attribution.model
    ?? latest.dispatch.requestedModel
  const full = formatPercent(latest.context.usedRatio)

  return (
    <div className="mo-context">
      <FormField label="Session">
        {(field) => (
          <Select
            {...field}
            value={session.id}
            options={sessionIds.map((id) => ({ value: id, label: id }))}
            onChange={onSelectSession}
          />
        )}
      </FormField>
      <FieldList>
        <Field label="Model" value={model ?? "Not available"} />
        <Field
          label="Context window"
          value={formatOptionalCount(contextWindow)}
        />
        <Field label="Input window" value={formatOptionalCount(inputWindow)} />
        <Field
          label="Output window"
          value={formatOptionalCount(outputWindow)}
        />
        <Field label="Full" value={full} />
      </FieldList>
      <section
        className="mo-context-map"
        aria-labelledby="mo-context-map-title"
      >
        <h3 id="mo-context-map-title">Turns</h3>
        <p className="mo-context-legend">
          <span>
            <code>I</code> input
          </span>
          <span>
            <code>O</code> output
          </span>
          <span>
            <code>.</code> available
          </span>
        </p>
        <div className="mo-context-turns">
          {session.turns.map((turn, index) => (
            <ContextTurn
              key={turn.identity.requestId}
              number={index + 1}
              request={turn}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

function ContextTurn({
  number,
  request,
}: {
  number: number
  request: ReturnType<typeof deriveContextSessions>[number]["turns"][number]
}) {
  const input = request.context.usedTokens
  const output = request.tokens?.outputTokens ?? null
  const capacity = request.context.contextWindowTokens
  const cells =
    input === null || output === null || capacity === null ?
      null
    : deriveContextCells({
        inputTokens: input,
        outputTokens: output,
        contextWindowTokens: capacity,
      })
  const label =
    `Turn ${String(number)}: ${formatOptionalCount(input)} input tokens, `
    + `${formatOptionalCount(output)} output tokens, `
    + `${formatOptionalCount(capacity)} context window`

  return (
    <div className="mo-context-turn">
      <div className="mo-context-turn-heading">
        <span>Turn {number}</span>
        <time dateTime={request.timing.acceptedAt}>
          {formatTimestamp(request.timing.acceptedAt)}
        </time>
      </div>
      {cells ?
        <div className="mo-context-cells" role="img" aria-label={label}>
          {Array.from({ length: CONTEXT_CELL_COUNT }, (_, index) => {
            const kind = cellKind(index, cells)
            return (
              <span
                key={index}
                className={`mo-context-cell mo-context-cell--${kind}`}
                aria-hidden="true"
              >
                {CELL_CHARACTERS[kind]}
              </span>
            )
          })}
        </div>
      : <p className="mo-context-unavailable">
          Token capacity is not available for this turn.
        </p>
      }
      <span className="mo-context-turn-counts">
        {formatOptionalCount(input)} in · {formatOptionalCount(output)} out
      </span>
    </div>
  )
}

function formatOptionalCount(value: number | null): string {
  return value === null ? "Not available" : formatCount(value)
}

type CellKind = "input" | "output" | "available"

const CELL_CHARACTERS: Record<CellKind, string> = {
  input: "I",
  output: "O",
  available: ".",
}

function cellKind(index: number, cells: ContextCells): CellKind {
  if (index < cells.input) return "input"
  if (index < cells.input + cells.output) return "output"
  return "available"
}

function formatPercent(value: number | null): string {
  if (value === null) return "Not available"
  const percentage = value * 100
  return `${percentage < 10 ? percentage.toFixed(1) : String(Math.round(percentage))}%`
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
