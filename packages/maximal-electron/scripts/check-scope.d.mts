/**
 * Types for `check-scope.mjs`.
 *
 * The scripts in this directory run under plain Node, outside the TypeScript
 * program, which is why `eslint.config.mjs` treats them separately.
 */

/** How many things an assertion ran over, and what they were. */
export interface Scope {
  count: number;
  of: string;
}

export interface ScopedChecks {
  check(ok: boolean, message: string, scope: Scope): boolean;
  summary(subject: string): number;
}

export declare function scopedChecks(sinks?: {
  log?: (line: string) => void;
  fail?: (line: string) => void;
}): ScopedChecks;
