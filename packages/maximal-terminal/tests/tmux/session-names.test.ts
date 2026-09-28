import { describe, expect, it } from 'vitest';

import { TMUX_SESSION_PREFIX_PATTERN, TmuxSessionNames } from '../../src/tmux/session-names.js';

const HEX = '0123456789abcdef0123456789abcdef';

describe('TmuxSessionNames', () => {
  it('generates prefixed names with 32 random hex digits', () => {
    const name = new TmuxSessionNames('maximal').create();
    expect(name).toMatch(/^maximal-[0-9a-f]{32}$/);
    expect(new TmuxSessionNames('maximal').create()).not.toBe(name);
  });

  it('owns only names with its own prefix and the generated shape', () => {
    const names = new TmuxSessionNames('maximal');
    expect(names.owns(`maximal-${HEX}`)).toBe(true);
    expect(names.owns(`other-${HEX}`)).toBe(false);
    expect(names.owns(`xmaximal-${HEX}`)).toBe(false);
    expect(names.owns(`maximal-${HEX}0`)).toBe(false);
    expect(names.owns(`maximal-${HEX.slice(1)}`)).toBe(false);
    expect(names.owns(`maximal-${HEX.toUpperCase()}`)).toBe(false);
    expect(names.owns(undefined)).toBe(false);
    expect(names.owns({ toString: () => `maximal-${HEX}` })).toBe(false);
  });

  it('refuses entropy that would not produce an owned name', () => {
    expect(new TmuxSessionNames('maximal', () => HEX).create()).toBe(`maximal-${HEX}`);
    expect(() => new TmuxSessionNames('maximal', () => 'invalid').create())
      .toThrow('Invalid generated tmux session name.');
  });

  it('accepts only prefixes that are literal in a pattern and valid in tmux', () => {
    for (const prefix of ['maximal', 'M', 'a_1', 'a'.repeat(64)]) {
      expect(TMUX_SESSION_PREFIX_PATTERN.test(prefix)).toBe(true);
      expect(new TmuxSessionNames(prefix).prefix).toBe(prefix);
    }
    for (const prefix of ['', '1a', 'a.b', 'a-b', 'a:b', 'a b', 'a'.repeat(65), 'a|b', '.*']) {
      expect(() => new TmuxSessionNames(prefix)).toThrow('Invalid tmux session prefix.');
    }
  });
});
