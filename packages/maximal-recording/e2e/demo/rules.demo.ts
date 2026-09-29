import { expect, test } from '@playwright/test';

import {
  GAP_SECONDS,
  MAX_FINAL_PAD_SECONDS,
  MIN_HOLD_SECONDS,
  MIN_TOTAL_SECONDS,
  validateEdit,
  type Clip,
} from './edit.js';
import type { Sequence, Take } from './take.js';

/**
 * The pacing rules, proved rather than asserted in a comment.
 *
 * These run in milliseconds and launch nothing, so they sit in front of the
 * recording rather than in a suite of their own. A rule that is only enforced
 * when somebody remembers it is not enforced.
 *
 * They matter more now than they did. Holds used to be wall clock waits during
 * capture, so breaking one cost a re-drive to discover. They are numbers in a
 * JSON file that a person edits by hand, which is easier to get wrong and much
 * cheaper to fix.
 */

/** A sequence that plays for a given number of seconds. */
function seq(id: string, seconds: number, marks: string[] = []): Sequence {
  const startedAt = 1_000_000;
  return {
    id,
    name: id,
    startedAt,
    endedAt: startedAt + seconds * 1000,
    marks: marks.map((label, index) => ({ label, at: startedAt + (index + 1) * 100 })),
    frames: [{ at: startedAt, file: `frames/${id}.jpg` }],
  };
}

function take(...sequences: Sequence[]): Take {
  return { name: 'test', width: 1440, height: 900, fps: 30, sequences };
}

const clip = (id: string, extra: Partial<Clip> = {}): Clip => ({ seq: id, ...extra });

test('a clip may not hold for less than the floor', () => {
  const source = take(seq('a', 4), seq('b', 4));
  expect(() =>
    validateEdit(source, [clip('a', { hold: MIN_HOLD_SECONDS - 0.1 }), clip('b')]),
  ).toThrow(/floor/);
  expect(() =>
    validateEdit(source, [clip('a', { hold: MIN_HOLD_SECONDS }), clip('b', { hold: 20 })]),
  ).not.toThrow();
});

test('an edit that cannot reach the duration floor is rejected', () => {
  // Two of the shortest legal clips cannot get there, even padded to the cap.
  // This is the arithmetic MAX_FINAL_PAD_SECONDS is tuned against: raise the
  // cap much above this and the check below stops being reachable at all.
  const perClip = MIN_HOLD_SECONDS + GAP_SECONDS;
  expect(2 * perClip + MAX_FINAL_PAD_SECONDS).toBeLessThan(MIN_TOTAL_SECONDS);

  const short = take(seq('a', 0), seq('b', 0), seq('c', 0));
  expect(() => validateEdit(short, [clip('a'), clip('b')])).toThrow(/tops out/);

  // One clip is not an edit, however long it holds.
  expect(() => validateEdit(short, [clip('a', { hold: 60 })])).toThrow(
    /at least two clips/,
  );

  // Three can be padded over the line.
  expect(3 * perClip + MAX_FINAL_PAD_SECONDS).toBeGreaterThanOrEqual(MIN_TOTAL_SECONDS);
  expect(() => validateEdit(short, [clip('a'), clip('b'), clip('c')])).not.toThrow();
});

test('a clip naming a sequence the take does not hold is rejected', () => {
  const source = take(seq('a', 20), seq('b', 20));
  // The message names what does exist. Without that the reader has to open the
  // take by hand to find out what they mistyped.
  expect(() => validateEdit(source, [clip('a'), clip('nope')])).toThrow(/a, b/);
});

test('a freeze or a trim has to name a real mark', () => {
  const source = take(seq('a', 20, ['ready']), seq('b', 20));

  expect(() =>
    validateEdit(source, [clip('a', { freezeAt: 'ready' }), clip('b')]),
  ).not.toThrow();

  expect(() =>
    validateEdit(source, [clip('a', { freezeAt: 'never' }), clip('b')]),
  ).toThrow(/no mark called "never"/);

  // `start` and `end` work without having been declared, so an edit can trim
  // to the edges of a sequence with no help from the timeline.
  expect(() =>
    validateEdit(source, [clip('a', { from: 'start', to: 'end' }), clip('b')]),
  ).not.toThrow();
});

test('a clip may be repeated', () => {
  // Repeating is what makes "put the sequences together in different ways"
  // work, and allowing it costs nothing.
  const source = take(seq('a', 12), seq('b', 12));
  expect(() => validateEdit(source, [clip('a'), clip('b'), clip('a')])).not.toThrow();
});
