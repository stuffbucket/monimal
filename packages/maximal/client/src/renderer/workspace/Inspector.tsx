import type { ReactElement } from 'react'

import { StatusBadge } from './RunCard'
import { type AgentRun, formatElapsed } from './model'

// Presentational only — no data fetching. Renders into the shell's right
// inspector: properties for a selected run, and an empty state when nothing
// is selected.

interface ToolCallRow {
  key: 'read' | 'edit' | 'bash'
  label: string
}

const TOOL_CALL_ROWS: readonly ToolCallRow[] = [
  { key: 'read', label: 'Read' },
  { key: 'edit', label: 'Edit' },
  { key: 'bash', label: 'Bash' },
]

interface DetailRow {
  label: string
  value: ReactElement | string
}

function buildDetailRows(run: AgentRun): DetailRow[] {
  return [
    { label: 'Project', value: run.project },
    { label: 'Branch', value: <span className="mono">{run.branch}</span> },
    { label: 'Model', value: <span className="mono">{run.model}</span> },
    { label: 'Elapsed', value: formatElapsed(run.elapsedMs) },
    { label: 'Tokens', value: run.tokens.toLocaleString() },
    {
      label: 'Diff',
      value: (
        <>
          <span className="run-inspector__diff-added">{`+${run.diff.added}`}</span>{' '}
          <span className="run-inspector__diff-removed">{`−${run.diff.removed}`}</span>
        </>
      ),
    },
  ]
}

interface InspectorProps {
  run: AgentRun | null
}

// Cohesive presentational panel; splitting fragments tightly-coupled JSX.
export function Inspector({ run }: InspectorProps): ReactElement {
  if (!run) {
    return (
      <aside className="run-inspector">
        <h2 className="run-inspector__eyebrow">Fleet</h2>
        <p className="run-inspector__empty-text">Select a run to inspect it.</p>
      </aside>
    )
  }

  const detailRows = buildDetailRows(run)
  const maxToolCalls = Math.max(run.toolCalls.read, run.toolCalls.edit, run.toolCalls.bash, 1)

  return (
    <aside className="run-inspector">
      <h2 className="run-inspector__eyebrow">Agent run</h2>
      <StatusBadge status={run.status} />
      <p className="run-inspector__title">{run.title}</p>
      <p className="run-inspector__activity">{run.activity}</p>

      <section className="run-inspector__section" aria-labelledby="inspector-details-heading">
        <h3 id="inspector-details-heading" className="run-inspector__eyebrow">
          Details
        </h3>
        <dl className="run-inspector__details">
          {detailRows.map((row) => (
            <div className="run-inspector__detail-row" key={row.label}>
              <dt className="run-inspector__detail-label">{row.label}</dt>
              <dd className="run-inspector__detail-value">{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="run-inspector__section" aria-labelledby="inspector-tool-calls-heading">
        <h3 id="inspector-tool-calls-heading" className="run-inspector__eyebrow">
          Tool calls
        </h3>
        <ul className="run-inspector__bars">
          {TOOL_CALL_ROWS.map(({ key, label }) => {
            const count = run.toolCalls[key]
            const pct = (count / maxToolCalls) * 100
            return (
              <li className="run-inspector__bar-row" key={key}>
                <span className="run-inspector__bar-label">{label}</span>
                <span className="run-inspector__bar-track" aria-hidden="true">
                  <span className="run-inspector__bar-fill" style={{ width: `${pct}%` }} />
                </span>
                {/* The count is a real text node, not just an aria-label: the
                    bar's width is decorative, never the only way the number
                    reaches a screen reader. */}
                <span className="run-inspector__bar-count">{count}</span>
              </li>
            )
          })}
        </ul>
      </section>
    </aside>
  )
}

// ---- Styles ----
//
// Injected once on import, guarded by element id. `StatusBadge` comes from
// RunCard rather than being redefined here, and importing it also runs that
// module's style injection, so `.status-badge` is present before this
// stylesheet needs it.
//
// The namespace is `run-inspector`, not `inspector`, and must stay that way.
// The package styles `.sb-shell .inspector`, `.inspector__title`,
// `.inspector__section`, `.inspector__header` and `.inspector__body` at
// specificity (0,2,0); every rule here is a bare class at (0,1,0), so a shared
// name loses silently — a losing rule is not an error. Two of those meant
// something else entirely: the package's `.inspector` is the panel container
// and paints a `border-left` this content column must not draw inside the
// frame's right panel, and its `.inspector__title` is an 11px uppercase
// eyebrow, which turned the run title below into a second eyebrow. Renaming is
// the fix rather than out-specifying: a name collision won on specificity is
// the same bug waiting for the next release.
const INSPECTOR_CSS = `
.run-inspector {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-4, 16px);
  padding: var(--shell-space-4, 16px);
  color: var(--shell-text, #f5f5f5);
}

.run-inspector__eyebrow {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--shell-text-subtle, #6a6a6a);
}

.run-inspector__empty-text {
  margin: 0;
  font-size: 13px;
  color: var(--shell-text-muted, #8a8a8a);
}

.run-inspector__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--shell-text, #f5f5f5);
}

.run-inspector__activity {
  margin: 0;
  font-size: 13px;
  color: var(--shell-text-muted, #8a8a8a);
}

.run-inspector__section {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-2, 8px);
}

.run-inspector__details {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-2, 8px);
  margin: 0;
}

.run-inspector__detail-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--shell-space-3, 12px);
}

.run-inspector__detail-label {
  margin: 0;
  font-size: 12px;
  color: var(--shell-text-subtle, #6a6a6a);
  flex: none;
}

.run-inspector__detail-value {
  margin: 0;
  font-size: 13px;
  color: var(--shell-text, #f5f5f5);
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.run-inspector__diff-added {
  color: var(--maximal-success, #22c55e);
  font-weight: 600;
}

.run-inspector__diff-removed {
  color: var(--shell-danger, #ef4444);
  font-weight: 600;
}

.run-inspector__bars {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-2, 8px);
  margin: 0;
  padding: 0;
  list-style: none;
}

.run-inspector__bar-row {
  display: grid;
  grid-template-columns: 44px 1fr auto;
  align-items: center;
  gap: var(--shell-space-2, 8px);
}

.run-inspector__bar-label {
  font-size: 12px;
  color: var(--shell-text-muted, #8a8a8a);
}

.run-inspector__bar-track {
  position: relative;
  height: 6px;
  border-radius: 9999px;
  background: var(--shell-hover, rgb(255 255 255 / 0.08));
  overflow: hidden;
}

.run-inspector__bar-fill {
  display: block;
  height: 100%;
  border-radius: 9999px;
  background: var(--shell-accent, #5198a6);
  transition: width 200ms ease-out;
}

.run-inspector__bar-count {
  min-width: 1.5em;
  font-size: 12px;
  text-align: right;
  color: var(--shell-text, #f5f5f5);
  font-variant-numeric: tabular-nums;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
}

@media (prefers-reduced-motion: reduce) {
  .run-inspector__bar-fill {
    transition-duration: 0.01ms;
  }
}
`

const INSPECTOR_STYLE_ID = 'workspace-inspector-styles'

if (typeof document !== 'undefined' && !document.getElementById(INSPECTOR_STYLE_ID)) {
  const style = document.createElement('style')
  style.id = INSPECTOR_STYLE_ID
  style.textContent = INSPECTOR_CSS
  document.head.appendChild(style)
}
