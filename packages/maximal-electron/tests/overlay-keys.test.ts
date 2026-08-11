import { describe, expect, it } from 'vitest';

import {
  escapeAction,
  outsideAction,
  type OverlayDismissal,
} from '../src/renderer/lib/overlay-keys.js';

/**
 * The overlay's dismissal rules.
 *
 * These exist because the end-to-end tests that cover the same ground need a
 * running local model. They skip in CI and they did not run while the overlay's
 * modal was being moved onto Radix, which is exactly when a three-way ordering
 * is easiest to get wrong.
 *
 * The ordering is the whole content of the rule, so every pair of states is
 * pinned rather than a representative few.
 */

const CASES: [pending: boolean, busy: boolean, expected: OverlayDismissal][] = [
  // A pending tool call wins over everything, including a streaming answer.
  [true, true, 'deny'],
  [true, false, 'deny'],
  // Nothing pending: stop the run before closing the window it streams into.
  [false, true, 'abort'],
  // Idle. Only now does Escape mean "go away".
  [false, false, 'hide'],
];

describe('escapeAction', () => {
  for (const [pending, busy, expected] of CASES) {
    it(`is ${expected} when pending=${String(pending)} busy=${String(busy)}`, () => {
      expect(escapeAction(pending, busy)).toBe(expected);
    });
  }

  it('answers a pending call rather than aborting the run under it', () => {
    // The bug this ordering prevents: Escape kills the run, the gate stays
    // open, and it holds until the tool call times out. Every summon in that
    // window reports the agent as busy.
    expect(escapeAction(true, true)).not.toBe('abort');
  });
});

describe('outsideAction', () => {
  it('answers a pending call on the way out', () => {
    expect(outsideAction(true)).toEqual(['deny', 'hide']);
  });

  it('just dismisses when nothing is pending', () => {
    expect(outsideAction(false)).toEqual(['hide']);
  });

  it('always ends by hiding, unlike Escape', () => {
    // A click outside is unambiguous: the user is done with the card. Escape
    // is not, which is why the two have different rules at all.
    for (const pending of [true, false]) {
      expect(outsideAction(pending).at(-1)).toBe('hide');
    }
  });
});
