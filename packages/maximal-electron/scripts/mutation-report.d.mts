/**
 * Types for `mutation-report.mjs`.
 *
 * The scripts in this directory run under plain Node, outside the TypeScript
 * program, which is why `eslint.config.mjs` treats them separately.
 */

export declare const MUTANT_FLOOR: number;
export declare const IGNORED_CEILING: number;

export interface MutationSummary {
  total: number;
  statuses: Map<string, number>;
  perFile: Map<string, number>;
  unattributed: string[];
  dangling: string[];
  killers: Set<string>;
  knownTests: number;
  testFiles: number;
}

export declare function readReport(file: string): unknown;
export declare function summarize(report: unknown): MutationSummary;
