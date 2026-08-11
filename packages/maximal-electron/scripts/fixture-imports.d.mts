/**
 * Types for `fixture-imports.mjs`.
 *
 * The scripts in this directory run under plain Node, outside the TypeScript
 * program, which is why `eslint.config.mjs` treats them separately. This
 * declaration exists so the unit tests keep their types without dragging the
 * script into a build step.
 */

/** One import specifier, and the line the file states it on. */
export interface FoundImport {
  specifier: string;
  line: number;
}

/** Where a relative specifier is resolved from, and what it may not leave. */
export interface ResolutionScope {
  fromDir: string;
  root: string;
}

export declare const SOURCE_EXTENSIONS: string[];

export declare function importSpecifiers(text: string, extension: string): FoundImport[];
export declare function reachesOutside(
  specifier: string,
  scope: ResolutionScope,
): string | undefined;
export declare function packageSubpath(
  specifier: string,
  packageName: string,
): string | undefined;
