import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import {
  access,
  readFile,
  readdir,
  stat,
} from 'node:fs/promises';
import path from 'node:path';

import { chromium } from '@playwright/test';
import ts from 'typescript';

import {
  assertServerRunning,
  storyRenderResultWithNavigationRetry,
  storyUrl,
  waitForServer,
} from './storybook-check.mjs';

const STORY_PATTERN = /\.stories\.[cm]?[jt]sx?$/u;
const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
  'reports',
]);
const MAX_PROBES = 32;

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function isFile(file) {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

async function nearestNamedFile(start, name) {
  let current = path.resolve(start);
  while (true) {
    if (await exists(path.join(current, name))) return current;
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

async function sourceFiles(root) {
  const files = [];
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) continue;
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) {
          pending.push(path.join(current, entry.name));
        }
      } else if (STORY_PATTERN.test(entry.name)) {
        files.push(path.join(current, entry.name));
      }
    }
  }
  return files.sort();
}

async function resolveImport(source, specifier) {
  if (!specifier.startsWith('.')) return undefined;
  const unresolved = path.resolve(path.dirname(source), specifier);
  const extension = path.extname(unresolved);
  const base = ['.js', '.mjs', '.cjs'].includes(extension)
    ? unresolved.slice(0, -extension.length)
    : unresolved;
  for (const candidate of [
    unresolved,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mts`,
    `${base}.js`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ]) {
    if (await isFile(candidate)) return path.resolve(candidate);
  }
  return undefined;
}

function hasExportModifier(node) {
  return node.modifiers?.some((modifier) =>
    modifier.kind === ts.SyntaxKind.ExportKeyword) === true;
}

function hasDefaultModifier(node) {
  return node.modifiers?.some((modifier) =>
    modifier.kind === ts.SyntaxKind.DefaultKeyword) === true;
}

function declarationExportsName(statement, exportName) {
  if (!hasExportModifier(statement)) return false;
  if (hasDefaultModifier(statement) && exportName === 'default') return true;
  if (
    (ts.isFunctionDeclaration(statement)
      || ts.isClassDeclaration(statement)
      || ts.isEnumDeclaration(statement))
    && statement.name?.text === exportName
  ) return true;
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.some((declaration) =>
      ts.isIdentifier(declaration.name) && declaration.name.text === exportName);
  }
  return false;
}

function importedSymbols(statement) {
  if (
    !ts.isImportDeclaration(statement)
    || !ts.isStringLiteral(statement.moduleSpecifier)
    || statement.importClause?.isTypeOnly === true
  ) return [];
  const clause = statement.importClause;
  if (clause === undefined) return [];
  const symbols = clause.name === undefined
    ? []
    : [{ imported: 'default', local: clause.name.text }];
  if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
    for (const element of clause.namedBindings.elements) {
      if (!element.isTypeOnly) {
        symbols.push({
          imported: element.propertyName?.text ?? element.name.text,
          local: element.name.text,
        });
      }
    }
  }
  return symbols;
}

async function parsedSource(file) {
  const text = await readFile(file, 'utf8');
  return ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

async function moduleExportsEntry(
  source,
  exportName,
  absoluteEntry,
  visited = new Set(),
) {
  const key = `${path.resolve(source)}\u0000${exportName}`;
  if (visited.has(key)) return false;
  visited.add(key);
  const root = await parsedSource(source);
  if (
    path.resolve(source) === absoluteEntry
    && root.statements.some((statement) =>
      declarationExportsName(statement, exportName))
  ) return true;

  const imports = new Map();
  for (const statement of root.statements) {
    if (
      ts.isImportDeclaration(statement)
      && ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      const resolved = await resolveImport(source, statement.moduleSpecifier.text);
      if (resolved === undefined) continue;
      for (const symbol of importedSymbols(statement)) {
        imports.set(symbol.local, { source: resolved, name: symbol.imported });
      }
    }
  }

  for (const statement of root.statements) {
    if (!ts.isExportDeclaration(statement)) continue;
    if (
      statement.moduleSpecifier
      && ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      const resolved = await resolveImport(source, statement.moduleSpecifier.text);
      if (resolved === undefined) continue;
      if (statement.exportClause === undefined) {
        if (await moduleExportsEntry(
          resolved,
          exportName,
          absoluteEntry,
          visited,
        )) return true;
      } else if (ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          if (
            !element.isTypeOnly
            && element.name.text === exportName
            && await moduleExportsEntry(
              resolved,
              element.propertyName?.text ?? element.name.text,
              absoluteEntry,
              visited,
            )
          ) return true;
        }
      }
      continue;
    }
    if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) {
        if (element.isTypeOnly || element.name.text !== exportName) continue;
        const imported = imports.get(element.propertyName?.text ?? element.name.text);
        if (
          imported
          && await moduleExportsEntry(
            imported.source,
            imported.name,
            absoluteEntry,
            visited,
          )
        ) return true;
      }
    }
  }
  return false;
}

function exportValue(exports, subpath) {
  if (typeof exports === 'string') return subpath === '.' ? exports : undefined;
  if (exports === null || typeof exports !== 'object') return undefined;
  if (subpath in exports) return exports[subpath];
  for (const [key, value] of Object.entries(exports)) {
    if (!key.includes('*')) continue;
    const [prefix, suffix = ''] = key.split('*');
    if (!subpath.startsWith(prefix) || !subpath.endsWith(suffix)) continue;
    const wildcard = subpath.slice(prefix.length, subpath.length - suffix.length);
    return replaceExportWildcard(value, wildcard);
  }
  return undefined;
}

function replaceExportWildcard(value, wildcard) {
  if (typeof value === 'string') return value.replaceAll('*', wildcard);
  if (Array.isArray(value)) {
    return value.map((entry) => replaceExportWildcard(entry, wildcard));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) =>
      [key, replaceExportWildcard(entry, wildcard)]));
  }
  return value;
}

function exportTargets(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(exportTargets);
  if (value !== null && typeof value === 'object') {
    const preferred = ['import', 'default', 'browser', 'types'];
    return [
      ...preferred.flatMap((condition) =>
        condition in value ? exportTargets(value[condition]) : []),
      ...Object.entries(value)
        .filter(([condition]) => !preferred.includes(condition))
        .flatMap(([, target]) => exportTargets(target)),
    ];
  }
  return [];
}

async function resolveSelfPackageImport(
  packageRoot,
  packageJson,
  specifier,
) {
  if (
    typeof packageJson.name !== 'string'
    || (
      specifier !== packageJson.name
      && !specifier.startsWith(`${packageJson.name}/`)
    )
  ) return undefined;
  const suffix = specifier.slice(packageJson.name.length);
  const subpath = suffix === '' ? '.' : `.${suffix}`;
  const configured = exportValue(packageJson.exports, subpath);
  const targets = exportTargets(
    configured ?? (
      subpath === '.'
        ? packageJson.module ?? packageJson.main
        : undefined
    ),
  );
  for (const target of targets) {
    const resolved = await resolveImport(
      path.join(packageRoot, 'package.json'),
      target,
    );
    if (resolved !== undefined) return resolved;
  }
  return undefined;
}

async function moduleExportsAnyEntry(source, symbols, absoluteEntry) {
  for (const symbol of symbols) {
    if (await moduleExportsEntry(source, symbol.imported, absoluteEntry)) {
      return true;
    }
  }
  return false;
}

export async function discoverPulseStoryFiles(entry) {
  const absoluteEntry = path.resolve(entry);
  const packageRoot = await nearestNamedFile(path.dirname(absoluteEntry), 'package.json');
  if (packageRoot === undefined) return [];
  const packageJson = JSON.parse(
    await readFile(path.join(packageRoot, 'package.json'), 'utf8'),
  );
  const stories = await sourceFiles(packageRoot);
  const matches = [];
  for (const story of stories) {
    const root = await parsedSource(story);
    for (const statement of root.statements) {
      if (!ts.isImportDeclaration(statement)
        || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const specifier = statement.moduleSpecifier.text;
      const source = await resolveImport(story, specifier)
        ?? await resolveSelfPackageImport(packageRoot, packageJson, specifier);
      if (source === undefined) continue;
      const symbols = importedSymbols(statement);
      if (await moduleExportsAnyEntry(source, symbols, absoluteEntry)) {
        matches.push(story);
        break;
      }
    }
  }
  return matches;
}

async function childPackageRoots(workspaceRoot) {
  const roots = [];
  for (const parentName of ['packages', 'apps']) {
    const parent = path.join(workspaceRoot, parentName);
    if (!await exists(parent)) continue;
    for (const entry of await readdir(parent, { withFileTypes: true })) {
      if (entry.isDirectory()) roots.push(path.join(parent, entry.name));
    }
  }
  return roots;
}

export async function discoverPulseCatalogRoots(entry) {
  const workspaceRoot = await nearestNamedFile(path.dirname(path.resolve(entry)), 'pnpm-workspace.yaml');
  const packageRoot = await nearestNamedFile(path.dirname(path.resolve(entry)), 'package.json');
  const candidates = new Set([
    ...(packageRoot === undefined ? [] : [packageRoot]),
    ...(workspaceRoot === undefined ? [] : await childPackageRoots(workspaceRoot)),
  ]);
  const roots = [];
  for (const candidate of candidates) {
    if (
      await exists(path.join(candidate, 'quality.config.json'))
      && await exists(path.join(candidate, '.storybook'))
      && await exists(path.join(candidate, 'node_modules/storybook/dist/bin/dispatcher.js'))
    ) roots.push(candidate);
  }
  return roots.sort();
}

function indexedStoryFile(catalogRoot, story) {
  return path.resolve(catalogRoot, story.importPath);
}

function matchingIndexedStories(index, catalogRoot, storyFiles) {
  const expected = new Set(storyFiles.map((story) => path.resolve(story)));
  return Object.values(index.entries)
    .filter((entry) =>
      entry.type === 'story'
      && expected.has(indexedStoryFile(catalogRoot, entry)))
    .sort((left, right) => left.id.localeCompare(right.id));
}

async function existingIndex(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/index.json`);
    return response.ok ? response.json() : undefined;
  } catch {
    return undefined;
  }
}

async function startCatalog(catalogRoot, config) {
  const port = config.browser.port ?? 6008;
  const baseUrl = `http://127.0.0.1:${String(port)}`;
  const running = await existingIndex(baseUrl);
  if (running !== undefined) {
    return { baseUrl, index: running, server: undefined, serverError: { value: '' } };
  }
  const cli = path.join(
    catalogRoot,
    'node_modules/storybook/dist/bin/dispatcher.js',
  );
  const serverError = { value: '' };
  const server = spawn(
    process.execPath,
    [cli, 'dev', '-p', String(port), '--no-open', '--quiet'],
    {
      cwd: catalogRoot,
      stdio: ['ignore', 'ignore', 'pipe'],
      env: process.env,
    },
  );
  server.stderr.on('data', (chunk) => {
    serverError.value = (serverError.value + String(chunk)).slice(-2000);
  });
  return {
    baseUrl,
    index: await waitForServer(server, serverError, baseUrl),
    server,
    serverError,
  };
}

function targetSelector(binding) {
  const parsed = /^([A-Za-z][A-Za-z0-9]*)(.*)$/u.exec(binding.target);
  if (parsed === null) return undefined;
  const [, target, qualifiers] = parsed;
  if (target === undefined || qualifiers === undefined) return undefined;
  if (/^[a-z][a-z0-9-]*$/u.test(target)) return `${target}${qualifiers}`;
  if (target.endsWith('Button')) return `button${qualifiers}`;
  if (target.endsWith('Dialog')) return `[role="dialog"]${qualifiers}`;
  return undefined;
}

function eventPayloads(binding, cells) {
  if (binding.event !== 'keydown' && binding.event !== 'keyup') return [{}];
  const guards = cells.flatMap((cell) =>
    cell.transitions.flatMap((transition) => transition.guards));
  const payloads = [];
  for (const guard of guards) {
    const directKey = /event\.key\s*===\s*['"]([^'"]+)['"]/u.exec(guard)?.[1];
    const lowerKey =
      /event\.key\.toLocaleLowerCase\(\)\s*===\s*['"]([^'"]+)['"]/u.exec(guard)?.[1];
    const key = directKey ?? lowerKey;
    if (key !== undefined) {
      payloads.push({
        key,
        ctrlKey: /event\.ctrlKey/u.test(guard),
        metaKey: /event\.metaKey/u.test(guard),
        shiftKey: /event\.shiftKey/u.test(guard),
        altKey: /event\.altKey/u.test(guard),
      });
    }
  }
  const unique = new Map(payloads.map((payload) => [JSON.stringify(payload), payload]));
  return unique.size === 0
    ? [{ key: 'Unidentified' }]
    : [...unique.values()];
}

function fingerprint(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

async function domFingerprint(page) {
  const html = await page.locator('body').innerHTML();
  return { hash: fingerprint(html), length: html.length };
}

function staticPrediction(matrix, binding) {
  const cells = matrix.cells.filter((cell) =>
    cell.line === binding.line && cell.reactProp === binding.reactProp);
  const opaque = matrix.opaqueBindings.some((candidate) =>
    candidate.line === binding.line && candidate.reactProp === binding.reactProp);
  const possibleTransitions = cells.flatMap((cell) =>
    cell.transitions.filter((transition) => transition.applicability !== 'blocked'));
  const effects = [...new Set(cells.flatMap((cell) =>
    [...cell.dispatches, ...cell.transportCalls]))];
  return {
    cells,
    kind: opaque
      ? 'opaque'
      : possibleTransitions.length > 0 || effects.length > 0
        ? 'response'
        : 'none',
    possibleTransitions: possibleTransitions.length,
    effects,
  };
}

export function comparePulseObservation(prediction, changed, errors = []) {
  if (errors.length > 0) return 'runtime-error';
  if (prediction === 'opaque') return changed ? 'observed-opaque' : 'stable-opaque';
  if (prediction === 'response') return changed ? 'corroborated' : 'unobserved';
  return changed ? 'divergent' : 'corroborated';
}

export function confirmPulseCandidate(comparisons) {
  const first = comparisons[0];
  if (!['divergent', 'runtime-error'].includes(first)) return first;
  if (
    comparisons.length >= 3
    && comparisons.every((comparison) => comparison === first)
  ) return `confirmed-${first}`;
  return 'flaky-candidate';
}

async function dispatchStimulus(locator, binding, payload) {
  if (
    binding.event === 'change'
    && binding.target.includes('[type="file"]')
  ) {
    await locator.setInputFiles({
      name: 'pulse-probe.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Pulse browser probe'),
    });
    return { supported: true };
  }
  if (['dragover', 'drop', 'paste'].includes(binding.event)) {
    await locator.evaluate((element, eventName) => {
      const transfer = new globalThis.DataTransfer();
      transfer.items.add(new globalThis.File(
        ['Pulse browser probe'],
        'pulse-probe.txt',
        { type: 'text/plain' },
      ));
      const event = eventName === 'paste'
        ? new globalThis.ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: transfer,
          })
        : new globalThis.DragEvent(eventName, {
            bubbles: true,
            cancelable: true,
            dataTransfer: transfer,
          });
      element.dispatchEvent(event);
    }, binding.event);
    return { supported: true };
  }
  if (binding.event === 'change') {
    await locator.fill('pulse-probe');
    return { supported: true };
  }
  if (binding.event === 'scroll') {
    await locator.evaluate((element) => {
      element.scrollTop += 1;
      element.dispatchEvent(new globalThis.Event('scroll', { bubbles: true }));
    });
    return { supported: true };
  }
  await locator.dispatchEvent(binding.event, payload);
  return { supported: true };
}

export async function probePulseBindingOnPage(
  page,
  binding,
  payload,
  prediction,
) {
  const selector = targetSelector(binding);
  if (selector === undefined) {
    return { state: 'skipped', reason: 'custom component target has no DOM selector' };
  }
  const locator = page.locator(selector);
  const count = await locator.count();
  if (count === 0) return { state: 'missing', reason: `no element matches ${selector}` };
  if (count > 1) {
    return {
      state: 'ambiguous',
      reason: `${String(count)} elements match ${selector}`,
    };
  }
  const errors = [];
  const onPageError = (error) => errors.push(error.message);
  page.on('pageerror', onPageError);
  try {
    const before = await domFingerprint(page);
    let dispatched;
    try {
      dispatched = await dispatchStimulus(locator, binding, payload);
    } catch (error) {
      return {
        state: 'probe-error',
        reason: error instanceof Error ? error.message : String(error),
      };
    }
    if (!dispatched.supported) {
      return { state: 'skipped', reason: dispatched.reason };
    }
    await page.waitForTimeout(100);
    const after = await domFingerprint(page);
    const changed = before.hash !== after.hash;
    return {
      state: 'observed',
      changed,
      before,
      after,
      errors,
      comparison: comparePulseObservation(prediction.kind, changed, errors),
    };
  } finally {
    page.off('pageerror', onPageError);
  }
}

async function loadStory(page, story, catalog, config) {
  const theme = config.browser.themes[0];
  await page.goto(
    storyUrl(story, theme, catalog.baseUrl, config),
    { waitUntil: 'domcontentloaded' },
  );
  return storyRenderResultWithNavigationRetry(page, story.id);
}

async function probeBinding(browser, stories, catalog, config, binding, prediction) {
  const payloads = eventPayloads(binding, prediction.cells);
  const results = [];
  for (const payload of payloads) {
    let result = { state: 'missing', reason: 'target is absent from matching stories' };
    let fallback;
    for (const story of stories) {
      const page = await browser.newPage();
      try {
        const render = await loadStory(page, story, catalog, config);
        if (render.state !== 'ok') {
          result = {
            state: 'render-failed',
            story: story.id,
            reason: `${render.state}: ${render.message}`,
          };
          continue;
        }
        result = {
          story: story.id,
          payload,
          ...await probePulseBindingOnPage(
            page,
            binding,
            payload,
            prediction,
          ),
        };
        if (
          result.state === 'observed'
          && ['divergent', 'runtime-error'].includes(result.comparison)
        ) {
          const reproductions = [result.comparison];
          for (let replay = 0; replay < 2; replay += 1) {
            const replayPage = await browser.newPage();
            try {
              const replayRender = await loadStory(
                replayPage,
                story,
                catalog,
                config,
              );
              if (replayRender.state !== 'ok') {
                reproductions.push(`render-${replayRender.state}`);
                continue;
              }
              const replayResult = await probePulseBindingOnPage(
                replayPage,
                binding,
                payload,
                prediction,
              );
              reproductions.push(replayResult.comparison ?? replayResult.state);
            } finally {
              await replayPage.close();
            }
          }
          result = {
            ...result,
            reproductions,
            comparison: confirmPulseCandidate(reproductions),
          };
        }
        if (result.state === 'missing') continue;
        if (
          result.state === 'observed'
          && result.comparison === 'unobserved'
        ) {
          fallback ??= result;
          continue;
        }
        break;
      } finally {
        await page.close();
      }
    }
    results.push(
      result.state === 'missing' && fallback !== undefined
        ? fallback
        : result,
    );
  }
  return results;
}

export async function runPulseBrowserAnalysis(entry, analysis) {
  const storyFiles = await discoverPulseStoryFiles(entry);
  if (storyFiles.length === 0) {
    return {
      state: 'unavailable',
      reason: 'no story imports the implementation or one of its package exports',
      storyFiles: [],
      stories: [],
      probes: [],
    };
  }
  const catalogRoots = await discoverPulseCatalogRoots(entry);
  if (catalogRoots.length === 0) {
    return {
      state: 'unavailable',
      reason: 'no workspace Storybook quality catalog was found',
      storyFiles,
      stories: [],
      probes: [],
    };
  }

  let catalog;
  let config;
  let stories = [];
  for (const catalogRoot of catalogRoots) {
    const candidateConfig = JSON.parse(
      await readFile(path.join(catalogRoot, 'quality.config.json'), 'utf8'),
    );
    const candidate = await startCatalog(catalogRoot, candidateConfig);
    const matches = matchingIndexedStories(candidate.index, catalogRoot, storyFiles);
    if (matches.length > 0) {
      catalog = candidate;
      config = candidateConfig;
      stories = matches;
      break;
    }
    candidate.server?.kill();
  }
  if (catalog === undefined || config === undefined) {
    return {
      state: 'unavailable',
      reason: 'no Storybook catalog indexes the discovered stories',
      storyFiles,
      stories: [],
      probes: [],
    };
  }

  let browser;
  try {
    if (catalog.server !== undefined) {
      assertServerRunning(catalog.server, catalog.serverError);
    }
    browser = await chromium.launch();
    const probes = [];
    for (const binding of analysis.eventMatrix.bindings) {
      if (probes.length >= MAX_PROBES) break;
      const prediction = staticPrediction(analysis.eventMatrix, binding);
      probes.push({
        binding,
        prediction: {
          kind: prediction.kind,
          possibleTransitions: prediction.possibleTransitions,
          effects: prediction.effects,
        },
        observations: await probeBinding(
          browser,
          stories,
          catalog,
          config,
          binding,
          prediction,
        ),
      });
    }
    return {
      state: 'complete',
      catalog: catalog.baseUrl,
      storyFiles,
      stories: stories.map((story) => story.id),
      probes,
    };
  } finally {
    await browser?.close();
    catalog.server?.kill();
  }
}

export function pulseCorrectnessCandidates(runtime) {
  if (runtime.state !== 'complete') return [];
  return runtime.probes.flatMap((probe) =>
    probe.observations
      .filter((observation) =>
        ['confirmed-divergent', 'confirmed-runtime-error']
          .includes(observation.comparison))
      .map((observation) => ({
        binding: probe.binding,
        prediction: probe.prediction,
        observation,
      })));
}

export function pulseBrowserAnalysisToMarkdown(runtime) {
  if (runtime.state !== 'complete') {
    return `## Chromium response probes\n\n- State: unavailable\n- Reason: ${runtime.reason}\n`;
  }
  const observations = runtime.probes.flatMap((probe) => probe.observations);
  const counts = observations.reduce((current, observation) => {
    const key = observation.comparison ?? observation.state;
    return { ...current, [key]: (current[key] ?? 0) + 1 };
  }, {});
  const correctnessCandidates = pulseCorrectnessCandidates(runtime);
  const rows = runtime.probes.flatMap((probe) =>
    probe.observations.map((observation) =>
      `| ${probe.binding.event} | ${probe.binding.target} | `
      + `${probe.prediction.kind} | ${observation.story ?? '—'} | `
      + `${observation.comparison ?? observation.state} | `
      + `${observation.reason ?? (observation.changed ? 'DOM changed' : 'DOM stable')} |`));
  return `## Chromium response probes

- Catalog: \`${runtime.catalog}\`
- Matching stories: ${runtime.stories.length}
- Probe bindings: ${runtime.probes.length}
- Observations: ${observations.length}
- Confirmed component correctness candidates: ${correctnessCandidates.length}
- Outcomes: ${Object.entries(counts)
    .map(([name, count]) => `${name}=${String(count)}`)
    .join(', ')}

| Event | Target | Static prediction | Story | Comparison | Evidence |
|---|---|---|---|---|---|
${rows.join('\n')}

${correctnessCandidates.length === 0
    ? 'No component correctness contradiction reproduced three times.'
    : `### Confirmed component correctness candidates

${correctnessCandidates.map((candidate) =>
    `- \`${candidate.binding.event}\` on \`${candidate.binding.target}\` in `
    + `\`${candidate.observation.story}\`: ${candidate.observation.comparison} `
    + `(${candidate.observation.reproductions.join(', ')})`).join('\n')}`}
`;
}
