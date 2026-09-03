import type { ReactElement } from 'react'

import { Field, FieldList, InspectorPanel, Note, StatusChip } from 'stuffbucket-electron/renderer'

import { type AgentRun, formatElapsed, statusLabel } from './model'

// Presentational only — no data fetching. Renders into the shell's right
// inspector: properties for a selected run, and an empty state when nothing
// is selected.
//
// The `.run-inspector__*` namespace is nearly gone, and both reasons it existed
// are now settled — one by a change upstream, one by this file.
//
// It was renamed out of `.inspector__*` because the package's rules for those
// names outranked this file's: `.sb-shell .inspector__title` at (0,2,0) against
// a bare `.inspector__title` at (0,1,0), probed on a live element in the
// running application, where the class computed to the package's 11px
// uppercase eyebrow and this file's 16px heading rule had never once applied.
// That was real when it was measured. It stopped being possible afterwards,
// when the package moved into `@layer sb-shell.base`: an unlayered rule beats
// a layered one whatever its specificity, so a stylesheet appended to head
// with no layer — this one — now wins such a collision rather than losing it
// silently. The rename is no longer what protects this file; the layer is.
//
// The second reason survives both, and is why composing is the real fix. The
// package's `.inspector` is a panel container and its `.inspector__title` is
// an eyebrow, so sharing those names meant inheriting rules that meant
// something else — winning the cascade with the wrong design. `InspectorPanel`
// is what the rename was standing in for: the panel chrome, the header, the
// scrolling body and the section grid are the package's now, under the
// package's names, doing the package's job.

interface ToolCallRow {
  key: 'read' | 'edit' | 'bash'
  label: string
}

const TOOL_CALL_ROWS: readonly ToolCallRow[] = [
  { key: 'read', label: 'Read' },
  { key: 'edit', label: 'Edit' },
  { key: 'bash', label: 'Bash' },
]

interface InspectorProps {
  run: AgentRun | null
}

// Cohesive presentational panel; splitting fragments tightly-coupled JSX.
export function Inspector({ run }: InspectorProps): ReactElement {
  if (!run) {
    return (
      <InspectorPanel title="Fleet" testId="run-inspector">
        <Note>Select a run to inspect it.</Note>
      </InspectorPanel>
    )
  }

  const maxToolCalls = Math.max(run.toolCalls.read, run.toolCalls.edit, run.toolCalls.bash, 1)

  return (
    <InspectorPanel title="Agent run" testId="run-inspector">
      <section className="inspector__section">
        {/* The package already keeps a chip from stretching edge to edge
            inside a section grid — `.inspector__section > .chip` — so this is
            a direct child on purpose. */}
        <StatusChip status={run.status} label={statusLabel[run.status]} />
        <p className="run-inspector__title">{run.title}</p>
        <Note>{run.activity}</Note>
      </section>

      <section className="inspector__section" aria-labelledby="inspector-details-heading">
        <h3 id="inspector-details-heading" className="inspector__title">
          Details
        </h3>
        {/*
         * `FieldList` is the `<dl>` and each `Field` a `dt`/`dd` pair inside
         * it, so a screen reader announces "Branch, main" rather than two
         * unrelated strings. The value column is already monospaced, so branch
         * and model need no font rule of their own.
         *
         * The diff row was written out by hand here, because `Field` narrowed
         * `value` to a string and this one is two differently-coloured
         * numbers. It takes a node now — that narrowing was reported from this
         * file and fixed upstream — so the last hand-written copy of `Field`'s
         * markup goes with it.
         */}
        <FieldList>
          <Field label="Project" value={run.project} />
          <Field label="Branch" value={run.branch} />
          <Field label="Model" value={run.model} />
          <Field label="Elapsed" value={formatElapsed(run.elapsedMs)} />
          <Field label="Tokens" value={run.tokens.toLocaleString()} />
          <Field
            label="Diff"
            value={
              <>
                <span className="run-inspector__diff-added">{`+${run.diff.added}`}</span>{' '}
                <span className="run-inspector__diff-removed">{`−${run.diff.removed}`}</span>
              </>
            }
          />
        </FieldList>
      </section>

      <section className="inspector__section" aria-labelledby="inspector-tool-calls-heading">
        <h3 id="inspector-tool-calls-heading" className="inspector__title">
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
    </InspectorPanel>
  )
}

// ---- Styles ----
//
// Injected once on import, guarded by element id.
//
// Three things are left, and each is one the package publishes nothing for:
// the panel's subject line, the two diff colours, and the tool-call bars. The
// eyebrow headings, the section grid, the label/value rows, the panel chrome
// and the empty state are all gone into `InspectorPanel`, `Field` and `Note`.
const INSPECTOR_CSS = `
/*
 * The panel's subject: the run's own title. Not \`.inspector__title\`, which is
 * the 11px uppercase eyebrow the section headings above use, and not
 * \`.card__name\`, which clips to one line — a run title is a sentence and has
 * to wrap. The package has no component for the line that names what a panel
 * is about.
 */
.run-inspector__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: var(--shell-leading-base, 1.35);
  color: var(--shell-text, #f5f5f5);
}

.run-inspector__diff-added {
  color: var(--maximal-success, #22c55e);
  font-weight: 600;
}

.run-inspector__diff-removed {
  color: var(--shell-danger, #ef4444);
  font-weight: 600;
}

/*
 * A small bar chart. The package publishes no meter, no progress bar and no
 * bar-chart row, so all six rules stay.
 */
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
