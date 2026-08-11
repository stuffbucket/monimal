/**
 * Which packages an entry point needs installed, and which of them are not.
 *
 * The peer table in `README.md` says what to install. Nothing said whether a
 * consumer did: every peer is optional, so npm reports no missing one, and the
 * types resolve out of `dist/` whether or not the runtime package exists. A
 * `./renderer` consumer therefore gets a clean install and a clean `tsc`, and
 * the first signal is an unresolved import in a browser. Issue #172.
 *
 * The requirements are derived from the built graph rather than held as a list,
 * for the reason `scripts/peer-table.mjs` gives about the table it checks.
 *
 * Plain ESM in `scripts/`, matching `export-checks.mjs`: this runs under plain
 * `node` in a consumer's checkout, not through their bundler. Reading is scoped
 * to the package root the caller names, and resolution is the caller's
 * function, because only they can resolve from their own project.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { exportTargets, importedPackages, relativeImports } from './export-checks.mjs';

/**
 * @typedef {object} Check
 * @property {string} name
 * @property {boolean} ok
 * @property {string} detail What the check found, for one that did not pass.
 */

/**
 * A package an entry point requires that no import of it reaches.
 *
 * A React component does not import a renderer, so nothing in `dist/renderer`
 * names `react-dom`, and a consumer mounting these components still needs one.
 * `scripts/peer-table.mjs` re-exports this and asserts each name is a declared
 * peer no entry point imports, so a name that becomes reachable has to leave.
 */
export const REQUIRED_WITHOUT_IMPORT = [{ subpath: './renderer', name: 'react-dom' }];

/** A target that is an asset rather than a module to walk. */
function isModuleTarget(target) {
  return target.endsWith('.js') || target.endsWith('.mjs');
}

/**
 * A module's source, or nothing for one this install does not carry.
 *
 * Empty rather than absent, so the walk has no case to branch on: a module that
 * is not there imports nothing, which is what an empty source already says.
 *
 * Exported because it is the default `readSource` and a caller reading from
 * somewhere else needs the same contract to write one.
 */
export function readPackageSource(file) {
  return readFile(file, 'utf8').catch(() => '');
}

/**
 * Every bare specifier the graph under `entry` reaches.
 *
 * A file is read once however many modules import it, which is what keeps a
 * graph that imports itself in a circle from walking forever.
 */
async function packagesReached(entry, readSource) {
  const found = new Set();
  const visited = new Set();

  /*
   * Recursive rather than a worklist loop, which is a testability choice as
   * much as a shape one. A `while` over a pending array is one mutation away
   * from never draining, and a mutant that hangs is killed by a timeout rather
   * than by anything asserting: `scripts/mutation-report.mjs` refuses those.
   * Following the edges directly leaves every mutant here observable in a
   * returned value.
   */
  async function follow(file) {
    if (visited.has(file)) return;
    visited.add(file);

    const source = await readSource(file);
    for (const name of importedPackages(source)) found.add(name);

    await Promise.all(
      relativeImports(source).map((specifier) =>
        follow(path.resolve(path.dirname(file), specifier)),
      ),
    );
  }

  await follow(entry);
  return found;
}

/**
 * What each export subpath needs installed, as subpath to package names.
 *
 * Every condition of a subpath walks to the same graph, so the first module
 * target wins and the rest are skipped.
 *
 * `readSource` is the seam the tests read a graph through without writing one
 * to disk. It defaults to reading the package the caller named.
 */
export async function peerRequirements(packageRoot, exports, readSource = readPackageSource) {
  /** @type {Map<string, string[]>} */
  const requirements = new Map();

  for (const { subpath, target } of exportTargets(exports)) {
    if (requirements.has(subpath) || !isModuleTarget(target)) continue;

    const entry = path.resolve(packageRoot, target);
    const reached = await packagesReached(entry, readSource);
    for (const { subpath: where, name } of REQUIRED_WITHOUT_IMPORT) {
      if (where === subpath) reached.add(name);
    }

    requirements.set(subpath, [...reached].sort());
  }

  return requirements;
}

/**
 * One check per package the named subpaths require.
 *
 * `resolve` answers whether a specifier resolves from the caller's project. It
 * is theirs to supply because resolution depends on where they ask from, and a
 * check that resolved from this file would answer about the wrong tree.
 */
export function missingPeerChecks(input) {
  const { requirements, subpaths, resolve } = input;
  /** @type {Check[]} */
  const checks = [];

  for (const subpath of subpaths) {
    const required = requirements.get(subpath);

    // A subpath with no entry is a caller naming an export that is not there,
    // which is a failure about the argument rather than about a peer.
    if (required === undefined) {
      checks.push({
        name: `${subpath} is an export of this package`,
        ok: false,
        detail: `the manifest names no module target for ${subpath}`,
      });
      continue;
    }

    for (const name of required) {
      checks.push({
        name: `${subpath} can resolve ${name}`,
        ok: resolve(name),
        detail: `${name} is required by ${subpath} and does not resolve`,
      });
    }
  }

  /*
   * The floor. Naming no subpath, or naming only ones that need nothing,
   * reports zero failures over zero questions, which reads as a pass.
   */
  checks.push({
    name: 'the requirements reached at least one package',
    ok: checks.some((check) => check.name.includes(' can resolve ')),
    detail: 'no named subpath required any package, so nothing was checked',
  });

  return checks;
}

/** The detail of every check that did not pass. */
export function failedPeerChecks(checks) {
  return checks.filter((check) => !check.ok).map((check) => check.detail);
}
