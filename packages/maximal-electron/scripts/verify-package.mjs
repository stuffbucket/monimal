#!/usr/bin/env node
/**
 * Verify the packaged application.
 *
 * The end-to-end tests deliberately drive the unpackaged build, because the
 * `EnableNodeCliInspectArguments: false` fuse stops Playwright attaching to a
 * packaged binary. That leaves three packaging properties unchecked by any
 * test, and they are exactly the ones that break silently:
 *
 *   1. The asar contains the main, preload, and renderer bundles.
 *   2. The renderer documents declare the policy the terminal needs.
 *   3. The fuses are set to the hardened values in package-contract.mjs.
 *
 * This script closes that gap. Run it after `npm run package`.
 */

import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { listPackage, extractFile } from '@electron/asar';
import { FuseV1Options, getCurrentFuseWire } from '@electron/fuses';

import {
  PACKAGE_FUSES,
  RUNTIME_ICONS,
  externalClosure,
  hoistedDependencies,
  platformPackagePlan,
} from './package-contract.mjs';
import { terminalPackageChecks } from './terminal-package.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const failures = [];
const check = (ok, message) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${message}`);
  if (!ok) failures.push(message);
};

/* --------------------------------------------------------------- locate */

function locate() {
  const arch = process.arch;
  if (process.platform === 'darwin') {
    const app = path.join(ROOT, `out/Stuffbucket-darwin-${arch}/Stuffbucket.app`);
    return { app, asar: path.join(app, 'Contents/Resources/app.asar') };
  }
  if (process.platform === 'win32') {
    const dir = path.join(ROOT, `out/Stuffbucket-win32-${arch}`);
    return { app: path.join(dir, 'Stuffbucket.exe'), asar: path.join(dir, 'resources/app.asar') };
  }
  const dir = path.join(ROOT, `out/Stuffbucket-linux-${arch}`);
  return { app: path.join(dir, 'stuffbucket'), asar: path.join(dir, 'resources/app.asar') };
}

const { app, asar } = locate();

console.log('Verifying packaged application');
console.log(`  app:  ${path.relative(ROOT, app)}`);
console.log(`  asar: ${path.relative(ROOT, asar)}\n`);

if (!existsSync(app)) {
  console.error('Packaged application not found. Run `npm run package` first.');
  process.exit(1);
}

/* ----------------------------------------------------------------- asar */

console.log('asar contents');

/**
 * asar entries, with forward slashes on every platform.
 *
 * `listPackage` returns paths with the platform separator, so on Windows the
 * entries read `\.vite\build\main.js`. Every check below is written with `/`,
 * which is why seven of them failed there the first time this script ever got
 * far enough on Windows to run: the spawn error had been masking them.
 *
 * Only rewritten where the separator is a separator. A backslash is a legal
 * character in a POSIX filename.
 */
const listing = listPackage(asar).map((entry) =>
  path.sep === '\\' ? entry.replaceAll('\\', '/') : entry,
);

/**
 * Where the renderer build lands inside the archive.
 *
 * Every path below is anchored to it. `endsWith('.css')` over the whole listing
 * was satisfied by any dependency that shipped a stylesheet, and `/index.html`
 * by any that shipped a page: correct for the right reason, one dependency away
 * from not being. Issue #92.
 */
const RENDERER = '/.vite/renderer/main_window';

check(listing.includes('/.vite/build/main.js'), 'main bundle is packed');
check(listing.includes('/.vite/build/preload.js'), 'preload bundle is packed');
check(listing.includes(`${RENDERER}/index.html`), 'renderer shell is packed');
check(listing.includes(`${RENDERER}/splash.html`), 'splash window is packed');
check(
  listing.some(
    (entry) => entry.startsWith(`${RENDERER}/assets/index-`) && entry.endsWith('.css'),
  ),
  'renderer stylesheet is packed',
);

// The capture fixture is a screenshot and video prop. It used to sit inside the
// product's own bundle, reachable with a query parameter, and shipped to every
// user. `forge.config.ts` drops it; this is what makes that a fact rather than
// an intention.
check(
  !listing.some((entry) => entry.includes('/renderer/demo_window')),
  'capture fixture is not packed',
);

// Stories live beside the components they cover, inside `src/`. Nothing
// imports them, so Vite should never reach one from an entry point. This is
// the check on that: co-location is convenient right up until a story ends up
// in the application a user installs.
check(
  !listing.some((entry) => entry.includes('.stories.')),
  'stories are not packed',
);

/* --------------------------------------------------- content security policy */

console.log('\ncontent security policy');

/**
 * What a shipped document says about its content policy.
 *
 * Three outcomes, not two: read and declaring a policy, read and declaring
 * none, or not read at all. Collapsing the third into the second reported
 * `the shell declares a content policy` on Windows for a document that
 * declares one, and sent the reader looking for a missing `meta` tag.
 * Issue #98.
 *
 * The search is scoped to the `meta` tag on purpose. `index.html` names
 * `'wasm-unsafe-eval'` in a comment explaining why it is there, so a search of
 * the whole file would pass on the explanation after the grant itself had gone.
 *
 * @returns {{readable: boolean, reason?: string, policy?: string}}
 */
function declaredPolicy(document) {
  let html;
  try {
    /*
     * Every path in this file is forward-slashed with a leading slash, to match
     * `listing` above after its rewrite. `extractFile` wants neither: it
     * resolves the inner path by splitting on `path.sep`
     * (`filesystem.js`, `searchNodeFromDirectory`), so on Windows a
     * forward-slashed path collapses to one bogus segment and resolves nowhere.
     * Worse, that function creates the segment it fails to find rather than
     * throwing, so the error arrives later as "not found in this archive".
     */
    const inner = path.join(...document.replace(/^\//, '').split('/'));
    html = extractFile(asar, inner).toString('utf8');
  } catch (error) {
    return { readable: false, reason: error.message };
  }
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (!/http-equiv\s*=\s*["']content-security-policy["']/i.test(tag)) continue;
    // Matched to its own delimiter. A policy is full of single quotes, so a
    // pattern that stops at either kind captures `default-src ` and nothing
    // more.
    return { readable: true, policy: /content\s*=\s*(["'])(.*?)\1/is.exec(tag)?.[2] };
  }
  return { readable: true };
}

// Read out of the archive rather than restated here. `ghostty-web` needs two
// grants, and the checks that assert them had never been given a policy to
// measure: removing `'wasm-unsafe-eval'` from the shipped HTML broke the
// terminal and passed every check. Issue #92.
const documents = { shell: declaredPolicy(`${RENDERER}/index.html`) };

// An unreadable document fails saying so, rather than as a document that
// declares nothing. Both are failures; only one of them is true.
for (const [label, document] of Object.entries(documents)) {
  check(
    document.readable && document.policy !== undefined,
    document.readable
      ? `the ${label} declares a content policy`
      : `the ${label} could not be read from the asar: ${document.reason}`,
  );
}

const shellPolicy = documents.shell.policy;

/* ------------------------------------------------- native module (pty) */

console.log('\nnative modules');

// A .node file cannot be loaded from inside an asar, so the prebuilt binaries
// are unpacked beside it.
const unpacked = path.join(path.dirname(asar), 'app.asar.unpacked');
const unpackedFiles = existsSync(unpacked)
  ? readdirSync(unpacked, { recursive: true, encoding: 'utf8' }).map((entry) =>
      entry.split(path.sep).join('/'),
    )
  : [];

// The terminal assertions are the `./verify` export, so a consumer packaging
// `./host/terminal` runs the same checks this build runs rather than a copy
// that drifts. Issue #76.
for (const { name, ok } of terminalPackageChecks({
  packedFiles: listing,
  unpackedFiles,
  platform: process.platform,
  arch: process.arch,
  contentSecurityPolicy: shellPolicy,
})) {
  check(ok, name);
}

const EXTERNAL_MODULES = ['node-pty'];
const IO = {
  basename: (target) => path.basename(target),
  realpath: (target) => {
    try {
      return realpathSync(target);
    } catch {
      return target;
    }
  },
  sep: path.sep,
  join: (...parts) => path.join(...parts),
  readPackageJson: (dir) => {
    const file = path.join(dir, 'package.json');
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined;
  },
};

const workspaceRoot = (() => {
  let dir = ROOT;
  for (;;) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return ROOT;
    dir = parent;
  }
})();

const RESOLUTION = { boundary: workspaceRoot };
const hoisted = hoistedDependencies(IO, path.join(ROOT, 'node_modules'), EXTERNAL_MODULES, RESOLUTION);
const CLOSURE = externalClosure(IO, path.join(ROOT, 'node_modules'), EXTERNAL_MODULES, RESOLUTION);

// The floor. With an empty closure every assertion below runs zero times, and
// the run is green over a package that cannot load the library at all.
/*
 * The floor is on the closure, not on hoisting.
 *
 * `hoistedDependencies` answers "which of these did the installer put at the
 * top level", and the honest answer under pnpm is none: every one is a sibling
 * in the store. That is not an empty scope to check, it is a different shape
 * of install, and asserting the old number here failed a correct build.
 */
check(
  CLOSURE.length > 0,
  CLOSURE.length > 0
    ? `the external modules reach ${String(CLOSURE.length)} package(s), ${String(hoisted.length)} of them hoisted`
    : 'nothing to check: the external modules reach 0 packages',
);

/*
 * Every closure placement reached the archive, at the path it belongs at.
 *
 * This used to iterate `hoisted` — the names a *flat* installer lifts to the
 * top level — which under pnpm is the empty list. The floor above it was moved
 * to the closure in the same change, so the run reported `all 0 hoisted
 * dependencies are packed` and passed. A check that examined nothing, guarding
 * the output of the copy that had just been rewritten.
 *
 * Paths rather than names, because the placement is the part that can be
 * wrong: a version conflict nests, and a nested copy landing at the top level
 * is how the library stops loading.
 */
const listedPaths = new Set(listing.map((entry) => entry.replace(/^\//, '')));

/*
 * Minus what this target cannot run.
 *
 * `packageAfterCopy` drops a package whose own `os` or `cpu` excludes the
 * build's platform, so the closure is the set that was COPIED and not the set
 * that ships. Expecting all of it here would fail a build that pruned
 * correctly. The build and verifier derive target compatibility from the same
 * function.
 */
const platformPlan = platformPackagePlan(
  CLOSURE.map(({ dir, path: placement }) => {
    const json = IO.readPackageJson(dir) ?? {};
    return { path: placement, os: json.os, cpu: json.cpu };
  }),
  process.platform,
  process.arch,
);
const platformDropped = platformPlan.filter((entry) => !entry.keep);
for (const entry of platformDropped) {
  console.log(`  dropped ${entry.path}: ${entry.reason}`);
}

const expected = new Set(
  platformPlan.filter((entry) => entry.keep).map((entry) => entry.path),
);
const unplaced = CLOSURE.filter(
  ({ path: placement }) => expected.has(placement) && !listedPaths.has(placement),
);
check(
  unplaced.length === 0,
  unplaced.length === 0
    ? `all ${String(expected.size)} closure placements this target runs are packed`
    : `${String(unplaced.length)} closure placement(s) are missing, first ${unplaced[0]?.path ?? ''}`,
);

/*
 * And nothing packed is for another platform.
 *
 * The other half, and the one a prune that silently did nothing fails:
 * `unplaced` is satisfied whether or not anything was dropped. Read off the
 * archive rather than off the closure, so a package the copy placed and the
 * closure does not name is judged too.
 *
 * A transitive prebuild can match the build host instead of the target, so the
 * archive itself must be checked after pruning.
 */
const packedManifests = listing
  .map((entry) => entry.replace(/^\//, ''))
  .filter((entry) => entry.startsWith('node_modules/') && entry.endsWith('/package.json'));

// The floor. An archive this found no manifests in would report every packed
// package as runnable by reading none of them.
check(packedManifests.length > 0, `${String(packedManifests.length)} packed manifest(s) were read`);

const packedPlan = platformPackagePlan(
  packedManifests.map((manifest) => {
    // `extractFile` splits on `path.sep`, so a forward-slashed path resolves
    // nowhere on Windows. Same rewrite as `declaredPolicy` above.
    const json = JSON.parse(extractFile(asar, path.join(...manifest.split('/'))).toString('utf8'));
    return { path: path.posix.dirname(manifest), os: json.os, cpu: json.cpu };
  }),
  process.platform,
  process.arch,
);
const foreign = packedPlan.filter((entry) => !entry.keep);
check(
  foreign.length === 0,
  foreign.length === 0
    ? `all ${String(packedPlan.length)} packed package(s) run on ${process.platform}-${process.arch}`
    : `${String(foreign.length)} packed package(s) cannot run here, first ${foreign[0]?.path ?? ''} (${foreign[0]?.reason ?? ''})`,
);

/* ---------------------------------------------------------------- icons */

console.log('\nicons');

// The main process loads these at run time, from beside the asar. They are not
// in the bundle, so nothing in the build fails when they are missing: the
// window shows a stock Electron icon and the tray silently does not appear.
// `forge.config.ts` copies them out of the directory `STUFFBUCKET_ICON_DIR`
// names, from the same list this reads.
const resources = path.dirname(asar);

// The floor. An empty list checks nothing and reports it as a pass.
check(RUNTIME_ICONS.length > 0, 'the contract names run-time icons');
for (const file of RUNTIME_ICONS) {
  check(existsSync(path.join(resources, file)), `${file} is beside the asar`);
}

/* ---------------------------------------------------------------- fuses */

console.log('\nfuse configuration');

// `forge.config.ts` fuses the binary from the same list, in
// `scripts/package-contract.mjs`, so a seventh fuse is burned in and checked
// from one edit rather than from a rule asking for two. Issue #92.

let wire;
try {
  wire = await getCurrentFuseWire(app);
} catch (error) {
  console.error(`  could not read fuses: ${error.message}`);
  process.exit(1);
}

/**
 * The wire stores each fuse as the character code of '0' or '1'.
 *
 * An unrecognised value fails the check rather than reading as disabled.
 * These are the hardening switches, so "I did not understand the answer" must
 * not look like "the answer was the safe one".
 */
const DISABLED = '0'.charCodeAt(0);
const ENABLED = '1'.charCodeAt(0);

// The floor. An empty list would report the binary as hardened without
// reading a single fuse.
check(Object.keys(PACKAGE_FUSES).length > 0, 'the contract names fuses');

for (const [name, expected] of Object.entries(PACKAGE_FUSES)) {
  const state = wire[FuseV1Options[name]];

  if (state !== ENABLED && state !== DISABLED) {
    check(false, `${name} reports a state this script understands`);
    continue;
  }

  check(
    (state === ENABLED) === expected,
    `${name} is ${expected ? 'Enabled' : 'Disabled'}`,
  );
}

/* --------------------------------------------------------------- result */

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll packaging checks passed.');
