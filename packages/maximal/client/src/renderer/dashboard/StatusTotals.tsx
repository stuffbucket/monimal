import type { ReactElement } from 'react'

import { StatusChip, Tag } from 'stuffbucket-electron/renderer'

import { statusLabel, type RunStatus } from '../workspace/model'

// Fleet-wide status totals. A row of real numbers, not a bar chart and not a
// grid of bordered tiles — docs/design/failure-modes.md's "page reads as a
// grid of similar rectangles" warning generalizes past the Tauri shell it's
// written for, and four same-sized boxes in a row is exactly that shape.
//
// Status is never color-alone here: the status word ("Running", "Needs
// approval", ...) is real text inside the pill, and it is the thing a screen
// reader — or a monochrome display — actually gets.
//
// The pill is `StatusChip`, which reads its colour from `--shell-status`, and
// ../theme.ts maps that once for the whole application. That replaced a
// hand-drawn dot plus four per-state colour rules, one for each state, which
// is the shape of rule a new state has to be added to. `Tag` for "All runs"
// rather than a fifth chip: `Tag` is documented as a label on a value and
// `StatusChip` as a state, and "all" is not a state a run can be in.

const STATUS_ORDER: readonly RunStatus[] = ['running', 'needs-approval', 'done', 'failed']

interface StatusTotalsProps {
  counts: Record<RunStatus, number> & { all: number }
}

export function StatusTotals({ counts }: StatusTotalsProps): ReactElement {
  return (
    <ul className="dashboard-totals" aria-label="Run status totals">
      <li className="dashboard-totals__item">
        <span className="dashboard-totals__figure">{counts.all}</span>
        <Tag>All runs</Tag>
      </li>
      {STATUS_ORDER.map((status) => (
        <li className="dashboard-totals__item" key={status}>
          <span className="dashboard-totals__figure">{counts[status]}</span>
          <StatusChip status={status} label={statusLabel[status]} />
        </li>
      ))}
    </ul>
  )
}
