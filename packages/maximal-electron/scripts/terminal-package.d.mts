/**
 * Types for `terminal-package.mjs`, the `./verify` export.
 *
 * The scripts in this directory run under plain Node, outside the TypeScript
 * program, which is why `eslint.config.mjs` treats them separately.
 */

export interface TerminalPackageCheck {
  readonly name: string;
  readonly ok: boolean;
}

export interface TerminalPackageInput {
  /** Every path inside the archive, forward-slashed. */
  readonly packedFiles: readonly string[];
  /** Every path under `app.asar.unpacked`, forward-slashed. */
  readonly unpackedFiles: readonly string[];
  readonly platform: string;
  readonly arch: string;
  /**
   * The policy the renderer document declares. Read it out of the shipped HTML
   * rather than restating it: a copy passes while the shipped policy drops a
   * grant. Omitting it fails a check rather than skipping two.
   */
  readonly contentSecurityPolicy?: string;
}

export declare const TERMINAL_CONTENT_SECURITY_POLICY: readonly {
  readonly directive: string;
  readonly source: string;
}[];

export declare function terminalPrebuildDirectory(platform: string, arch: string): string;
/** Files that must arrive outside the archive, relative to the prebuild directory. */
export declare function terminalNativeFiles(platform: string): string[];
export declare function contentSecurityPolicyChecks(policy: string): TerminalPackageCheck[];
export declare function terminalPackageChecks(
  input: TerminalPackageInput,
): TerminalPackageCheck[];
