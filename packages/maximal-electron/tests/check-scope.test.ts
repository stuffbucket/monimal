import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { scopedChecks } from '../scripts/check-scope.mjs';

/**
 * The runner that makes an empty scope visible.
 *
 * Seven checks in this repository passed while examining nothing, so the
 * reporting is the feature and is tested through the lines it writes rather
 * than through its internals. A helper whose own output is trusted is the same
 * defect one level up.
 */

const sink = () => {
  const log: string[] = [];
  const fail: string[] = [];
  return {
    log: (line: string) => log.push(line),
    fail: (line: string) => fail.push(line),
    log_: log,
    fail_: fail,
  };
};

describe('check', () => {
  it('prints the count beside the message', () => {
    const out = sink();
    scopedChecks(out).check(true, 'nine libraries are unpacked', { count: 9, of: 'libraries' });
    expect(out.log_).toEqual(['  ok   nine libraries are unpacked  [9 libraries]']);
    expect(out.fail_).toEqual([]);
  });

  it('fails on zero however the assertion went', () => {
    const out = sink();
    const passed = scopedChecks(out).check(true, 'every pair contrasts', {
      count: 0,
      of: 'pairs',
    });
    expect(passed).toBe(false);
    expect(out.log_).toEqual([]);
    expect(out.fail_).toEqual([' FAIL  every pair contrasts  [nothing to check: 0 pairs]']);
  });

  it('says nothing to check rather than reporting it as wrong', () => {
    // The distinction the skill asks for: "this was wrong" against "there was
    // nothing to look at" send the reader to different places.
    const out = sink();
    scopedChecks(out).check(false, 'a real failure', { count: 4, of: 'targets' });
    expect(out.fail_[0]).toBe(' FAIL  a real failure  [4 targets]');
  });

  it('refuses an assertion that states no scope', () => {
    const { check } = scopedChecks(sink());
    // The whole message, not a substring. Destructuring `undefined` throws a
    // TypeError naming `scope` too, so a looser pattern passes with the guard
    // deleted.
    // @ts-expect-error the point of the type is that this is refused
    expect(() => check(true, 'something')).toThrow('a check needs a scope: { count, of }');
    // `typeof null` is `'object'`, so null needs its own arm of the guard.
    // @ts-expect-error same
    expect(() => check(true, 'something', null)).toThrow('a check needs a scope: { count, of }');
  });

  it('refuses a count that is not a whole number, and a nameless one', () => {
    const { check } = scopedChecks(sink());
    expect(() => check(true, 'x', { count: -1, of: 'files' })).toThrow(/whole number/);
    expect(() => check(true, 'x', { count: 1.5, of: 'files' })).toThrow(/whole number/);
    expect(() => check(true, 'x', { count: 3, of: '  ' })).toThrow(/what was counted/);
    // A noun that is not a string at all. `.trim()` on it throws as well, so
    // the message is what tells the guard apart from the crash.
    expect(() =>
      // @ts-expect-error the type refuses this; the guard is what a caller in
      // plain ESM hits
      check(true, 'x', { count: 3, of: 42 }),
    ).toThrow('scope.of must name what was counted');
  });

  it('takes only a literal true as a pass', () => {
    const out = sink();
    // A truthy value is a length, an array, or a match object, and each of
    // those has been the thing that was really being asserted.
    expect(scopedChecks(out).check(1 as unknown as boolean, 'x', { count: 2, of: 'y' })).toBe(
      false,
    );
  });
});

describe('summary', () => {
  it('adds the scopes up, so the run itself reports one', () => {
    const out = sink();
    const run = scopedChecks(out);
    run.check(true, 'a', { count: 3, of: 'files' });
    run.check(true, 'b', { count: 4, of: 'pairs' });
    expect(run.summary('verify:thing')).toBe(0);
    expect(out.log_.at(-1)).toBe('\nverify:thing: 2 assertion(s) over 7 things, 0 failed');
  });

  it('exits non-zero when one failed', () => {
    const out = sink();
    const run = scopedChecks(out);
    run.check(false, 'a', { count: 3, of: 'files' });
    expect(run.summary('verify:thing')).toBe(1);
    expect(out.fail_.at(-1)).toBe('\nverify:thing: 1 assertion(s) over 3 things, 1 failed');
  });

  it('fails a run that asserted nothing at all', () => {
    // A script whose whole check list was skipped is the empty-set defect one
    // level up. `verify-package.mjs` exited 0 on Windows this way.
    const out = sink();
    expect(scopedChecks(out).summary('verify:thing')).toBe(1);
    expect(out.fail_).toEqual(['\n FAIL  verify:thing: no assertions ran']);
  });
});

/**
 * Adoption, discovered rather than listed.
 *
 * `verify-exports.mjs` listed its targets by hand and never checked a new
 * export. A hand-written list of the scripts that follow this convention would
 * fail the same way, so the set comes out of `package.json`: any script this
 * repository calls a check has to report its scopes, or be named below with
 * the issue that will fix it.
 */
describe('the scope convention', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as { scripts: Record<string, string> };

  /** Scripts not yet moved onto the runner, and why. */
  const PENDING = new Map([
    ['scripts/verify-package.mjs', '#92 is rewriting its check helper on the v0.0.4 train'],
    ['scripts/verify-exports.mjs', '#98 follow-up: its targets are still listed by hand'],
    ['scripts/verify-publish.mjs', '#98 follow-up'],
    ['scripts/verify-neutral.mjs', '#98 follow-up'],
    ['scripts/verify-git-install.mjs', '#98 follow-up'],
    ['scripts/storybook-check.mjs', '#98 follow-up'],
  ]);

  const checkScripts = [
    ...new Set(
      Object.entries(manifest.scripts)
        .filter(([name]) => /^(verify|check):|:check$/.test(name))
        .flatMap(([, command]) => [
          ...command.matchAll(/\bnode\b[^&|]*?\b(scripts\/[\w.-]+\.mjs)/g),
        ])
        .map((match) => match[1] ?? ''),
    ),
  ];

  it('finds the check scripts, so an empty scan cannot pass', () => {
    expect(checkScripts.length).toBeGreaterThan(PENDING.size);
  });

  for (const file of checkScripts) {
    it(`${file} reports its scopes`, () => {
      const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
      if (PENDING.has(file)) {
        expect(source).not.toContain('check-scope.mjs');
        return;
      }
      expect(source).toContain("from './check-scope.mjs'");
    });
  }

  it('carries no entry for a script that already adopted it', () => {
    // The list may only shrink. An entry that stops being true is how an
    // exemption becomes the rule.
    for (const file of PENDING.keys()) expect(checkScripts).toContain(file);
  });
});
