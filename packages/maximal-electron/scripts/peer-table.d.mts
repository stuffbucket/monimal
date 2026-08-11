/**
 * Types for `peer-table.mjs`.
 *
 * The scripts in this directory run under plain Node, outside the TypeScript
 * program, which is why `eslint.config.mjs` treats them separately.
 */

export interface PeerTableCheck {
  name: string;
  ok: boolean;
  /** What the two sides held, for a check that did not. */
  detail: string;
}

export interface PeerTableException {
  subpath: string;
  name: string;
}

export interface PeerTableInput {
  table: Map<string, string[]>;
  reached: Map<string, string[]>;
  peers: readonly string[];
  exceptions: readonly PeerTableException[];
}

/** A peer a row names that no import reaches, and the row it belongs to. */
export declare const PEER_TABLE_EXCEPTIONS: PeerTableException[];
/** The rows of the peer table, as export subpath to the peers the row names. */
export declare function peerTable(readme: string, packageName: string): Map<string, string[]>;
/** The table against the import graph, in both directions. */
export declare function peerTableChecks(input: PeerTableInput): PeerTableCheck[];
/** The names of the checks that did not hold. */
export declare function failedPeerTableChecks(checks: PeerTableCheck[]): string[];
