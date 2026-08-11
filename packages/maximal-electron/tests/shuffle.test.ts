import { describe, expect, it } from 'vitest';

import { shuffle } from '../e2e/shuffle.js';

/**
 * The shuffler orders the end-to-end suite, so a bug here would silently drop
 * or duplicate tests. That failure looks like a passing run, which is the
 * worst kind.
 */
describe('shuffle', () => {
  const items = Array.from({ length: 20 }, (_unused, index) => index);

  it('keeps every element exactly once', () => {
    const out = shuffle(items, 12345);
    expect([...out].sort((a, b) => a - b)).toEqual(items);
  });

  it('does not mutate its input', () => {
    const original = [...items];
    shuffle(items, 999);
    expect(items).toEqual(original);
  });

  it('is deterministic for one seed', () => {
    expect(shuffle(items, 42)).toEqual(shuffle(items, 42));
  });

  it('produces different orders for different seeds', () => {
    // Not guaranteed for any specific pair, but over 20 elements a collision
    // between these two seeds would mean the generator ignores its seed.
    expect(shuffle(items, 1)).not.toEqual(shuffle(items, 2));
  });

  it('actually reorders, rather than returning the input', () => {
    expect(shuffle(items, 7)).not.toEqual(items);
  });

  it('handles empty and single-element lists', () => {
    expect(shuffle([], 5)).toEqual([]);
    expect(shuffle(['only'], 5)).toEqual(['only']);
  });
});
