/**
 * Whether this shell knows anything about the application it is a shell for.
 *
 * Two separate questions, because they fail differently. An import is a real
 * dependency and is decided by parsing; a literal is a name that leaked into
 * code or prose and is decided by reading. `scripts/verify-neutral.mjs` runs
 * both and owns the scope each one covers. Issue #16, for
 * stuffbucket/maximal#417.
 *
 * Plain ESM under `scripts/`, outside the TypeScript program, which is why
 * `eslint.config.mjs` treats this directory separately.
 */

import ts from 'typescript';

/**
 * The workspace packages `self` may not import: every package the root
 * `architecture-analysis.json` declares, less `self` and its `dependsOn`. The
 * tree is declared there, so a sibling is allowed by being listed, not by
 * what it is called.
 */
export function deniedPackages(policy, self) {
  if (!(self in policy.packages)) throw new Error(`${self} is not in the declared tree`);
  const allowed = new Set([self, ...(policy.packages[self].dependsOn ?? [])]);
  return Object.keys(policy.packages)
    .filter((name) => !allowed.has(name))
    .sort();
}

/**
 * Overridden by `FORBIDDEN_TERMS`, so a consumer can name their own.
 *
 * Bare `maximal` is absent: it names the whole `@maximal/maximal-*`
 * workspace, this package included, so it cannot single out the host.
 * `deniedPackages` still denies depending on the application.
 */
export const DEFAULT_FORBIDDEN_TERMS = ['maximal-core', 'copilot'];

/** Callers that take a module specifier and hand back a module or its path. */
const RESOLVERS = new Set(['resolve']);

/** The terms to scan for, from the environment, in declaration order. */
export function forbiddenTerms(environment = {}) {
  const injected = environment['FORBIDDEN_TERMS'];
  if (injected === undefined) return [...DEFAULT_FORBIDDEN_TERMS];
  return injected
    .split(',')
    .map((term) => term.trim())
    .filter(Boolean);
}

/* --------------------------------------------------------------- imports */

function literal(node) {
  if (node === undefined) return undefined;
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isLiteralTypeNode(node) && ts.isStringLiteralLike(node.literal)) {
    return node.literal.text;
  }
  return undefined;
}

function eachNode(node, visit) {
  visit(node);
  node.forEachChild((child) => {
    eachNode(child, visit);
  });
}

/**
 * The names bound to `createRequire` and to the requires it produces.
 *
 * `createRequire(import.meta.url)('maximal')` is an import wearing a different
 * hat, and so is the same call assigned to a local first. Both are named in
 * issue #16 as laundering the guard, so the specifier collector needs to know
 * which identifiers in this file are require functions.
 */
function requireBindings(sourceFile) {
  const factories = new Set(['createRequire']);
  const requires = new Set(['require']);

  const isFactoryCall = (node) =>
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    factories.has(node.expression.text);

  // Aliases first: `import { createRequire as make } from 'node:module'`.
  eachNode(sourceFile, (node) => {
    if (ts.isImportSpecifier(node) && (node.propertyName ?? node.name).text === 'createRequire') {
      factories.add(node.name.text);
    }
    if (
      ts.isBindingElement(node) &&
      ts.isIdentifier(node.name) &&
      (node.propertyName !== undefined && ts.isIdentifier(node.propertyName)
        ? node.propertyName.text
        : node.name.text) === 'createRequire'
    ) {
      factories.add(node.name.text);
    }
  });

  eachNode(sourceFile, (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      isFactoryCall(node.initializer)
    ) {
      requires.add(node.name.text);
    }
  });

  return { factories, requires, isFactoryCall };
}

/**
 * Every module specifier a source file names, however it names it.
 *
 * A specifier that is not a literal is reported with `text: undefined`. That is
 * not a violation on its own — the caller decides — but it is the one shape
 * this parse cannot judge, so it is never silently dropped.
 */
export function moduleSpecifiers(source, fileName) {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const { requires, isFactoryCall } = requireBindings(sourceFile);
  const found = [];

  const record = (node, argument, form) => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    found.push({ text: literal(argument), line: line + 1, form });
  };

  const isResolverOn = (callee, holds) =>
    ts.isPropertyAccessExpression(callee) &&
    RESOLVERS.has(callee.name.text) &&
    holds(callee.expression);

  eachNode(sourceFile, (node) => {
    if (ts.isImportDeclaration(node)) return record(node, node.moduleSpecifier, 'import');
    if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
      return record(node, node.moduleSpecifier, 'export from');
    }
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      return record(node, node.moduleReference.expression, 'import =');
    }
    if (ts.isImportTypeNode(node)) return record(node, node.argument, 'import type');

    if (!ts.isCallExpression(node)) return;
    const callee = node.expression;
    const argument = node.arguments[0];

    if (callee.kind === ts.SyntaxKind.ImportKeyword) {
      return record(node, argument, 'dynamic import');
    }
    if (ts.isIdentifier(callee) && requires.has(callee.text)) {
      return record(node, argument, 'require');
    }
    if (isFactoryCall(callee)) return record(node, argument, 'createRequire()()');
    if (isResolverOn(callee, (target) => ts.isIdentifier(target) && requires.has(target.text))) {
      return record(node, argument, 'require.resolve');
    }
    if (isResolverOn(callee, isFactoryCall)) {
      return record(node, argument, 'createRequire().resolve');
    }
    if (
      isResolverOn(
        callee,
        (target) => ts.isMetaProperty(target) && target.name.text === 'meta',
      )
    ) {
      return record(node, argument, 'import.meta.resolve');
    }
  });

  return found;
}

/** Whether a specifier is one of the denied packages, or a path inside one. */
export function isForbiddenPackage(specifier, packages) {
  return packages.some((name) => specifier === name || specifier.startsWith(`${name}/`));
}

/** Every specifier in a source file that reaches a denied package. */
export function forbiddenImports(source, fileName, packages) {
  return moduleSpecifiers(source, fileName).filter(
    (found) => found.text !== undefined && isForbiddenPackage(found.text, packages),
  );
}

/* ----------------------------------------------------------------- terms */

/**
 * Naming a repository is not depending on it.
 *
 * Prose that cites `stuffbucket/maximal-core` refers to a repository. A term
 * inside an owner-qualified slug is exempt; a bare one is not, which is what
 * leaves `COPILOT_TOKEN` and `provider === 'copilot'` reportable.
 *
 * The `@` matters. `@maximal/maximal-core` is an npm scope, so it is a
 * package a string could name, not a repository prose refers to. Exempting it
 * let a laundered specifier sit in a string literal unreported.
 */
const SLUG_OWNER = /(?<!@)stuffbucket\/$/i;

/**
 * Every place a forbidden term appears in a text.
 *
 * The boundary treats `_` and `-` as separators, which `\b` does not:
 * `COPILOT_TOKEN` is the shape of constant issue #16 exists to catch, and
 * `\bcopilot\b` does not match it.
 */
export function termMatches(text, terms) {
  const found = [];

  for (const term of terms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, 'gi');

    for (const match of text.matchAll(pattern)) {
      const at = match.index;
      if (SLUG_OWNER.test(text.slice(Math.max(0, at - 13), at))) continue;

      const before = text.slice(0, at);
      const line = before.split('\n').length;
      const start = before.lastIndexOf('\n') + 1;
      const end = text.indexOf('\n', at);
      found.push({
        term,
        line,
        excerpt: text.slice(start, end === -1 ? text.length : end).trim(),
      });
    }
  }

  return found.sort((a, b) => a.line - b.line || a.term.localeCompare(b.term));
}
