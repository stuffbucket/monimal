/**
 * The floor each repository ruleset must still meet.
 *
 * Pure over already-parsed JSON, so `tests/rulesets.test.ts` runs offline.
 * `scripts/verify-rulesets.mjs` is the half that reads the API.
 *
 * A weakening fails and a tightening passes. Bare existence is worthless,
 * because a ruleset can be present and gutted; a byte-exact snapshot is worse,
 * because a check that reddens on every legitimate settings change gets
 * deleted. See `docs/admin/repository-settings.md`.
 */

/** Rulesets this repository requires, and the floor each must still meet. */
export const EXPECTED = [
  {
    name: 'tags-immutable',
    target: 'tag',
    refs: ['v*', 'refs/tags/v*', '~ALL'],
    rules: ['deletion', 'non_fast_forward'],
    why: 'A consumer pins this package by git ref, so a lockfile records the commit a tag resolved to. Moving a published tag gives two machines different code under one version. `v0.0.2` was deleted and re-pushed eight minutes later.',
  },
  {
    name: 'main-no-force-delete',
    target: 'branch',
    refs: ['~DEFAULT_BRANCH', 'refs/heads/main'],
    rules: ['deletion', 'non_fast_forward'],
    why: 'Without it `main` can be deleted or force-pushed, and the history a released tag points into can be rewritten under consumers who already resolved it.',
  },
  {
    name: 'main-require-pr',
    target: 'branch',
    refs: ['~DEFAULT_BRANCH', 'refs/heads/main'],
    rules: ['pull_request'],
    why: 'Without it every gate in `ci.yml` is advisory again: a red pull request, or no pull request at all, can land on `main`.',
  },
];

/**
 * The bypass list is returned only to a caller that can read repository
 * administration. A workflow `GITHUB_TOKEN` cannot be granted it, so its
 * absence is reported as unverified and never as a finding.
 */
const BYPASS_UNREADABLE =
  'the API returned no `bypass_actors` key. That is what it returns to a caller that cannot read repository administration, which includes every workflow `GITHUB_TOKEN`. Run `npm run verify:rulesets` locally, where the check reads the token `gh auth login` already holds.';

const rule = (live, type) => (live.rules ?? []).find((entry) => entry.type === type);

/**
 * One expected ruleset against the live state.
 *
 * `unprotected` means a protection is missing or weaker than the floor.
 * `unverified` means an assertion could not be computed at all. The two are
 * never merged: an answer nobody could compute must not read as one that was.
 */
export function assess(live, want) {
  const findings = [];
  const unverified = [];
  const fail = (assertion, detail) => findings.push({ assertion, detail });

  const found = (live ?? []).find((entry) => entry.name === want.name);
  if (!found) {
    fail(
      `a ruleset named \`${want.name}\` exists`,
      `no ruleset on this repository carries that name. ${(live ?? []).length} ruleset(s) were read: ${(live ?? []).map((entry) => `${entry.name} (${entry.target})`).join(', ') || 'none'}.`,
    );
    return { name: want.name, why: want.why, state: 'unprotected', findings, unverified };
  }

  if (found.enforcement !== 'active') {
    fail(
      'enforcement is `active`',
      `enforcement is \`${found.enforcement ?? '(unset)'}\`, so the rules are recorded and not applied.`,
    );
  }

  if (found.target !== want.target) {
    fail(
      `targets \`${want.target}\``,
      `target is \`${found.target ?? '(unset)'}\`, which protects a different kind of ref entirely.`,
    );
  }

  const refs = found.conditions?.ref_name?.include ?? [];
  if (!want.refs.some((ref) => refs.includes(ref))) {
    fail(
      `applies to ${want.refs[0]}`,
      `\`conditions.ref_name.include\` is ${JSON.stringify(refs)}, none of ${want.refs.join(' / ')}.`,
    );
  }

  for (const type of want.rules) {
    if (!rule(found, type)) fail(`carries the \`${type}\` rule`, `the \`${type}\` rule is gone.`);
  }

  // No ruleset here needs an exemption. A protection with one is not that
  // protection, and this is the assertion a workflow token cannot make.
  if (found.bypass_actors === undefined) {
    unverified.push({ assertion: 'no actor may bypass it', reason: BYPASS_UNREADABLE });
  } else if (found.bypass_actors.length > 0) {
    fail(
      'no actor may bypass it',
      `${found.bypass_actors.length} bypass actor(s) are exempt from it.`,
    );
  }

  const state =
    findings.length > 0 ? 'unprotected' : unverified.length > 0 ? 'unverified' : 'protected';
  return { name: want.name, why: want.why, state, findings, unverified };
}

/** Every expectation against the live state, plus what the run examined. */
export function evaluate(live, expected = EXPECTED) {
  return {
    examinedLive: (live ?? []).length,
    examinedExpectations: expected.length,
    rulesets: expected.map((want) => assess(live, want)),
  };
}

/**
 * A gutted copy of every expected ruleset: right name, wrong everything else.
 * `verify-rulesets.mjs` evaluates this before it opens a socket, so a floor
 * that has stopped detecting a weakening fails the run instead of passing it.
 */
export function gutted(expected = EXPECTED) {
  return expected.map((want) => ({
    name: want.name,
    target: want.target === 'branch' ? 'tag' : 'branch',
    enforcement: 'evaluate',
    conditions: { ref_name: { include: ['refs/heads/nothing-matches-this'] } },
    rules: [],
    bypass_actors: [{ actor_id: 1, actor_type: 'RepositoryRole', bypass_mode: 'always' }],
  }));
}

/** Expectations that failed to notice their own gutted ruleset. */
export function selfTestFailures(expected = EXPECTED) {
  const report = evaluate(gutted(expected), expected);
  return report.rulesets
    .filter((entry) => entry.state !== 'unprotected')
    .map((entry) => `${entry.name} reported \`${entry.state}\` against a gutted ruleset.`);
}

/** The worst state any expectation reached. */
export function overallState(report) {
  const states = report.rulesets.map((entry) => entry.state);
  if (states.includes('unprotected')) return 'unprotected';
  if (states.includes('unverified')) return 'unverified';
  return 'protected';
}

const LABEL = { protected: 'PROTECTED  ', unprotected: 'UNPROTECTED', unverified: 'UNVERIFIED ' };

const OVERALL = {
  protected: 'PROTECTED — every assertion was computed and every one holds.',
  unprotected: 'UNPROTECTED — a protection is missing or weaker than the recorded floor.',
  unverified:
    'UNVERIFIED — nothing was found weakened, and at least one assertion could not be computed. This is not a clean run.',
};

/** One block per expectation, for the run log. */
export function renderSummary(report) {
  const lines = [
    `Examined ${report.examinedLive} live ruleset(s) against ${report.examinedExpectations} expectation(s)`,
    '',
  ];
  for (const entry of report.rulesets) {
    lines.push(`${LABEL[entry.state]}  ${entry.name}`);
    for (const finding of entry.findings) {
      lines.push(`    expected  ${finding.assertion}`, `    got       ${finding.detail}`);
    }
    for (const item of entry.unverified) {
      lines.push(`    unverified  ${item.assertion}`, `    because     ${item.reason}`);
    }
  }
  lines.push('', OVERALL[overallState(report)]);
  return lines.join('\n');
}

/** Markdown issue body, scoped so the fix is derivable from it alone. */
export function renderIssue(report, repo) {
  const lines = [
    '## A repository ruleset no longer meets its floor',
    '',
    `\`${repo}\` is protected by settings that live in GitHub's UI, where no pull request can see them change. \`scripts/rulesets.mjs\` records the floor; this run found the live state below it.`,
    '',
    `Review https://github.com/${repo}/settings/rules, then either restore the protection or, if the change was deliberate, update \`EXPECTED\` and \`docs/admin/repository-settings.md\` in one pull request.`,
    '',
  ];
  for (const entry of report.rulesets.filter((item) => item.findings.length > 0)) {
    lines.push(`### \`${entry.name}\``, entry.why, '');
    for (const finding of entry.findings) {
      lines.push(`- **expected:** ${finding.assertion}`, `  - ${finding.detail}`);
    }
    lines.push('');
  }
  const unverified = report.rulesets.flatMap((entry) =>
    entry.unverified.map((item) => `- \`${entry.name}\` — ${item.assertion}: ${item.reason}`),
  );
  if (unverified.length > 0) {
    lines.push('### Not verified by this run', '', ...unverified, '');
  }
  lines.push(
    '---',
    '_Filed by `watch-rulesets.yml`. Reused while the gap persists, and closed on the next clean run._',
  );
  return lines.join('\n');
}

/** The body filed when the rulesets could not be read at all. */
export function renderUnreadable(repo, reason) {
  return [
    '## The repository rulesets could not be read',
    '',
    `This run cannot say whether \`${repo}\` is still protected. It is not a report that protection is gone. It is a report that nobody can currently tell.`,
    '',
    `\`\`\`\n${reason}\n\`\`\``,
    '',
    'The ruleset endpoints return 403 on a private repository without GitHub Pro. Otherwise suspect the API or a rate limit. Read the live state by hand at https://github.com/' +
      repo +
      '/settings/rules, and see `docs/admin/repository-settings.md`.',
    '',
    '---',
    '_Filed by `watch-rulesets.yml`._',
  ].join('\n');
}
