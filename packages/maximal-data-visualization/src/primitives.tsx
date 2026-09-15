import { type ReactNode, useLayoutEffect, useRef, useState } from "react"

export function ChartViewport({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={["data-viz-viewport", className].filter(Boolean).join(" ")}>
      {children}
    </div>
  )
}

export interface DataVizLegendItem {
  id: string
  label: ReactNode
  swatch: ReactNode
  value?: ReactNode
}

export function DataVizLegend({
  ariaLabel,
  items,
  className,
}: {
  ariaLabel: string
  items: Array<DataVizLegendItem>
  className?: string
}) {
  return (
    <ul
      className={["data-viz-legend", className].filter(Boolean).join(" ")}
      aria-label={ariaLabel}
    >
      {items.map((item) => (
        <li key={item.id} className="data-viz-legend-item">
          <span className="data-viz-legend-swatch" aria-hidden="true">
            {item.swatch}
          </span>
          <span className="data-viz-legend-label">{item.label}</span>
          {item.value === undefined ? null : (
            <span className="data-viz-legend-value">{item.value}</span>
          )}
        </li>
      ))}
    </ul>
  )
}

export function DataVizSegmentedControl<Value extends string>({
  ariaLabel,
  value,
  options,
  onChange,
}: {
  ariaLabel: string
  value: Value
  options: Array<{ value: Value; label: string }>
  onChange: (value: Value) => void
}) {
  return (
    <div className="data-viz-segmented" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => {
            onChange(option.value)
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function DataVizMeter({
  ariaLabel,
  percent,
  tone = "accent",
}: {
  ariaLabel: string
  percent: number
  tone?: "accent" | "warning" | "danger"
}) {
  return (
    <div className="data-viz-meter" role="img" aria-label={ariaLabel}>
      <span
        className="data-viz-meter-fill"
        data-tone={tone}
        style={{ width: `${String(Math.min(100, Math.max(0, percent)))}%` }}
      />
    </div>
  )
}

export interface DataVizTooltipState {
  text: string
  anchorTop: number
  anchorCenter: number
}

export function useDataVizTooltip() {
  const [tooltip, setTooltip] = useState<DataVizTooltipState | null>(null)
  const show = (event: { currentTarget: HTMLElement }, text: string) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setTooltip({
      text,
      anchorTop: rect.top,
      anchorCenter: rect.left + rect.width / 2,
    })
  }
  const hide = () => {
    setTooltip(null)
  }
  return { tooltip, show, hide }
}

export function DataVizTooltip({
  text,
  anchorTop,
  anchorCenter,
}: DataVizTooltipState) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({
    top: anchorTop,
    left: anchorCenter,
  })

  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const { width, height } = node.getBoundingClientRect()
    const margin = 4
    const gap = 6
    setPosition({
      left: Math.min(
        Math.max(anchorCenter - width / 2, margin),
        window.innerWidth - width - margin,
      ),
      top: Math.max(anchorTop - height - gap, margin),
    })
  }, [text, anchorTop, anchorCenter])

  return (
    <div
      ref={ref}
      className="data-viz-tooltip"
      role="tooltip"
      style={{ top: position.top, left: position.left }}
    >
      {text}
    </div>
  )
}
