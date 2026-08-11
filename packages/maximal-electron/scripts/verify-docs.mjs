#!/usr/bin/env node
/**
 * Verify what the documentation claims.
 *
 * This repository tried a prose linter and removed it. The rules could not
 * tell a rule from a description, an identifier from an English word, or a
 * hedge from an instruction, and a faithful pass over the docs inverted a
 * modal on the repository's central invariant.
 *
 * None of that applies to a name. `npm run lint:docs` either is a script or is
 * not. `READ_ONLY_TOOLS` either appears in the source or it does not. Those
 * are decidable, and every documentation defect this repository has actually
 * shipped was one of them, including three introduced in a single afternoon by
 * renaming code and not grepping the docs.
 *
 * So: no style rules, and no model. Four checks that a compiler would make if
 * prose went through one, each reporting how many claims it read.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { scopedChecks } from './check-scope.mjs';
import { constants, links, npmScripts, npmScriptsOutOfScope, pathClaims } from './docs-claims.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Documented prose. Everything here is checked. */
const DOC_ROOTS = ['docs', '.claude/skills'];
const DOC_FILES = ['README.md', 'AGENTS.md'];

/**
 * Prose describing what does not exist yet.
 *
 * This check asks whether a documented name is real. A proposal argues for
 * names that are not real, which is the point of writing one, so running the
 * check over it produces a failure that says only "this has not been built".
 *
 * The cost is honest and worth stating: a proposal that is accepted and built
 * gets no name checking until its content moves into a document outside this
 * directory. Move it when it lands, rather than leaving it here as the record.
 */
const DOC_EXEMPT = ['docs/proposals'];

/**
 * Where a name has to appear to count as real.
 *
 * Deliberately wide. A constant may live in source, a fuse in `forge.config.ts`,
 * an environment variable in a workflow. The check is "does this exist
 * anywhere outside the prose", not "is it exported from the module I expect".
 */
const SOURCE_ROOTS = ['src', 'e2e', 'tests', 'scripts', '.github', 'build'];

/**
 * This checker does not count as evidence for itself.
 *
 * All three files name `READ_ONLY_TOOLS` and `MIN_SCREENSHOT_BYTES` as
 * examples of what they catch. Left in the haystack, those mentions make the
 * two dead symbols look alive, and the check silently stops working on exactly
 * the case it was written for.
 *
 * The unit tests belong here for the same reason, found by breaking the build
 * output rule on purpose: the fixture naming the break made the haystack
 * vouch for it, and the run went green.
 */
const SELF = [
  'scripts/verify-docs.mjs',
  'scripts/docs-claims.mjs',
  'tests/docs-claims.test.ts',
];
const SOURCE_FILES = [
  'package.json',
  'forge.config.ts',
  'stryker.conf.json',
  'eslint.config.mjs',
  'vitest.config.ts',
  'playwright.config.ts',
  'tsconfig.json',
];

/** Where a backticked path is read as a claim about this checkout. */
const PATH_ROOTS = [...SOURCE_ROOTS, 'docs', '.claude'];

/**
 * Build output, which no checkout contains.
 *
 * A build produces `.vite/build/main.js`, so `existsSync` cannot decide it.
 * What is decidable is whether the build configuration or a packaging check
 * names the same string, which is the rule `constants` already uses. Before
 * #152 a build path matched no root at all, and `.vite/build/llama-worker-BREAK.js`
 * sat in `docs/architecture.md` through a green run.
 *
 * `out/` is not a root here. Packager composes that directory name from the
 * product name and the target triple, so there is no literal in the source to
 * match, and a bare `out` matches the English word in every file.
 */
const BUILD_ROOTS = ['.vite'];

/**
 * Bases that a document writes module paths relative to.
 *
 * The native integration table in `docs/architecture.md` reads
 * `native/crash-reports.ts` and `host/crash-artifacts.ts` in one row, at two
 * different depths, because a reader of that table is inside the source tree
 * already. A name resolves when any base holds it.
 */
const RELATIVE_BASES = ['src', 'src/main', 'src/renderer'];

/** The extensions that make a relative name a module rather than prose. */
const MODULE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.css', '.html'];

/**
 * Paths the documentation names that are deliberately not here.
 *
 * A document may name another repository's file, or record what a deletion
 * took with it. Nothing in the syntax tells those from a stale reference, so
 * they are declared, with the reason, and the check fails when one of them
 * starts existing. A list that only ever grows is the exemption becoming the
 * rule.
 */
const PATHS_NOT_HERE = new Map([
  ['scripts/build-msi.ps1', 'deleted with the MSI in #119; docs/release.md records what went'],
  ['scripts/verify-msi.ps1', 'deleted with the MSI in #119'],
  ['build/windows/app.wxs', 'deleted with the MSI in #119'],
  ['tests/wxs.test.ts', 'deleted with the MSI in #119'],
  ['scripts/prebuild.js', "node-pty's, run by its own install"],
  ['src/main/shell.ts', "maximal/client's, named in docs/embedding.md as the consumer's side"],
  ['src/renderer/.vite/', 'the output path a misconfigured `root` produces, and must not exist'],
  [
    'client/src/renderer/styles/shell-adapter.css',
    "maximal/client's adapter, counted in docs/shell-variables.md",
  ],
  ['shell/src/ui/styles/tokens.css', "stuffbucket/maximal's scale, followed by ours"],
]);

const { check, summary } = scopedChecks();

console.log('Verifying the corpus before verifying anything in it\n');

/**
 * Every file under `dir`.
 *
 * A `readdirSync` failure used to return an empty list, so a renamed `docs/`
 * left the run green over a smaller corpus. It throws now, and the roots are
 * floored below.
 */
function walk(dir, match) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walk(full, match));
    else if (entry.isFile() && match(entry.name)) found.push(full);
  }
  return found;
}

/** A glob's literal directory prefix, and a matcher for the whole pattern. */
function globMatches(pattern) {
  const firstStar = pattern.indexOf('*');
  const base = path.posix.dirname(pattern.slice(0, firstStar) + 'x');
  if (!existsSync(path.join(ROOT, base))) return [];

  const expression = pattern
    .split(/(\*\*|\*)/)
    .map((part) =>
      part === '**' ? '.*' : part === '*' ? '[^/]*' : part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'),
    )
    .join('');
  const matcher = new RegExp(`^${expression}$`);

  return walk(path.join(ROOT, base), () => true)
    .map((file) => path.relative(ROOT, file).split(path.sep).join('/'))
    .filter((file) => matcher.test(file));
}

/** Whether a documented path names something in this checkout. */
function pathExists(target) {
  if (target.includes('*')) return globMatches(target).length > 0;
  return existsSync(path.join(ROOT, target));
}

/** Whether a name written from inside the source tree resolves under a base. */
function relativeExists(target) {
  return RELATIVE_BASES.some((base) => pathExists(`${base}/${target}`));
}

/**
 * The part of a build-output path a substring test can decide.
 *
 * A checkout has no `.vite/`, so existence is not the question and being named
 * by the configuration that produces it is. A glob is read to its literal
 * prefix, because expanding the rest would need a build.
 */
function buildLiteral(target) {
  const star = target.indexOf('*');
  return (star === -1 ? target : target.slice(0, star)).replace(/\/$/, '');
}

/* ------------------------------------------------------------- the corpus */

const missingRoots = [...DOC_ROOTS, ...SOURCE_ROOTS].filter(
  (dir) => !existsSync(path.join(ROOT, dir)),
);
check(
  missingRoots.length === 0,
  missingRoots.length === 0
    ? 'every declared root exists'
    : `these declared roots do not exist: ${missingRoots.join(', ')}`,
  { count: DOC_ROOTS.length + SOURCE_ROOTS.length, of: 'declared roots' },
);
if (missingRoots.length > 0) process.exit(summary('verify:docs'));

const docsByRoot = new Map(
  DOC_ROOTS.map((dir) => [dir, walk(path.join(ROOT, dir), (name) => name.endsWith('.md'))]),
);
for (const [dir, found] of docsByRoot) {
  check(true, `${dir} holds documents`, { count: found.length, of: 'documents' });
}

const docs = [
  ...DOC_FILES.map((file) => path.join(ROOT, file)),
  ...[...docsByRoot.values()].flat(),
]
  .filter((file) => existsSync(file))
  .filter((file) => {
    const relative = path.relative(ROOT, file);
    return !DOC_EXEMPT.some((dir) => relative.startsWith(dir + path.sep));
  });

const sourceByRoot = new Map(
  SOURCE_ROOTS.map((dir) => [dir, walk(path.join(ROOT, dir), () => true)]),
);
for (const [dir, found] of sourceByRoot) {
  check(true, `${dir} holds source`, { count: found.length, of: 'files' });
}

const sourceFiles = [
  ...SOURCE_FILES.map((file) => path.join(ROOT, file)),
  ...[...sourceByRoot.values()].flat(),
]
  .filter((file) => existsSync(file))
  .filter((file) => !SELF.includes(path.relative(ROOT, file)));

// One string. These trees are small, and a substring test over it is both
// simpler and less wrong than guessing at each name's declaration syntax.
const haystack = sourceFiles.map((file) => readFileSync(file, 'utf8')).join('\n');

const scripts = Object.keys(JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts);

/* -------------------------------------------------------------- the checks */

/**
 * How a backticked path is sorted before anything is asserted about it.
 *
 * Three assertions rather than one total, because a total hides a category
 * that has fallen to zero. That is instance 6 in
 * `.claude/skills/write-a-check/SKILL.md`, one level up.
 */
const PATH_SCOPE = {
  roots: PATH_ROOTS,
  buildRoots: BUILD_ROOTS,
  moduleExtensions: MODULE_EXTENSIONS,
};

/** One assertion per claim kind, over every claim of that kind in the corpus. */
const kinds = [
  {
    of: '`npm run` mentions',
    message: 'every documented script is in package.json',
    claims: (text) => npmScripts(text),
    holds: (name) => scripts.includes(name),
    say: (rel, name) => `${rel}: \`npm run ${name}\` is not a script in package.json`,
  },
  {
    of: 'constants',
    message: 'every documented constant appears in the source',
    claims: (text) => constants(text),
    holds: (name) => haystack.includes(name),
    say: (rel, name) => `${rel}: \`${name}\` appears nowhere outside the documentation`,
  },
  {
    of: 'links',
    message: 'every relative link resolves',
    claims: (text) => links(text),
    holds: (target, file) => existsSync(path.resolve(path.dirname(file), target)),
    say: (rel, target) => `${rel}: link to ${target} does not exist`,
  },
  {
    of: 'backticked paths',
    message: 'every backticked path names a file in this checkout',
    claims: (text) => pathClaims(text, PATH_SCOPE).repo.filter((p) => !PATHS_NOT_HERE.has(p)),
    holds: (target) => pathExists(target),
    say: (rel, target) => `${rel}: \`${target}\` does not exist`,
  },
  {
    of: 'build-output paths',
    message: 'every documented build-output path is named where the build produces it',
    claims: (text) => pathClaims(text, PATH_SCOPE).build,
    holds: (target) => haystack.includes(buildLiteral(target)),
    say: (rel, target) =>
      `${rel}: \`${target}\` is named by no build configuration and no packaging check`,
  },
  {
    of: 'source-relative paths',
    message: 'every module path written from inside the source tree resolves',
    claims: (text) => pathClaims(text, PATH_SCOPE).relative.filter((p) => !PATHS_NOT_HERE.has(p)),
    holds: (target) => relativeExists(target),
    say: (rel, target) => `${rel}: \`${target}\` is under none of ${RELATIVE_BASES.join(', ')}`,
  },
];

const failures = [];
let outOfScope = 0;
const declined = [];

for (const kind of kinds) {
  let count = 0;
  const broken = [];
  for (const file of docs) {
    const rel = path.relative(ROOT, file);
    const text = readFileSync(file, 'utf8');
    for (const claim of new Set(kind.claims(text))) {
      count += 1;
      if (!kind.holds(claim, file)) broken.push(kind.say(rel, claim));
    }
  }
  check(broken.length === 0, kind.message, { count, of: kind.of });
  failures.push(...broken);
}

for (const file of docs) {
  const text = readFileSync(file, 'utf8');
  outOfScope += npmScriptsOutOfScope(text);
  declined.push(...new Set(pathClaims(text, PATH_SCOPE).declined));
}

check(
  [...PATHS_NOT_HERE.keys()].every((target) => !pathExists(target) && !relativeExists(target)),
  'every path declared absent is still absent',
  { count: PATHS_NOT_HERE.size, of: 'declared absences' },
);

/* --------------------------------------------------------------- result */

for (const failure of failures) console.error(`       ${failure}`);

/**
 * What the run declined, in the same breath as what it examined.
 *
 * #152: the paths under no root were dropped in silence, so a reader saw 205
 * and concluded every backticked path was checked. A count is not coverage,
 * but it is the difference between a gap and an invisible one.
 */
const declinedPaths = declined.filter((span) => span.includes('/')).length;
const declinedNames = declined.length - declinedPaths;

console.log(
  '\nOut of scope by construction:' +
    `\n  ${String(outOfScope)} \`npm run\` mentions inside a fenced block or outside a code span.` +
    `\n  ${String(declinedPaths)} backticked paths under no declared root: another repository's` +
    "\n    files, package specifiers, git refs, and a running machine's directories." +
    `\n  ${String(declinedNames)} backticked bare names, where a file name and a dotted` +
    '\n    identifier are the same shape and this check cannot tell them apart.',
);

process.exit(summary('verify:docs'));
