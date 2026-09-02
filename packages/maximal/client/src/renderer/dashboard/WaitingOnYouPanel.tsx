import type { ReactElement } from 'react'

import { Note } from 'stuffbucket-electron/renderer'

import { type AgentRun, formatElapsed } from '../workspace/model'

// The right-rail "waiting on you" queue — the fleet-wide default the
// reference demo's inspector shows when nothing is selected (see the
// captured stills: a "WAITING ON YOU" panel naming each blocked run and what
// it's blocked on). This is that panel's dashboard-native home: always
// visible regardless of scroll position in the main column, because it's
// the answer to "what needs me right now."
//
// Each run's blocker is its own `activity` string (e.g. "Waiting for
// approval to run: npm test") — the same text RunCard and Inspector show —
// so this queue never states a fact the rest of the UI doesn't back up. It is
// a `Note` with the run's state on it, so ../theme.ts's `--shell-status`
// mapping tints it and this surface names no colour.
//
// `data-status` on the entry does the same job for its left edge: one rule
// reading `--shell-status` instead of a hardcoded `--shell-warning` that
// would have to be duplicated the day a second kind of entry joins the queue.

interface WaitingOnYouPanelProps {
  runs: readonly AgentRun[]
}

export function WaitingOnYouPanel({ runs }: WaitingOnYouPanelProps): ReactElement {
  return (
    <aside className="dashboard-waiting" aria-label="Waiting on you">
      <h2 className="dashboard__section-heading">Waiting on you ({runs.length})</h2>
      {runs.length === 0 ? (
        <Note>Nothing needs your approval right now.</Note>
      ) : (
        <ul className="dashboard-waiting__list">
          {runs.map((run) => (
            <li className="dashboard-waiting__item" data-status="needs-approval" key={run.id}>
              <span className="dashboard-waiting__title">{run.title}</span>
              <Note>
                {run.project} · {formatElapsed(run.elapsedMs)} elapsed
              </Note>
              <Note status="needs-approval">{run.activity}</Note>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
