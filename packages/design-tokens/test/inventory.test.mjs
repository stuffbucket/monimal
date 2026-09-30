import assert from 'node:assert/strict';
import test from 'node:test';

import { dtcgInventory, ratchetChanges } from '../scripts/inventory.mjs';

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
