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
  inventoryIssues,
  ratchetChanges,
  readIconMetrics,
  scanTokenSources,
  runtimePropertyDeclarations,
} from '../scripts/inventory.mjs';

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
      `)],
      ['--term-selection', '--maximal-term-baseline'],
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
