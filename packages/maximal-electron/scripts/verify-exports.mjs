#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

import { buildPackage } from './build-package.mjs';
import { selectors, unscopedSelectors } from './css-selectors.mjs';
import {
  RENDERER_SURFACE,
  VERIFY_SURFACE,
  dependencyContractChecks,
  exportTargets,
  mainSurfaceChecks,
  moduleGraphChecks,
  preloadSurfaceChecks,
  reExportedNames,
} from './export-checks.mjs';
import { PEER_TABLE_EXCEPTIONS, peerTable, peerTableChecks } from './peer-table.mjs';
import { packageStylesheets } from './shell-variables.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

/*
 * Build first, here, rather than in front of this script in `package.json`.
 *
 * Everything below reads `dist/`: the export targets, the shipped stylesheet,
 * the renderer import graph, the packed file list. A run against whatever was
 * last built is a green run over the wrong files, and there is no way to tell
 * the two apart from the output.
 *
 * It is also what lets the pack below skip lifecycle scripts. This IS the
 * build `prepack` runs -- the same function, from the same file -- so the
 * artifact npm would produce is already on disk by the time it is asked what
 * it would pack.
 */
await buildPackage();
const failures = [];
const check = (condition, message) => {
  console.log(`${condition ? '  ok  ' : ' FAIL '} ${message}`);
  if (!condition) failures.push(message);
};

console.log('Package dependency contract');
const dependencies = await dependencyContractChecks(root, manifest);
for (const { name, ok } of dependencies.checks) check(ok, name);

/*
 * The peer table in `README.md`. Issue #121.
 *
 * `README.md` said the table could not drift from what the code imports without
 * failing a check, and no check read it. It is the first thing a consumer reads
 * to decide what to install, and it was maintained by hand.
 */
const readme = await readFile(path.join(root, 'README.md'), 'utf8');
const table = peerTable(readme, manifest.name);
console.log(
  `\nPeer table in README.md (${String(table.size)} rows against ${String(dependencies.reached.size)} entry points)`,
);
for (const { name, ok, detail } of peerTableChecks({
  table,
  reached: dependencies.reached,
  peers: Object.keys(manifest.peerDependencies ?? {}),
  exceptions: PEER_TABLE_EXCEPTIONS,
})) {
  check(ok, name);
  if (!ok && detail !== '') console.log(`         ${detail}`);
}

/*
 * `scripts/export-checks.mjs` holds what an export has to satisfy.
 * `verify-git-install.mjs` asks the same questions of a package installed by
 * git ref, which runs `prepare` where this path runs `prepack`. Issue #83.
 */
const targets = exportTargets(manifest.exports);

console.log('\nPackage export targets');
// The floor. An empty map would report every check below as passing by
// checking nothing.
check(targets.length > 0, 'the manifest declares at least one export');
for (const { subpath, condition, target } of targets) {
  check(existsSync(path.join(root, target)), `${subpath} ${condition} -> ${target} exists`);
}

/*
 * The stylesheet a consumer installs.
 *
 * The published stylesheet ships unbundled and unscoped by anything but itself,
 * so a selector that escapes `.sb-shell` restyles the consumer's whole
 * application. `tests/package-exports.test.ts` judges the sources; this judges
 * the artifact, and asserts the two agree, which nothing did while
 * `scripts/copy-renderer-css.mjs` was the only thing keeping them in step.
 * Issue #51.
 *
 * The sources come from `packageStylesheets()`, which is also what the copy
 * step and the `--shell-*` contract check read. Naming a file here instead
 * would be the fourth place a stylesheet is listed.
 */
console.log('\nShipped stylesheet');
const SHELL_ROOT = '.sb-shell';
const publishedSheet = packageStylesheets().find(
  (sheet) => sheet.published === manifest.exports['./renderer/styles.css']?.replace(/^\.\//, ''),
);
const stylesheetSource = publishedSheet
  ? (
      await Promise.all(
        publishedSheet.sources.map((source) => readFile(path.join(root, source), 'utf8')),
      )
    ).join('\n')
  : '';
const stylesheetTarget = manifest.exports['./renderer/styles.css'];
const shipped = existsSync(path.join(root, stylesheetTarget ?? ''))
  ? await readFile(path.join(root, stylesheetTarget), 'utf8')
  : '';
const shippedSelectors = selectors(shipped);

check(
  publishedSheet !== undefined && shipped === stylesheetSource,
  `${String(stylesheetTarget)} is its sources, concatenated`,
  { count: publishedSheet?.sources.length ?? 0, of: 'source stylesheets' },
);
// The floor. A parse that found nothing would report every selector scoped by
// judging none of them.
check(shippedSelectors.length > 30, `${String(shippedSelectors.length)} selectors were read`);
const escaping = unscopedSelectors(shipped, SHELL_ROOT);
check(escaping.length === 0, `every selector is scoped under ${SHELL_ROOT}`);
for (const selector of escaping) console.log(`         ${selector}`);

const rendererEntry = path.join(root, manifest.exports['./renderer'].default);
const rendererSource = await readFile(rendererEntry, 'utf8');
check(
  JSON.stringify(reExportedNames(rendererSource)) === JSON.stringify(RENDERER_SURFACE),
  'renderer JavaScript exposes only the approved component surface',
);
check(
  import.meta.resolve(`${manifest.name}/renderer`) ===
    new URL(manifest.exports['./renderer'].default, `file://${root}/`).href,
  'renderer package specifier resolves to the built entry',
);

/*
 * The packaging checks a consumer runs. Issue #76.
 *
 * Plain ESM under `scripts/` rather than TypeScript in `src/`, because `dist/`
 * is ESM syntax in a package with no `"type": "module"`: a bundler reads it and
 * `node` refuses it. This one is imported by a packaging script, not bundled
 * into an application, so it has to load under plain `node`. Importing it here
 * is what proves that.
 */
console.log('\nConsumer verification export');
const verifySpecifier = `${manifest.name}/verify`;
const verifyTarget = manifest.exports['./verify']?.default;
check(typeof verifyTarget === 'string', 'the manifest declares a ./verify export');

let verifyNames = [];
let resolved;
try {
  resolved = import.meta.resolve(verifySpecifier);
  verifyNames = Object.keys(await import(verifySpecifier)).sort();
} catch (error) {
  console.log(`         ${error.message}`);
}

check(
  typeof verifyTarget === 'string' &&
    resolved === new URL(verifyTarget, `file://${root}/`).href,
  'the ./verify specifier resolves to the file the manifest names',
);
// The floor. A specifier that fails to load leaves the comparison below with
// nothing to compare, and a bare mismatch says nothing about why.
check(verifyNames.length > 0, 'the ./verify export loads under plain node');
check(
  JSON.stringify(verifyNames) === JSON.stringify(VERIFY_SURFACE),
  'the ./verify export exposes the documented names',
);

/*
 * The main-process seam. Issue #15.
 */
console.log('\nMain-process seam');
const mainChecks = await mainSurfaceChecks(root, manifest.exports['./main']?.types);
for (const { name, ok } of mainChecks.checks) check(ok, name);

/*
 * The preload seam. Issue #17.
 */
console.log('\nPreload bridge seam');
const preloadChecks = await preloadSurfaceChecks(root, manifest.exports['./preload']?.types);
for (const { name, ok } of preloadChecks.checks) check(ok, name);

console.log('\nRenderer import graph');
const { checks: graphChecks, inspected } = await moduleGraphChecks(root, rendererEntry);
for (const { name, ok } of graphChecks) check(ok, name);

/*
 * `--ignore-scripts`, because this script already ran the build they perform.
 *
 * It used to run them, on the reasoning that skipping them would test whether
 * a stale build happened to be on disk. `buildPackage()` above answers that:
 * the tree npm is asked about was written by the same function `prepack`
 * calls, moments ago.
 *
 * What the hooks bought was not worth what they cost. `npm pack` runs BOTH
 * `prepare` and `prepack`, so the package built three times per run, and
 * whatever they wrote to stdout arrived in the middle of the JSON parsed
 * here. When those hooks shelled into `pnpm run`, that was pnpm's resolution
 * progress -- silent in CI, where the lockfile matches the registry, and
 * several kilobytes of it on a developer machine behind the proxy registry in
 * `.npmrc`. The check passed in CI and died with `Unexpected token 'S'`
 * everywhere else, and rewrote `pnpm-lock.yaml` on its way out (issue #26).
 *
 * `scripts/build-package.mjs` removed the nested package manager, and this
 * removes the dependence on the build staying quiet.
 */
const packOutput = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
  cwd: root,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
});

let packed;
try {
  packed = JSON.parse(packOutput)[0].files.map((file) => file.path);
} catch (error) {
  // A bare `Unexpected token` names neither the command nor what it said. The
  // failure this replaces cost an afternoon for exactly that reason.
  console.error(
    `npm pack --dry-run --json did not return JSON: ${error.message}\n` +
      `First 200 characters of its stdout:\n${packOutput.slice(0, 200)}`,
  );
  process.exit(1);
}

console.log('\nPacked library artifacts');
for (const { target } of targets) {
  const packedPath = target.replace(/^\.\//, '');
  check(packed.includes(packedPath), `${packedPath} is included by npm pack`);
}

/* ------------------------------------------------------- artifact freshness */

/*
 * `dist/` is a build artifact that is also committed, and `.gitignore` lists
 * it. Once a file is tracked the ignore stops applying, so a build rewrites
 * tracked files and nothing says so. Everything above then reads whatever was
 * last committed: the export names, the import graph, the packed paths. Each
 * check passes against an artifact that may be several merges behind `src/`,
 * which is a green run over the wrong files.
 *
 * That is not hypothetical. `npm run verify:exports` builds first, so a
 * difference here means the committed artifact and the source disagree — which
 * they did after the tab strip landed, leaving the published `./renderer`
 * export one merged pull request behind.
 *
 * Issue #33 proposes building at pack time and untracking `dist/` entirely.
 * This check reports nothing once that lands, because there is nothing tracked
 * to be stale.
 */
console.log('\nCommitted artifacts');
const git = (...args) => {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  } catch {
    return undefined;
  }
};

const tracked = git('ls-files', '--', 'dist');
if (tracked === undefined) {
  console.log('  skip   git is not available, so staleness cannot be judged');
} else if (tracked.trim() === '') {
  console.log('  skip   dist is not tracked, so there is nothing to be stale');
} else {
  // Both directions. A modified file is a rebuild nobody committed. A file
  // this build wrote that git does not track is a new export missing from the
  // artifact a consumer installs, and `.gitignore` keeps it out of
  // `git status`.
  const changed = (git('status', '--porcelain', '--', 'dist') ?? '').trim();
  const onDisk = readdirSync(path.join(root, 'dist'), {
    recursive: true,
    encoding: 'utf8',
  })
    .map((entry) => `dist/${entry.split(path.sep).join('/')}`)
    .filter((entry) => existsSync(path.join(root, entry)) && /\.[a-z]+$/.test(entry));
  const untracked = onDisk.filter((entry) => !tracked.includes(`${entry}\n`));

  check(changed === '', 'committed dist matches a fresh build');
  if (changed !== '') console.log(changed);
  check(untracked.length === 0, 'every built file is committed');
  for (const entry of untracked) console.log(`         ${entry}`);
}

if (failures.length > 0) {
  console.error(`\n${String(failures.length)} export check(s) failed.`);
  process.exit(1);
}

console.log(`\nAll exports passed (${String(inspected)} renderer modules inspected).`);
