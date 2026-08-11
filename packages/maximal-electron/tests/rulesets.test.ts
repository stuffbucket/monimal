import { describe, expect, it } from 'vitest';

import {
  EXPECTED,
  assess,
  evaluate,
  gutted,
  overallState,
  renderIssue,
  renderSummary,
  renderUnreadable,
  selfTestFailures,
} from '../scripts/rulesets.mjs';
import type { LiveRuleset } from '../scripts/rulesets.mjs';

/**
 * The floor over the repository rulesets.
 *
 * The protections live in GitHub's settings, where no pull request can see
 * them change. The risk in a check like this is not a missed weakening but a
 * false one: a byte-exact snapshot reddens on every legitimate change and gets
 * deleted. So these tests pin what a tightening does — nothing — as hard as
 * what a weakening does.
 *
 * The third state is the point. `bypass_actors` is returned only to a caller
 * that can read repository administration, and a workflow `GITHUB_TOKEN` never
 * can. An assertion nobody could compute must never render as one that was.
 */

const tagRuleset = (over: Partial<LiveRuleset> = {}): LiveRuleset => ({
  name: 'tags-immutable',
  target: 'tag',
  enforcement: 'active',
  conditions: { ref_name: { include: ['v*'] } },
  rules: [{ type: 'deletion' }, { type: 'non_fast_forward' }],
  bypass_actors: [],
  ...over,
});

const want = () => {
  const found = EXPECTED.find((entry) => entry.name === 'tags-immutable');
  if (!found) throw new Error('tags-immutable is no longer expected');
  return found;
};

describe('the expectations themselves', () => {
  it('names at least one ruleset, so an emptied list cannot pass', () => {
    expect(EXPECTED.length).toBeGreaterThan(0);
  });

  it('requires a ruleset that protects tags', () => {
    const tags = EXPECTED.filter((entry) => entry.target === 'tag');
    expect(tags.map((entry) => entry.name)).toContain('tags-immutable');
    expect(tags[0]?.rules).toEqual(expect.arrayContaining(['deletion', 'non_fast_forward']));
  });

  it('gives every expectation a reason a reader can act on', () => {
    for (const entry of EXPECTED) expect(entry.why.length).toBeGreaterThan(40);
  });
});

describe('assessing one ruleset', () => {
  it('is protected when the floor is met and the bypass list is readable', () => {
    const result = assess([tagRuleset()], want());
    expect(result.state).toBe('protected');
    expect(result.findings).toEqual([]);
  });

  it('stays protected when the ruleset is tightened beyond the floor', () => {
    const tightened = tagRuleset({
      rules: [{ type: 'deletion' }, { type: 'non_fast_forward' }, { type: 'update' }],
      conditions: { ref_name: { include: ['v*', 'refs/tags/release-*'] } },
    });
    expect(assess([tightened], want()).state).toBe('protected');
  });

  it('reports a missing ruleset, and names what was read instead', () => {
    const result = assess([{ name: 'main-require-pr', target: 'branch' }], want());
    expect(result.state).toBe('unprotected');
    expect(result.findings[0]?.detail).toContain('main-require-pr');
  });

  it('reports a ruleset that exists but is not enforced', () => {
    const result = assess([tagRuleset({ enforcement: 'evaluate' })], want());
    expect(result.state).toBe('unprotected');
    expect(result.findings.map((finding) => finding.assertion)).toContain(
      'enforcement is `active`',
    );
  });

  it('reports a ruleset retargeted away from tags', () => {
    const result = assess([tagRuleset({ target: 'branch' })], want());
    expect(result.findings.map((finding) => finding.assertion)).toContain('targets `tag`');
  });

  it('reports a rule that was removed', () => {
    const result = assess([tagRuleset({ rules: [{ type: 'deletion' }] })], want());
    expect(result.findings.map((finding) => finding.assertion)).toContain(
      'carries the `non_fast_forward` rule',
    );
  });

  it('reports a ref pattern that no longer covers the release tags', () => {
    const narrowed = tagRuleset({ conditions: { ref_name: { include: ['refs/tags/nightly-*'] } } });
    expect(assess([narrowed], want()).findings.map((finding) => finding.assertion)).toContain(
      'applies to v*',
    );
  });

  it('reports an added bypass actor as a weakening', () => {
    const exempt = tagRuleset({ bypass_actors: [{ actor_id: 5, bypass_mode: 'always' }] });
    const result = assess([exempt], want());
    expect(result.state).toBe('unprotected');
    expect(result.findings.map((finding) => finding.assertion)).toContain(
      'no actor may bypass it',
    );
  });

  /** The rule that matters most: an unreadable answer is not a clean one. */
  it('reports an absent bypass list as unverified, never as a finding', () => {
    const withoutKey = tagRuleset();
    delete withoutKey.bypass_actors;
    const result = assess([withoutKey], want());
    expect(result.state).toBe('unverified');
    expect(result.findings).toEqual([]);
    expect(result.unverified[0]?.assertion).toBe('no actor may bypass it');
  });

  it('does not soften a real finding into unverified', () => {
    const broken = tagRuleset({ enforcement: 'disabled' });
    delete broken.bypass_actors;
    const result = assess([broken], want());
    expect(result.state).toBe('unprotected');
    expect(result.unverified.length).toBe(1);
  });
});

/**
 * The counts `verify-rulesets.mjs` hands to `scopedChecks`. Both are the size
 * of a set the run could legitimately find empty, which is why the runner has
 * to see them rather than a boolean.
 */
describe('what the run examined', () => {
  it('counts the live rulesets and the expectations', () => {
    const report = evaluate([tagRuleset()], [want()]);
    expect(report.examinedLive).toBe(1);
    expect(report.examinedExpectations).toBe(1);
  });

  it('reports zero live rulesets as zero, not as a clean sweep', () => {
    const report = evaluate([], [want()]);
    expect(report.examinedLive).toBe(0);
    expect(report.rulesets[0]?.state).toBe('unprotected');
  });

  it('reports an emptied expectation list as zero', () => {
    expect(evaluate([tagRuleset()], []).examinedExpectations).toBe(0);
  });

  it('prints both counts before it says anything else', () => {
    const summary = renderSummary(evaluate([tagRuleset()], [want()]));
    expect(summary.split('\n')[0]).toBe(
      'Examined 1 live ruleset(s) against 1 expectation(s)',
    );
  });
});

/** The check runs this before it opens a socket. */
describe('the positive control', () => {
  it('finds every expectation still detects its own gutted ruleset', () => {
    expect(selfTestFailures()).toEqual([]);
  });

  it('produces one gutted ruleset per expectation', () => {
    expect(gutted().length).toBe(EXPECTED.length);
  });

  /**
   * The control exists for an evaluator that stopped evaluating, which is the
   * shape six checks here have shipped in. Every gutted ruleset carries the
   * right name and nothing else, so an `assess` that reads any of enforcement,
   * target, refs, rules, or the bypass list still reports it.
   */
  it('reports every gutted ruleset as unprotected, by name', () => {
    const report = evaluate(gutted(), EXPECTED);
    expect(report.rulesets.map((entry) => entry.state)).toEqual(EXPECTED.map(() => 'unprotected'));
  });
});

describe('the overall state', () => {
  it('is protected only when every assertion was computed and holds', () => {
    expect(overallState(evaluate([tagRuleset()], [want()]))).toBe('protected');
  });

  it('is unverified when nothing is weakened and something is unreadable', () => {
    const withoutKey = tagRuleset();
    delete withoutKey.bypass_actors;
    expect(overallState(evaluate([withoutKey], [want()]))).toBe('unverified');
  });

  it('is unprotected when any expectation has a finding, unreadable or not', () => {
    const withoutKey = tagRuleset({ rules: [] });
    delete withoutKey.bypass_actors;
    expect(overallState(evaluate([withoutKey], [want()]))).toBe('unprotected');
  });

  it('says which of the three states the run is in', () => {
    const summary = renderSummary(evaluate([], [want()]));
    expect(summary).toContain('UNPROTECTED —');
  });
});

describe('the issue body', () => {
  const body = renderIssue(evaluate([], [want()]), 'stuffbucket/maximal-electron');

  it('carries the settings URL a reader has to open', () => {
    expect(body).toContain('https://github.com/stuffbucket/maximal-electron/settings/rules');
  });

  it('carries the reason the protection is wanted', () => {
    expect(body).toContain('lockfile');
  });

  it('names the file to edit if the change was deliberate', () => {
    expect(body).toContain('scripts/rulesets.mjs');
  });

  it('states every unverified assertion under its own heading', () => {
    const withoutKey = tagRuleset();
    delete withoutKey.bypass_actors;
    const unverified = renderIssue(evaluate([withoutKey], [want()]), 'owner/name');
    expect(unverified).toContain('### Not verified by this run');
    expect(unverified).toContain('no actor may bypass it');
  });

  it('omits that heading when every assertion was computed', () => {
    expect(renderIssue(evaluate([tagRuleset({ rules: [] })], [want()]), 'owner/name')).not.toContain(
      'Not verified by this run',
    );
  });
});

/** Silence has to be earned. An unreadable run says so rather than passing. */
describe('the unreadable body', () => {
  const body = renderUnreadable('owner/name', 'GET /repos/owner/name/rulesets answered 403');

  it('says nobody can tell, not that protection is gone', () => {
    expect(body).toContain('nobody can currently tell');
  });

  it('quotes the reason and names the settings page', () => {
    expect(body).toContain('answered 403');
    expect(body).toContain('https://github.com/owner/name/settings/rules');
  });
});
