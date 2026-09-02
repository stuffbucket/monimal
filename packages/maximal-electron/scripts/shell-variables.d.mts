/**
 * Types for `shell-variables.mjs`, the `./verify/shell-variables` export.
 *
 * The scripts in this directory run under plain Node, outside the TypeScript
 * program, which is why `eslint.config.mjs` treats them separately.
 */

/**
 * `required` is read as `var(--shell-x)` somewhere, so an unset value renders
 * nothing. `fallback` is only ever read as `var(--shell-x, …)`. `runtime` is
 * resolved by JavaScript and appears in no rule.
 */
export type ShellVariableKind = 'required' | 'fallback' | 'runtime';

export interface ShellStylesheet {
  /** For the failure message. Any label the caller can act on. */
  readonly name: string;
  readonly css: string;
}

export interface ShellVariableEntry {
  readonly name: string;
  readonly kind: ShellVariableKind;
}

export interface ShellVariableInput {
  readonly stylesheets: readonly ShellStylesheet[];
  /** Custom properties JavaScript resolves, such as `SHELL_TERMINAL_PROPERTIES`. */
  readonly runtimeProperties: readonly string[];
  /** The contract as published, to compare the derived one against. */
  readonly published: readonly ShellVariableEntry[];
}

export interface ShellVariableCheck {
  readonly name: string;
  readonly ok: boolean;
}

export interface ShellVariableContract {
  readonly required: string[];
  readonly fallback: string[];
  readonly runtime: string[];
}

export interface PackageStylesheet {
  /** Repository-relative paths, concatenated in order into `published`. */
  readonly sources: readonly string[];
  /** Repository-relative path the build writes. */
  readonly published: string;
}

export declare const SHELL_NAMESPACE: string;
export declare function packageStylesheets(): PackageStylesheet[];

export declare function shellVariablesIn(css: string): {
  required: string[];
  fallback: string[];
};
export declare function shellVariableContract(
  input: Pick<ShellVariableInput, 'stylesheets' | 'runtimeProperties'>,
): ShellVariableContract;
export declare function shellVariableEntries(
  input: Pick<ShellVariableInput, 'stylesheets' | 'runtimeProperties'>,
): ShellVariableEntry[];
export declare function shellVariableChecks(input: ShellVariableInput): ShellVariableCheck[];
export declare function failedShellVariableChecks(
  checks: readonly ShellVariableCheck[],
): string[];
