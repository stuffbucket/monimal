/**
 * Types for `tag-history.mjs`.
 *
 * The scripts in this directory run under plain Node, outside the TypeScript
 * program. This declaration exists so the unit tests keep their types without
 * dragging the script into a build step.
 */

export interface Version {
  major: number;
  minor: number;
  patch: number;
  pre: { name: string; number: number } | null;
}

export interface Run {
  id: number;
  headSha: string;
}

export interface TagFacts {
  tag: string;
  sha?: string | null;
  tags?: string[];
  runs?: Run[];
  dryRun?: boolean;
}

export interface TagFinding {
  assertion: string;
  detail: string;
}

export interface TagReport {
  tag: string;
  dryRun: boolean;
  examinedTags: number;
  examinedRuns: number;
  findings: TagFinding[];
  notes: string[];
}

export declare function parseVersion(tag: string): Version | null;
export declare function compareVersions(a: Version, b: Version): number;
export declare function scopeFailures(facts: TagFacts): string[];
export declare function evaluateTag(facts: TagFacts): TagReport;
export declare const MOVED_TAG_FIXTURE: TagFacts;
export declare const BACKWARDS_TAG_FIXTURE: TagFacts;
export declare function selfTestFailures(): string[];
export declare function renderTagReport(report: TagReport): string;
