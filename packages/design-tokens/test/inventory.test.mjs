import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';

import {
  dtcgInventory,
  iconSourceIssues,
  ratchetChanges,
  readIconMetrics,
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
