#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

function sortedUnique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function declarationText(checker, symbol) {
  const target = symbol.flags & ts.SymbolFlags.Alias
    ? checker.getAliasedSymbol(symbol)
    : symbol;
  const declarations = target.getDeclarations() ?? [];
  const declarationsByKind = declarations.map((declaration) => {
    if (
      ts.isInterfaceDeclaration(declaration)
      || ts.isTypeAliasDeclaration(declaration)
      || ts.isEnumDeclaration(declaration)
      || ts.isClassDeclaration(declaration)
    ) {
      return declaration.getText().replace(/\s+/gu, ' ').trim();
    }
    if (
      ts.isFunctionDeclaration(declaration)
      || ts.isMethodDeclaration(declaration)
    ) {
      const signature = checker.getSignatureFromDeclaration(declaration);
      if (signature !== undefined) {
        return checker.signatureToString(
          signature,
          declaration,
          ts.TypeFormatFlags.NoTruncation,
        );
      }
    }
    const location = target.valueDeclaration ?? declaration;
    return checker.typeToString(
      checker.getTypeOfSymbolAtLocation(target, location),
      location,
      ts.TypeFormatFlags.NoTruncation,
    );
  });
  return sortedUnique(declarationsByKind);
}

function programFor(root) {
  const configPath = path.join(root, 'tsconfig.json');
  const parsed = ts.getParsedCommandLineOfConfigFile(
    configPath,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic(diagnostic) {
        throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
      },
    },
  );
  if (parsed === undefined) throw new Error(`Could not parse ${configPath}`);

  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length > 0) {
    throw new Error(ts.formatDiagnostics(diagnostics, {
      getCanonicalFileName: (file) => path.relative(root, file),
      getCurrentDirectory: () => root,
      getNewLine: () => '\n',
    }));
  }
  return program;
}

export function apiSurface(root = process.cwd(), entry = 'src/index.ts') {
  const program = programFor(root);
  const source = program.getSourceFile(path.resolve(root, entry));
  if (source === undefined) throw new Error(`Could not load ${entry}`);
  const checker = program.getTypeChecker();
  const module = checker.getSymbolAtLocation(source);
  if (module === undefined) throw new Error(`Could not resolve ${entry}`);

  return checker.getExportsOfModule(module)
    .map((symbol) => ({
      name: symbol.getName(),
      declarations: declarationText(checker, symbol),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function cssFiles(root, entry, seen = new Set()) {
  const absolute = path.resolve(root, entry);
  if (seen.has(absolute)) return [];
  seen.add(absolute);
  const source = await readFile(absolute, 'utf8');
  const imports = [...source.matchAll(/@import\s+['"]([^'"]+)['"]/gu)]
    .map((match) => path.resolve(path.dirname(absolute), match[1]));
  const nested = [];
  for (const imported of imports) {
    nested.push(...await cssFiles(root, imported, seen));
  }
  return [{ file: absolute, source }, ...nested];
}

function cssSurface(files, root) {
  const customProperties = [];
  const selectors = [];
  for (const { source } of files) {
    const withoutComments = source
      .replace(/\/\*[\s\S]*?\*\//gu, '')
      .replace(/@import\s+['"][^'"]+['"]\s*;/gu, '');
    customProperties.push(
      ...[...withoutComments.matchAll(/(--[\w-]+)\s*:/gu)].map((match) => match[1]),
    );
    for (const match of withoutComments.matchAll(/([^{}]+)\{/gu)) {
      const prelude = match[1].trim();
      if (prelude.startsWith('@')) continue;
      selectors.push(...prelude.split(',').map((selector) =>
        selector.replace(/\s+/gu, ' ').trim()
      ));
    }
  }
  return {
    files: sortedUnique(files.map(({ file }) => path.relative(root, file))),
    customProperties: sortedUnique(customProperties),
    selectors: sortedUnique(selectors),
  };
}

function sourceTokenEntries(value, prefix = []) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [];
  if (Object.hasOwn(value, '$value')) {
    return [{ name: prefix.join('-'), segments: prefix }];
  }
  return Object.entries(value).flatMap(([name, child]) =>
    name.startsWith('$') ? [] : sourceTokenEntries(child, [...prefix, name])
  );
}

function hasGeneratedToken(value, segments) {
  let current = value;
  for (const segment of segments) {
    if (current === null || typeof current !== 'object' || !(segment in current)) {
      return false;
    }
    current = current[segment];
  }
  return true;
}

export async function tokenSurface(root = process.cwd()) {
  const tokenDirectory = path.join(root, 'tokens');
  const { readdir } = await import('node:fs/promises');
  const sourceFiles = (await readdir(tokenDirectory))
    .filter((name) => name.endsWith('.json'))
    .sort((left, right) => left.localeCompare(right));
  const source = [];
  for (const file of sourceFiles) {
    const value = JSON.parse(await readFile(path.join(tokenDirectory, file), 'utf8'));
    source.push(...sourceTokenEntries(value));
  }
  const entries = [...new Map(source.map((entry) => [entry.name, entry])).values()]
    .sort((left, right) => left.name.localeCompare(right.name));
  const sourceNames = entries.map(({ name }) => name);
  const generatedJson = JSON.parse(
    await readFile(path.join(root, 'dist', 'tokens', 'tokens.json'), 'utf8'),
  );
  const generatedCss = await readFile(
    path.join(root, 'dist', 'tokens', 'tokens.css'),
    'utf8',
  );
  return {
    source: sourceNames,
    generatedJson: entries.filter(({ segments }) =>
      hasGeneratedToken(generatedJson, segments)
    ).map(({ name }) => name),
    generatedCss: sortedUnique(
      [...generatedCss.matchAll(/(--[\w-]+)\s*:/gu)].map((match) => match[1]),
    ),
  };
}

export async function packageApiReport(root = process.cwd()) {
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const subpaths = [];
  for (const [subpath, targetValue] of Object.entries(manifest.exports).sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    if (typeof targetValue !== 'string') {
      throw new Error(`Unsupported conditional export at ${subpath}`);
    }
    const target = targetValue.replace(/^\.\//u, '');
    if (target.endsWith('.css')) {
      subpaths.push({
        subpath,
        target,
        kind: 'css',
        surface: cssSurface(await cssFiles(root, target), root),
      });
    } else {
      subpaths.push({
        subpath,
        target,
        kind: 'typescript',
        exports: apiSurface(root, target),
      });
    }
  }
  return { version: 1, subpaths, tokens: await tokenSurface(root) };
}

export function serializeApiReport(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export async function checkApiBaseline({
  root = process.cwd(),
  update = false,
  stdout = console.log,
  stderr = console.error,
} = {}) {
  const baselinePath = path.join(root, 'api-surface.json');
  const current = serializeApiReport({ version: 1, exports: apiSurface(root) });
  if (update) {
    await writeFile(baselinePath, current);
    stdout(`Updated public API surface for ${root}.`);
    return true;
  }
  const baseline = await readFile(baselinePath, 'utf8').catch(() => '');
  if (baseline === current) {
    stdout(`Public API surface matches its reviewed baseline for ${root}.`);
    return true;
  }
  stderr(
    `Public API surface changed for ${root}. Review the diff, then rerun with --update.`,
  );
  return false;
}

export async function main(argv = process.argv.slice(2)) {
  const positional = argv.filter((argument) =>
    argument !== '--' && !argument.startsWith('--'));
  if (positional.length > 1) {
    throw new Error('Usage: maximal-ds-api-check [project-root] [--update]');
  }
  const root = path.resolve(positional[0] ?? process.cwd());
  const update = argv.includes('--update');
  return checkApiBaseline({ root, update });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!await main()) process.exitCode = 1;
}
