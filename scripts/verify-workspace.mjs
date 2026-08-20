#!/usr/bin/env node
/**
 * Verify the install actually has the shape the config asks for.
 *
 * A dropped pnpm setting looks exactly like a satisfied one from the outside:
 * the install succeeds either way, and build, typecheck and test stay green.
 * (SOURCES.md, "Put pnpm settings in pnpm-workspace.yaml", records which
 * spellings pnpm 11 accepts and ignores.) So these assertions read the
 * installed tree rather than the config, and a setting that stops being
 * honoured turns red here rather than somewhere far away and much later.
 *
 * `scopedChecks` comes from maximal-electron rather than being rewritten here
 * because the empty-set defect it guards against is live in this file: the
 * cross-package scan below asserts over a set it builds by reading manifests,
 * and a wrong path would make it pass over nothing. That is the seventh
 * instance the helper's own comment describes. Reaching into a package's
 * scripts from the root is coupling, and the alternative -- a second copy at
 * the root -- is the duplication this repo's AGENTS.md rules out.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { scopedChecks } from '../packages/maximal-electron/scripts/check-scope.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'noop.js'));

const { check, summary } = scopedChecks();

/** A package's manifest, or null when it is not installed. */
function manifestAt(...segments) {
  try {
    return JSON.parse(readFileSync(path.join(...segments, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
}

/** Resolve `specifier` the way a bundler walking the symlink path would. */
function resolvesFrom(fromFile, specifier) {
  try {
    return createRequire(fromFile).resolve(specifier);
  } catch {
    return null;
  }
}

// 1. The public hoist. `publicHoistPattern: ["*", ...]` in pnpm-workspace.yaml
//    puts every package in the root node_modules. Electron Forge refuses to run
//    under pnpm without a hoist pattern, and Rolldown resolves a symlinked
//    package's imports from the symlink path, so both depend on this. A dropped
//    setting shows up as a root tree with a handful of entries instead of ~850.
const rootModules = path.join(ROOT, 'node_modules');
const rootEntries = existsSync(rootModules)
  ? readdirSync(rootModules).filter((entry) => !entry.startsWith('.'))
  : [];
const rootScope = { count: rootEntries.length, of: 'entries in the root node_modules' };

check(rootEntries.length > 400, 'the root node_modules is publicly hoisted', rootScope);

// 2. ...except typescript, which must NOT be hoisted. maximal/client pins
//    typescript ^7.0.2 and every other package pins ^5.9.3. Hoisting either one
//    shadows the other for any dependency that resolves by walking up rather
//    than through its own peer link, which is what made
//    eslint-plugin-perfectionist call a TS 5 API on the TS 7 module.
check(!rootEntries.includes('typescript'), 'typescript is exempt from the hoist', {
  count: 1,
  of: 'hoist exemptions',
});

const TYPESCRIPT_MAJORS = [
  ['packages/maximal-core', 5],
  ['packages/maximal/client', 7],
];
const ownTypescript = TYPESCRIPT_MAJORS.every(([pkg, major]) => {
  const version = manifestAt(ROOT, pkg, 'node_modules/typescript')?.version;
  return version != null && Number(version.split('.')[0]) === major;
});
check(
  ownTypescript,
  'each package resolves its own typescript major',
  { count: TYPESCRIPT_MAJORS.length, of: 'packages pinned to a typescript major' },
);

// 3. Radix's transitive deps, resolved from the SYMLINK path rather than the
//    realpath. This is the resolution mode Rolldown uses, and the one that goes
//    invisible under isolated linking -- failing one package at a time, which
//    reads as unrelated breakage.
const RADIX_TRANSITIVES = ['@radix-ui/react-primitive', 'react-remove-scroll'];
const rendererEntry = path.join(
  ROOT,
  'packages/maximal/client/node_modules/stuffbucket-electron/dist/renderer/index.js',
);
const rendererBuilt = existsSync(rendererEntry);
check(
  rendererBuilt &&
    RADIX_TRANSITIVES.every((specifier) => resolvesFrom(rendererEntry, specifier) !== null),
  'Radix transitive deps resolve through the symlink path',
  { count: RADIX_TRANSITIVES.length, of: 'radix transitive deps' },
);

// 4. Native dependencies work. esbuild is the sentinel for `allowBuilds`
//    specifically: its platform binary is fetched by a postinstall script, so
//    an allowlist that stops being honoured leaves `bin/esbuild` absent. Read
//    the binary rather than the setting, since the failure mode being guarded
//    against is a setting that is accepted and ignored.
const esbuildRoot = path.dirname(require.resolve('esbuild/package.json'));
check(
  existsSync(path.join(esbuildRoot, 'bin/esbuild')),
  'esbuild has the platform binary its postinstall fetches',
  { count: 1, of: 'postinstalled binaries' },
);

//    node-pty ships prebuilds for every platform, so the presence of a binary
//    proves nothing about THIS runtime -- loading it does. This is the check
//    that catches a node major switching under an install (the ABI moves, the
//    files do not), which is live here because .nvmrc and whatever is on PATH
//    are free to disagree.
let ptyLoads = false;
try {
  ptyLoads = typeof require('node-pty').spawn === 'function';
} catch {}
check(ptyLoads, `node-pty loads on this node ABI (${process.version})`, {
  count: 1,
  of: 'native modules loaded',
});

// 5. The `overrides` block moved out of package.json's `pnpm` field, which
//    pnpm 11 ignores. @stuffbucket/eslint-config now declares prettier at
//    3.8.3 directly, but the override still matters: it also pins the copies
//    that arrive transitively, which a declaration cannot reach. 3.9.6
//    reformats unions into lint errors across untouched files.
check(
  JSON.parse(readFileSync(require.resolve('prettier/package.json'), 'utf8')).version === '3.8.3',
  'the prettier override is in effect',
  { count: 1, of: 'overrides' },
);

//    The @electron/node-gyp override is the same shape: pnpm 11 refuses to
//    resolve a git-hosted subdependency at all, and @electron/rebuild pins one
//    by commit. The override redirects it to the identical version on the
//    registry, so what needs proving is that the resolved copy is that version
//    and not the tarball.
const nodeGyp = JSON.parse(
  readFileSync(require.resolve('@electron/node-gyp/package.json'), 'utf8'),
);
check(
  nodeGyp.version === '10.2.0-electron.1',
  'the @electron/node-gyp override resolves to the registry copy',
  { count: 1, of: 'overrides' },
);

// 6. One node version, and one vite major, across everything.
//
//    Declaring a version in .nvmrc does not make anything run on it: the
//    runtime in use is whatever is on PATH, and mise, a shell, and CI each
//    decide that separately. The engines fields are equally inert -- pnpm warns
//    at most. So compare the running major against the file that names it.
const wantedNodeMajor = Number(readFileSync(path.join(ROOT, '.nvmrc'), 'utf8').trim().split('.')[0]);
check(
  Number(process.versions.node.split('.')[0]) === wantedNodeMajor,
  `node ${String(wantedNodeMajor)}.x is what is running (${process.version})`,
  { count: 1, of: 'node runtimes' },
);

//    vite is the other one worth pinning globally: it is the bundler under the
//    electron renderer, the client, and (through astro) the Pages site. All
//    three install from the same workspace lockfile, so inspect their resolved
//    package-local trees in the same way.
const VITE_CONSUMERS = [
  'packages/maximal-electron',
  'packages/maximal/client',
  'packages/maximal/site',
];
const viteMajors = new Map();
for (const pkg of VITE_CONSUMERS) {
  const version = manifestAt(ROOT, pkg, 'node_modules/vite')?.version;
  if (version != null) viteMajors.set(pkg, version);
}

const EXPECTED_VITE_CONSUMERS = VITE_CONSUMERS.length;
const distinctViteMajors = new Set(
  [...viteMajors.values()].map((version) => version.split('.')[0]),
);
if (distinctViteMajors.size > 1 || ![...distinctViteMajors].every((m) => m === '8')) {
  for (const [pkg, version] of viteMajors) console.error(`       ${pkg}: vite ${version}`);
}
check(
  viteMajors.size === EXPECTED_VITE_CONSUMERS &&
    distinctViteMajors.size === 1 &&
    [...distinctViteMajors][0] === '8',
  'every vite consumer is on the same major (8)',
  { count: viteMajors.size, of: 'vite consumers' },
);

//    eslint is the third, and the one best able to hide a split: each package
//    runs its own eslint binary, so a package left behind on an older major
//    does not fail. It lints with a different engine against a different
//    resolved rule set and comes back green, which reads as "that package is
//    clean" rather than "that package was checked by something else". The
//    shared config states `eslint ^10.0.0` as a peer, and a peer range is
//    advisory -- pnpm warns and installs anyway -- so the range is not the
//    check. Every consumer is listed by name and every one must be observed:
//    a mistyped path drops a package out of the comparison silently, and a
//    comparison over four of five packages passes for the wrong reason.
const ESLINT_CONSUMERS = [
  'packages/eslint-config',
  'packages/maximal-core',
  'packages/maximal',
  'packages/maximal-electron',
  'packages/maximal/client',
];
const eslintVersions = new Map();
for (const pkg of ESLINT_CONSUMERS) {
  const version = manifestAt(ROOT, pkg, 'node_modules/eslint')?.version;
  if (version != null) eslintVersions.set(pkg, version);
}
const distinctEslintMajors = new Set(
  [...eslintVersions.values()].map((version) => version.split('.')[0]),
);
if (eslintVersions.size !== ESLINT_CONSUMERS.length || distinctEslintMajors.size !== 1) {
  for (const pkg of ESLINT_CONSUMERS) {
    console.error(`       ${pkg}: eslint ${eslintVersions.get(pkg) ?? '(not installed)'}`);
  }
}
check(
  eslintVersions.size === ESLINT_CONSUMERS.length &&
    distinctEslintMajors.size === 1 &&
    [...distinctEslintMajors][0] === '10',
  'every package resolves the same eslint major (10)',
  { count: eslintVersions.size, of: 'eslint consumers' },
);

// 7. Every registry artifact in the workspace lockfile is content-pinned.
//
//    SOURCES.md#lockfile-integrity owns the proxy rationale. Compare the
//    sha512 count with the number of artifact resolutions: checking only for
//    sha1 and shard URLs would miss sha256 or missing integrity.
const LOCKFILES = [
  {
    relative: 'pnpm-lock.yaml',
    contents: readFileSync(path.join(ROOT, 'pnpm-lock.yaml'), 'utf8'),
    // A `directory:` resolution is a workspace link with no artifact to pin.
    countEntries: (text) =>
      (text.match(/^ {4}resolution: \{/gm) ?? []).length -
      (text.match(/^ {4}resolution: \{directory:/gm) ?? []).length,
  },
];

let unpinned = 0;
let weakPins = 0;
let shardTarballs = 0;
let strongPins = 0;
let totalEntries = 0;

for (const { relative, contents, countEntries } of LOCKFILES) {
  const entries = countEntries(contents);
  // Anchor to pnpm's integrity field rather than package names containing an
  // algorithm string (for example @aws-crypto/sha256-browser).
  const integrity = (algorithm) =>
    (contents.match(new RegExp(`integrity: ${algorithm}-`, 'g')) ?? []).length;
  const strong = integrity('sha512');
  const weak = integrity('sha1');
  const otherAlgorithms = integrity('sha256') + integrity('sha384');
  const shards = (contents.match(/ms-feed-\d+\.pkgs\.visualstudio\.com/g) ?? []).length;

  totalEntries += entries;
  strongPins += strong;
  weakPins += weak;
  shardTarballs += shards;
  if (strong !== entries) unpinned += 1;

  if (strong !== entries || weak > 0 || shards > 0) {
    console.error(
      `       ${relative}: ${String(strong)} sha512 of ${String(entries)} entr(ies)` +
        `, ${String(weak)} sha1, ${String(otherAlgorithms)} other-algorithm` +
        `, ${String(shards)} rotating shard-host URL(s)`,
    );
  }
}
if (unpinned > 0 || weakPins > 0 || shardTarballs > 0) {
  console.error('       Repair with: node scripts/relock-integrity.mjs');
}
check(
  unpinned === 0 && weakPins === 0 && shardTarballs === 0 && totalEntries > 0,
  'every lockfile entry is content-pinned by sha512, with no shard-host URLs',
  { count: strongPins, of: 'sha512-pinned packages in the workspace lockfile' },
);

// 8. No two workspace packages may end up on different versions of the same
//    directly-declared dependency. maximal-electron pinned electron 43.2.0
//    while maximal/client pinned 43.3.0, so the UI library was tested against
//    one runtime and the app that ships it was built against another -- a
//    divergence nothing reported, because each package's own install was
//    internally consistent and every gate passed.
//
//    Only direct declarations are compared. Transitive duplicates are pnpm
//    doing its job (two dependents legitimately wanting different majors);
//    two workspace manifests naming the same dependency at different versions
//    is a decision nobody made.
//
//    A down-only ratchet, the same shape maximal-core uses for cycles and
//    clones: deliberate splits are named with their reason, the rest are a
//    backlog that may shrink and may not grow. Removing a split from the
//    backlog without removing it from this list fails too, so the list cannot
//    quietly outlive the problem it describes. When BACKLOG reaches zero,
//    delete it and this ratchet with it.
// Asked of pnpm rather than hand-listed. A hardcoded copy of
// pnpm-workspace.yaml's globs would leave a newly added package silently
// uncovered by the one check meant to catch silent things.
const WORKSPACE_MANIFESTS = JSON.parse(
  execFileSync('pnpm', ['ls', '--recursive', '--depth', '-1', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }),
).map((project) => path.relative(ROOT, project.path) || '.');
const DELIBERATE = new Map([
  [
    'typescript',
    'maximal/client is on the native port (7.x) while the rest are on 5.9.3; ' +
      'this is what the !typescript hoist exemption exists for',
  ],
]);
const BACKLOG = new Set(['@vitejs/plugin-react', 'lucide-react']);

/** name -> { declaredBy, byVersion } for every directly-declared dependency. */
const declared = new Map();
for (const pkg of WORKSPACE_MANIFESTS) {
  const manifest = manifestAt(ROOT, pkg);
  if (manifest === null) continue;
  const names = [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ];
  for (const name of names) {
    if (!declared.has(name)) declared.set(name, { declaredBy: 0, byVersion: new Map() });
    const record = declared.get(name);
    record.declaredBy += 1;
    // Counted separately from `declaredBy`: a dependency declared in two
    // packages but installed in only one is not evidence of alignment, and
    // treating it as such is how a half-finished install talks you into
    // editing the ratchet. Only fully observed names are judged below.
    const version = manifestAt(ROOT, pkg, 'node_modules', name)?.version;
    if (version == null) continue;
    if (!record.byVersion.has(version)) record.byVersion.set(version, []);
    record.byVersion.get(version).push(pkg);
  }
}

const split = new Map();
const observed = new Set();
for (const [name, { declaredBy, byVersion }] of declared) {
  if (declaredBy < 2) continue;
  const installed = [...byVersion.values()].reduce((total, pkgs) => total + pkgs.length, 0);
  if (installed === declaredBy) observed.add(name);
  if (byVersion.size < 2) continue;
  split.set(
    name,
    [...byVersion].map(([version, pkgs]) => `${pkgs.join('+')}@${version}`).join(', '),
  );
}

for (const [name, reason] of DELIBERATE) {
  if (split.has(name)) console.log(`       ${name} is split on purpose: ${reason}`);
}

const unexpected = [...split.keys()].filter((name) => !DELIBERATE.has(name) && !BACKLOG.has(name));
for (const name of unexpected) {
  console.error(`       ${name}: ${split.get(name)}`);
}
check(unexpected.length === 0, 'no new dependency is split across the workspace', {
  count: declared.size,
  of: 'declared dependency names',
});

const healed = [...BACKLOG].filter((name) => observed.has(name) && !split.has(name));
for (const name of healed) {
  console.error(`       ${name} is aligned now — drop it from BACKLOG`);
}
// Scoped to the names compared, not to BACKLOG: scoping to the backlog would
// make this assertion fail as an empty set at the exact moment the last split
// is fixed, which is the state it exists to reach.
check(healed.length === 0, 'the known-split list has no stale entries', {
  count: observed.size,
  of: 'dependencies declared by more than one package',
});

process.exit(summary('verify:workspace'));
