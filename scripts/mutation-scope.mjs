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
 * Each package passes its `deferred` backlog, one entry per file with the
 * issue that closes it. A file that matches the criterion and appears in
 * neither its `stryker.conf.json` nor `deferred` fails this check.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

/** Directories the criterion reads by default. Tests and fixtures are not product code. */
export const ROOTS = ['src', 'scripts'];

const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.mjs', '.js', '.jsx']);
const RESOLVE_EXTENSIONS = ['', '.ts', '.tsx', '.mjs', '.js', '.jsx'];

/**
 * A value import of one of these puts the file out of Stryker's reach.
 * `import type` does not: TypeScript erases it, so the emitted module never
 * loads Electron. `main-options.ts` is the worked example and is mutated.
 */
export const RUNTIME_ONLY = [
  'electron',
  'react',
  'react-dom',
  'react-resizable-panels',
  'lucide-react',
  '@xterm/',
  '@wterm/',
  '@radix-ui/',
];


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

/** A module of `export … from` declarations alone has no code for Stryker to change. */
export function reexportsOnly(source, fileName) {
  const { statements } = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  return statements.length > 0 &&
    statements.every((node) => ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined);
}

function resolveRelative(root, fromRelative, specifier) {
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
function outOfReach(root, relative, cache, visiting) {
  const cached = cache.get(relative);
  if (cached !== undefined) return cached;
  if (visiting.has(relative)) return null;
  visiting.add(relative);

  let reason = null;
  if (relative.endsWith('.tsx') || relative.endsWith('.jsx')) reason = 'JSX';
  if (!reason) {
    const source = readFileSync(path.join(root, relative), 'utf8');
    for (const specifier of reason ? [] : valueImports(source, relative)) {
      const runtime = RUNTIME_ONLY.find((name) =>
        name.endsWith('/') ? specifier.startsWith(name) : specifier === name || specifier.startsWith(`${name}/`),
      );
      if (runtime) {
        reason = runtime;
        break;
      }
      if (!specifier.startsWith('.')) continue;
      const target = resolveRelative(root, relative, specifier);
      if (!target) continue;
      const inherited = outOfReach(root, target, cache, visiting);
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

/**
 * @param {{ root: string, deferred: ReadonlyMap<string, number>, roots?: readonly string[] }} options
 */
export function mutationScope({ root, deferred, roots = ROOTS }) {
  const scanned = roots.flatMap((name) => walk(path.join(root, name), []))
    .map((absolute) => path.relative(root, absolute).split(path.sep).join('/'))
    .filter(isProductCode)
    .sort();

  const cache = new Map();
  const eligible = [];
  const outOfScope = [];
  for (const relative of scanned) {
    // Checked here, not in `outOfReach`: an importer of a barrel still reaches
    // whatever the barrel re-exports.
    const reason = outOfReach(root, relative, cache, new Set()) ??
      (reexportsOnly(readFileSync(path.join(root, relative), 'utf8'), relative) ? 're-exports only' : null);
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
    unaccounted: eligible.filter((file) => !mutated.includes(file) && !deferred.has(file)),
    missing: mutated.filter((file) => !existsSync(path.join(root, file))),
    staleDeferrals: [...deferred.keys()].filter((file) => !eligible.includes(file) || mutated.includes(file)),
  };
}

/** Print the scope and exit non-zero when it is unaccounted for. */
export function checkMutationScope(options) {
  const roots = options.roots ?? ROOTS;
  const scope = mutationScope(options);
  const failures = [];

  console.log(
    `Mutation scope: scanned ${scope.scanned.length} files under ${roots.join(', ')}, ` +
      `${scope.eligible.length} reachable by Stryker, ${scope.outOfScope.length} out of reach or with nothing to mutate`,
  );
  console.log(
    `  ${scope.mutated.length} on the mutate list, ${options.deferred.size} deferred, ${scope.unaccounted.length} unaccounted`,
  );

  // Floors first, so the output distinguishes "this was wrong" from "there was
  // nothing to look at". A criterion that selects nothing passes every other
  // assertion below.
  if (scope.scanned.length === 0) failures.push(`No files under ${roots.join(', ')}. The roots are wrong.`);
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
