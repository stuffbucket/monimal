/**
 * Types for `neutrality.mjs`, the logic behind `verify-neutral.mjs`.
 *
 * The scripts in this directory run under plain Node, outside the TypeScript
 * program, which is why `eslint.config.mjs` treats them separately.
 */

export interface ModuleSpecifier {
  /** The literal, or `undefined` when the specifier is computed. */
  readonly text: string | undefined;
  /** One-based. */
  readonly line: number;
  /** The syntax that named it: `import`, `require.resolve`, and so on. */
  readonly form: string;
}

export interface TermMatch {
  readonly term: string;
  /** One-based. */
  readonly line: number;
  /** The whole line, trimmed. */
  readonly excerpt: string;
}

export declare const FORBIDDEN_PACKAGES: string[];
export declare const DEFAULT_FORBIDDEN_TERMS: string[];

export declare function forbiddenTerms(environment?: Record<string, string | undefined>): string[];
export declare function moduleSpecifiers(source: string, fileName: string): ModuleSpecifier[];
export declare function isForbiddenPackage(specifier: string, packages?: string[]): boolean;
export declare function forbiddenImports(
  source: string,
  fileName: string,
  packages?: string[],
): ModuleSpecifier[];
export declare function termMatches(
  text: string,
  terms: string[],
  exempt?: string[],
): TermMatch[];
