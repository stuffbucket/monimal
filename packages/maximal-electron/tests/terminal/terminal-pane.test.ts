import { describe, expect, it } from 'vitest';

import {
  removeTerminalPane,
  splitTerminalPane,
  terminalPaneSessionIds,
  type TerminalPane,
} from '../../src/renderer/lib/terminal-pane.js';

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

  it('returns undefined after removing the only leaf', () => {
    expect(removeTerminalPane({ sessionId: 'a' }, 'a')).toBeUndefined();
  });
});