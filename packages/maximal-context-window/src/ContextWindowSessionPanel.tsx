import {
  DataVizLegend,
  DataVizMeter,
  DataVizTooltip,
  useDataVizTooltip,
} from "@stuffbucket/maximal-data-visualization"
import { FormField, Select } from "@stuffbucket/maximal-electron/renderer"
import { useState } from "react"

import {
  deriveContextGrid,
  deriveTurnComposition,
  type ContextGrid,
  type ContextGridCategory,
  type ContextGridSegment,
  type ContextInputSegment,
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
  system: "System prompt",
  tools: "Tool definitions",
  mcp: "MCP definitions",
  skills: "Skills",
  userInput: "User input",
  other: "Other content",
  output: "Output",
  reserved: "Reserved output",
  free: "Free space",
}

/** Describes a segment's tokens for an aria-label, noting the cached
 * portion as an attribute of the category rather than a category of its
 * own. */
function segmentDescription(segment: {
  category: ContextGridCategory
  tokens: number
  cachedTokens: number
}): string {
  const cachedNote =
    segment.cachedTokens > 0 ?
      `, ${formatCount(segment.cachedTokens)} cached`
    : ""
  return `${CATEGORY_LABELS[segment.category]}: ${formatCount(segment.tokens)} tokens${cachedNote}`
}

/** Splits a segment's tokens into its cached and new (freshly processed)
 * parts, in that order -- cached content is the earlier, already
 * -processed part of a category, so it renders first within it. */
function cachedThenNew(
  segment: ContextGridSegment,
): Array<{ cached: boolean; tokens: number }> {
  return [
    { cached: true, tokens: segment.cachedTokens },
    { cached: false, tokens: segment.tokens - segment.cachedTokens },
  ].filter((part) => part.tokens > 0)
}

/** Hover text for one rendered piece (a grid cell half, turn-bar segment,
 * or legend swatch part). The grid and turn bar are each already
 * accessibly labeled as a whole via their `aria-label`, so this is a
 * mouse-hover convenience -- it tells a sighted user which category and
 * how many tokens *this specific piece* represents, since a single cell
 * or segment can't show that on its own the way the legend's text can. */
function pieceTitle(piece: {
  category: ContextGridCategory
  cached: boolean
  tokens: number
}): string {
  const cachedNote = piece.cached ? " (cached)" : ""
  return `${CATEGORY_LABELS[piece.category]}: ${formatCount(piece.tokens)} tokens${cachedNote}`
}

export function ContextWindowSessionPanel({
  session,
  sessionIds,
  onSelectSession,
  inputSegmentsFor,
}: {
  session: ContextSession
  sessionIds: Array<string>
  onSelectSession: (sessionId: string) => void
  /** Breaks a turn's input down into explicit content categories (system,
   * tools, MCP, skills, user input) when the caller can attribute its own
   * prompt. Omit to fall back to a single, honestly undifferentiated
   * "other" bucket -- the observability contract does not report this
   * breakdown for real traffic. */
  inputSegmentsFor?:
    ((turn: Turn) => Array<ContextInputSegment> | undefined) | undefined
}) {
  return (
    <div className="mcw-panel data-viz-root">
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
      <ContextWindowTurns
        key={session.id}
        session={session}
        inputSegmentsFor={inputSegmentsFor}
      />
    </div>
  )
}

function ContextWindowTurns({
  session,
  inputSegmentsFor,
}: {
  session: ContextSession
  inputSegmentsFor?:
    ((turn: Turn) => Array<ContextInputSegment> | undefined) | undefined
}) {
  const [selectedIndex, setSelectedIndex] = useState(
    Math.max(0, session.turns.length - 1),
  )
  const { tooltip, show, hide } = useDataVizTooltip()
  const turn = session.turns[selectedIndex] ?? session.turns.at(-1)
  if (!turn) return null
  const inputSegments = inputSegmentsFor?.(turn)
  const grid = deriveContextGrid({ request: turn, inputSegments })
  const composition = deriveTurnComposition(turn, inputSegments)

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
      <TurnCompositionBar
        turn={turn}
        composition={composition}
        onHoverPiece={show}
        onHoverEnd={hide}
      />
      <ContextGridView
        turn={turn}
        grid={grid}
        onHoverPiece={show}
        onHoverEnd={hide}
      />
      {tooltip && <DataVizTooltip {...tooltip} />}
    </>
  )
}

function capacityLevel(percent: number): "low" | "medium" | "high" {
  if (percent >= 85) return "high"
  if (percent >= 60) return "medium"
  return "low"
}

function capacityTone(
  level: "low" | "medium" | "high",
): "accent" | "warning" | "danger" {
  if (level === "high") return "danger"
  if (level === "medium") return "warning"
  return "accent"
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
      <DataVizMeter
        ariaLabel={summaryLabel}
        percent={percent}
        tone={capacityTone(level)}
      />
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
 * against the full-window grid below. Each category renders as one
 * contiguous colored span, with its cached portion (if any) textured
 * rather than given a different color.
 */
function TurnCompositionBar({
  turn,
  composition,
  onHoverPiece,
  onHoverEnd,
}: {
  turn: Turn
  composition: TurnComposition | null
  onHoverPiece: (event: { currentTarget: HTMLElement }, text: string) => void
  onHoverEnd: () => void
}) {
  if (!composition) return null

  const summaryLabel = composition.segments
    .map((segment) => segmentDescription(segment))
    .join(", ")

  return (
    <div className="mcw-turn-bar">
      <h3>This turn</h3>
      <div
        className="mcw-turn-bar-track"
        role="img"
        aria-label={`This turn's own tokens: ${summaryLabel}`}
      >
        {composition.segments.flatMap((segment) =>
          cachedThenNew(segment).map((part) => (
            <span
              key={`${segment.category}-${part.cached ? "cached" : "new"}`}
              className={`mcw-turn-bar-segment mcw-cell--${segment.category}`}
              data-cached={part.cached || undefined}
              onMouseEnter={(event) => {
                onHoverPiece(
                  event,
                  pieceTitle({ category: segment.category, ...part }),
                )
              }}
              onMouseLeave={onHoverEnd}
              style={{ flexGrow: part.tokens / composition.totalTokens }}
            />
          )),
        )}
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
  onHoverPiece,
  onHoverEnd,
}: {
  turn: Turn
  grid: ContextGrid | null
  onHoverPiece: (event: { currentTarget: HTMLElement }, text: string) => void
  onHoverEnd: () => void
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
    .map((segment) => segmentDescription(segment))
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
            <span
              className={`mcw-cell-half mcw-cell--${cell.left.category}`}
              data-cached={cell.left.cached || undefined}
              onMouseEnter={(event) => {
                onHoverPiece(event, pieceTitle(cell.left))
              }}
              onMouseLeave={onHoverEnd}
            />
            <span
              className={`mcw-cell-half mcw-cell--${cell.right.category}`}
              data-cached={cell.right.cached || undefined}
              onMouseEnter={(event) => {
                onHoverPiece(event, pieceTitle(cell.right))
              }}
              onMouseLeave={onHoverEnd}
            />
          </span>
        ))}
      </div>
      <DataVizLegend
        ariaLabel="Context window legend"
        className="mcw-legend"
        items={grid.segments
          .filter((segment) => segment.tokens > 0)
          .map((segment) => ({
            id: segment.category,
            label: CATEGORY_LABELS[segment.category],
            value: (
              <>
                {formatTokensCompact(segment.tokens)} (
                {formatPercent(segment.tokens / grid.contextWindowTokens)})
              </>
            ),
            swatch: cachedThenNew(segment).map((part) => (
              <span
                key={part.cached ? "cached" : "new"}
                className={`mcw-legend-swatch-part mcw-cell--${segment.category}`}
                data-cached={part.cached || undefined}
                onMouseEnter={(event) => {
                  onHoverPiece(
                    event,
                    pieceTitle({ category: segment.category, ...part }),
                  )
                }}
                onMouseLeave={onHoverEnd}
                style={{ flexGrow: part.tokens }}
              />
            )),
          }))}
      />
    </section>
  )
}
