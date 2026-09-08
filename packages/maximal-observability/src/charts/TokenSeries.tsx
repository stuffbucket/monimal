import type { TrafficTokenSeries } from "@stuffbucket/maximal-observability-contract"

import { useId } from "react"

import { deriveTokenStacks, scaleLinear } from "../derive.ts"
import { formatCount, formatTimestamp } from "../format.ts"

const SERIES = [
  { key: "uncached", label: "Uncached input" },
  { key: "cache-read", label: "Cache-read input" },
  { key: "cache-created", label: "Cache-created input" },
  { key: "output", label: "Output" },
] as const

export function TokenSeriesChart({ series }: { series: TrafficTokenSeries }) {
  const titleId = useId()
  const descriptionId = useId()
  const patternId = useId().replaceAll(":", "")
  const stacks = deriveTokenStacks(series.points).slice(-96)
  const maximum = Math.max(
    1,
    ...stacks.map(({ values }) =>
      values.reduce((sum, value) => sum + value, 0),
    ),
  )
  const plotHeight = 150
  const barWidth =
    stacks.length === 0 ? 0 : Math.max(2, Math.min(18, 680 / stacks.length - 2))
  const gap = stacks.length === 0 ? 0 : 680 / stacks.length

  return (
    <section className="mo-section" aria-labelledby={titleId}>
      <header className="mo-section-heading">
        <div>
          <h2 id={titleId}>Token volume</h2>
          <p id={descriptionId}>
            Stacked token counts over time. The chart shows at most the latest
            96 buckets.
          </p>
        </div>
      </header>
      <ul className="mo-legend" aria-label="Token series legend">
        {SERIES.map(({ key, label }, index) => (
          <li key={key}>
            <span className={`mo-legend-mark mo-series-${String(index)}`} />
            {label}
          </li>
        ))}
      </ul>
      {stacks.length === 0 ?
        <p className="mo-state">
          No token activity is available for these filters.
        </p>
      : <>
          <div className="mo-chart-scroll">
            <svg
              className="mo-token-chart"
              viewBox="0 0 720 190"
              role="img"
              aria-labelledby={`${titleId} ${descriptionId}`}
            >
              <defs>
                <pattern
                  id={patternId}
                  width="6"
                  height="6"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(45)"
                >
                  <line
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="6"
                    className="mo-pattern-line"
                  />
                </pattern>
              </defs>
              {[0, 0.5, 1].map((fraction) => (
                <g key={fraction}>
                  <line
                    className="mo-grid-line"
                    x1="32"
                    x2="712"
                    y1={12 + plotHeight * fraction}
                    y2={12 + plotHeight * fraction}
                  />
                  <text
                    className="mo-axis-label"
                    x="0"
                    y={16 + plotHeight * fraction}
                  >
                    {formatCount(Math.round(maximum * (1 - fraction)))}
                  </text>
                </g>
              ))}
              {stacks.map((stack, stackIndex) => {
                let offset = 0
                const x = 32 + stackIndex * gap + (gap - barWidth) / 2
                return (
                  <g key={stack.start} tabIndex={0}>
                    <title>{`${formatTimestamp(stack.start)}: ${formatCount(stack.total)} total tokens`}</title>
                    {stack.values.map((value, seriesIndex) => {
                      const segmentHeight = scaleLinear(
                        value,
                        maximum,
                        plotHeight,
                      )
                      const y = 12 + plotHeight - offset - segmentHeight
                      offset += segmentHeight
                      return (
                        <rect
                          key={SERIES[seriesIndex]?.key}
                          className={`mo-token-segment mo-series-${String(seriesIndex)}`}
                          x={x}
                          y={y}
                          width={barWidth}
                          height={Math.max(0, segmentHeight - 2)}
                          rx="2"
                          fill={
                            seriesIndex === 2 ? `url(#${patternId})` : undefined
                          }
                        />
                      )
                    })}
                  </g>
                )
              })}
            </svg>
          </div>
          <div className="mo-table-scroll">
            <table>
              <caption>Token counts by time bucket</caption>
              <thead>
                <tr>
                  <th scope="col">Started</th>
                  {SERIES.map(({ key, label }) => (
                    <th scope="col" key={key}>
                      {label}
                    </th>
                  ))}
                  <th scope="col">Total</th>
                </tr>
              </thead>
              <tbody>
                {stacks.map((stack) => (
                  <tr key={stack.start}>
                    <th scope="row">{formatTimestamp(stack.start)}</th>
                    {stack.values.map((value, index) => (
                      <td key={SERIES[index]?.key}>{formatCount(value)}</td>
                    ))}
                    <td>{formatCount(stack.total)}</td>
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
