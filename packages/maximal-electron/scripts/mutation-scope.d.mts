/**
 * Types for `mutation-scope.mjs`.
 *
 * The scripts in this directory run under plain Node, outside the TypeScript
 * program, which is why `eslint.config.mjs` treats them separately.
 */

export declare const ROOTS: readonly string[];
export declare const DEFERRED: ReadonlyMap<string, number>;

export declare function valueImports(source: string, fileName: string): string[];

export interface MutationScope {
  scanned: string[];
  eligible: string[];
  outOfScope: { file: string; reason: string }[];
  mutated: string[];
  unaccounted: string[];
  missing: string[];
  staleDeferrals: string[];
}

export declare function mutationScope(): MutationScope;
