/**
 * Types for `workflow-health.mjs`.
 *
 * The scripts in this directory run under plain Node, outside the TypeScript
 * program. This declaration exists so the unit tests keep their types without
 * dragging the script into a build step.
 */

export type WorkflowState = 'healthy' | 'failing' | 'silent' | 'never-run' | 'unreadable';

export interface Triggers {
  events: string[];
  crons: string[];
}

export interface Cadence {
  asserted: boolean;
  window?: number;
  why: string;
}

export interface Run {
  conclusion: string | null;
  createdAt: string;
}

export interface Observed {
  file: string;
  triggers: Triggers;
  runs?: Run[];
  registered?: boolean;
  unreadable?: string;
}

export interface Finding {
  assertion: string;
  detail: string;
}

export interface Assessment {
  file: string;
  state: WorkflowState;
  runsRead: number;
  conclusive: number;
  recency: Cadence;
  findings: Finding[];
  notes: string[];
}

export interface Report {
  examined: number;
  runsRead: number;
  recencyDeclined: number;
  rateDeclined: number;
  workflows: Assessment[];
}

export declare const SAMPLE: number;
export declare const MIN_SAMPLE: number;
export declare const ACTIVITY_WINDOW: number;
export declare const SCHEDULE_TOLERANCE: number;

export declare function cronInterval(expression: string): number | undefined;
export declare function triggersOf(document: unknown): Triggers;
export declare function cadence(triggers: Triggers): Cadence;
export declare function assess(observed: Observed, now?: number): Assessment;
export declare function evaluate(observed: Observed[], now?: number): Report;
export declare function broken(now?: number): (Observed & { want: WorkflowState })[];
export declare function selfTestFailures(now?: number): string[];
export declare function overallState(report: Report): 'healthy' | 'broken' | 'unverified';
export declare function renderSummary(report: Report): string;
export declare function renderIssue(report: Report, repo: string): string;
export declare function renderUnreadable(repo: string, reason: string): string;
