import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  candidatePorts,
  matchesSelector,
  parseArguments,
  readLiveRecords,
  serverId,
} from '@maximal/maximal-storybook/storybook-server';
import { storybookManagerHead } from '@maximal/maximal-storybook';

test('parses start, list, and stop commands', () => {
  assert.deepEqual(parseArguments(['list']), { command: 'list' });
  assert.deepEqual(parseArguments(['stop', 'agents/storybook']), {
    command: 'stop',
    selector: 'agents/storybook',
  });
  assert.deepEqual(parseArguments(['stop', '--', '6020']), {
    command: 'stop',
    selector: '6020',
  });
  assert.deepEqual(
    parseArguments([
      'start',
      '--catalog',
      'maximal-storybook',
      '--catalog-root',
      '/tmp/catalog',
    ]),
    {
      command: 'start',
      catalog: 'maximal-storybook',
      catalogRoot: '/tmp/catalog',
    },
  );
});

test('derives stable server IDs and a complete deterministic port range', () => {
  assert.equal(serverId('/workspace/one', 'catalog'), serverId('/workspace/one', 'catalog'));
  assert.notEqual(
    serverId('/workspace/one', 'catalog'),
    serverId('/workspace/two', 'catalog'),
  );
  const ports = candidatePorts('/workspace/one', 'catalog');
  assert.equal(ports.length, 94);
  assert.equal(new Set(ports).size, 94);
  assert.equal(Math.min(...ports), 6006);
  assert.equal(Math.max(...ports), 6099);
  assert.deepEqual(ports, candidatePorts('/workspace/one', 'catalog'));
});

test('removes malformed and stale registry records', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'storybook-registry-'));
  const live = {
    version: 1,
    id: 'live',
    catalog: 'maximal-storybook',
    worktree: '/workspace/live',
    branch: 'agents/live',
    commit: 'abcdef123456',
    port: 6020,
    url: `http://${[127, 0, 0, 1].join('.')}:6020`,
    wrapperPid: 101,
    serverPid: 102,
    startedAt: '2026-10-01T00:00:00.000Z',
  };
  const stale = { ...live, id: 'stale', wrapperPid: 201 };
  fs.writeFileSync(path.join(directory, 'live.json'), JSON.stringify(live));
  fs.writeFileSync(path.join(directory, 'stale.json'), JSON.stringify(stale));
  fs.writeFileSync(path.join(directory, 'invalid.json'), '{');

  try {
    assert.deepEqual(
      readLiveRecords(directory, {
        ownsProcess: (record) => record.wrapperPid === 101,
      }),
      [live],
    );
    assert.deepEqual(fs.readdirSync(directory), ['live.json']);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('matches explicit server selectors', () => {
  const record = {
    id: 'abc123def456',
    catalog: 'maximal-storybook',
    worktree: '/workspace/agents-storybook',
    branch: 'agents/storybook',
    port: 6020,
  };
  assert.equal(matchesSelector(record, 'abc123'), true);
  assert.equal(matchesSelector(record, 'maximal-storybook'), true);
  assert.equal(matchesSelector(record, 'agents/storybook'), true);
  assert.equal(matchesSelector(record, 'agents-storybook'), true);
  assert.equal(matchesSelector(record, '6020'), true);
  assert.equal(matchesSelector(record, 'main'), false);
});

test('adds escaped worktree identity to the Storybook manager', () => {
  const head = storybookManagerHead(
    '<meta charset="utf-8">',
    'agents/<identity> · worktree',
  );
  assert.match(head, /Storybook/);
  assert.match(head, /agents\/\\u003cidentity>/);
  assert.doesNotMatch(head, /agents\/<identity>/);
  assert.match(head, /data-monimal-storybook-identity/);
});
