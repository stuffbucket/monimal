import {
  Field,
  FieldList,
  FormField,
  Select,
} from "@stuffbucket/maximal-electron/renderer"

import {
  CONTEXT_CELL_COUNT,
  deriveContextCells,
  type ContextCells,
  type ContextSession,
} from "./context-window.ts"
import { formatCount, formatTimestamp } from "./format.ts"

export function ContextWindowSessionPanel({
  session,
  sessionIds,
  onSelectSession,
}: {
  session: ContextSession
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
      <section className="mcw-map" aria-labelledby="mcw-map-title">
        <h3 id="mcw-map-title">Turns</h3>
        <p className="mcw-legend">
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
        <div className="mcw-turns">
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
  request: ContextSession["turns"][number]
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
    <div className="mcw-turn">
      <div className="mcw-turn-heading">
        <span>Turn {number}</span>
        <time dateTime={request.timing.acceptedAt}>
          {formatTimestamp(request.timing.acceptedAt)}
        </time>
      </div>
      {cells ?
        <div className="mcw-cells" role="img" aria-label={label}>
          {Array.from({ length: CONTEXT_CELL_COUNT }, (_, index) => {
            const kind = cellKind(index, cells)
            return (
              <span
                key={index}
                className={`mcw-cell mcw-cell--${kind}`}
                aria-hidden="true"
              >
                {CELL_CHARACTERS[kind]}
              </span>
            )
          })}
        </div>
      : <p className="mcw-unavailable">
          Token capacity is not available for this turn.
        </p>
      }
      <span className="mcw-turn-counts">
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
