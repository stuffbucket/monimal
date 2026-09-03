import type { ReactElement } from 'react'

import { Note, StatusChip, Tag } from 'stuffbucket-electron/renderer'

import { statusLabel, type RunStatus } from '../workspace/model'
import type { ProjectRollup } from './derive'

// Per-project rollups. Rows in one list, not a card per project — the same
// "no grid of similar rectangles" reasoning as StatusTotals. Each status
// count is real text (`"2 running"`) inside a `StatusChip`, so the breakdown
// reads correctly with color turned off entirely, and the colour it does have
// comes from ../theme.ts's one `--shell-status` mapping rather than from four
// per-state rules of this surface's own.

const STATUS_ORDER: readonly RunStatus[] = ['running', 'needs-approval', 'done', 'failed']

interface ProjectRollupsProps {
  rollups: readonly ProjectRollup[]
}

export function ProjectRollups({ rollups }: ProjectRollupsProps): ReactElement {
  if (rollups.length === 0) {
    return <Note>No projects yet.</Note>
  }

  return (
    <ul className="dashboard-rows" aria-label="Runs by project">
      {rollups.map(({ project, counts }) => {
        const nonZero = STATUS_ORDER.filter((status) => counts[status] > 0)
        return (
          <li className="dashboard-row" key={project.id}>
            <span className="dashboard-row__name">{project.name}</span>
            <span className="dashboard-row__counts">
              {nonZero.length === 0 ? (
                // `Tag`, not a `StatusChip` with some "none" status: an empty
                // project is not in a state, it has nothing to be in one.
                <Tag>No runs</Tag>
              ) : (
                nonZero.map((status) => (
                  <StatusChip
                    key={status}
                    status={status}
                    label={`${String(counts[status])} ${statusLabel[status].toLowerCase()}`}
                  />
                ))
              )}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
