#!/usr/bin/env node
/**
 * Build the published library: the two `tsc` emits and the stylesheet copy.
 *
 * One file rather than three npm scripts calling each other, because the
 * caller that matters is not a shell. `npm pack` runs `prepack` AND `prepare`,
 * both of which built this package by shelling back into the package manager,
 * and `scripts/verify-exports.mjs` parses `npm pack --dry-run --json` off the
 * stdout those hooks inherit. A build that prints anything at all lands in the
 * middle of the JSON.
 *
 * That was not hypothetical, and it was not the compilers: `pnpm run` writes
 * its own resolution progress to stdout whenever the lockfile does not match
 * the configured registry, which is every invocation on a developer machine
 * behind the proxy registry in `.npmrc` (SOURCES.md#lockfile-integrity). CI
 * resolves cleanly and printed nothing, so the check passed there and crashed
 * with `Unexpected token 'S'` for anyone who ran it locally. The same nested
 * `pnpm run` also rewrote `pnpm-lock.yaml` as a side effect of a read-only
 * check -- see issue #26.
 *
 * So nothing here shells into a package manager. `tsc` is invoked at the path
 * it is installed at, and the stylesheet copy is imported rather than spawned.
 *
 * Importable, because `verify-exports.mjs` needs the build to have happened
 * and needs to be the thing that made it happen. Plain ESM under `scripts/`
 * for the reason the rest of this directory is: it has to load under plain
 * `node`, without a bundler and without the `dist/` it produces.
 *
 * Usage: node scripts/build-package.mjs [--host | --renderer]
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * `tsc` as a path, not as a name.
 *
 * A bare `tsc` resolves through `PATH`, which only carries `node_modules/.bin`
 * when a package manager put it there. That is exactly the dependency this
 * file exists to remove.
 */
const TSC = path.join(ROOT, 'node_modules', '.bin', 'tsc');

/** @param {string} project A `tsconfig` in this package. */
function compile(project) {
  // `inherit`, so a type error reaches the terminal rather than a buffer this
  // would then have to decide what to do with.
  execFileSync(TSC, ['-p', project], { cwd: ROOT, stdio: 'inherit' });
}

/** The host and preload entry points a consumer imports from `./main`. */
export function buildHost() {
  compile('tsconfig.host.json');
}

/**
 * The renderer entry point, and the stylesheet that ships beside it.
 *
 * The copy is `copy-renderer-css.mjs`'s whole body, imported for its side
 * effect. It reads the same `packageStylesheets()` list the `--shell-*`
 * contract check and `verify-exports.mjs` read, so a stylesheet cannot be
 * added to one and missed by the others.
 */
export async function buildRenderer() {
  compile('tsconfig.renderer-package.json');
  await import('./copy-renderer-css.mjs');
}

/** Everything `prepack` produces. */
export async function buildPackage() {
  buildHost();
  await buildRenderer();
}

const INVOKED_DIRECTLY = process.argv[1] === fileURLToPath(import.meta.url);

if (INVOKED_DIRECTLY) {
  const only = process.argv[2];
  if (only === '--host') buildHost();
  else if (only === '--renderer') await buildRenderer();
  else if (only === undefined) await buildPackage();
  else {
    console.error(`Unknown argument ${only}. Expected --host, --renderer, or nothing.`);
    process.exit(1);
  }
}
