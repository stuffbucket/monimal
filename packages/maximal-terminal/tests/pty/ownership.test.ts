import { describe, expect, it } from 'vitest';

import { stageOwnership, type PtyOwnershipPort } from '../../src/pty/ownership.js';
import type { PtySpawnRequest } from '../../src/contract.js';

type Win = 'owner' | 'recipient' | 'real';
type Grid = { cols: number; rows: number };

const p1: PtySpawnRequest = { id: 'p1', cols: 80, rows: 24 };
const p2: PtySpawnRequest = { id: 'p2', cols: 100, rows: 30 };
const p3: PtySpawnRequest = { id: 'p3', cols: 120, rows: 40 };

const QUERIES = new Set(['isProjection', 'projectionIds', 'viewerGrid', 'isMirror', 'mirrorAttached', 'realOwnerOf']);

interface World {
  projections: Set<string>;
  projectionIds: Map<string, string[]>;
  grids: Map<string, Grid>;
  mirrors: Set<string>;
  attached: Set<string>;
  realOwners: Map<string, Win | undefined>;
  failing: Set<string>;
}

function harness(setup: Partial<World> = {}) {
  const world: World = {
    projections: new Set(),
    projectionIds: new Map(),
    grids: new Map(),
    mirrors: new Set(),
    attached: new Set(),
    realOwners: new Map(),
    failing: new Set(),
    ...setup,
  };
  const log: unknown[][] = [];
  const impl: PtyOwnershipPort<Win> = {
    isProjection: (id) => world.projections.has(id),
    projectionIds: (window, id) => world.projectionIds.get(`${window}:${id}`) ?? [],
    grantProjection: (_owner, id, recipient) => {
      if (world.failing.has(`grant:${id}`)) return false;
      const key = `${recipient}:${id}`;
      world.projectionIds.set(key, [...(world.projectionIds.get(key) ?? []), `new-${id}`]);
      return true;
    },
    transferProjection: (from, id) => !world.failing.has(`transferProjection:${from}:${id}`),
    revokeProjection: () => {},
    detachProjection: () => {},
    detachProjectionOwner: () => {},
    forgetProjectionEpoch: () => {},
    viewerGrid: (id, window) => world.grids.get(`${window}:${id}`),
    trackViewerSize: () => {},
    forgetViewerSize: () => {},
    isMirror: (window, id) => world.mirrors.has(`${window}:${id}`),
    mirrorAttached: (id, window) => world.attached.has(`${window}:${id}`),
    realOwnerOf: (_window, id) => (world.realOwners.has(id) ? world.realOwners.get(id) : 'real'),
    registerMirror: () => {},
    attachMirror: () => {},
    detachMirror: () => {},
    copy: (_owner, _recipient, request) => !world.failing.has(`copy:${request.id}`),
    transfer: (from, _to, request) => !world.failing.has(`transfer:${from}:${request.id}`),
  };
  const port = Object.fromEntries(
    Object.entries(impl).map(([name, fn]) => [
      name,
      (...args: unknown[]) => {
        log.push([name, ...args]);
        return (fn as (...a: unknown[]) => unknown)(...args);
      },
    ]),
  ) as unknown as PtyOwnershipPort<Win>;
  const effects = () => log.filter(([name]) => !QUERIES.has(name as string));
  const clear = () => log.splice(0);
  return { world, port, log, effects, clear };
}

describe('stageOwnership guards', () => {
  it.each([
    ['no owner', undefined, 'recipient', [p1]],
    ['no recipient', 'owner', undefined, [p1]],
    ['same window', 'owner', 'owner', [p1]],
    ['no requests', 'owner', 'recipient', []],
    ['duplicate ids', 'owner', 'recipient', [p1, { ...p1 }]],
  ] as const)('refuses %s without touching the registry', (_label, owner, recipient, requests) => {
    const { port, log } = harness();
    expect(stageOwnership<Win>(port, owner, recipient, requests, 'copy')).toBeUndefined();
    expect(log).toEqual([]);
  });

  it('stages distinct requests', () => {
    const { port, effects } = harness();
    expect(stageOwnership<Win>(port, 'owner', 'recipient', [p1, p2], 'copy')).toBeDefined();
    expect(effects()).toEqual([
      ['copy', 'owner', 'recipient', p1],
      ['copy', 'owner', 'recipient', p2],
    ]);
  });
});

describe('stageOwnership copy', () => {
  it('commits exactly once and ignores rollback afterwards', () => {
    const { port, effects, clear } = harness();
    const tx = stageOwnership<Win>(port, 'owner', 'recipient', [p1], 'copy')!;
    clear();
    expect(tx.commit()).toBe(true);
    expect(tx.commit()).toBe(false);
    tx.rollback();
    expect(effects()).toEqual([]);
  });

  it('rollback detaches new mirrors in reverse and runs once', () => {
    const { port, effects, clear } = harness();
    const tx = stageOwnership<Win>(port, 'owner', 'recipient', [p1, p2], 'copy')!;
    clear();
    tx.rollback();
    tx.rollback();
    expect(tx.commit()).toBe(false);
    expect(effects()).toEqual([
      ['detachMirror', 'p2', 'recipient'],
      ['detachMirror', 'p1', 'recipient'],
    ]);
  });

  it('a failed copy undoes the earlier copies', () => {
    const { port, effects } = harness({ failing: new Set(['copy:p3']) });
    expect(stageOwnership<Win>(port, 'owner', 'recipient', [p1, p2, p3], 'copy')).toBeUndefined();
    expect(effects()).toEqual([
      ['copy', 'owner', 'recipient', p1],
      ['copy', 'owner', 'recipient', p2],
      ['copy', 'owner', 'recipient', p3],
      ['detachMirror', 'p2', 'recipient'],
      ['detachMirror', 'p1', 'recipient'],
    ]);
  });
});

describe('stageOwnership mirror rollback', () => {
  function stagedOverMirror(setup: Partial<World>, requests = [p1]) {
    const h = harness({ mirrors: new Set(['recipient:p1']), ...setup });
    const tx = stageOwnership<Win>(h.port, 'owner', 'recipient', requests, 'copy')!;
    h.clear();
    return { ...h, tx };
  }

  it('leaves a mirror that is still registered', () => {
    const { tx, effects } = stagedOverMirror({});
    tx.rollback();
    expect(effects()).toEqual([]);
  });

  it('re-registers and reattaches a lost attached mirror at its prior grid', () => {
    const { tx, world, effects } = stagedOverMirror({
      attached: new Set(['recipient:p1']),
      grids: new Map([['recipient:p1', { cols: 90, rows: 33 }]]),
    });
    world.mirrors.clear();
    tx.rollback();
    expect(effects()).toEqual([
      ['registerMirror', 'real', 'recipient', 'p1'],
      ['attachMirror', 'real', 'recipient', { id: 'p1', cols: 90, rows: 33 }],
    ]);
  });

  it('reattaches at the request grid when none was tracked', () => {
    const { tx, world, effects } = stagedOverMirror({ attached: new Set(['recipient:p1']) });
    world.mirrors.clear();
    tx.rollback();
    expect(effects()).toEqual([
      ['registerMirror', 'real', 'recipient', 'p1'],
      ['attachMirror', 'real', 'recipient', p1],
    ]);
  });

  it('restores the tracked grid of a lost detached mirror', () => {
    const { tx, world, effects } = stagedOverMirror({
      grids: new Map([['recipient:p1', { cols: 90, rows: 33 }]]),
    });
    world.mirrors.clear();
    tx.rollback();
    expect(effects()).toEqual([
      ['registerMirror', 'real', 'recipient', 'p1'],
      ['trackViewerSize', 'p1', 'recipient', 90, 33],
    ]);
  });

  it('only re-registers a lost detached mirror without a grid', () => {
    const { tx, world, effects } = stagedOverMirror({});
    world.mirrors.clear();
    tx.rollback();
    expect(effects()).toEqual([['registerMirror', 'real', 'recipient', 'p1']]);
  });

  it('skips a lost mirror without a real owner and keeps rolling back', () => {
    const { tx, world, effects } = stagedOverMirror({ realOwners: new Map([['p1', undefined]]) }, [p2, p1]);
    world.mirrors.clear();
    tx.rollback();
    expect(effects()).toEqual([['detachMirror', 'p2', 'recipient']]);
  });
});

describe('stageOwnership projections', () => {
  it('grants at the request grid and rolls back only new projections', () => {
    const { port, effects, clear } = harness({
      projections: new Set(['p1']),
      projectionIds: new Map([['recipient:p1', ['old']]]),
    });
    const tx = stageOwnership<Win>(port, 'owner', 'recipient', [p1], 'copy')!;
    expect(effects()).toEqual([['grantProjection', 'owner', 'p1', 'recipient', 80, 24]]);
    clear();
    tx.rollback();
    expect(effects()).toEqual([
      ['detachProjection', 'recipient', 'p1', 'new-p1'],
      ['revokeProjection', 'owner', 'p1', 'recipient'],
      ['forgetViewerSize', 'p1', 'recipient'],
    ]);
  });

  it('forgets the epoch of a first projection and restores its grid', () => {
    const { port, effects, clear } = harness({
      projections: new Set(['p1']),
      grids: new Map([['recipient:p1', { cols: 70, rows: 20 }]]),
    });
    const tx = stageOwnership<Win>(port, 'owner', 'recipient', [p1], 'copy')!;
    clear();
    tx.rollback();
    expect(effects()).toEqual([
      ['detachProjection', 'recipient', 'p1', 'new-p1'],
      ['revokeProjection', 'owner', 'p1', 'recipient'],
      ['forgetProjectionEpoch', 'recipient', 'p1'],
      ['trackViewerSize', 'p1', 'recipient', 70, 20],
    ]);
  });

  it('a failed grant undoes earlier entries but not itself', () => {
    const { port, effects } = harness({ projections: new Set(['p2']), failing: new Set(['grant:p2']) });
    expect(stageOwnership<Win>(port, 'owner', 'recipient', [p1, p2], 'copy')).toBeUndefined();
    expect(effects()).toEqual([
      ['copy', 'owner', 'recipient', p1],
      ['grantProjection', 'owner', 'p2', 'recipient', 100, 30],
      ['detachMirror', 'p1', 'recipient'],
    ]);
  });
});

describe('stageOwnership move', () => {
  it('transfers every session and finalizes projections', () => {
    const { port, effects, clear } = harness({ projections: new Set(['p2']) });
    const tx = stageOwnership<Win>(port, 'owner', 'recipient', [p1, p2], 'move')!;
    clear();
    expect(tx.commit()).toBe(true);
    expect(tx.commit()).toBe(false);
    expect(effects()).toEqual([
      ['transfer', 'owner', 'recipient', p1],
      ['transferProjection', 'owner', 'p2', 'recipient'],
      ['revokeProjection', 'recipient', 'p2', 'recipient'],
      ['detachProjectionOwner', 'owner', 'p2'],
      ['forgetProjectionEpoch', 'owner', 'p2'],
      ['forgetViewerSize', 'p2', 'owner'],
      ['trackViewerSize', 'p2', 'recipient', 100, 30],
    ]);
  });

  it('a failed projection transfer returns moved PTYs at their source grid, newest first', () => {
    const { port, effects, clear } = harness({
      projections: new Set(['p3']),
      grids: new Map([['real:p1', { cols: 90, rows: 40 }]]),
      failing: new Set(['transferProjection:owner:p3']),
    });
    const tx = stageOwnership<Win>(port, 'owner', 'recipient', [p1, p2, p3], 'move')!;
    clear();
    expect(tx.commit()).toBe(false);
    expect(effects()).toEqual([
      ['transfer', 'owner', 'recipient', p1],
      ['transfer', 'owner', 'recipient', p2],
      ['transferProjection', 'owner', 'p3', 'recipient'],
      ['transfer', 'recipient', 'real', p2],
      ['transfer', 'recipient', 'real', { id: 'p1', cols: 90, rows: 40 }],
      ['detachProjection', 'recipient', 'p3', 'new-p3'],
      ['revokeProjection', 'owner', 'p3', 'recipient'],
      ['forgetProjectionEpoch', 'recipient', 'p3'],
      ['forgetViewerSize', 'p3', 'recipient'],
      ['detachMirror', 'p2', 'recipient'],
      ['detachMirror', 'p1', 'recipient'],
    ]);
  });

  it('a missing real owner returns moved projections', () => {
    const { port, log, effects, clear } = harness({
      projections: new Set(['p1']),
      realOwners: new Map([['p2', undefined]]),
    });
    const tx = stageOwnership<Win>(port, 'owner', 'recipient', [p1, p2], 'move')!;
    clear();
    expect(tx.commit()).toBe(false);
    expect(log.filter(([name]) => name === 'viewerGrid')).toEqual([]);
    expect(effects()).toEqual([
      ['transferProjection', 'owner', 'p1', 'recipient'],
      ['transferProjection', 'recipient', 'p1', 'owner'],
      ['detachMirror', 'p2', 'recipient'],
      ['detachProjection', 'recipient', 'p1', 'new-p1'],
      ['revokeProjection', 'owner', 'p1', 'recipient'],
      ['forgetProjectionEpoch', 'recipient', 'p1'],
      ['forgetViewerSize', 'p1', 'recipient'],
    ]);
  });

  it('a failed transfer undoes what moved before it', () => {
    const { port, effects, clear } = harness({ failing: new Set(['transfer:owner:p2']) });
    const tx = stageOwnership<Win>(port, 'owner', 'recipient', [p1, p2], 'move')!;
    clear();
    expect(tx.commit()).toBe(false);
    expect(effects()).toEqual([
      ['transfer', 'owner', 'recipient', p1],
      ['transfer', 'owner', 'recipient', p2],
      ['transfer', 'recipient', 'real', p1],
      ['detachMirror', 'p2', 'recipient'],
      ['detachMirror', 'p1', 'recipient'],
    ]);
  });
});
