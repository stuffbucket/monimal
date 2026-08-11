import { describe, expect, it } from 'vitest';

import {
  BACKWARDS_TAG_FIXTURE,
  MOVED_TAG_FIXTURE,
  compareVersions,
  evaluateTag,
  parseVersion,
  renderTagReport,
  scopeFailures,
  selfTestFailures,
} from '../scripts/tag-history.mjs';

/**
 * The gate that would have stopped `v0.0.2`.
 *
 * A tag deletion erases the ref and nothing else, so the record this reads is
 * the workflow runs on that ref: two of them, at `e983b74` and `441df8a`. The
 * risk here is the opposite of a missed re-cut — a false one would block a
 * legitimate release on the one path that cannot be re-run, so the first cut
 * of a version and a re-run of a failed job both have to pass.
 */

const FIRST = 'e983b742f51a139bd5d74df64d280ba12247b1a9';
const SECOND = '441df8a427f74407db96579f5ca7664eb522569a';

const found = (facts: Parameters<typeof evaluateTag>[0]): string[] =>
  evaluateTag(facts).findings.map((finding) => finding.assertion);

const MOVED = 'this ref has never been built at another commit';
const ORDERED = 'the tag is above every tag that exists';

describe('parsing a version', () => {
  it('reads a release and a pre-release', () => {
    expect(parseVersion('v1.2.3')).toMatchObject({ major: 1, minor: 2, patch: 3, pre: null });
    expect(parseVersion('v1.2.3-beta.4')?.pre).toEqual({ name: 'beta', number: 4 });
  });

  it('reads a pre-release with no number', () => {
    expect(parseVersion('v1.0.0-alpha')?.pre).toEqual({ name: 'alpha', number: 0 });
  });

  it('refuses anything that is not a release tag', () => {
    for (const tag of ['1.2.3', 'v1.2', 'v1.2.3.4', 'release-1.2.3', 'v1.2.3-rc.1', '']) {
      expect(parseVersion(tag)).toBeNull();
    }
  });
});

describe('ordering two versions', () => {
  const at = (tag: string) => {
    const version = parseVersion(tag);
    if (!version) throw new Error(`${tag} does not parse`);
    return version;
  };

  it('orders by major, then minor, then patch', () => {
    expect(compareVersions(at('v0.0.4'), at('v0.0.5'))).toBeLessThan(0);
    expect(compareVersions(at('v0.2.0'), at('v0.10.0'))).toBeLessThan(0);
    expect(compareVersions(at('v1.0.0'), at('v0.99.99'))).toBeGreaterThan(0);
  });

  it('puts a pre-release below the release of the same number', () => {
    expect(compareVersions(at('v1.0.0-beta.1'), at('v1.0.0'))).toBeLessThan(0);
    expect(compareVersions(at('v1.0.0-alpha.9'), at('v1.0.0-beta.1'))).toBeLessThan(0);
    expect(compareVersions(at('v1.0.0-beta.1'), at('v1.0.0-beta.2'))).toBeLessThan(0);
  });

  it('calls the same version the same', () => {
    expect(compareVersions(at('v1.0.0'), at('v1.0.0'))).toBe(0);
  });
});

describe('the incident', () => {
  it('refuses the second push of v0.0.2 and names the first commit', () => {
    const report = evaluateTag(MOVED_TAG_FIXTURE);
    expect(report.findings.map((finding) => finding.assertion)).toContain(MOVED);
    expect(report.findings[0]?.detail).toContain('e983b742');
  });

  /** The push that was legitimate has to stay legitimate. */
  it('allows the first push of v0.0.2, which is the same ref at one commit', () => {
    expect(
      found({ tag: 'v0.0.2', sha: FIRST, tags: ['v0.0.1', 'v0.0.2'], runs: [{ id: 1, headSha: FIRST }] }),
    ).toEqual([]);
  });

  /** A failed job is re-run on the same tag, at the same commit, routinely. */
  it('allows a re-run of the same tag at the same commit', () => {
    const runs = [
      { id: 1, headSha: SECOND },
      { id: 2, headSha: SECOND },
    ];
    expect(found({ tag: 'v0.0.3', sha: SECOND, tags: ['v0.0.2', 'v0.0.3'], runs })).toEqual([]);
  });
});

describe('cutting forwards only', () => {
  it('refuses a version at or below one that exists', () => {
    expect(found(BACKWARDS_TAG_FIXTURE)).toContain(ORDERED);
  });

  it('allows the next patch', () => {
    expect(
      found({ tag: 'v0.0.5', sha: SECOND, tags: ['v0.0.1', 'v0.0.4', 'v0.0.5'], runs: [{ id: 1, headSha: SECOND }] }),
    ).toEqual([]);
  });

  it('allows the first release, with no tag to compare against', () => {
    expect(found({ tag: 'v0.0.1', sha: FIRST, tags: ['v0.0.1'], runs: [{ id: 1, headSha: FIRST }] })).toEqual([]);
  });

  it('ignores a tag that is not a version', () => {
    const tags = ['v0.0.1', 'v0.0.2', 'nightly', 'v-broken'];
    expect(found({ tag: 'v0.0.2', sha: FIRST, tags, runs: [{ id: 1, headSha: FIRST }] })).toEqual([]);
  });

  it('refuses a tag that is not a version, and says nothing else', () => {
    expect(found({ tag: 'release-1', sha: FIRST, tags: ['release-1'], runs: [] })).toEqual([
      'the tag names a version',
    ]);
  });
});

describe('the floors on scope', () => {
  it('fails when the tag list does not contain the tag being pushed', () => {
    expect(scopeFailures({ tag: 'v0.0.5', tags: [], runs: [{ id: 1, headSha: FIRST }] })).toEqual([
      expect.stringContaining('tag list was not read'),
    ]);
  });

  it('fails when no run was found on the ref, not even this one', () => {
    expect(scopeFailures({ tag: 'v0.0.5', tags: ['v0.0.5'], runs: [] })).toEqual([
      expect.stringContaining('run list was not read'),
    ]);
  });

  it('passes on a push that read both', () => {
    expect(
      scopeFailures({ tag: 'v0.0.5', tags: ['v0.0.5'], runs: [{ id: 1, headSha: FIRST }] }),
    ).toEqual([]);
  });

  /** A dry run has no tag and no run on its ref. Neither is a defect. */
  it('asserts nothing on a dry run', () => {
    expect(scopeFailures({ tag: 'v0.0.5', tags: [], runs: [], dryRun: true })).toEqual([]);
  });

  it('counts what it examined', () => {
    const report = evaluateTag({
      tag: 'v0.0.5',
      sha: SECOND,
      tags: ['v0.0.4', 'v0.0.5'],
      runs: [{ id: 1, headSha: SECOND }],
    });
    expect(report.examinedTags).toBe(2);
    expect(report.examinedRuns).toBe(1);
    expect(renderTagReport(report)).toContain('Examined 1 run(s)');
  });
});

describe('the dry run', () => {
  /**
   * A release branch sits at the shipped version until the bump, so its own
   * tag exists for most of a train. Failing there would redden the rehearsal
   * for a reason the rehearsal is not about.
   */
  it('notes an existing tag rather than failing on it', () => {
    const report = evaluateTag({ tag: 'v0.0.4', tags: ['v0.0.4'], runs: [], dryRun: true });
    expect(report.findings).toEqual([]);
    expect(report.notes[0]).toContain('Bump the version');
  });

  it('still refuses a version below one that exists', () => {
    const report = evaluateTag({ tag: 'v0.0.2', tags: ['v0.0.4'], runs: [], dryRun: true });
    expect(report.findings.map((finding) => finding.assertion)).toContain(ORDERED);
  });

  it('does not claim the run history was clean', () => {
    const report = evaluateTag({ tag: 'v0.0.5', tags: ['v0.0.4'], runs: [], dryRun: true });
    const rendered = renderTagReport(report);
    expect(rendered).toContain('run history was not evaluated');
    expect(rendered).not.toContain('is a new cut');
  });

  it('says a real push is a new cut', () => {
    const report = evaluateTag({
      tag: 'v0.0.5',
      sha: SECOND,
      tags: ['v0.0.4', 'v0.0.5'],
      runs: [{ id: 1, headSha: SECOND }],
    });
    expect(renderTagReport(report)).toContain('is a new cut');
  });

  it('says a re-cut is a re-cut', () => {
    expect(renderTagReport(evaluateTag(MOVED_TAG_FIXTURE))).toContain('is a re-cut');
  });

  /** The conclusion must not contradict the scope floor above it. */
  it('claims nothing when no run was read on a real push', () => {
    const report = evaluateTag({ tag: 'v9.9.9', sha: SECOND, tags: ['v0.0.4'], runs: [] });
    expect(renderTagReport(report)).toContain('nothing about `v9.9.9` was decided');
  });
});

/** `verify-tag.mjs` runs this before it reads git or the API. */
describe('the positive control', () => {
  it('replays both incidents and catches both', () => {
    expect(selfTestFailures()).toEqual([]);
  });
});
