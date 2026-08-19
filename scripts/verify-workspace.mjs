#!/usr/bin/env node
/**
 * Verify the install actually has the shape the config asks for.
 *
 * Every one of these assertions exists because the corresponding failure is
 * silent. pnpm 11 stopped reading `public-hoist-pattern` from `.npmrc` without
 * warning, which emptied the root `node_modules` -- the install still
 * succeeded, `build`, `typecheck` and `test` still passed, and only
 * `electron-forge package` would have failed, which CI did not run. In the
 * same migration `onlyBuiltDependencies` was renamed to `allowBuilds` and the
 * old key was accepted and ignored, so every native dependency silently went
 * unbuilt.
 *
 * The shared property is that a dropped setting looks exactly like a satisfied
 * one from the outside. These checks read the installed tree instead of the
 * config, so a setting that stops being honoured turns red here rather than
 * somewhere far away and much later.
 */

import { createRequire } from 'node:module';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

let failed = 0;
let assertions = 0;

function check(ok, label, detail) {
  assertions += 1;
  if (!ok) failed += 1;
  const mark = ok ? ' ok  ' : 'FAIL ';
  console.log(`  ${mark} ${label}${detail ? `  [${detail}]` : ''}`);
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
  ? readdirSync(rootModules).filter((e) => !e.startsWith('.')).length
  : 0;
check(rootEntries > 400, 'the root node_modules is publicly hoisted', `${rootEntries} entries`);

// 2. ...except typescript, which must NOT be hoisted. maximal/client pins
//    typescript ^7.0.2 and every other package pins ^5.9.3. Hoisting either one
//    shadows the other for any dependency that resolves by walking up rather
//    than through its own peer link, which is what made
//    eslint-plugin-perfectionist call a TS 5 API on the TS 7 module.
check(
  !existsSync(path.join(rootModules, 'typescript')),
  'typescript is exempt from the hoist',
  existsSync(path.join(rootModules, 'typescript')) ? 'hoisted — it will shadow' : 'not hoisted',
);

for (const [pkg, major] of [
  ['packages/maximal-core', 5],
  ['packages/maximal/client', 7],
]) {
  const manifest = path.join(ROOT, pkg, 'node_modules/typescript/package.json');
  const version = existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8')).version : null;
  check(
    version !== null && Number(version.split('.')[0]) === major,
    `${pkg} resolves its own typescript ${major}.x`,
    version ?? 'not resolvable',
  );
}

// 3. Radix's transitive deps, resolved from the SYMLINK path rather than the
//    realpath. This is the resolution mode Rolldown uses, and the one that goes
//    invisible under isolated linking -- failing one package at a time, which
//    reads as unrelated breakage.
const rendererEntry = path.join(
  ROOT,
  'packages/maximal/client/node_modules/stuffbucket-electron/dist/renderer/index.js',
);
for (const specifier of ['@radix-ui/react-primitive', 'react-remove-scroll']) {
  check(
    existsSync(rendererEntry) && resolvesFrom(rendererEntry, specifier) !== null,
    `${specifier} resolves through the symlink path`,
    existsSync(rendererEntry) ? undefined : 'renderer entry missing — run build first',
  );
}

// 4. Native dependencies work. esbuild is the sentinel for `allowBuilds`
//    specifically: its platform binary is fetched by a postinstall script, so
//    an allowlist that stops being honoured leaves `bin/esbuild` absent. Read
//    the binary rather than the setting, since the failure mode being guarded
//    against is a setting that is accepted and ignored.
const esbuild = resolvesFrom(path.join(ROOT, 'noop.js'), 'esbuild');
let esbuildBinary = false;
if (esbuild) {
  const esbuildRoot = esbuild.slice(0, esbuild.lastIndexOf('/esbuild/') + '/esbuild/'.length);
  esbuildBinary = existsSync(path.join(esbuildRoot, 'bin/esbuild'));
}
check(esbuildBinary, 'esbuild has its platform binary', esbuildBinary ? undefined : 'postinstall did not run');

//    node-pty ships prebuilds for every platform, so the presence of a binary
//    proves nothing about THIS runtime -- loading it does. This is the check
//    that catches a node major switching under an install (the ABI moves, the
//    files do not), which is live here because .nvmrc and whatever is on PATH
//    are free to disagree.
let ptyLoads = false;
let ptyDetail = 'did not load';
try {
  const pty = createRequire(path.join(ROOT, 'noop.js'))('node-pty');
  ptyLoads = typeof pty.spawn === 'function';
  if (!ptyLoads) ptyDetail = 'loaded but exposes no spawn()';
} catch (error) {
  ptyDetail = String(error.message).split('\n')[0].slice(0, 60);
}
check(ptyLoads, 'node-pty loads on this node ABI', ptyLoads ? `node ${process.version}` : ptyDetail);

// 5. The `overrides` block moved out of package.json's `pnpm` field, which
//    pnpm 11 ignores. prettier is declared nowhere -- it arrives through
//    @echristian/eslint-config -- so the override is the only thing pinning it,
//    and 3.9.6 reformats unions into lint errors across untouched files.
const prettier = resolvesFrom(path.join(ROOT, 'noop.js'), 'prettier/package.json');
const prettierVersion = prettier ? JSON.parse(readFileSync(prettier, 'utf8')).version : null;
check(prettierVersion === '3.8.3', 'the prettier override is in effect', prettierVersion ?? 'not resolvable');

console.log(
  `verify:workspace: ${assertions} assertion(s), ${failed} failed`,
);
process.exit(failed > 0 ? 1 : 0);
