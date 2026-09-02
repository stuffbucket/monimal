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
  LLAMA_BACKENDS_VARIABLE,
  PACKAGE_FUSES,
  RUNTIME_ICONS,
  externalClosure,
  hoistedDependencies,
  llamaPackagePlan,
  parseLlamaBackends,
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
// `native/llama-host.ts` forks this from `__dirname`, so it has to sit beside
// the main bundle. Absent, every embedded run fails at the fork. Issue #133.
check(listing.includes('/.vite/build/llama-worker.js'), 'llama engine bundle is packed');
check(listing.includes(`${RENDERER}/index.html`), 'renderer shell is packed');
check(listing.includes(`${RENDERER}/splash.html`), 'splash window is packed');
check(listing.includes(`${RENDERER}/overlay.html`), 'overlay window is packed');
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
const documents = {
  shell: declaredPolicy(`${RENDERER}/index.html`),
  overlay: declaredPolicy(`${RENDERER}/overlay.html`),
};

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

// The overlay hosts the same terminal. Its own comment says "Same policy as the
// shell", which is a claim until something reads both. A document that was not
// read fails above, with the reason.
check(
  documents.overlay.policy !== undefined &&
    documents.overlay.policy === documents.shell.policy,
  'the shell and the overlay declare one policy',
);

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

check(
  listing.some((entry) => entry.includes('node_modules/node-llama-cpp/')),
  'node-llama-cpp is packed',
);

/**
 * Unpacked files whose name matches a simple `*` glob.
 *
 * This used to shell out to `find`. On Windows that name resolves to
 * `System32\find.exe`, which searches for a string inside files and takes
 * unrelated arguments, so these checks reported a packaging fault that was
 * really a portability one. Reading the directory needs no subprocess and
 * behaves the same everywhere.
 */
const findUnpacked = (pattern) => {
  const expression = pattern
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  const matches = new RegExp(`^${expression}$`);
  return unpackedFiles.filter((entry) => matches.test(path.basename(entry)));
};

check(
  findUnpacked('*.node').some((entry) => entry.includes('node-llama-cpp')),
  'the llama.cpp addon is unpacked',
);

// llama.cpp ships its backends as shared libraries beside the addon, and
// `dlopen` cannot reach into an asar. An `unpack` glob of only `*.node` leaves
// these inside the archive: the package builds, the app starts, and the model
// fails to load with an error that reads like a bad model file rather than a
// packaging fault.
//
// The expectation is derived rather than restated, because the set is platform
// specific in both name and size. It is derived through the plan
// `forge.config.ts` prunes with, not from the whole installed scope: npm
// selects by `os` and `cpu`, which puts `win-arm64` and 505 MB of CUDA on a
// `win32-x64` host that ships neither. Issue #113.
//
// Compared by path inside the scope, never by file name. Windows ships
// `ggml-base.dll` in four directories, so a name-keyed comparison reports the
// CUDA backend as present because the CPU one is — the same widened scope this
// script exists to catch.
const LIBRARY_EXTENSIONS = ['.dylib', '.so', '.dll'];
const EXTERNAL_MODULES = ['node-pty', 'node-llama-cpp'];

/**
 * The two native modules, and everything they reach.
 *
 * The keep-list names directories, so a dependency that landed at the top
 * level was silently absent and `node-llama-cpp` could not load in any
 * packaged build. Derived from the installed tree by `hoistedDependencies`, so
 * this checks the same set `forge.config.ts` kept rather than a second list.
 * Issue #133.
 */
const IO = {
    basename: (target) => path.basename(target),
    realpath: (target) => {
      // A package directory is usually a symlink under pnpm, and its
      // dependencies sit beside its real location rather than beside the link.
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

const hoisted = hoistedDependencies(IO, path.join(ROOT, 'node_modules'), EXTERNAL_MODULES);
const CLOSURE = externalClosure(IO, path.join(ROOT, 'node_modules'), EXTERNAL_MODULES);

const LLAMA_SCOPE = 'node_modules/@node-llama-cpp';

/*
 * Where the prebuild scope really is.
 *
 * `<root>/node_modules/@node-llama-cpp` is where a flat install puts it and
 * where nothing puts it under pnpm: the platform build is an optional
 * dependency of `node-llama-cpp` and lives beside it in the store. Reading the
 * assumed path found nothing, and every check below then reported the packaged
 * scope as full of strays — the expectation was empty, not the archive.
 *
 * `externalClosure` already resolves each one, so the directory it found is
 * the directory to read.
 */
const scopeEntries = CLOSURE.filter(({ name }) => name.startsWith('@node-llama-cpp/'));
const llamaScopeDir = (name) =>
  scopeEntries.find((entry) => entry.name === `@node-llama-cpp/${name}`)?.dir ??
  path.join(ROOT, LLAMA_SCOPE, name);
const installed = scopeEntries.map(({ name }) => name.slice('@node-llama-cpp/'.length));

// The first floor. With no scope installed the plan is empty, every loop below
// runs zero times, and the run is green over a package with no llama.cpp in it.
check(installed.length > 0, 'the dependency installs llama.cpp prebuild packages');

const plan =
  installed.length > 0
    ? llamaPackagePlan(
        installed,
        process.platform,
        process.arch,
        parseLlamaBackends(process.env[LLAMA_BACKENDS_VARIABLE]),
      )
    : [];
const kept = plan.filter((entry) => entry.keep).map((entry) => entry.name);
const dropped = plan.filter((entry) => !entry.keep);

console.log(
  `  ${String(plan.length)} prebuild package(s) installed, ${String(kept.length)} shipped: ` +
    `${kept.join(', ') || 'none'}`,
);
for (const entry of dropped) {
  console.log(`  dropped ${entry.name}: ${entry.reason}`);
}

// The second floor. A plan that keeps nothing is a package with no llama.cpp
// backend at all, which every per-file check below would report as clean.
check(kept.length > 0, 'the plan keeps a llama.cpp prebuild package for this target');

const shippedLibraries = kept.flatMap((name) =>
  readdirSync(llamaScopeDir(name), { recursive: true, encoding: 'utf8' })
    .map((entry) => entry.split(path.sep).join('/'))
    .filter((entry) => LIBRARY_EXTENSIONS.includes(path.extname(entry)))
    .map((entry) => `${name}/${entry}`),
);

// The third floor. An empty expectation asserts nothing, which is the shape
// this replaced: two globs flat-mapped into one non-empty assertion, where
// losing all seven `libggml*` still passed on the two `libllama*`. Issue #92.
check(shippedLibraries.length > 0, 'the shipped packages carry llama.cpp shared libraries');
console.log(`  ${String(shippedLibraries.length)} shared librar(ies) expected in the package`);

const unpackedPaths = new Set(unpackedFiles);
for (const library of shippedLibraries) {
  check(unpackedPaths.has(`${LLAMA_SCOPE}/${library}`), `${library} is unpacked`);
}

// The other half, and the one the per-file checks cannot make: nothing under
// the scope belongs to a package the plan dropped. Without it a prune that
// silently did nothing still passes, because every kept library is present
// either way.
//
// One assertion over the whole scope rather than one per dropped package,
// because a target may legitimately drop none: `mac-arm64` installs a single
// package. The entry count beneath it is the floor, so a scope that vanished
// from the package fails rather than passing with no strays.
const scopePrefix = `${LLAMA_SCOPE}/`;
const shippedScopeEntries = unpackedFiles.filter((entry) => entry.startsWith(scopePrefix));
check(shippedScopeEntries.length > 0, 'the package carries the @node-llama-cpp scope');

const keptNames = new Set(kept);
const strays = shippedScopeEntries.filter(
  (entry) => !keptNames.has(entry.slice(scopePrefix.length).split('/')[0]),
);
check(
  strays.length === 0,
  strays.length === 0
    ? `all ${String(shippedScopeEntries.length)} scope entries belong to a shipped package`
    : `${String(strays.length)} scope entr(ies) belong to a dropped package, first ${strays[0]}`,
);


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

/**
 * Which top-level packages the archive carries. A scoped name is two segments,
 * so `@huggingface` alone would report `@huggingface/jinja` as present when
 * some other package under that scope is the one that shipped.
 */
const packedPackages = new Set(
  listing
    .filter((entry) => entry.startsWith('/node_modules/'))
    .map((entry) => {
      const parts = entry.split('/').slice(2);
      return parts[0]?.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
    })
    .filter((name) => name !== undefined && !name.startsWith('.')),
);
const absent = hoisted.filter((name) => !packedPackages.has(name));
check(
  absent.length === 0,
  absent.length === 0
    ? `all ${String(hoisted.length)} hoisted dependencies are packed`
    : `${String(absent.length)} hoisted dependenc(ies) are missing, first ${absent[0]}`,
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
