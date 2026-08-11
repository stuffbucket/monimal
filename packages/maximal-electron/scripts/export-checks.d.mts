/**
 * Types for `export-checks.mjs`.
 *
 * The scripts in this directory run under plain Node, outside the TypeScript
 * program, which is why `eslint.config.mjs` treats them separately. This
 * declaration exists so the unit tests keep their types without dragging the
 * script into a build step.
 *
 * `export-checks.mjs` ships, so a consumer running the checks against their own
 * build gets these types with it.
 */

/** One file an `exports` map names, under one condition. */
export interface ExportTarget {
  subpath: string;
  condition: string;
  target: string;
}

/** One assertion, and whether it held. */
export interface Check {
  name: string;
  ok: boolean;
}

export declare const INSTALLED_WITHOUT_BUILD: string;

/** The deliberate list each subpath promises a consumer. */
export declare const RENDERER_SURFACE: string[];
export declare const VERIFY_SURFACE: string[];
export declare const MAIN_SURFACE: string[];
export declare const PRELOAD_SURFACE: string[];

export declare function exportTargets(exports: Record<string, unknown> | undefined): ExportTarget[];
export declare function declaredTargets(exports: Record<string, unknown> | undefined): string[];
export declare function targetPresent(root: string, target: string): boolean;
export declare function missingTargets(
  root: string,
  exports: Record<string, unknown> | undefined,
): string[];
export declare function packedName(name: string): string;
export declare function packedTarballName(name: string, version: string): string;
export declare function reExportedNames(source: string): string[];
export declare function isGeneric(relativePath: string): boolean;
export declare function declarationSurfaceChecks(
  packageRoot: string,
  declaration: unknown,
  subpath: string,
  names: readonly string[],
): Promise<{ checks: Check[] }>;
