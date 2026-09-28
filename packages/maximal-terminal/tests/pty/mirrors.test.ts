import { describe, expect, it } from 'vitest';

import { PtyMirrors } from '../../src/pty/mirrors.js';

interface Win {
  name: string;
}

function harness(subscribable = true) {
  const log: unknown[][] = [];
  const closers = new Map<Win, Array<() => void>>();
  const exits = new Map<string, () => void>();
  const mirrors = new PtyMirrors<Win>({
    onClosed: (window, listener) => {
      log.push(['onClosed', window.name]);
      closers.set(window, [...(closers.get(window) ?? []), listener]);
    },
    subscribe: (owner, recipient, id, onExit) => {
      log.push(['subscribe', owner.name, recipient.name, id]);
      if (!subscribable) return undefined;
      exits.set(`${recipient.name}:${id}`, onExit);
      return () => log.push(['unsubscribe', recipient.name, id]);
    },
    onDetached: (id, recipient, preserveViewer) => log.push(['detached', id, recipient.name, preserveViewer]),
    onWindowForgotten: (window) => log.push(['forgotten', window.name]),
  });
  const close = (window: Win) => {
    for (const listener of closers.get(window) ?? []) listener();
  };
  const clear = () => log.splice(0);
  return { mirrors, log, close, exits, clear };
}

const owner = { name: 'owner' };
const other = { name: 'other' };
const a = { name: 'a' };
const b = { name: 'b' };

describe('PtyMirrors owners', () => {
  it('records, lists, and forgets process owners', () => {
    const { mirrors } = harness();
    expect(mirrors.ownerOf('p1')).toBeUndefined();
    mirrors.setOwner('p1', owner);
    mirrors.setOwner('p2', other);
    mirrors.setOwner('p3', owner);
    expect(mirrors.ownerOf('p1')).toBe(owner);
    expect(mirrors.ownedBy(owner)).toEqual(['p1', 'p3']);
    mirrors.forgetOwner('p1');
    expect(mirrors.ownerOf('p1')).toBeUndefined();
    expect(mirrors.ownedBy(owner)).toEqual(['p3']);
  });

  it('resolves a mirror to the process owner and anyone else to itself', () => {
    const { mirrors } = harness();
    mirrors.setOwner('p1', owner);
    expect(mirrors.realOwnerOf(a, 'p1')).toBe(a);
    mirrors.register(a, 'p1');
    expect(mirrors.realOwnerOf(a, 'p1')).toBe(owner);
    expect(mirrors.realOwnerOf(a, 'p2')).toBe(a);
  });
});

describe('PtyMirrors registration', () => {
  it('accumulates ids per window and hooks each window once', () => {
    const { mirrors, log } = harness();
    expect(mirrors.isMirror(a, 'p1')).toBe(false);
    expect(mirrors.mirroredBy(a)).toEqual([]);
    mirrors.register(a, 'p1');
    mirrors.register(a, 'p2');
    mirrors.register(b, 'p1');
    expect(mirrors.isMirror(a, 'p1')).toBe(true);
    expect(mirrors.mirroredBy(a)).toEqual(['p1', 'p2']);
    expect(log).toEqual([['onClosed', 'a'], ['onClosed', 'b']]);
  });

  it('returns a snapshot of mirrored ids', () => {
    const { mirrors } = harness();
    mirrors.register(a, 'p1');
    const ids = mirrors.mirroredBy(a);
    mirrors.register(a, 'p2');
    expect(ids).toEqual(['p1']);
  });
});

describe('PtyMirrors attachment', () => {
  it('subscribes each recipient and replaces its earlier subscription', () => {
    const { mirrors, log, clear } = harness();
    expect(mirrors.attach(owner, a, 'p1')).toBe(true);
    expect(mirrors.attach(owner, b, 'p1')).toBe(true);
    expect(mirrors.isAttached('p1', a)).toBe(true);
    expect(mirrors.isAttached('p1', b)).toBe(true);
    clear();
    expect(mirrors.attach(owner, a, 'p1')).toBe(true);
    expect(log).toEqual([['unsubscribe', 'a', 'p1'], ['subscribe', 'owner', 'a', 'p1']]);
    expect(mirrors.isAttached('p1', b)).toBe(true);
  });

  it('stays detached when there is nothing to stream', () => {
    const { mirrors } = harness(false);
    expect(mirrors.attach(owner, a, 'p1')).toBe(false);
    expect(mirrors.isAttached('p1', a)).toBe(false);
  });

  it('detaches a recipient whose stream exits', () => {
    const { mirrors, log, exits, clear } = harness();
    mirrors.register(a, 'p1');
    mirrors.attach(owner, a, 'p1');
    clear();
    exits.get('a:p1')!();
    expect(log).toEqual([['unsubscribe', 'a', 'p1'], ['detached', 'p1', 'a', false]]);
    expect(mirrors.isAttached('p1', a)).toBe(false);
    expect(mirrors.isMirror(a, 'p1')).toBe(false);
  });
});

describe('PtyMirrors detach', () => {
  it('drops one recipient and keeps the others', () => {
    const { mirrors, log, clear } = harness();
    mirrors.register(a, 'p1');
    mirrors.register(a, 'p2');
    mirrors.attach(owner, a, 'p1');
    mirrors.attach(owner, b, 'p1');
    clear();
    mirrors.detach('p1', a, true);
    expect(log).toEqual([['unsubscribe', 'a', 'p1'], ['detached', 'p1', 'a', true]]);
    expect(mirrors.isAttached('p1', a)).toBe(false);
    expect(mirrors.isAttached('p1', b)).toBe(true);
    expect(mirrors.mirroredBy(a)).toEqual(['p2']);
    mirrors.attach(owner, a, 'p1');
    expect(mirrors.isAttached('p1', b)).toBe(true);
  });

  it('forgets a session once its last recipient leaves', () => {
    const { mirrors, log, clear } = harness();
    mirrors.attach(owner, a, 'p1');
    mirrors.detach('p1', a);
    clear();
    mirrors.attach(owner, b, 'p1');
    mirrors.detach('p1', a);
    expect(log).toEqual([['subscribe', 'owner', 'b', 'p1'], ['detached', 'p1', 'a', false]]);
    expect(mirrors.isAttached('p1', b)).toBe(true);
  });

  it('reports a detach even for a recipient that never attached', () => {
    const { mirrors, log } = harness();
    mirrors.detach('p1', a);
    expect(log).toEqual([['detached', 'p1', 'a', false]]);
  });
});

describe('PtyMirrors window close', () => {
  it('detaches every mirrored session, then forgets the window once', () => {
    const { mirrors, log, close, clear } = harness();
    mirrors.register(a, 'p1');
    mirrors.register(a, 'p2');
    mirrors.attach(owner, a, 'p1');
    clear();
    close(a);
    close(a);
    expect(log).toEqual([
      ['unsubscribe', 'a', 'p1'],
      ['detached', 'p1', 'a', false],
      ['detached', 'p2', 'a', false],
      ['forgotten', 'a'],
    ]);
    expect(mirrors.mirroredBy(a)).toEqual([]);
    expect(mirrors.isMirror(a, 'p2')).toBe(false);
  });
});
