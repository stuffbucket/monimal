#!/usr/bin/env node
/**
 * Verify the capture fixture is a consumer, not an insider.
 *
 * `e2e/fixtures/demo-shell/` is the shell that the screen recordings and the
 * README stills are cut from, and `docs/recording.md` calls it the first
 * consumer of the renderer package. A consumer resolves through the `exports`
 * map in `package.json`, which is the map a registry install resolves through.
 * A relative path into `src/` resolves through nothing a third party has, so
 * an import that reaches for one makes the fixture prove less than it claims
 * while looking identical.
 *
 * That is not hypothetical: every import in this fixture read `../../../src/`
 * until the rewrite this check landed with, and the exports were missing eight
 * of the names it needed without anything saying so.
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { scopedChecks } from './check-scope.mjs';
import {
  importSpecifiers,
  packageSubpath,
  reachesOutside,
  SOURCE_EXTENSIONS,
} from './fixture-imports.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = path.join(ROOT, 'e2e/fixtures/demo-shell');

const manifest = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const PACKAGE = manifest.name;
const PUBLIC = new Set(Object.keys(manifest.exports ?? {}));

const { check, summary } = scopedChecks();

/** Every file under the fixture, split by whether an import can be read out. */
function collect(directory) {
  const read = [];
  const declined = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = collect(full);
      read.push(...nested.read);
      declined.push(...nested.declined);
      continue;
    }
    if (!entry.isFile()) continue;
    if (SOURCE_EXTENSIONS.includes(path.extname(entry.name))) read.push(full);
    else declined.push(full);
  }

  return { read, declined };
}

const { read: files, declined } = collect(FIXTURE);

const specifiers = files.flatMap((file) =>
  importSpecifiers(readFileSync(file, 'utf8'), path.extname(file)).map((found) => ({
    ...found,
    file,
  })),
);

/* ------------------------------------------------------------ the checks */

/**
 * The floor. A renamed directory, a fixture reduced to data, or an extension
 * this parser does not read would otherwise leave the two checks below
 * asserting over nothing and reporting a clean run.
 */
check(specifiers.length > 0, 'the fixture states import specifiers', {
  count: files.length,
  of: 'fixture source files read',
});

const escapes = specifiers
  .map((found) => {
    const reason = reachesOutside(found.specifier, {
      fromDir: path.dirname(found.file),
      root: FIXTURE,
    });
    return reason === undefined ? undefined : { ...found, reason };
  })
  .filter((found) => found !== undefined);

check(escapes.length === 0, 'no import reaches outside the package exports', {
  count: specifiers.length,
  of: 'import specifiers',
});

/**
 * The second half. A specifier that stays out of `src/` and names a subpath
 * the package does not export fails at a consumer's install rather than here,
 * which is the same defect arriving later and somewhere else.
 */
const ours = specifiers
  .map((found) => ({ ...found, subpath: packageSubpath(found.specifier, PACKAGE) }))
  .filter((found) => found.subpath !== undefined);

const undeclared = ours.filter((found) => !PUBLIC.has(found.subpath));

check(undeclared.length === 0, `every ${PACKAGE} import names a declared export`, {
  count: ours.length,
  of: 'package imports',
});

/* --------------------------------------------------------------- result */

for (const found of [...escapes, ...undeclared]) {
  const where = `${path.relative(ROOT, found.file)}:${String(found.line)}`;
  const why = found.reason ?? `${found.subpath} is not in the exports map`;
  console.error(`       ${where}  ${found.specifier}  — ${why}`);
}

/**
 * What the scan declined, beside what it read. A count over a narrowed input
 * that does not say what it narrowed reads as coverage it does not have.
 */
console.log(
  `\nOut of scope by construction:\n  ${String(declined.length)} fixture files with no ` +
    `import syntax this check reads (${SOURCE_EXTENSIONS.join(' ')} are read).`,
);

process.exit(summary('verify:fixture-imports'));
