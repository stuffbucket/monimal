#!/usr/bin/env node
/**
 * The shell stays agnostic about the application it hosts.
 *
 * Two checks, because two things go wrong. An import is a real dependency, so
 * it is parsed rather than matched: `require.resolve` and `createRequire`
 * launder one past any grep. A literal is a name that leaked into code or
 * prose, so it is read.
 *
 * CI-only, no git hook, per issue #16. `scripts/neutrality.mjs` holds the
 * logic and `tests/neutrality.test.ts` fixture-tests it on positives and on
 * non-violations.
 *
 * ## Scope, decided here rather than inherited
 *
 * Every file under `src`, and `README.md`. `README.md` is the only prose npm
 * puts in the tarball, so it is the only document a consumer receives; `docs/`
 * is this repository's own engineering record, written throughout by
 * comparison with the sibling it was extracted from, and nobody installs it.
 * That boundary is asserted below, not assumed: a manifest that starts
 * shipping documentation fails.
 *
 * Naming a repository is not depending on it, so a term inside a
 * `stuffbucket/…` slug is exempt. This repository is called maximal-electron.
 * Without that one rule the scan fails on its own Help menu URL and says
 * nothing about a real leak.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FORBIDDEN_PACKAGES,
  forbiddenImports,
  forbiddenTerms,
  isForbiddenPackage,
  moduleSpecifiers,
  termMatches,
} from './neutrality.mjs';
import { packedName } from './export-checks.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

/** The stylesheet ships from here; `copy-renderer-css.mjs` moves it. */
const SHIPPED_STYLESHEET = 'src/renderer/styles/structural.css';

/**
 * Files that name the application this shell was extracted from, and are not
 * shipped. Each is verified below to exist, to still contain a match, and to
 * be absent from the export graph, so the list cannot cover a file a consumer
 * installs and cannot outlive the debt it records.
 */
const ALLOWED = [
  {
    file: 'src/main/native/agent.ts',
    reason:
      'the reference application discovers a provider on localhost. Issue #22 injects the origin instead.',
  },
  {
    file: 'src/shared/ipc.ts',
    reason:
      'AgentProvider names that provider chain. Removed with the runMain seam in issue #22.',
  },
];

const failures = [];
const check = (condition, message) => {
  console.log(`${condition ? '  ok  ' : ' FAIL '} ${message}`);
  if (!condition) failures.push(message);
};
const detail = (line) => {
  console.log(`         ${line}`);
};

function walk(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walk(full));
    else if (entry.isFile()) found.push(path.relative(ROOT, full).split(path.sep).join('/'));
  }
  return found;
}

const sourceFiles = walk(path.join(ROOT, 'src')).sort();
const programFiles = sourceFiles.filter((file) => /\.tsx?$/.test(file));
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8');

/* ------------------------------------------------------ the parse itself */

/*
 * Before the tree, the fixture.
 *
 * Every check below reports nothing when the parse returns nothing, and this
 * repository has shipped four passes of exactly that shape. So the collector
 * proves it still sees each laundering form on a source it carries, and the
 * run stops here if it does not.
 */
const LAUNDERING = `
  import { createRequire as make } from 'node:module';
  import 'maximal';
  export { a } from 'maximal-core';
  import type { B } from '@stuffbucket/maximal-core';
  import legacy = require('maximal');
  const later = make(import.meta.url);
  await import('maximal/client');
  require('maximal');
  require.resolve('maximal-core');
  later('@stuffbucket/maximal-core');
  later.resolve('maximal');
  make(import.meta.url)('maximal');
  make(import.meta.url).resolve('maximal');
  import.meta.resolve('maximal');
  type C = import('maximal-core').D;
`;

/** One per line of `LAUNDERING` that reaches a denied package. */
const LAUNDERING_FORMS = [
  'createRequire().resolve',
  'createRequire()()',
  'dynamic import',
  'export from',
  'import',
  'import =',
  'import type',
  'import.meta.resolve',
  'require',
  'require.resolve',
];

console.log('Import parse');
const laundered = forbiddenImports(LAUNDERING, 'fixture.ts');
const forms = [...new Set(laundered.map((found) => found.form))].sort();
check(laundered.length === 13, `${String(laundered.length)} of 13 laundered imports caught`);
check(
  forms.join('|') === [...LAUNDERING_FORMS].sort().join('|'),
  'every laundering form is recognised',
);
detail(forms.join(', '));
if (failures.length > 0) {
  console.error('\nThe import parse is broken, so no result below means anything.');
  process.exit(1);
}

/* -------------------------------------------------------------- imports */

console.log('\nForbidden imports');
// The floor. A walk that found no file, or a parse that found no specifier,
// would report a clean tree by inspecting nothing.
check(programFiles.length > 20, `${String(programFiles.length)} TypeScript sources parsed`);

const specifiers = new Map(programFiles.map((file) => [file, moduleSpecifiers(read(file), file)]));
const total = [...specifiers.values()].reduce((sum, found) => sum + found.length, 0);
check(total > 0, `${String(total)} module specifiers read`);

let reached = 0;
for (const [file, found] of specifiers) {
  for (const one of found) {
    if (one.text === undefined) {
      reached += 1;
      check(false, `${file}:${String(one.line)} ${one.form} takes a computed specifier`);
      detail('a specifier this parse cannot read is a specifier this guard cannot judge');
    } else if (isForbiddenPackage(one.text)) {
      reached += 1;
      check(false, `${file}:${String(one.line)} ${one.form} '${one.text}'`);
    }
  }
}
check(reached === 0, `no source reaches ${FORBIDDEN_PACKAGES.join(', ')}`);

/* --------------------------------------------------------- what ships */

/*
 * The export graph, from the manifest rather than a list written here. A
 * hand-written list is how `verify-exports.mjs` once checked targets nobody
 * had added to it.
 */
const entries = Object.values(manifest.exports ?? {})
  .flatMap((entry) => (typeof entry === 'string' ? [entry] : Object.values(entry)))
  .filter((target) => typeof target === 'string' && /^\.\/dist\/.+\.js$/.test(target))
  .map((target) => target.replace(/^\.\/dist\//, 'src/').replace(/\.js$/, ''));

const shipped = new Set([SHIPPED_STYLESHEET]);
const pending = [...entries];
while (pending.length > 0) {
  const specifier = pending.pop();
  const file = ['.ts', '.tsx', '/index.ts']
    .map((extension) => `${specifier}${extension}`)
    .find((candidate) => existsSync(path.join(ROOT, candidate)));
  if (file === undefined || shipped.has(file)) continue;
  shipped.add(file);

  const directory = path.posix.dirname(file);
  for (const one of specifiers.get(file) ?? []) {
    if (one.text?.startsWith('.') === true) {
      pending.push(path.posix.join(directory, one.text.replace(/\.js$/, '')));
    }
  }
}

console.log('\nWhat a consumer receives');
check(entries.length > 0, `${String(entries.length)} export entry points in the manifest`);
check(shipped.size > 5, `${String(shipped.size)} files reachable from them`);
check(shipped.has(SHIPPED_STYLESHEET), `${SHIPPED_STYLESHEET} is in the shipped set`);
check(shipped.has('src/renderer/index.ts'), 'src/renderer/index.ts is in the shipped set');

/*
 * The docs boundary, asserted. `docs/` is out of scope because npm does not
 * pack it. If that stops being true the scope is wrong, and this says so.
 */
const packedDocs = (manifest.files ?? []).filter(
  (entry) => entry === 'docs' || entry.startsWith('docs/') || entry.endsWith('.md'),
);
check(packedDocs.length === 0, 'the manifest packs no documentation beyond README.md');

/* ---------------------------------------------------------------- terms */

const terms = forbiddenTerms(process.env);
const scanned = [...sourceFiles, 'README.md'];
const allowed = new Map(ALLOWED.map((entry) => [entry.file, entry.reason]));

/*
 * This package's own name, which carries a forbidden term because the
 * repository is called maximal-electron. Naming yourself is not depending on
 * a sibling. Both forms: the specifier a consumer imports, and the flattened
 * one npm writes as a release asset. The guard on the guard is below: the
 * exemption may not be a package the import rule denies, so it can never
 * cancel a real one.
 */
const selfNames = [manifest.name, packedName(manifest.name)];

console.log(`\nNeutrality scan (${terms.join(', ')})`);
// Two more floors. An empty term list matches nothing, and so does an empty
// corpus.
check(terms.length > 0, `${String(terms.length)} forbidden terms`);
check(scanned.length > 20, `${String(scanned.length)} files scanned`);
check(
  !isForbiddenPackage(manifest.name),
  `the self-name exemption ${manifest.name} is not a denied package`,
);
// A dead exemption is a rule nobody notices has stopped applying. If the name
// stops carrying a term, these lines go.
for (const self of selfNames) {
  check(termMatches(self, terms).length > 0, `${self} needs the self-name exemption`);
}

for (const entry of ALLOWED) {
  check(scanned.includes(entry.file), `${entry.file} is a file the scan covers`);
}

let clean = 0;
for (const file of scanned) {
  const matches = termMatches(read(file), terms, selfNames);
  const reason = allowed.get(file);

  if (reason === undefined) {
    if (matches.length === 0) {
      clean += 1;
      continue;
    }
    check(false, `${file} names ${String(matches.length)}`);
    for (const match of matches) detail(`${String(match.line)} [${match.term}] ${match.excerpt}`);
    continue;
  }

  // A dead exemption is a rule nobody notices has stopped applying. Fix the
  // file and this line has to go with it.
  check(matches.length > 0, `${file} still needs its exemption`);
  check(!shipped.has(file), `${file} is exempt and is not shipped`);
  detail(`${String(matches.length)} allowed: ${reason}`);
}
const expected = scanned.length - allowed.size;
check(clean === expected, `${String(clean)} of ${String(expected)} files name none of them`);

if (failures.length > 0) {
  console.error(`\n${String(failures.length)} neutrality check(s) failed.`);
  process.exit(1);
}

console.log(
  `\nThe shell is neutral (${String(programFiles.length)} sources parsed, ${String(scanned.length)} scanned, ${String(shipped.size)} shipped).`,
);
