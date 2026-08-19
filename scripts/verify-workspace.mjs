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
//    pnpm 11 ignores. prettier is declared nowhere -- it arrives through
//    @echristian/eslint-config -- so the override is the only thing pinning it,
//    and 3.9.6 reformats unions into lint errors across untouched files.
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

// 6. No two workspace packages may end up on different versions of the same
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
