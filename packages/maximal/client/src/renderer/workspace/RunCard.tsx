import type { ReactElement } from 'react'

import { Card, StatusChip, Tag } from 'stuffbucket-electron/renderer'

import { type AgentRun, statusLabel, formatElapsed } from './model'

// Presentational only — no data fetching.
//
// The card itself is the package's `Card`: a `role="option"` tile with the
// border, the fill, the hover, the selected ring and the focus outline already
// on it. What is left below is the arrangement of this application's own
// content inside it, and the two colours the package has no name for.
//
// `StatusBadge` used to live here and is gone. It was a bordered pill with a
// coloured dot and four `.is-*` colour rules; `StatusChip` is the same pill,
// and theme.ts maps `data-status` to `--shell-status` application-wide, so the
// colour needs no rule at any call site. The text still carries the status —
// colour is reinforcement, never the only channel.

interface RunCardProps {
  run: AgentRun
  selected: boolean
  onSelect: (id: string) => void
}

// Cohesive presentational card; splitting fragments tightly-coupled JSX.
export function RunCard({ run, selected, onSelect }: RunCardProps): ReactElement {
  return (
    // `status` publishes `--shell-status` and `--shell-status-muted` to
    // everything inside the tile, which is how the chip below colours itself
    // with no rule of its own. `role="option"`, `aria-selected` and the tab
    // stop are `Card`'s and `Canvas`'s — this file no longer states any of
    // them, and can no longer state them wrongly.
    <Card
      modifier="run-card"
      selected={selected}
      onSelect={() => onSelect(run.id)}
      status={run.status}
      testId={`run-card-${run.id}`}
    >
      <span className="run-card__head">
        <StatusChip status={run.status} label={statusLabel[run.status]} />
        <span className="run-card__elapsed">{formatElapsed(run.elapsedMs)}</span>
      </span>

      <span className="card__name">{run.title}</span>

      <span className="card__sub">
        {run.project}
        {' · '}
        {run.branch}
      </span>

      <span className="card__sub card__sub--wrap">{run.activity}</span>

      <span className="run-card__footer">
        {/* A model name is a property of the run, true in every state it can
            be in, which is exactly what `Tag` is for and what `StatusChip` is
            not. */}
        <Tag>{run.model}</Tag>
        <span className="run-card__diff">
          <span className="run-card__diff-added">{`+${run.diff.added}`}</span>{' '}
          <span className="run-card__diff-removed">{`−${run.diff.removed}`}</span>
        </span>
      </span>
    </Card>
  )
}

// ---- Styles ----
//
// What is left after `Card`, `StatusChip` and `Tag` took the rest: one padding
// override, one row layout the package publishes no primitive for, and the two
// numbers.
//
// A colour the package has no name for takes this application's own prefix
// rather than the package's. The package publishes `--shell-danger` and no
// success, so diff-added reads `--maximal-success`, defined in `theme.ts`
// beside the rest of the application's palette. `eslint/shell-contract.mjs` is
// what keeps that distinction.
const RUN_CARD_CSS = `
/*
 * .sb-shell .card is padding: 0, so a caller can draw a full-bleed thumbnail
 * above a padded .card__meta. This card is all text and wants one padded box,
 * which is what Card's own \`modifier\` prop is for.
 *
 * One class is enough, and that is not luck. Every rule the package ships is
 * inside \`@layer sb-shell.base\`, and an unlayered rule beats a layered one
 * whatever its specificity, so this stylesheet -- which is appended to head
 * with no layer -- wins against .sb-shell .card without chaining a second
 * class to out-specify it.
 */
.run-card {
  padding: var(--shell-space-3, 12px);
}

/*
 * A line with something at each end. The package has no layout row to reach
 * for: its \`Row\` is a selectable tile, and the growing spacer that \`Toolbar\`
 * and \`Banner\` use is private to them.
 */
.run-card__head,
.run-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--shell-space-2, 8px);
}

.run-card__elapsed {
  font-size: var(--shell-text-xs, 11px);
  color: var(--shell-text-subtle, #6a6a6a);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.run-card__diff {
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.run-card__diff-added {
  color: var(--maximal-success, #22c55e);
}

.run-card__diff-removed {
  color: var(--shell-danger, #ef4444);
}
`

const RUN_CARD_STYLE_ID = 'workspace-run-card-styles'

if (typeof document !== 'undefined' && !document.getElementById(RUN_CARD_STYLE_ID)) {
  const style = document.createElement('style')
  style.id = RUN_CARD_STYLE_ID
  style.textContent = RUN_CARD_CSS
  document.head.appendChild(style)
}
