import { describe, expect, it } from 'vitest';

import {
  isTerminalPane,
  removeTerminalPane,
  splitTerminalPane,
  terminalPaneSessionIds,
  type TerminalPane,
} from '../src/pane.js';

const split: TerminalPane = {
  direction: 'right',
  first: { sessionId: 'a' },
  second: {
    direction: 'down',
    first: { sessionId: 'b' },
    second: { sessionId: 'c' },
  },
};

describe('terminal pane trees', () => {
  it('recognizes pane trees received across process boundaries', () => {
    expect(isTerminalPane({ sessionId: 'a' })).toBe(true);
    expect(isTerminalPane(split)).toBe(true);

    expect(isTerminalPane(undefined)).toBe(false);
    expect(isTerminalPane(null)).toBe(false);
    expect(isTerminalPane({ sessionId: '' })).toBe(false);
    expect(isTerminalPane({ sessionId: 1 })).toBe(false);
    expect(isTerminalPane({ direction: 'left', first: { sessionId: 'a' }, second: { sessionId: 'b' } })).toBe(false);
    expect(isTerminalPane({ first: { sessionId: 'a' }, second: { sessionId: 'b' } })).toBe(false);
    expect(isTerminalPane({ direction: 'right', second: { sessionId: 'b' } })).toBe(false);
    expect(isTerminalPane({ direction: 'right', first: { sessionId: 'a' } })).toBe(false);
    expect(isTerminalPane({ direction: 'down', first: { sessionId: 'a' }, second: { sessionId: '' } })).toBe(false);
  });

  it('rejects malformed pane branches without reading missing fields', () => {
    const malformed = (missing: 'direction' | 'first' | 'second') => new Proxy({}, {
      has: (_target, property) =>
        (property === 'direction' || property === 'first' || property === 'second') && property !== missing,
      get: () => { throw new Error(`read missing ${missing}`); },
    });

    expect(() => expect(isTerminalPane(malformed('direction'))).toBe(false)).not.toThrow();
    expect(() => expect(isTerminalPane(malformed('first'))).toBe(false)).not.toThrow();
    expect(() => expect(isTerminalPane(malformed('second'))).toBe(false)).not.toThrow();
  });

  it('lists sessions in visual order', () => {
    expect(terminalPaneSessionIds(split)).toEqual(['a', 'b', 'c']);
  });

  it('splits the matching leaf without changing its siblings', () => {
    expect(splitTerminalPane(split, 'b', 'right', 'd')).toEqual({
      direction: 'right',
      first: { sessionId: 'a' },
      second: {
        direction: 'down',
        first: {
          direction: 'right',
          first: { sessionId: 'b' },
          second: { sessionId: 'd' },
        },
        second: { sessionId: 'c' },
      },
    });
  });

  it('returns an equal tree when the split target is absent', () => {
    expect(splitTerminalPane(split, 'missing', 'down', 'd')).toEqual(split);
  });

  it('collapses a branch around a removed leaf', () => {
    expect(removeTerminalPane(split, 'b')).toEqual({
      direction: 'right',
      first: { sessionId: 'a' },
      second: { sessionId: 'c' },
    });
  });

  it('collapses a branch around a removed second leaf', () => {
    expect(removeTerminalPane(split, 'c')).toEqual({
      direction: 'right',
      first: { sessionId: 'a' },
      second: { sessionId: 'b' },
    });
  });

  it('returns undefined after removing the only leaf', () => {
    expect(removeTerminalPane({ sessionId: 'a' }, 'a')).toBeUndefined();
  });
});