/**
 * Types for `name-dev-bundle.mjs`.
 *
 * The scripts in this directory run under plain Node, outside the TypeScript
 * program that builds the app, so their types are declared rather than
 * inferred.
 */

/** The result of rewriting a plist's name keys. */
export interface BundleRename {
  /** Whether the plist changed. False both when already named and when absent. */
  changed: boolean
  /** The previous name, or `undefined` when the key is not in the plist. */
  was?: string
  plist: string
}

export declare function renameBundle(plist: string, name: string): BundleRename

/**
 * The binary inside the named copy, given the directory holding it.
 *
 * The bundle directory in this path is what the Dock reads a tile's name from;
 * `name-dev-bundle.mjs` has the evidence.
 */
export declare function executablePath(distPath: string): string

/**
 * Build the privately named development bundle.
 *
 * @returns The executable `forge.config.ts` should start, or `undefined` when
 *   there is nothing to name — not darwin, or no bundle installed.
 */
export declare function prepareDevBundle(): string | undefined
