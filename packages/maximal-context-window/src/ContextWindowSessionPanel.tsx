import { FormField, Select } from "@stuffbucket/maximal-electron/renderer"
import { useState } from "react"

import {
  deriveContextGrid,
  deriveTurnComposition,
  type ContextGrid,
  type ContextGridCategory,
  type ContextSession,
  type TurnComposition,
} from "./context-window.ts"
import {
  formatCount,
  formatPercent,
  formatTimestamp,
  formatTokensCompact,
} from "./format.ts"

type Turn = ContextSession["turns"][number]

const CATEGORY_LABELS: Record<ContextGridCategory, string> = {
  cached: "Cached context",
  created: "New context",
  input: "Input",
  output: "Output",
  reserved: "Reserved output",
  free: "Free space",
}

export function ContextWindowSessionPanel({
  session,
  sessionIds,
  onSelectSession,
}: {
  session: ContextSession
  sessionIds: Array<string>
  onSelectSession: (sessionId: string) => void
}) {
  return (
    <div className="mcw-panel">
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
      <ContextWindowTurns key={session.id} session={session} />
    </div>
  )
}

function ContextWindowTurns({ session }: { session: ContextSession }) {
  const [selectedIndex, setSelectedIndex] = useState(
    Math.max(0, session.turns.length - 1),
  )
  const turn = session.turns[selectedIndex] ?? session.turns.at(-1)
  if (!turn) return null
  const grid = deriveContextGrid({ request: turn })
  const composition = deriveTurnComposition(turn)

  return (
    <>
      <ContextCapacitySummary turn={turn} grid={grid} />
      {session.turns.length > 1 && (
        <TurnPicker
          turns={session.turns}
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
        />
      )}
      <TurnCompositionBar turn={turn} composition={composition} />
      <ContextGridView turn={turn} grid={grid} />
    </>
  )
}

function capacityLevel(percent: number): "low" | "medium" | "high" {
  if (percent >= 85) return "high"
  if (percent >= 60) return "medium"
  return "low"
}

interface CapacitySummary {
  model: string | null
  contextWindow: number | null
  inputWindow: number | null
  outputWindow: number | null
  freeTokens: number | null
  usedTokens: number | null
  usedRatio: number | null
  percent: number
  level: "low" | "medium" | "high"
}

function deriveCapacitySummary(
  turn: Turn,
  grid: ContextGrid | null,
): CapacitySummary {
  const contextWindow = turn.context.contextWindowTokens
  const outputWindow = turn.context.requestedMaxOutputTokens
  const inputWindow =
    contextWindow === null || outputWindow === null ?
      null
    : Math.max(0, contextWindow - outputWindow)
  const model =
    turn.dispatch.resolvedModel
    ?? turn.attribution.model
    ?? turn.dispatch.requestedModel
  const freeTokens =
    grid?.segments.find((segment) => segment.category === "free")?.tokens
    ?? null
  const usedTokens =
    grid === null || freeTokens === null ?
      null
    : Math.max(0, grid.contextWindowTokens - freeTokens)
  const usedRatio =
    grid === null || usedTokens === null || grid.contextWindowTokens <= 0 ?
      null
    : usedTokens / grid.contextWindowTokens
  const percent = usedRatio === null ? 0 : Math.min(100, usedRatio * 100)
  return {
    model,
    contextWindow,
    inputWindow,
    outputWindow,
    freeTokens,
    usedTokens,
    usedRatio,
    percent,
    level: capacityLevel(percent),
  }
}

function ContextCapacitySummary({
  turn,
  grid,
}: {
  turn: Turn
  grid: ContextGrid | null
}) {
  const {
    model,
    contextWindow,
    inputWindow,
    outputWindow,
    freeTokens,
    usedTokens,
    usedRatio,
    percent,
    level,
  } = deriveCapacitySummary(turn, grid)

  const summaryLabel =
    usedRatio === null ?
      `${model ?? "Model not available"}: context capacity not available`
    : `${model ?? "Model"}: ${formatPercent(usedRatio)} full, `
      + `${formatTokensCompact(usedTokens)} of ${formatTokensCompact(contextWindow)} tokens used`

  return (
    <div className="mcw-capacity">
      <div className="mcw-capacity-heading">
        <span className="mcw-capacity-model">{model ?? "Not available"}</span>
        <span className="mcw-capacity-windows">
          Ctx {formatTokensCompact(contextWindow)} · In{" "}
          {formatTokensCompact(inputWindow)} · Out{" "}
          {formatTokensCompact(outputWindow)}
        </span>
      </div>
      <div className="mcw-capacity-bar" role="img" aria-label={summaryLabel}>
        <div
          className="mcw-capacity-fill"
          data-level={level}
          style={{ width: `${String(percent)}%` }}
        />
      </div>
      <div className="mcw-capacity-footer">
        <span>{formatPercent(usedRatio)} full</span>
        <span>
          {formatTokensCompact(usedTokens)} used ·{" "}
          {formatTokensCompact(freeTokens)} free
        </span>
      </div>
    </div>
  )
}

function TurnPicker({
  turns,
  selectedIndex,
  onSelect,
}: {
  turns: Array<Turn>
  selectedIndex: number
  onSelect: (index: number) => void
}) {
  return (
    <div
      className="mcw-turn-picker"
      role="group"
      aria-label="Select a turn to inspect"
    >
      {turns.map((turn, index) => (
        <button
          key={turn.identity.requestId}
          type="button"
          className="mcw-turn-picker-button"
          aria-pressed={index === selectedIndex}
          title={formatTimestamp(turn.timing.acceptedAt)}
          onClick={() => {
            onSelect(index)
          }}
        >
          Turn {index + 1}
        </button>
      ))}
    </div>
  )
}

/**
 * This turn's own token composition, scaled to itself rather than to the
 * context window, so a small turn stays legible instead of vanishing
 * against the full-window grid below.
 */
function TurnCompositionBar({
  turn,
  composition,
}: {
  turn: Turn
  composition: TurnComposition | null
}) {
  if (!composition) return null

  const summaryLabel = composition.segments
    .map(
      (segment) =>
        `${CATEGORY_LABELS[segment.category]}: ${formatCount(segment.tokens)} tokens`,
    )
    .join(", ")

  return (
    <div className="mcw-turn-bar">
      <h3>This turn</h3>
      <div
        className="mcw-turn-bar-track"
        role="img"
        aria-label={`This turn's own tokens: ${summaryLabel}`}
      >
        {composition.segments.map((segment) => (
          <span
            key={segment.category}
            className={`mcw-turn-bar-segment mcw-cell--${segment.category}`}
            style={{ flexGrow: segment.tokens / composition.totalTokens }}
          />
        ))}
      </div>
      <span className="mcw-turn-bar-total">
        {formatTokensCompact(composition.totalTokens)} tokens ·{" "}
        {formatTimestamp(turn.timing.acceptedAt)}
      </span>
    </div>
  )
}

function ContextGridView({
  turn,
  grid,
}: {
  turn: Turn
  grid: ContextGrid | null
}) {
  if (!grid) {
    return (
      <p className="mcw-unavailable">
        Token capacity is not available for this turn.
      </p>
    )
  }

  const summaryLabel = grid.segments
    .filter((segment) => segment.tokens > 0)
    .map(
      (segment) =>
        `${CATEGORY_LABELS[segment.category]}: ${formatCount(segment.tokens)} tokens`,
    )
    .join(", ")

  return (
    <section className="mcw-map" aria-labelledby="mcw-map-title">
      <h3 id="mcw-map-title">
        Turn{" "}
        <time dateTime={turn.timing.acceptedAt}>
          {formatTimestamp(turn.timing.acceptedAt)}
        </time>
      </h3>
      <div
        className="mcw-grid"
        role="img"
        aria-label={`Context window contents: ${summaryLabel}`}
        style={{
          gridTemplateColumns: `repeat(${String(grid.columns)}, 1fr)`,
        }}
      >
        {grid.cells.map((cell, index) => (
          <span key={index} className="mcw-cell" aria-hidden="true">
            <span className={`mcw-cell-half mcw-cell--${cell.left.category}`} />
            <span
              className={`mcw-cell-half mcw-cell--${cell.right.category}`}
            />
          </span>
        ))}
      </div>
      <ul className="mcw-legend">
        {grid.segments.map((segment) => (
          <li key={segment.category} className="mcw-legend-item">
            <span
              className={`mcw-legend-swatch mcw-cell--${segment.category}`}
              aria-hidden="true"
            />
            <span className="mcw-legend-label">
              {CATEGORY_LABELS[segment.category]}
            </span>
            <span className="mcw-legend-value">
              {formatTokensCompact(segment.tokens)} (
              {formatPercent(segment.tokens / grid.contextWindowTokens)})
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
