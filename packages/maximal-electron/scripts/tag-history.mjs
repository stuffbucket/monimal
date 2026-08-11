/**
 * Whether a tag push is a new cut or a re-cut of one that already shipped.
 *
 * Pure over already-collected facts, so `tests/tag-history.test.ts` runs
 * offline. `scripts/verify-tag.mjs` is the half that reads git and the API.
 *
 * A tag deletion erases the ref and nothing else. The workflow runs on that
 * ref survive it, which is why the run list is what this reads: `v0.0.2` has
 * two, at two different commits. See `docs/release.md`.
 */

/** `v1.2.3` or `v1.2.3-beta.4`. Anything else is not a release tag. */
export function parseVersion(tag) {
  const match = /^v(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta)(?:\.(\d+))?)?$/.exec(tag ?? '');
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    // A release outranks any pre-release of the same number.
    pre: match[4] === undefined ? null : { name: match[4], number: Number(match[5] ?? 0) },
  };
}

/** Negative when `a` is below `b`, zero when they are the same version. */
export function compareVersions(a, b) {
  for (const part of ['major', 'minor', 'patch']) {
    if (a[part] !== b[part]) return a[part] - b[part];
  }
  if (a.pre === null && b.pre === null) return 0;
  if (a.pre === null) return 1;
  if (b.pre === null) return -1;
  if (a.pre.name !== b.pre.name) return a.pre.name < b.pre.name ? -1 : 1;
  return a.pre.number - b.pre.number;
}

/**
 * Two facts this run cannot have read, stated as their own failures so the
 * output distinguishes "nothing to look at" from "this was wrong". Both are
 * positive controls rather than count thresholds: a first release legitimately
 * has no other tag, but a tag push always has its own tag and its own run.
 */
export function scopeFailures({ tag, tags = [], runs = [], dryRun = false }) {
  if (dryRun) return [];
  const failures = [];
  if (!tags.includes(tag)) {
    failures.push(
      `\`${tag}\` is not in the ${tags.length} tag(s) this run read, and a tag push always has its own tag. The tag list was not read.`,
    );
  }
  if (runs.length === 0) {
    failures.push(
      `No workflow run was found on \`refs/tags/${tag}\`, not even the one running this check. The run list was not read.`,
    );
  }
  return failures;
}

/**
 * Every way this tag is a re-cut. `runs` is every workflow run on this exact
 * ref, `tags` every tag that exists now, `sha` the commit the ref points at.
 */
export function evaluateTag({ tag, sha, tags = [], runs = [], dryRun = false }) {
  const findings = [];
  const notes = [];
  const fail = (assertion, detail) => findings.push({ assertion, detail });

  const version = parseVersion(tag);
  if (version === null) {
    fail('the tag names a version', `\`${tag}\` is not of the form \`v1.2.3\` or \`v1.2.3-beta.4\`.`);
    return { tag, dryRun, examinedTags: tags.length, examinedRuns: runs.length, findings, notes };
  }

  // A release branch sits at the shipped version until the bump, so a dry run
  // finding its own tag is the normal state and not a defect. On a real push
  // the tag exists by definition, and the run history below is what decides.
  if (dryRun && tags.includes(tag)) {
    notes.push(
      `\`${tag}\` already exists. Pushing it again would move it, and this guard would refuse. Bump the version before the cut.`,
    );
  }

  const elsewhere = runs.filter((run) => sha && run.headSha && run.headSha !== sha);
  if (elsewhere.length > 0) {
    fail(
      'this ref has never been built at another commit',
      `${elsewhere.length} earlier run(s) on \`refs/tags/${tag}\` built a different commit: ${elsewhere
        .map((run) => `${run.headSha.slice(0, 8)} (run ${run.id})`)
        .join(', ')}. The tag has been moved. A consumer's lockfile pins the commit the tag resolved to, so cut the next unused version instead.`,
    );
  }

  const above = tags
    .filter((other) => other !== tag)
    .map((other) => ({ tag: other, version: parseVersion(other) }))
    .filter((other) => other.version !== null && compareVersions(other.version, version) >= 0);
  if (above.length > 0) {
    fail(
      'the tag is above every tag that exists',
      `${above.map((other) => `\`${other.tag}\``).join(', ')} already exist(s) at or above \`${tag}\`. A version is cut once and only forwards.`,
    );
  }

  return { tag, dryRun, examinedTags: tags.length, examinedRuns: runs.length, findings, notes };
}

/**
 * The incident this gate exists for. `v0.0.2` was cut at `e983b74`, the run
 * failed, #80 fixed it, and the tag was re-pushed onto `441df8a` eight minutes
 * later. `verify-tag.mjs` replays it before it reads anything real.
 */
export const MOVED_TAG_FIXTURE = {
  tag: 'v0.0.2',
  sha: '441df8a4000000000000000000000000000000aa',
  tags: ['v0.0.1', 'v0.0.2'],
  runs: [
    { id: 31056557272, headSha: 'e983b742000000000000000000000000000000bb' },
    { id: 31057024109, headSha: '441df8a4000000000000000000000000000000aa' },
  ],
};

/** A version cut behind one that already shipped. */
export const BACKWARDS_TAG_FIXTURE = {
  tag: 'v0.0.2',
  sha: 'cafe0000000000000000000000000000000000cc',
  tags: ['v0.0.1', 'v0.0.2', 'v0.0.3'],
  runs: [{ id: 1, headSha: 'cafe0000000000000000000000000000000000cc' }],
};

/** Fixtures the rules above failed to catch. */
export function selfTestFailures() {
  const failures = [];
  const cases = [
    ['a tag moved to another commit', MOVED_TAG_FIXTURE, 'this ref has never been built at another commit'],
    ['a version cut backwards', BACKWARDS_TAG_FIXTURE, 'the tag is above every tag that exists'],
  ];
  for (const [label, fixture, assertion] of cases) {
    const found = evaluateTag(fixture).findings.some((finding) => finding.assertion === assertion);
    if (!found) failures.push(`${label} was not detected.`);
  }
  return failures;
}

/** One block per finding, for the run log. */
export function renderTagReport(report) {
  const lines = [
    `Examined ${report.examinedRuns} run(s) on \`refs/tags/${report.tag}\` and ${report.examinedTags} existing tag(s)`,
    '',
  ];
  for (const finding of report.findings) {
    lines.push(`  expected  ${finding.assertion}`, `  got       ${finding.detail}`);
  }
  for (const note of report.notes) lines.push(`  note      ${note}`);
  if (report.findings.length > 0) {
    lines.push(`\`${report.tag}\` is a re-cut, not a new one.`);
  } else if (report.dryRun) {
    lines.push(`\`${report.tag}\` orders correctly. Its run history was not evaluated.`);
  } else if (report.examinedRuns === 0) {
    lines.push(`No run was read on this ref, so nothing about \`${report.tag}\` was decided.`);
  } else {
    lines.push(`\`${report.tag}\` is a new cut. Nothing has been built on this ref before.`);
  }
  return lines.join('\n');
}
