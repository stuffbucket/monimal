/**
 * The views over the fake fleet.
 *
 * The rows themselves live in `runs.ts`. This module is the only thing the
 * fixture's components import for navigation state.
 */

import {
  PROJECTS,
  RUNS,
  STATUS_LABELS,
  type AgentRun,
  type RunStatus,
} from './runs.js';

/* ---------------------------------------------------------- the left nav */

/** A view id is `all`, `project:<name>`, or `status:<status>`. */
export type DemoViewId = string;

export const DEFAULT_VIEW: DemoViewId = 'all';

export interface DemoNavEntry {
  id: DemoViewId;
  label: string;
  count: number;
  /** Drives the status dot. Absent on an entry that is not a status bucket. */
  status?: RunStatus;
}

export interface DemoNavSection {
  id: string;
  label: string;
  items: DemoNavEntry[];
}

function countBy(status: RunStatus): number {
  return RUNS.filter((run) => run.status === status).length;
}

export const NAV_SECTIONS: DemoNavSection[] = [
  {
    id: 'projects',
    label: 'Projects',
    items: PROJECTS.map((project) => ({
      id: `project:${project}`,
      label: project,
      count: RUNS.filter((run) => run.project === project).length,
    })),
  },
  {
    id: 'agents',
    label: 'Agents',
    items: [
      { id: 'all', label: 'All runs', count: RUNS.length },
      ...(['running', 'blocked', 'done', 'failed'] as RunStatus[]).map(
        (status) => ({
          id: `status:${status}`,
          label: STATUS_LABELS[status],
          count: countBy(status),
          status,
        }),
      ),
    ],
  },
];

export function runsFor(view: DemoViewId): AgentRun[] {
  if (view.startsWith('project:')) {
    const project = view.slice('project:'.length);
    return RUNS.filter((run) => run.project === project);
  }
  if (view.startsWith('status:')) {
    const status = view.slice('status:'.length);
    return RUNS.filter((run) => run.status === status);
  }
  return RUNS;
}

export function viewLabel(view: DemoViewId): string {
  for (const section of NAV_SECTIONS) {
    for (const entry of section.items) {
      if (entry.id === view) return entry.label;
    }
  }
  return 'All runs';
}
