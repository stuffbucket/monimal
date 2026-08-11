/**
 * Types for `rulesets.mjs`.
 *
 * The scripts in this directory run under plain Node, outside the TypeScript
 * program. This declaration exists so the unit tests keep their types without
 * dragging the script into a build step.
 */

export type RulesetState = 'protected' | 'unprotected' | 'unverified';

export interface Expectation {
  name: string;
  target: string;
  refs: string[];
  rules: string[];
  why: string;
}

export interface LiveRuleset {
  name?: string;
  target?: string;
  enforcement?: string;
  conditions?: { ref_name?: { include?: string[] } };
  rules?: { type?: string }[];
  /** Absent unless the caller can read repository administration. */
  bypass_actors?: { actor_id?: number; actor_type?: string; bypass_mode?: string }[];
}

export interface Finding {
  assertion: string;
  detail: string;
}

export interface Unverified {
  assertion: string;
  reason: string;
}

export interface Assessment {
  name: string;
  why: string;
  state: RulesetState;
  findings: Finding[];
  unverified: Unverified[];
}

export interface Report {
  examinedLive: number;
  examinedExpectations: number;
  rulesets: Assessment[];
}

export declare const EXPECTED: Expectation[];
export declare function assess(live: LiveRuleset[], want: Expectation): Assessment;
export declare function evaluate(live: LiveRuleset[], expected?: Expectation[]): Report;
export declare function gutted(expected?: Expectation[]): LiveRuleset[];
export declare function selfTestFailures(expected?: Expectation[]): string[];
export declare function overallState(report: Report): RulesetState;
export declare function renderSummary(report: Report): string;
export declare function renderIssue(report: Report, repo: string): string;
export declare function renderUnreadable(repo: string, reason: string): string;
