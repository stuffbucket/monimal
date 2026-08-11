/**
 * Types for `docs-claims.mjs`.
 *
 * The scripts in this directory run under plain Node, outside the TypeScript
 * program, which is why `eslint.config.mjs` treats them separately. This
 * declaration exists so the unit tests keep their types without dragging the
 * script into a build step.
 */

export interface PathScope {
  roots: string[];
  buildRoots: string[];
  moduleExtensions: string[];
}

export interface PathClaims {
  repo: string[];
  build: string[];
  relative: string[];
  declined: string[];
}

export declare function withoutFences(text: string): string;
export declare function codeSpans(text: string): string[];
export declare function npmScripts(text: string): string[];
export declare function npmScriptsOutOfScope(text: string): number;
export declare function pathClaims(text: string, scope: PathScope): PathClaims;
export declare function constants(text: string): string[];
export declare function links(text: string): string[];
