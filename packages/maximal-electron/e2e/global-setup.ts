import { statSync } from 'node:fs';
import path from 'node:path';

import { newestMtime } from './freshness.js';

/**
 * Global end-to-end setup.
 *
 * Two things have to happen once, before any worker starts.
 */

const ROOT = path.resolve(__dirname, '..');
const BUNDLE = path.join(ROOT, '.vite/build/main.js');

/**
 * Refuse to run against bundles older than the source.
 *
 * `npm run test:e2e` is `playwright test` and builds nothing. The suite drives
 * whatever is in `.vite`, so an edit that has not been packaged is simply not
 * under test. `AGENTS.md` says to run `npm run package` first, and a
 * documented step is not a check.
 *
 * This is not hypothetical. A renderer change was tested against a bundle from
 * the previous day, the assertion that happened to match the old behaviour
 * passed, and the run was read as evidence the change worked. A silent wrong
 * answer is worse than a failure, which is the same reason `capture` rejects a
 * blank screenshot.
 *
 * Exported because the recorder and the stills runner drive the same bundles
 * from their own configurations, and were not guarded at all.
 */
export function requireFreshBundles(): void {
  let built: number;
  try {
    built = statSync(BUNDLE).mtimeMs;
  } catch {
    throw new Error(
      `No built bundles at ${path.relative(ROOT, BUNDLE)}. ` +
        'Run `npm run package` first: the suite drives the build, not the source.',
    );
  }

  // Both trees are compiled into `.vite`: the product from `src`, the capture
  // fixture from `e2e/fixtures`. An edit to either is not under test until it
  // has been packaged.
  const times = [path.join(ROOT, 'src'), path.join(ROOT, 'e2e/fixtures')]
    .map((directory) => newestMtime(directory))
    .filter((time) => time !== undefined);

  const newest = times.length > 0 ? Math.max(...times) : undefined;
  if (newest === undefined || newest <= built) return;

  const behind = Math.round((newest - built) / 1000);
  throw new Error(
    `The bundles in .vite are ${String(behind)}s older than the source. ` +
      'Run `npm run package` first, or the suite tests the previous build ' +
      'and a pass proves nothing about your change.',
  );
}

export default function globalSetup(): void {
  requireFreshBundles();

  /*
   * Playwright evaluates a spec file more than once: once in the main process
   * to collect tests, and again in each worker to run them. A seed generated
   * inside the spec is therefore generated twice, and the two orders disagree.
   *
   * `globalSetup` runs once, in the main process, before workers spawn.
   * Workers inherit its environment, so writing the seed here makes every load
   * agree.
   */
  process.env['E2E_SEED'] ??= String(Math.floor(Math.random() * 2 ** 31));
  // eslint-disable-next-line no-console
  console.log(
    `e2e shuffle seed: ${process.env['E2E_SEED']} (set E2E_SEED to replay)`,
  );
}
