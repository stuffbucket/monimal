import { describe, expect, it } from 'vitest';

import {
  append,
  cwdMessage,
  drain,
  emptyBuffer,
  emptyRetained,
  Generations,
  MAX_PENDING_BYTES,
  MAX_RETAINED_BYTES,
  Owners,
  replay,
  resolveCwd,
  retain,
} from '../src/main/native/pty-session.js';

/** A filesystem, as a lookup. */
const fs = (entries: Record<string, boolean>) => (target: string) =>
  target in entries ? { isDirectory: entries[target] === true } : undefined;

describe('resolveCwd', () => {
  const HOME = '/Users/someone';

  it('falls back when no directory is asked for', () => {
    expect(resolveCwd(undefined, HOME, fs({}))).toEqual({ ok: true, cwd: HOME });
    expect(resolveCwd('', HOME, fs({}))).toEqual({ ok: true, cwd: HOME });
  });

  it('accepts an absolute directory that exists', () => {
    const result = resolveCwd('/work/repo', HOME, fs({ '/work/repo': true }));
    expect(result).toEqual({ ok: true, cwd: '/work/repo' });
  });

  it('refuses a relative path', () => {
    // It would resolve against whatever the main process happens to have,
    // which is never what the caller meant.
    expect(resolveCwd('repo', HOME, fs({ repo: true }))).toEqual({
      ok: false,
      reason: 'relative',
    });
    expect(resolveCwd('./repo', HOME, fs({})).ok).toBe(false);
    expect(resolveCwd('../repo', HOME, fs({})).ok).toBe(false);
  });

  it('accepts a Windows path on any platform', () => {
    // Deliberately not `path.isAbsolute`, which reads the host platform and
    // would call this relative when the tests run on POSIX.
    expect(resolveCwd('C:\\work', HOME, fs({ 'C:\\work': true }))).toEqual({
      ok: true,
      cwd: 'C:\\work',
    });
    expect(resolveCwd('d:/work', HOME, fs({ 'd:/work': true })).ok).toBe(true);
  });

  it('anchors the drive-letter form at the start', () => {
    // Unanchored, this matches anywhere, so a relative path with a colon in it
    // reads as absolute.
    expect(resolveCwd('work/c:/repo', HOME, fs({ 'work/c:/repo': true }))).toEqual({
      ok: false,
      reason: 'relative',
    });
  });

  it('refuses a path that does not exist', () => {
    expect(resolveCwd('/gone', HOME, fs({}))).toEqual({ ok: false, reason: 'missing' });
  });

  it('refuses a file', () => {
    expect(resolveCwd('/work/file.txt', HOME, fs({ '/work/file.txt': false }))).toEqual({
      ok: false,
      reason: 'not-a-directory',
    });
  });
});

describe('cwdMessage', () => {
  it('names the path and what is wrong with it', () => {
    expect(cwdMessage('relative', 'repo')).toBe('repo is not an absolute path');
    expect(cwdMessage('missing', '/gone')).toBe('/gone does not exist');
    expect(cwdMessage('not-a-directory', '/f.txt')).toBe('/f.txt is not a directory');
  });
});

describe('Generations', () => {
  it('hands out an increasing generation per id', () => {
    const generations = new Generations();
    expect(generations.next('a')).toBe(1);
    expect(generations.next('a')).toBe(2);
    // Ids are independent.
    expect(generations.next('b')).toBe(1);
  });

  it('recognises only the newest generation', () => {
    const generations = new Generations();
    const first = generations.next('a');
    const second = generations.next('a');
    expect(generations.isCurrent('a', first)).toBe(false);
    expect(generations.isCurrent('a', second)).toBe(true);
  });

  it('does not recognise an id it has never seen', () => {
    expect(new Generations().isCurrent('a', 1)).toBe(false);
  });

  it('releases only for the current generation', () => {
    const generations = new Generations();
    const stale = generations.next('a');
    const live = generations.next('a');

    // This is the bug. A killed session's exit arrives late, after the id was
    // reused. Acting on it would delete the live session.
    expect(generations.release('a', stale)).toBe(false);
    expect(generations.isCurrent('a', live)).toBe(true);

    expect(generations.release('a', live)).toBe(true);
    expect(generations.isCurrent('a', live)).toBe(false);
  });

  it('counts from the last generation after a release', () => {
    // Release deletes the entry, so a naive implementation restarts at 1 and
    // hands a new session the number a stale callback is still holding.
    const generations = new Generations();
    const first = generations.next('a');
    generations.release('a', first);
    const second = generations.next('a');
    expect(second).not.toBe(first);
  });
});

describe('Owners', () => {
  /** A manager that records what was done to it. */
  const manager = () => ({ disposed: false });
  type Manager = ReturnType<typeof manager>;

  const registry = () => {
    const created: string[] = [];
    const owners = new Owners<string, Manager>(
      (owner) => {
        created.push(owner);
        return manager();
      },
      (target) => {
        target.disposed = true;
      },
    );
    return { owners, created };
  };

  it('creates one manager per owner, and reuses it', () => {
    const { owners, created } = registry();
    const first = owners.for('window-a');

    expect(owners.for('window-a')).toBe(first);
    expect(owners.for('window-b')).not.toBe(first);
    expect(created).toEqual(['window-a', 'window-b']);
  });

  it('reports a manager only for an owner that has one', () => {
    const { owners } = registry();
    expect(owners.get('window-a')).toBeUndefined();
    expect(owners.get('window-a')).toBe(undefined);

    const made = owners.for('window-a');
    expect(owners.get('window-a')).toBe(made);
  });

  it('reaps the closing owner and leaves every other owner running', () => {
    // This is the whole point. A window closing must not reach another
    // window's sessions, and must not leave its own behind.
    const { owners } = registry();
    const closing = owners.for('window-a');
    const staying = owners.for('window-b');

    owners.release('window-a');

    expect(closing.disposed).toBe(true);
    expect(staying.disposed).toBe(false);
    expect(owners.get('window-a')).toBeUndefined();
    expect(owners.get('window-b')).toBe(staying);
  });

  it('disposes nothing for an owner it does not hold', () => {
    // A window can be destroyed before it ever asks for a session, and
    // `closed` fires anyway.
    const { owners, created } = registry();
    const held = owners.for('window-a');

    owners.release('window-b');
    owners.release('window-a');
    owners.release('window-a');

    expect(held.disposed).toBe(true);
    expect(created).toEqual(['window-a']);
  });

  it('disposes every manager on release-all, and forgets them', () => {
    const { owners } = registry();
    const managers = ['window-a', 'window-b', 'window-c'].map((owner) =>
      owners.for(owner),
    );

    owners.releaseAll();

    expect(managers.map((target) => target.disposed)).toEqual([true, true, true]);
    // The floor: an empty registry would report the line above as passing by
    // checking nothing.
    expect(managers).toHaveLength(3);
    expect(owners.get('window-a')).toBeUndefined();
    // A later request builds a new manager rather than handing back a dead one.
    expect(owners.for('window-a')).not.toBe(managers[0]);
  });
});

describe('append and drain', () => {
  it('keeps everything under the limit', () => {
    const buffer = emptyBuffer();
    append(buffer, 'one');
    append(buffer, 'two');
    expect(drain(buffer)).toEqual({ text: 'onetwo', dropped: 0 });
  });

  it('empties the buffer', () => {
    const buffer = emptyBuffer();
    append(buffer, 'x');
    drain(buffer);
    expect(drain(buffer)).toEqual({ text: '', dropped: 0 });
  });

  it('keeps exactly the limit without dropping', () => {
    // The boundary. Written as `>=` this drops a character at the one length a
    // buffer is most likely to sit at.
    const buffer = emptyBuffer();
    append(buffer, 'abcd', 4);
    expect(drain(buffer)).toEqual({ text: 'abcd', dropped: 0 });
  });

  it('drops from the front, and only the overflow', () => {
    const buffer = emptyBuffer();
    append(buffer, 'abcdef', 4);
    // The newest output is what a user is looking at, so the front goes.
    expect(drain(buffer)).toEqual({ text: 'cdef', dropped: 2 });
  });

  it('accumulates dropped counts across appends', () => {
    const buffer = emptyBuffer();
    append(buffer, 'aa', 3);
    append(buffer, 'bb', 3);
    append(buffer, 'cc', 3);
    const result = drain(buffer);
    expect(result.text).toBe('bcc');
    expect(result.dropped).toBe(3);
  });

  it('resets the dropped count after draining', () => {
    const buffer = emptyBuffer();
    append(buffer, 'aaaa', 1);
    drain(buffer);
    append(buffer, 'cc');
    expect(drain(buffer).dropped).toBe(0);
  });

  it('has a limit large enough for a build log burst', () => {
    expect(MAX_PENDING_BYTES).toBeGreaterThan(100_000);
  });
});

describe('retain and replay', () => {
  it('replays nothing for a session that has printed nothing', () => {
    expect(replay(emptyRetained())).toBe('');
  });

  it('replays everything under the limit, in order', () => {
    const retained = emptyRetained();
    retain(retained, 'one');
    retain(retained, 'two');
    expect(replay(retained)).toBe('onetwo');
  });

  it('survives being read, unlike the pending buffer', () => {
    // A second view attaching to the same session gets the same tail.
    const retained = emptyRetained();
    retain(retained, 'kept');
    replay(retained);
    expect(replay(retained)).toBe('kept');
  });

  it('keeps exactly the limit without saying anything was dropped', () => {
    const retained = emptyRetained();
    retain(retained, 'abcd', 4);
    expect(replay(retained)).toBe('abcd');
  });

  it('drops from the front and says so', () => {
    const retained = emptyRetained();
    retain(retained, 'abcdef', 4);
    expect(replay(retained)).toBe(
      '\r\n\x1b[2m[earlier output dropped]\x1b[0m\r\ncdef',
    );
  });

  it('keeps saying so after later output fits', () => {
    // The notice is about the session, not about the last chunk.
    const retained = emptyRetained();
    retain(retained, 'abcdef', 4);
    retain(retained, '', 400);
    expect(replay(retained)).toContain('earlier output dropped');
  });

  it('reports a truncation that left nothing behind', () => {
    const retained = emptyRetained();
    retain(retained, 'abc', 0);
    expect(replay(retained)).toBe('\r\n\x1b[2m[earlier output dropped]\x1b[0m\r\n');
  });

  it('is smaller than the pending buffer, and still worth replaying', () => {
    // Charged for the life of a session rather than for one flush.
    expect(MAX_RETAINED_BYTES).toBeLessThan(MAX_PENDING_BYTES);
    expect(MAX_RETAINED_BYTES).toBeGreaterThan(10_000);
  });
});
