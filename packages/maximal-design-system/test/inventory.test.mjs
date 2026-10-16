import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  dtcgInventory,
  iconSourceIssues,
  isTokenInventorySource,
  inventoryIssues,
  ratchetChanges,
  readIconMetrics,
  scanTokenSources,
  runtimePropertyDeclarations,
} from '../scripts/inventory.mjs';

test('token inventory excludes non-runtime design-system tooling', () => {
  assert.equal(
    isTokenInventorySource('packages/maximal-design-system-tools/test/policy.test.mjs'),
    false,
  );
  assert.equal(
    isTokenInventorySource('packages/maximal-client/src/renderer/theme.css'),
    true,
  );
});

test('DTCG inventory preserves CSS identity and observed declarations', () => {
  const tokens = new Map([
    ['--shell-accent', [{ file: 'theme.css', value: '#2563eb' }]],
  ]);
  const inventory = dtcgInventory(tokens);
  const token = inventory.inventory['shell-accent'];

  assert.equal(token.$type, 'string');
  assert.equal(token.$value, '#2563eb');
  assert.equal(
    token.$extensions['dev.maximal.inventory'].cssCustomProperty,
    '--shell-accent',
  );
});

test('ratchet reports additions and stale baseline entries', () => {
  const current = [{ id: 'new' }, { id: 'kept' }];
  const recorded = [{ id: 'kept' }, { id: 'gone' }];

  assert.deepEqual(ratchetChanges(current, recorded), {
    added: [{ id: 'new' }],
    gone: [{ id: 'gone' }],
  });

  test('token scan ignores tracked files deleted from the working tree', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'maximal-token-scan-'));
    try {
      mkdirSync(path.join(root, 'apps', 'fixture'), { recursive: true });
      const kept = path.join(root, 'apps', 'fixture', 'kept.css');
      const deleted = path.join(root, 'apps', 'fixture', 'deleted.css');
      const keptToken = ['--', 'kept-token'].join('');
      const deletedToken = ['--', 'deleted-token'].join('');
      writeFileSync(kept, `:root { ${keptToken}: 1; }\n`);
      writeFileSync(deleted, `:root { ${deletedToken}: 1; }\n`);
      execFileSync('git', ['init', '--quiet'], { cwd: root });
      execFileSync('git', ['add', 'apps'], { cwd: root });
      unlinkSync(deleted);

      const scan = scanTokenSources(root);

      assert.equal(scan.tokens.has(keptToken), true);
      assert.equal(scan.tokens.has(deletedToken), false);
    } finally {
      rmSync(root, { recursive: true });
    }
  });

  test('runtime style properties satisfy dynamic CSS declarations', () => {
    assert.deepEqual(
      [...runtimePropertyDeclarations(`
        host.style.setProperty('--term-selection', theme.selection);
        host.style.setProperty("--maximal-term-baseline", baseline);
        Object.assign(tokens, {
          '--maximal-color-swatch-orange': alias('orange', 500),
          '--maximal-color-bg-selected-quiet': mode === 'dark'
            ? alias('white', 200)
            : alias('black', 100),
        });
      `)],
      [
        '--term-selection',
        '--maximal-term-baseline',
        '--maximal-color-swatch-orange',
        '--maximal-color-bg-selected-quiet',
      ],
    );
  });
});

test('DTCG icon owners type matching CSS custom properties', () => {
  const tokens = new Map([
    ['--size-icon', [{ file: 'tokens.css', value: '16px' }]],
    ['--icon-optical-map-scale', [{ file: 'tokens.css', value: '1.111111' }]],
  ]);
  const inventory = dtcgInventory(tokens).inventory;
  const token = inventory['size-icon'];

  assert.equal(token.$type, 'dimension');
  assert.deepEqual(token.$value, { value: 16, unit: 'px' });
  assert.equal(
    token.$extensions['dev.maximal.inventory'].provisionalType,
    false,
  );
  assert.equal(inventory['icon-optical-map-scale'].$type, 'number');
  assert.equal(inventory['icon-optical-map-scale'].$value, 1.111111);
});

test('DTCG motion and stacking owners preserve CSS values', () => {
  const tokens = new Map([
    ['--easing-standard', [{
      file: 'tokens.css',
      value: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
    }]],
    ['--opacity-disabled', [{ file: 'tokens.css', value: '0.5' }]],
    ['--z-index-popover', [{ file: 'tokens.css', value: '20' }]],
    ['--z-index-assistant', [{ file: 'tokens.css', value: '40' }]],
  ]);
  const inventory = dtcgInventory(tokens).inventory;

  assert.equal(inventory['easing-standard'].$type, 'cubicBezier');
  assert.deepEqual(inventory['easing-standard'].$value, [0.25, 0.1, 0.25, 1]);
  assert.equal(inventory['opacity-disabled'].$type, 'number');
  assert.equal(inventory['z-index-popover'].$type, 'number');
  assert.equal(inventory['z-index-assistant'].$type, 'number');
  assert.equal(inventory['z-index-assistant'].$value, 40);
});

test('DTCG spatial grid owners type colors and dot geometry', () => {
  const tokens = new Map([
    ['--shell-spatial-grid-dot-light', [{ file: 'tokens.css', value: 'rgb(196 196 196)' }]],
    ['--shell-spatial-grid-background-light', [{ file: 'tokens.css', value: 'rgb(245 245 245)' }]],
    ['--shell-spatial-grid-radius', [{ file: 'structural.css', value: '1px' }]],
  ]);
  const inventory = dtcgInventory(tokens).inventory;
  assert.equal(inventory['shell-spatial-grid-dot-light'].$type, 'color');
  assert.equal(inventory['shell-spatial-grid-background-light'].$type, 'color');
  assert.deepEqual(inventory['shell-spatial-grid-radius'].$value, { value: 1, unit: 'px' });
  assert.deepEqual(inventoryIssues({
    tokens,
    references: new Map(),
  }).filter(({ kind }) => kind !== 'tool-gap'), []);
});

test('DTCG elevation owners preserve composite shadow aliases', () => {
  const reference = `--${['elevation', 'reference', '100', 'dark', 'standard'].join('-')}`;
  const tokens = new Map([
    ['--elevation-100', [{
      file: 'tokens.css',
      value: `var(${reference})`,
    }]],
  ]);
  const inventory = dtcgInventory(tokens).inventory;

  assert.equal(inventory['elevation-100'].$type, 'shadow');
  assert.equal(
    inventory['elevation-100'].$value,
    '{elevation-reference.100.dark.standard}',
  );
  assert.deepEqual(inventoryIssues({
    tokens,
    references: new Map([
      ['--elevation-100', new Set(['elevations.css'])],
    ]),
  }).filter(({ kind }) => kind !== 'tool-gap'), []);
});

test('DTCG typography owners preserve CSS font shorthands', () => {
  const value = "400 11px/16px -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";
  const tokens = new Map([
    ['--body-medium', [{ file: 'tokens.css', value }]],
  ]);
  const inventory = dtcgInventory(tokens).inventory;

  assert.equal(inventory['body-medium'].$type, 'typography');
  assert.equal(inventory['body-medium'].$value.fontSize.value, 11);
  assert.deepEqual(inventoryIssues({
    tokens,
    references: new Map([
      ['--body-medium', new Set(['typography.css'])],
    ]),
  }).filter(({ kind }) => kind !== 'tool-gap'), []);
});

test('owned DTCG properties satisfy generated CSS references', () => {
  const issues = inventoryIssues({
    tokens: new Map(),
    references: new Map([
      ['--spacer-1', new Set(['grid.css'])],
      ['--missing-token', new Set(['grid.css'])],
    ]),
  });

  assert.deepEqual(
    issues.filter(({ kind }) => kind === 'unresolved-reference').map(({ id }) => id),
    ['unresolved-reference:--missing-token'],
  );
});

test('icon metric scan ratchets off-grid Lucide sizes', () => {
  const issues = iconSourceIssues(
    'packages/example/Icon.tsx',
    `
        import { FolderSearch, Globe as BrowserIcon } from 'lucide-react';
        export const Example = () => (
          <>
            <FolderSearch size=` + '{15}' + ` />
            <BrowserIcon size={16} />
          </>
        );
      `,
  );

  assert.deepEqual(issues.map(({ id }) => id), [
    'icon-size-outlier:packages/example/Icon.tsx:FolderSearch:15',
  ]);
});

test('icon metric scan validates SVG source canvases', () => {
  const metrics = readIconMetrics();

  assert.deepEqual(
    iconSourceIssues(
      'packages/example/icons/good.svg',
      '<svg viewBox="0 0 24 24"></svg>',
      metrics,
    ),
    [],
  );
  assert.equal(
    iconSourceIssues(
      'packages/example/icons/wide.svg',
      '<svg viewBox="0 0 24 16"></svg>',
      metrics,
    )[0]?.kind,
    'icon-source-canvas-non-square',
  );
});

test('icon metric scan excludes explicitly named reference sheets', () => {
  assert.deepEqual(
    iconSourceIssues(
      'packages/example/icons/catalog.sheet.svg',
      '<svg viewBox="0 0 5312 3296"></svg>',
    ),
    [],
  );
});

test('icon metric scan validates PNG source canvases', () => {
  const png = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
  png.writeUInt32BE(22, 16);
  png.writeUInt32BE(22, 20);

  assert.deepEqual(
    iconSourceIssues('packages/example/icons/tray.png', png),
    [],
  );
  png.writeUInt32BE(20, 20);
  assert.equal(
    iconSourceIssues('packages/example/icons/tray.png', png)[0]?.kind,
    'icon-source-canvas-non-square',
  );
});
