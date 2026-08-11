/**
 * Types for `peer-requirements.mjs`, the `./verify/peers` export.
 *
 * The scripts in this directory run under plain Node, outside the TypeScript
 * program, which is why `eslint.config.mjs` treats them separately.
 */

export interface PeerCheck {
  readonly name: string;
  readonly ok: boolean;
  /** What the check found, for one that did not pass. */
  readonly detail: string;
}

export interface RequiredWithoutImport {
  readonly subpath: string;
  readonly name: string;
}

export interface MissingPeerInput {
  /** Export subpath to the packages it requires, from `peerRequirements`. */
  readonly requirements: Map<string, string[]>;
  /** The subpaths the caller imports. Usually a subset. */
  readonly subpaths: readonly string[];
  /** Whether a specifier resolves from the caller's project. */
  readonly resolve: (specifier: string) => boolean;
}

export declare const REQUIRED_WITHOUT_IMPORT: RequiredWithoutImport[];

/**
 * A module's source, or empty for one the install does not carry. Defaults to
 * reading from disk; the tests pass a graph held in memory.
 */
export type ReadSource = (file: string) => Promise<string>;

export declare function peerRequirements(
  packageRoot: string,
  exports: unknown,
  readSource?: ReadSource,
): Promise<Map<string, string[]>>;

export declare function readPackageSource(file: string): Promise<string>;

export declare function missingPeerChecks(input: MissingPeerInput): PeerCheck[];

export declare function failedPeerChecks(checks: readonly PeerCheck[]): string[];
