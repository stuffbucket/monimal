import type { TrafficFlow } from "@stuffbucket/maximal-observability-contract"

import { useId, useState } from "react"

import { deriveDisplayFlow, scaleLinear, type FlowMeasure } from "../derive.ts"
import { formatCount, formatDuration } from "../format.ts"

const KIND_LABELS = {
  client: "Client",
  route: "Route",
  provider: "Provider",
  model: "Model",
  outcome: "Outcome",
} as const

export function TrafficFlowChart({ flow }: { flow: TrafficFlow }) {
  const [measure, setMeasure] = useState<FlowMeasure>("requests")
  const titleId = useId()
  const descriptionId = useId()
  const display = deriveDisplayFlow(flow, measure)
  const maximum = Math.max(
    1,
    ...display.edges.map((edge) =>
      measure === "requests" ? edge.requestCount : edge.totalTokens,
    ),
  )
  const byId = new Map(display.nodes.map((node) => [node.id, node]))
  const height = Math.max(
    210,
    ...display.nodes.map((node) => node.y + node.height + 16),
  )

  return (
    <section className="mo-section" aria-labelledby={titleId}>
      <header className="mo-section-heading">
        <div>
          <h2 id={titleId}>Traffic flow</h2>
          <p id={descriptionId}>
            Requests move from client to route, provider, model, and outcome.
          </p>
        </div>
        <div
          className="mo-segmented"
          role="group"
          aria-label="Traffic flow measure"
        >
          <button
            type="button"
            aria-pressed={measure === "requests"}
            onClick={() => setMeasure("requests")}
          >
            Requests
          </button>
          <button
            type="button"
            aria-pressed={measure === "tokens"}
            onClick={() => setMeasure("tokens")}
          >
            Tokens
          </button>
        </div>
      </header>
      {display.nodes.length === 0 ?
        <p className="mo-state">No flow data is available for these filters.</p>
      : <>
          <div className="mo-chart-scroll">
            <svg
              className="mo-flow-chart"
              viewBox={`0 0 792 ${String(height)}`}
              role="img"
              aria-labelledby={`${titleId} ${descriptionId}`}
            >
              {display.edges.map((edge) => {
                const source = byId.get(edge.source)
                const target = byId.get(edge.target)
                if (!source || !target) return null
                const value =
                  measure === "requests" ? edge.requestCount : edge.totalTokens
                const startX = source.x + source.width
                const startY = source.y + source.height / 2
                const endX = target.x
                const endY = target.y + target.height / 2
                const middle = (startX + endX) / 2
                return (
                  <path
                    key={`${edge.source}-${edge.target}`}
                    className="mo-flow-edge"
                    d={`M ${String(startX)} ${String(startY)} C ${String(middle)} ${String(startY)}, ${String(middle)} ${String(endY)}, ${String(endX)} ${String(endY)}`}
                    strokeWidth={2 + scaleLinear(value, maximum, 8)}
                  >
                    <title>{`${source.label} to ${target.label}: ${formatCount(value)} ${measure}`}</title>
                  </path>
                )
              })}
              {display.nodes.map((node) => (
                <g key={node.id} className="mo-flow-node" tabIndex={0}>
                  <title>{`${KIND_LABELS[node.kind]} ${node.label}: ${formatCount(nodeValue(node, measure))} ${measure}`}</title>
                  <rect
                    x={node.x}
                    y={node.y}
                    width={node.width}
                    height={node.height}
                    rx={4}
                  />
                  <text x={node.x + 8} y={node.y + 17}>
                    {truncate(node.label)}
                  </text>
                </g>
              ))}
              {Object.entries(KIND_LABELS).map(([kind, label], index) => (
                <text
                  key={kind}
                  className="mo-flow-column-label"
                  x={index * 170}
                  y={10}
                >
                  {label}
                </text>
              ))}
            </svg>
          </div>
          <div className="mo-table-scroll">
            <table>
              <caption>Traffic flow connections by {measure}</caption>
              <thead>
                <tr>
                  <th scope="col">From</th>
                  <th scope="col">To</th>
                  <th scope="col">Requests</th>
                  <th scope="col">Tokens</th>
                  <th scope="col">Average duration</th>
                </tr>
              </thead>
              <tbody>
                {display.edges.map((edge) => (
                  <tr key={`${edge.source}-${edge.target}`}>
                    <th scope="row">{byId.get(edge.source)?.label}</th>
                    <td>{byId.get(edge.target)?.label}</td>
                    <td>{formatCount(edge.requestCount)}</td>
                    <td>{formatCount(edge.totalTokens)}</td>
                    <td>{formatDuration(edge.averageDurationMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      }
    </section>
  )
}

function nodeValue(
  node: { requestCount: number; totalTokens: number },
  measure: FlowMeasure,
): number {
  return measure === "requests" ? node.requestCount : node.totalTokens
}

function truncate(value: string): string {
  return value.length > 16 ? `${value.slice(0, 15)}…` : value
}
