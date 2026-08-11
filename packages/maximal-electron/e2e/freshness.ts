import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * The newest modification time under a directory.
 *
 * Kept separate from `global-setup.ts` so it imports nothing from Playwright
 * and can be unit tested. The walk is deliberately plain: this answers one
 * question, and a build-freshness check that itself needs a dependency has
 * pushed the problem somewhere else.
 *
 * Returns undefined for a directory that does not exist or holds no files, so
 * a caller can tell "nothing to compare" apart from "compared, and it is old".
 */
export function newestMtime(directory: string): number | undefined {
  let newest: number | undefined;

  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return undefined;
  }

  for (const entry of entries) {
    const full = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      const nested = newestMtime(full);
      if (nested !== undefined && (newest === undefined || nested > newest)) {
        newest = nested;
      }
      continue;
    }

    if (!entry.isFile()) continue;

    try {
      const { mtimeMs } = statSync(full);
      if (newest === undefined || mtimeMs > newest) newest = mtimeMs;
    } catch {
      // A file that vanished between listing and stat is not a staleness
      // signal. Skip it rather than fail the whole run.
    }
  }

  return newest;
}
