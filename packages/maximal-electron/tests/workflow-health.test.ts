import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

import {
  ACTIVITY_WINDOW,
  MIN_SAMPLE,
  SAMPLE,
  assess,
  broken,
  cadence,
  cronInterval,
  evaluate,
  overallState,
  renderIssue,
  renderSummary,
  renderUnreadable,
  selfTestFailures,
  triggersOf,
} from '../scripts/workflow-health.mjs';
import type { Observed, Run } from '../scripts/workflow-health.mjs';

/**
 * Whether each workflow still runs, and still works.
 *
 * The risk in this check is not a missed defect but a false one. `release.yml`
 * fires on a tag and nothing else, so a rule that wants a run every week would
 * flag it every quiet week, and a rule flagged every week gets deleted. So
 * these tests pin what the check declines to answer as hard as what it
 * asserts, and the declining is a state of its own rather than a silent pass.
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-08-06T12:00:00Z');

const runs = (count: number, conclusion: string | null, oldestDays = 0): Run[] =>
  Array.from({ length: count }, (_, index) => ({
    conclusion,
    createdAt: new Date(NOW - oldestDays * DAY - index * 60_000).toISOString(),
  }));

const observed = (over: Partial<Observed> = {}): Observed => ({
  file: 'ci.yml',
  triggers: { events: ['pull_request'], crons: [] },
  runs: runs(SAMPLE, 'success'),
  registered: true,
  ...over,
});

describe('cron', () => {
  it('reads the interval a schedule actually fires at', () => {
    expect(cronInterval('17 6 * * *')).toBe(DAY);
    expect(cronInterval('*/15 * * * *')).toBe(15 * 60_000);
    expect(cronInterval('0 */6 * * *')).toBe(6 * 60 * 60 * 1000);
    expect(cronInterval('0 6 * * 1')).toBe(7 * DAY);
    expect(cronInterval('0 6 1 * *')).toBe(31 * DAY);
  });

  it('answers nothing rather than guessing at an expression it cannot read', () => {
    expect(cronInterval('nonsense')).toBeUndefined();
  });
});

describe('triggers', () => {
  /**
   * YAML 1.1 reads a bare `on` as the boolean true. Which key a parser
   * produces is its choice, and reading only one of them is a check that finds
   * no triggers at all and then declines every assertion in silence.
   */
  it('reads `on` however the parser spelled it', () => {
    expect(triggersOf({ on: { pull_request: null } }).events).toEqual(['pull_request']);
    expect(triggersOf({ true: { pull_request: null } }).events).toEqual(['pull_request']);
    expect(triggersOf({ on: 'push' }).events).toEqual(['push']);
    expect(triggersOf({ on: ['push', 'issues'] }).events).toEqual(['push', 'issues']);
    expect(triggersOf({}).events).toEqual([]);
  });

  it('does not read a tag-only push as repository activity', () => {
    const tagged = triggersOf({ on: { push: { tags: ['v*.*.*'] }, workflow_dispatch: null } });
    expect(tagged.events).toEqual(['workflow_dispatch']);
    expect(cadence(tagged).asserted).toBe(false);
  });

  it('reads a branch push as repository activity', () => {
    const pushed = triggersOf({ on: { push: { branches: ['main'] } } });
    expect(cadence(pushed)).toMatchObject({ asserted: true, window: ACTIVITY_WINDOW });
  });

  it('takes the tightest window when a workflow carries both kinds', () => {
    const both = triggersOf({
      on: { pull_request: null, schedule: [{ cron: '0 6 * * *' }] },
    });
    expect(cadence(both).window).toBe(2 * DAY);
  });
});

describe('a workflow that has never run', () => {
  it('is its own state, not a failure rate of zero', () => {
    const entry = assess(observed({ runs: [], registered: false }), NOW);
    expect(entry.state).toBe('never-run');
    expect(entry.findings).toHaveLength(1);
  });

  /**
   * `watch-rulesets.yml` is this case. GitHub registers a workflow from the
   * default branch, so a file that lives only on a release branch has no
   * record at all — and the diagnosis has to say so, because the reader's next
   * move differs from the one for a registered workflow nothing triggers.
   */
  it('says whether GitHub has heard of the file at all', () => {
    expect(assess(observed({ runs: [], registered: false }), NOW).findings[0]?.detail).toContain(
      'no record',
    );
    expect(assess(observed({ runs: [], registered: true }), NOW).findings[0]?.detail).toContain(
      'never been triggered',
    );
  });
});

describe('a workflow that fails every time', () => {
  it('is a finding once there are enough runs to call it one', () => {
    const entry = assess(observed({ runs: runs(SAMPLE, 'failure') }), NOW);
    expect(entry.state).toBe('failing');
    expect(entry.findings[0]?.assertion).toBe('not every recent run failed');
  });

  it('counts a jobless startup failure, which is what triage.yml produces', () => {
    expect(assess(observed({ runs: runs(SAMPLE, 'startup_failure') }), NOW).state).toBe('failing');
  });

  it('is not called on a sample too small to mean anything', () => {
    const entry = assess(observed({ runs: runs(MIN_SAMPLE - 1, 'failure') }), NOW);
    expect(entry.state).toBe('healthy');
    expect(entry.notes.join(' ')).toContain('failure rate not asserted');
  });

  /**
   * One success clears it. A stricter rule — a percentage — reddens on
   * `ci.yml`, `release.yml` and `merge-preview.yml`, all three of which mix
   * red and green today, and a rule that is red on everything is deleted.
   */
  it('clears on a single success among the failures', () => {
    const mixed = [...runs(SAMPLE - 1, 'failure'), ...runs(1, 'success')];
    expect(assess(observed({ runs: mixed }), NOW).state).toBe('healthy');
  });

  it('does not read a cancelled run as either outcome', () => {
    const entry = assess(observed({ runs: runs(SAMPLE, 'cancelled') }), NOW);
    expect(entry.conclusive).toBe(0);
    expect(entry.state).toBe('healthy');
  });

  /**
   * A run in flight is evidence the workflow fires and no evidence about
   * whether it works. Without this, the first run of a new workflow reads its
   * own in-progress record and reports itself dead.
   */
  it('counts a run still in flight towards having run, not towards failing', () => {
    const entry = assess(observed({ runs: runs(1, null) }), NOW);
    expect(entry.runsRead).toBe(1);
    expect(entry.conclusive).toBe(0);
    expect(entry.state).toBe('healthy');
  });
});

describe('a workflow that has stopped running', () => {
  it('is late against twice its own cron interval, not against a fixed week', () => {
    const daily: Partial<Observed> = { triggers: { events: [], crons: ['0 6 * * *'] } };
    expect(assess(observed({ ...daily, runs: runs(1, 'success', 1) }), NOW).state).toBe('healthy');
    expect(assess(observed({ ...daily, runs: runs(1, 'success', 5) }), NOW).state).toBe('silent');
  });

  /**
   * The false-positive case this rule exists to avoid. `release.yml` fires on
   * a tag and a dispatch. A month of quiet is a month with no release, which
   * is not a defect, so the assertion is declined and the declining is
   * counted rather than passed over.
   */
  it('is never called against a workflow with no cadence to be late against', () => {
    const entry = assess(
      observed({
        file: 'release.yml',
        triggers: { events: ['workflow_dispatch'], crons: [] },
        runs: runs(SAMPLE, 'success', 90),
      }),
      NOW,
    );
    expect(entry.state).toBe('healthy');
    expect(entry.recency.asserted).toBe(false);
    expect(entry.notes.join(' ')).toContain('recency not asserted');
  });

  /**
   * Found by running it. A window shorter than a day printed "it ran within 0
   * day(s)", against a span also printed as 0, which is a message saying less
   * than the numbers behind it.
   */
  it('states the span in a unit that does not round it away', () => {
    const entry = assess(
      observed({
        triggers: { events: [], crons: ['*/5 * * * *'] },
        runs: runs(1, 'success', 1),
      }),
      NOW,
    );
    expect(entry.findings[0]?.assertion).toBe('it ran within 10 minute(s)');
    expect(entry.findings[0]?.detail).toContain('1 day(s) ago');
  });
});

describe('a workflow that could not be read', () => {
  it('is never rendered as one that was', () => {
    const entry = assess(observed({ unreadable: 'GET … answered 403 Forbidden' }), NOW);
    expect(entry.state).toBe('unreadable');
    expect(entry.findings).toEqual([]);
    expect(overallState(evaluate([observed({ unreadable: 'boom' })], NOW))).toBe('unverified');
  });

  it('loses to a real finding, because a finding is the more actionable answer', () => {
    const report = evaluate(
      [observed({ unreadable: 'boom' }), observed({ file: 'triage.yml', runs: [] })],
      NOW,
    );
    expect(overallState(report)).toBe('broken');
  });
});

describe('the report', () => {
  it('counts what it declined as well as what it judged', () => {
    const report = evaluate(
      [
        observed({ file: 'ci.yml' }),
        observed({ file: 'release.yml', triggers: { events: ['workflow_dispatch'], crons: [] } }),
        observed({ file: 'new.yml', runs: runs(1, 'success') }),
      ],
      NOW,
    );
    expect(report).toMatchObject({ examined: 3, recencyDeclined: 1, rateDeclined: 1 });
    expect(renderSummary(report)).toContain('Recency declined on 1, failure rate declined on 1');
  });

  /**
   * A workflow already reported as a finding is not also counted as an answer
   * nobody could compute. Counting it twice inflates the declined number with
   * exactly the cases the findings list already carries.
   */
  it('does not count a never-run workflow as an assertion it declined', () => {
    const report = evaluate([observed({ runs: [], registered: false })], NOW);
    expect(report).toMatchObject({ recencyDeclined: 0, rateDeclined: 0 });
  });

  it('fails a run over no workflows at all rather than calling it healthy', () => {
    // The empty-set defect at the level of the whole check. The runner has its
    // own floor; this pins that the report cannot claim health without one.
    const report = evaluate([], NOW);
    expect(report.examined).toBe(0);
    expect(report.runsRead).toBe(0);
  });

  it('names the workflow, the state, and where to look', () => {
    const report = evaluate([observed({ file: 'triage.yml', runs: runs(SAMPLE, 'failure') })], NOW);
    const body = renderIssue(report, 'stuffbucket/maximal-electron');
    expect(body).toContain('`triage.yml` — failing');
    expect(body).toContain(
      'https://github.com/stuffbucket/maximal-electron/actions/workflows/triage.yml',
    );
  });

  it('says nobody could tell rather than that nothing is wrong', () => {
    expect(renderUnreadable('owner/name', 'HTTP 403')).toContain('nobody can currently tell');
  });
});

/**
 * The rules against workflows that are unambiguously dead. `verify-rulesets`
 * evaluates a gutted ruleset before it opens a socket for the same reason:
 * rules that have stopped detecting a defect otherwise report a clean run.
 */
describe('the self test', () => {
  it('covers every state the check exists to catch', () => {
    expect(broken(NOW).map((sample) => sample.want).sort()).toEqual([
      'failing',
      'never-run',
      'silent',
    ]);
  });

  it('passes against the rules as they stand', () => {
    expect(selfTestFailures(NOW)).toEqual([]);
  });
});

/**
 * The list comes off the disk, never out of a constant. `verify-exports.mjs`
 * listed its targets by hand and never checked a new export; three workflows
 * escaped a hand-list in this repository in a single day.
 */
describe('the real workflow files', () => {
  const dir = new URL('../.github/workflows/', import.meta.url);
  const files = readdirSync(dir).filter((name) => name.endsWith('.yml'));

  it('finds files to check, so an empty scan cannot pass', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const name of files) {
    it(`${name} declares triggers this check can read`, () => {
      const document: unknown = parse(readFileSync(path.join(dir.pathname, name), 'utf8'));
      const triggers = triggersOf(document);
      expect(triggers.events.length + triggers.crons.length).toBeGreaterThan(0);
    });
  }
});
