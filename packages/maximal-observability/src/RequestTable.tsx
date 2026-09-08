import type { TrafficRequestSummary } from "@stuffbucket/maximal-observability-contract"

import { StatusChip } from "@stuffbucket/maximal-electron/renderer"

import { formatCount, formatDuration, formatTimestamp } from "./format.ts"

function outcomeLabel(request: TrafficRequestSummary): string {
  return request.outcome ?? request.state
}

export function RequestTable({
  requests,
  selectedRequestId,
  onSelect,
  caption,
}: {
  requests: Array<TrafficRequestSummary>
  selectedRequestId?: string | null
  onSelect?: (requestId: string) => void
  caption: string
}) {
  return (
    <div className="mo-table-scroll">
      <table className="mo-request-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Request</th>
            <th scope="col">Started</th>
            <th scope="col">Client</th>
            <th scope="col">Endpoint</th>
            <th scope="col">Provider / model</th>
            <th scope="col">Outcome</th>
            <th scope="col">Duration</th>
            <th scope="col">Tokens</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((request) => {
            const id = request.identity.requestId
            const selected = id === selectedRequestId
            return (
              <tr key={id} data-selected={selected ? "true" : undefined}>
                <th scope="row">
                  {onSelect ?
                    <button
                      type="button"
                      className="mo-request-link"
                      aria-pressed={selected}
                      onClick={() => onSelect(id)}
                    >
                      {id}
                    </button>
                  : id}
                </th>
                <td>{formatTimestamp(request.timing.acceptedAt)}</td>
                <td>{request.attribution.client ?? "Unknown"}</td>
                <td>
                  <code>{request.route.operation}</code>
                </td>
                <td>
                  {request.attribution.provider ?? "Unknown"} /{" "}
                  {request.attribution.model ?? "Unknown"}
                </td>
                <td>
                  <StatusChip
                    status={outcomeLabel(request)}
                    label={outcomeLabel(request)}
                  />
                </td>
                <td>{formatDuration(request.timing.durationMs)}</td>
                <td>
                  {request.tokens ?
                    formatCount(request.tokens.totalTokens)
                  : "Not available"}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
