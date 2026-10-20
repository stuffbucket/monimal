import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  apiSurface,
  checkApiBaseline,
  packageApiReport,
  serializeApiReport,
} from '../src/api-surface.mjs';

const WORK_ROOT = path.join(
  import.meta.dirname,
  `.check-api-work-${String(process.pid)}`,
);
let fixtureNumber = 0;

async function fixture({ invalid = false } = {}) {
  fixtureNumber += 1;
  const root = path.join(WORK_ROOT, String(fixtureNumber));
  await mkdir(path.join(root, 'src'), { recursive: true });
  await mkdir(path.join(root, 'tokens'), { recursive: true });
  await mkdir(path.join(root, 'dist', 'tokens'), { recursive: true });
  await writeFile(
    path.join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        target: 'ES2022',
      },
      include: ['src/**/*.ts'],
    }),
  );
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({
      type: 'module',
      exports: {
        './styles.css': './src/styles.css',
        './extra': './src/extra.ts',
        '.': './src/index.ts',
        './tokens.css': './dist/tokens/tokens.css',
      },
    }),
  );
  await writeFile(
    path.join(root, 'src', 'index.ts'),
    invalid
      ? 'export const broken: string = 1;\n'
      : [
          'interface Original { value: string }',
          'export { Original as Alias };',
          'export interface Zeta { enabled: boolean }',
          'export function parse(value: string): string;',
          'export function parse(value: number): number;',
          'export function parse(value: string | number) { return value; }',
          'export const answer = 42 as const;',
          '',
        ].join('\n'),
  );
  await writeFile(path.join(root, 'src', 'extra.ts'), 'export type Extra = "extra";\n');
  await writeFile(
    path.join(root, 'src', 'styles.css'),
    '@import "./nested.css";\n:root { --fixture-color: red; }\n.fixture, [data-fixture] { color: var(--fixture-color); }\n',
  );
  await writeFile(
    path.join(root, 'src', 'nested.css'),
    '.nested:hover { color: blue; }\n',
  );
  await writeFile(
    path.join(root, 'tokens', 'space.json'),
    JSON.stringify({ space: { small: { $type: 'dimension', $value: '4px' } } }),
  );
  await writeFile(
    path.join(root, 'dist', 'tokens', 'tokens.json'),
    JSON.stringify({ space: { small: '4px' } }),
  );
  await writeFile(
    path.join(root, 'dist', 'tokens', 'tokens.css'),
    ':root { --space-small: 4px; }\n',
  );
  return root;
}

test.after(async () => {
  await rm(WORK_ROOT, { force: true, recursive: true });
});

test('serializes aliases, interfaces, overloads, and values deterministically', async () => {
  const root = await fixture();
  const surface = apiSurface(root);

  assert.deepEqual(surface.map(({ name }) => name), ['Alias', 'answer', 'parse', 'Zeta']);
  assert.deepEqual(surface.find(({ name }) => name === 'Alias')?.declarations, [
    'interface Original { value: string }',
  ]);
  assert.deepEqual(surface.find(({ name }) => name === 'Zeta')?.declarations, [
    'export interface Zeta { enabled: boolean }',
  ]);
  assert.deepEqual(surface.find(({ name }) => name === 'parse')?.declarations, [
    '(value: number): number',
    '(value: string | number): string | number',
    '(value: string): string',
  ]);
  assert.deepEqual(surface.find(({ name }) => name === 'answer')?.declarations, ['42']);
  assert.equal(
    serializeApiReport({ exports: surface }),
    serializeApiReport({ exports: apiSurface(root) }),
  );
});

test('reports every export subpath, CSS contract, and source/generated tokens', async () => {
  const root = await fixture();
  const report = await packageApiReport(root);

  assert.deepEqual(report.subpaths.map(({ subpath }) => subpath), [
    '.',
    './extra',
    './styles.css',
    './tokens.css',
  ]);
  const styles = report.subpaths.find(({ subpath }) => subpath === './styles.css');
  assert.deepEqual(styles.surface.files, ['src/nested.css', 'src/styles.css']);
  assert.deepEqual(styles.surface.customProperties, ['--fixture-color']);
  assert.deepEqual(styles.surface.selectors, [
    ':root',
    '.fixture',
    '.nested:hover',
    '[data-fixture]',
  ]);
  assert.deepEqual(report.tokens, {
    source: ['space-small'],
    generatedJson: ['space-small'],
    generatedCss: ['--space-small'],
  });
});

test('reports TypeScript diagnostics before serializing an invalid API', async () => {
  const root = await fixture({ invalid: true });

  assert.throws(
    () => apiSurface(root),
    /Type 'number' is not assignable to type 'string'/u,
  );
});

test('fails a baseline mismatch and updates only on explicit request', async () => {
  const root = await fixture();
  const errors = [];
  assert.equal(await checkApiBaseline({
    root,
    stderr: (message) => errors.push(message),
    stdout: () => {},
  }), false);
  assert.match(errors.join('\n'), /public API surface changed/iu);

  assert.equal(await checkApiBaseline({
    root,
    update: true,
    stderr: () => {},
    stdout: () => {},
  }), true);
  assert.equal(await checkApiBaseline({
    root,
    stderr: () => {},
    stdout: () => {},
  }), true);
});
