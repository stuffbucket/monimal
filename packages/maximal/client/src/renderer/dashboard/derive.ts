import { type AgentRun, type Project, type RunStatus, type WorkspaceSnapshot } from '../workspace/model'
import { deriveStatusCounts, runsForProject } from '../workspace/source'

// Pure aggregation over a WorkspaceSnapshot. Nothing here touches React or
// the DOM, so each function is testable without a component tree.

/**
 * Runs blocked on the person at the keyboard: the "waiting on you" queue.
 * Snapshot order is preserved. `AgentRun` carries no priority, so imposing an
 * order here would imply a signal the data does not have.
 */
export function selectWaitingOnYou(snapshot: WorkspaceSnapshot): AgentRun[] {
  return snapshot.runs.filter((run) => run.status === 'needs-approval')
}

export interface ProjectRollup {
  project: Project
  counts: Record<RunStatus, number> & { all: number }
}

/**
 * Per-project status breakdown, in the same order as `snapshot.projects`.
 * Counts are derived from the runs themselves, never read from
 * `project.runCount`, so a rollup cannot drift from what it describes.
 */
export function deriveProjectRollups(snapshot: WorkspaceSnapshot): ProjectRollup[] {
  return snapshot.projects.map((project) => {
    const runs = runsForProject(snapshot.runs, project.name)
    return {
      project,
      counts: deriveStatusCounts({ projects: snapshot.projects, runs }),
    }
  })
}

export interface FinishedRuns {
  done: AgentRun[]
  failed: AgentRun[]
}

/**
 * Orders two finished runs most-recently-finished first. A finished run
 * missing `finishedAt` sorts to the back rather than masquerading as the most
 * recent entry. Ties fall back to `id`, so the order is total and stable
 * rather than depending on the sort's behaviour for equal keys.
 */
function byMostRecentlyFinished(a: AgentRun, b: AgentRun): number {
  const aFinishedAt = a.finishedAt ?? -Infinity
  const bFinishedAt = b.finishedAt ?? -Infinity
  if (aFinishedAt !== bFinishedAt) return bFinishedAt - aFinishedAt
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Finished runs, split by outcome so "done" and "failed" are never merged
 * into one undifferentiated "finished" pile, and ordered most-recently-
 * finished first within each list.
 */
export function selectRecentlyFinished(snapshot: WorkspaceSnapshot): FinishedRuns {
  const done: AgentRun[] = []
  const failed: AgentRun[] = []
  for (const run of snapshot.runs) {
    if (run.status === 'done') done.push(run)
    else if (run.status === 'failed') failed.push(run)
  }
  return { done: done.sort(byMostRecentlyFinished), failed: failed.sort(byMostRecentlyFinished) }
}

export { deriveStatusCounts }
