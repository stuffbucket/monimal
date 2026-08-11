import { describe, expect, it } from 'vitest';

import { detachedSessions } from '../src/renderer/lib/terminal-sessions.js';
import type { TerminalSession } from '../src/renderer/lib/terminal-transport.js';

function session(id: string): TerminalSession {
  return { id, cwd: '/work', shell: '/bin/sh', startedAt: 1 };
}

describe('detachedSessions', () => {
  it('reports a live session no view holds', () => {
    expect(detachedSessions([session('a'), session('b')], ['a'])).toEqual([
      session('b'),
    ]);
  });

  it('reports nothing when every session has a view', () => {
    expect(detachedSessions([session('a')], ['a'])).toEqual([]);
  });

  it('reports every session when no view holds any', () => {
    // The state after a window reload: shells running, nothing showing them.
    expect(detachedSessions([session('a'), session('b')], [])).toEqual([
      session('a'),
      session('b'),
    ]);
  });

  it('ignores a view whose session has already ended', () => {
    // A tab can outlive its shell, and that is not a detached session.
    expect(detachedSessions([], ['gone'])).toEqual([]);
  });

  it('keeps the order the host reported', () => {
    const sessions = [session('c'), session('a'), session('b')];
    expect(detachedSessions(sessions, ['a']).map((each) => each.id)).toEqual([
      'c',
      'b',
    ]);
  });
});
