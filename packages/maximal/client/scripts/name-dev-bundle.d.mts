/**
 * Types for `name-dev-bundle.mjs`.
 *
 * The scripts in this directory run under plain Node, outside the TypeScript
 * program that builds the app, so their types are declared rather than
 * inferred.
 */

/** The result of rewriting a plist's `CFBundleName`. */
export interface BundleRename {
  /** Whether the plist changed. False both when already named and when absent. */
  changed: boolean
  /** The previous name, or `undefined` when the key is not in the plist. */
  was?: string
  plist: string
}

export declare function renameBundle(plist: string, name: string): BundleRename

/**
 * Build the privately named development bundle.
 *
 * @returns A value for `ELECTRON_OVERRIDE_DIST_PATH`, or `undefined` when
 *   there is nothing to name — not darwin, or no bundle installed.
 */
export declare function prepareDevBundle(): string | undefined
