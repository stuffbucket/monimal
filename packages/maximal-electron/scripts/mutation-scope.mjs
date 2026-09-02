/**
 * Which modules to sweep: a criterion, not a hand-list.
 *
 * A module is in mutation scope when nothing in its import closure needs a
 * browser or an Electron runtime. Stryker runs mutants under plain Node
 * through Vitest, so a module that reaches `electron` or React cannot be
 * mutated here at all. Everything else can, and #102 records what happens
 * when the list is maintained by hand instead: two modules landed with
 * fixture tests and no mutation coverage while the headline stayed 100.00.
 *
 * `DEFERRED` is the backlog this criterion exposes, one entry per file with
 * the issue that closes it. A file that matches the criterion and appears in
 * neither `stryker.conf.json` nor `DEFERRED` fails this check.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Directories the criterion reads. Tests and fixtures are not product code. */
export const ROOTS = ['src', 'scripts'];

const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.mjs', '.js', '.jsx']);
const RESOLVE_EXTENSIONS = ['', '.ts', '.tsx', '.mjs', '.js', '.jsx'];

/**
 * A value import of one of these puts the file out of Stryker's reach.
 * `import type` does not: TypeScript erases it, so the emitted module never
 * loads Electron. `main-options.ts` is the worked example and is mutated.
 */
const RUNTIME_ONLY = [
  'electron',
  'react',
  'react-dom',
  'react-resizable-panels',
  'lucide-react',
  'ghostty-web',
  '@radix-ui/',
];

/**
 * Files the criterion selects that are not yet mutated. Each one is real work,
 * not an exemption: #125 holds the count and the disposition rule.
 */
export const DEFERRED = new Map([
  ['scripts/check-contrast.mjs', 125],
  ['scripts/check-install.mjs', 125],
  ['scripts/compose.mjs', 125],
  ['scripts/copy-renderer-css.mjs', 125],
  ['scripts/css-selectors.mjs', 125],
  ['scripts/export-checks.mjs', 125],
  ['scripts/gen-icons.mjs', 125],
  ['scripts/mutation-report.mjs', 125],
  ['scripts/mutation-scope.mjs', 125],
  ['scripts/neutrality.mjs', 125],
  ['scripts/package-contract.mjs', 125],
  ['scripts/packaged-app.mjs', 125],
  ['scripts/publish-package.mjs', 125],
  ['scripts/record.mjs', 125],
  ['scripts/resolve-exports.mjs', 125],
  ['scripts/smoke-packaged.mjs', 125],
  ['scripts/stills.mjs', 125],
  ['scripts/storybook-check.mjs', 125],
  ['scripts/tag-history.mjs', 125],
  ['scripts/verify-crash-artifact.mjs', 125],
  ['scripts/verify-docs.mjs', 125],
  ['scripts/verify-electron-cache.mjs', 125],
  ['scripts/verify-exports.mjs', 125],
  ['scripts/verify-fixture-imports.mjs', 125],
  ['scripts/verify-git-install.mjs', 125],
  ['scripts/verify-neutral.mjs', 125],
  ['scripts/verify-package.mjs', 125],
  ['scripts/verify-publish.mjs', 125],
  ['scripts/verify-tag.mjs', 125],
  ['scripts/verify-workflow-health.mjs', 125],
  ['scripts/workflow-health.mjs', 125],
  ['src/host/terminal-host.ts', 125],
  ['src/main/native/updates.ts', 125],
  ['src/renderer/lib/content-lorem.ts', 125],
  ['src/renderer/lib/sample-settings.ts', 125],
  ['src/shared/ipc.ts', 125],
]);

function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (CODE_EXTENSIONS.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

/** Declaration files emit nothing and stories are Storybook input, not product. */
function isProductCode(relative) {
  return !relative.endsWith('.d.ts') && !relative.endsWith('.d.mts') && !relative.includes('.stories.');
}

/**
 * Every specifier a file loads at run time.
 *
 * `import type` is excluded because TypeScript erases it, so the emitted
 * module never loads what it names. `main-options.ts` names `BrowserWindow`
 * that way and is mutated today.
 */
export function valueImports(source, fileName) {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const found = [];

  const walkNode = (node) => {
    if (ts.isImportDeclaration(node) && node.importClause?.isTypeOnly !== true) {
      if (ts.isStringLiteralLike(node.moduleSpecifier)) found.push(node.moduleSpecifier.text);
    }
    if (ts.isExportDeclaration(node) && node.isTypeOnly !== true && node.moduleSpecifier !== undefined) {
      if (ts.isStringLiteralLike(node.moduleSpecifier)) found.push(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const dynamic = callee.kind === ts.SyntaxKind.ImportKeyword;
      const required = ts.isIdentifier(callee) && callee.text === 'require';
      const argument = node.arguments[0];
      if ((dynamic || required) && argument !== undefined && ts.isStringLiteralLike(argument)) {
        found.push(argument.text);
      }
    }
    node.forEachChild(walkNode);
  };

  walkNode(sourceFile);
  return found;
}

/**
 * Does this file run as an Electron `utilityProcess`?
 *
 * `process.parentPort` exists in a utility process and nowhere else, so a file
 * that reads it needs an Electron runtime exactly as much as one that imports
 * `electron`. The criterion cannot see that through imports, because the
 * binding arrives on the global `process`. `src/main/llama-worker.ts` is the
 * worked example. Issue #133.
 */
export function usesParentPort(source, fileName) {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  let found = false;

  const walkNode = (node) => {
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'process' &&
      node.name.text === 'parentPort'
    ) {
      found = true;
    }
    node.forEachChild(walkNode);
  };

  walkNode(sourceFile);
  return found;
}

function resolveRelative(fromRelative, specifier) {
  const base = path.resolve(root, path.dirname(fromRelative), specifier);
  const bases = specifier.endsWith('.js') ? [base, base.slice(0, -3)] : [base];
  for (const candidate of bases) {
    for (const extension of RESOLVE_EXTENSIONS) {
      const full = candidate + extension;
      if (existsSync(full) && statSync(full).isFile()) return path.relative(root, full);
    }
    const index = path.join(candidate, 'index.ts');
    if (existsSync(index)) return path.relative(root, index);
  }
  return null;
}

/**
 * The reason a file cannot be mutated, or null when it can. Transitive: a pure
 * module that imports an Electron module is just as unreachable as the module
 * itself.
 */
function outOfReach(relative, cache, visiting) {
  const cached = cache.get(relative);
  if (cached !== undefined) return cached;
  if (visiting.has(relative)) return null;
  visiting.add(relative);

  let reason = null;
  if (relative.endsWith('.tsx') || relative.endsWith('.jsx')) reason = 'JSX';
  if (!reason) {
    const source = readFileSync(path.join(root, relative), 'utf8');
    if (usesParentPort(source, relative)) reason = 'utilityProcess';
    for (const specifier of reason ? [] : valueImports(source, relative)) {
      const runtime = RUNTIME_ONLY.find((name) =>
        name.endsWith('/') ? specifier.startsWith(name) : specifier === name || specifier.startsWith(`${name}/`),
      );
      if (runtime) {
        reason = runtime;
        break;
      }
      if (!specifier.startsWith('.')) continue;
      const target = resolveRelative(relative, specifier);
      if (!target) continue;
      const inherited = outOfReach(target, cache, visiting);
      if (inherited) {
        reason = `${inherited} via ${target}`;
        break;
      }
    }
  }

  visiting.delete(relative);
  cache.set(relative, reason);
  return reason;
}

export function mutationScope() {
  const scanned = ROOTS.flatMap((name) => walk(path.join(root, name), []))
    .map((absolute) => path.relative(root, absolute).split(path.sep).join('/'))
    .filter(isProductCode)
    .sort();

  const cache = new Map();
  const eligible = [];
  const outOfScope = [];
  for (const relative of scanned) {
    const reason = outOfReach(relative, cache, new Set());
    if (reason) outOfScope.push({ file: relative, reason });
    else eligible.push(relative);
  }

  const config = JSON.parse(readFileSync(path.join(root, 'stryker.conf.json'), 'utf8'));
  const mutated = config.mutate ?? [];

  return {
    scanned,
    eligible,
    outOfScope,
    mutated,
    unaccounted: eligible.filter((file) => !mutated.includes(file) && !DEFERRED.has(file)),
    missing: mutated.filter((file) => !existsSync(path.join(root, file))),
    staleDeferrals: [...DEFERRED.keys()].filter((file) => !eligible.includes(file) || mutated.includes(file)),
  };
}

function main() {
  const scope = mutationScope();
  const failures = [];

  console.log(
    `Mutation scope: scanned ${scope.scanned.length} files under ${ROOTS.join(', ')}, ` +
      `${scope.eligible.length} reachable by Stryker, ${scope.outOfScope.length} need Electron or a browser`,
  );
  console.log(
    `  ${scope.mutated.length} on the mutate list, ${DEFERRED.size} deferred, ${scope.unaccounted.length} unaccounted`,
  );

  // Floors first, so the output distinguishes "this was wrong" from "there was
  // nothing to look at". A criterion that selects nothing passes every other
  // assertion below.
  if (scope.scanned.length === 0) failures.push(`No files under ${ROOTS.join(', ')}. The roots are wrong.`);
  if (scope.eligible.length === 0)
    failures.push('The criterion selected no files. Every module now reads as needing Electron.');
  if (scope.mutated.length === 0) failures.push('stryker.conf.json mutates nothing.');

  for (const file of scope.missing) failures.push(`${file} is on the mutate list and does not exist.`);
  for (const file of scope.unaccounted)
    failures.push(`${file} is reachable by Stryker and is on neither the mutate list nor the deferred list.`);
  for (const file of scope.staleDeferrals)
    failures.push(`${file} is deferred but is now mutated or out of reach. Remove the deferral.`);

  if (failures.length > 0) {
    for (const failure of failures) console.error(`  ${failure}`);
    console.error(`\nMutation scope: ${failures.length} problem(s).`);
    process.exit(1);
  }

  console.log('Every module the criterion selects is mutated or deferred with an issue');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
