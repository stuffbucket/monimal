import {
  Button,
  Field,
  FieldList,
  InspectorPanel,
  StatusChip,
} from "@stuffbucket/maximal-electron/renderer"

import { ObservabilityFilters } from "./Filters.tsx"
import {
  displayValue,
  formatBytes,
  formatCount,
  formatDuration,
  formatTimestamp,
} from "./format.ts"
import { RequestTable } from "./RequestTable.tsx"
import { useObservability } from "./state.tsx"

export function TrafficExplorerRail() {
  return <ObservabilityFilters title="Traffic filters" />
}

export function TrafficExplorerMain() {
  const {
    hasMore,
    isLoadingMore,
    loadMore,
    refresh,
    requestItems,
    requests,
    selectRequest,
    selectedRequestId,
  } = useObservability()
  return (
    <main className="mo-main" aria-labelledby="mo-traffic-title">
      <header className="mo-page-heading">
        <div>
          <p className="mo-eyebrow">Observability</p>
          <h1 id="mo-traffic-title">Traffic explorer</h1>
        </div>
        <Button size="sm" onClick={() => void refresh()}>
          Refresh
        </Button>
      </header>
      {requests.status === "loading" && (
        <p className="mo-state" role="status" aria-live="polite">
          Loading request history…
        </p>
      )}
      {requests.status === "error" && (
        <div className="mo-state" role="alert">
          <strong>Request history could not be loaded.</strong>
          <span>{requests.message}</span>
          <Button size="sm" onClick={() => void refresh()}>
            Try again
          </Button>
        </div>
      )}
      {requests.status === "unsupported" && (
        <div className="mo-state" role="status">
          <strong>Request history is not supported.</strong>
          <span>{requests.message}</span>
        </div>
      )}
      {requests.status === "empty" && (
        <p className="mo-state">No requests matched these filters.</p>
      )}
      {requests.status === "ready" && (
        <section className="mo-section" aria-label="Request history">
          <RequestTable
            requests={requestItems}
            caption="Cursor-paged request history"
            selectedRequestId={selectedRequestId}
            onSelect={selectRequest}
          />
          {hasMore && (
            <div className="mo-load-more">
              <Button disabled={isLoadingMore} onClick={() => void loadMore()}>
                {isLoadingMore ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </section>
      )}
    </main>
  )
}

export function TrafficExplorerInspector() {
  const { detail, selectedRequestId, selectRequest } = useObservability()
  return (
    <aside className="mo-inspector" aria-label="Request metadata">
      <InspectorPanel title="Request metadata">
        {selectedRequestId === null && (
          <p className="mo-state">Select a request to inspect its metadata.</p>
        )}
        {detail?.status === "loading" && (
          <p className="mo-state" role="status" aria-live="polite">
            Loading request metadata…
          </p>
        )}
        {detail?.status === "error" && (
          <p className="mo-state" role="alert">
            {detail.message}
          </p>
        )}
        {detail?.status === "unsupported" && (
          <p className="mo-state">
            Request detail is not supported. {detail.message}
          </p>
        )}
        {(detail?.status === "ready" || detail?.status === "empty") && (
          <>
            <FieldList>
              <Field
                label="Request ID"
                value={detail.data.request.identity.requestId}
              />
              <Field
                label="Trace ID"
                value={displayValue(detail.data.request.identity.traceId)}
              />
              <Field
                label="Client"
                value={displayValue(detail.data.request.attribution.client)}
              />
              <Field
                label="Endpoint"
                value={`${detail.data.request.route.method} ${detail.data.request.route.path}`}
              />
              <Field
                label="Operation"
                value={detail.data.request.route.operation}
              />
              <Field
                label="Provider"
                value={displayValue(detail.data.request.attribution.provider)}
              />
              <Field
                label="Model"
                value={displayValue(detail.data.request.attribution.model)}
              />
              <Field
                label="Outcome"
                value={
                  <StatusChip
                    status={
                      detail.data.request.outcome ?? detail.data.request.state
                    }
                    label={
                      detail.data.request.outcome ?? detail.data.request.state
                    }
                  />
                }
              />
              <Field
                label="Duration"
                value={formatDuration(detail.data.request.timing.durationMs)}
              />
              <Field
                label="Tokens"
                value={
                  detail.data.request.tokens ?
                    formatCount(detail.data.request.tokens.totalTokens)
                  : "Not available"
                }
              />
              <Field
                label="Request size"
                value={formatBytes(detail.data.request.size.requestBytes)}
              />
              <Field
                label="Response size"
                value={formatBytes(detail.data.request.size.responseBytes)}
              />
              <Field
                label="Attempts"
                value={formatCount(detail.data.request.dispatch.attemptCount)}
              />
              <Field
                label="Retries"
                value={formatCount(detail.data.request.dispatch.retryCount)}
              />
            </FieldList>
            <section
              className="mo-lifecycle"
              aria-labelledby="mo-lifecycle-title"
            >
              <h3 id="mo-lifecycle-title">Lifecycle</h3>
              <ol>
                {detail.data.lifecycle.map((event) => (
                  <li key={event.sequence}>
                    <span>{event.kind}</span>
                    <time dateTime={event.at}>{formatTimestamp(event.at)}</time>
                  </li>
                ))}
              </ol>
            </section>
            <Button size="sm" onClick={() => selectRequest(null)}>
              Clear selection
            </Button>
          </>
        )}
      </InspectorPanel>
    </aside>
  )
}

export function TrafficExplorerStatus() {
  const { hasMore, live, requestItems, selectedRequestId } = useObservability()
  return (
    <div className="mo-status" role="status" aria-live="polite">
      <StatusChip
        status={live ? "live" : "paused"}
        label={live ? "Live" : "Paused"}
      />
      <span>
        {formatCount(requestItems.length)} loaded
        {hasMore ? " · more available" : ""}
        {selectedRequestId ? ` · ${selectedRequestId} selected` : ""}
      </span>
    </div>
  )
}
