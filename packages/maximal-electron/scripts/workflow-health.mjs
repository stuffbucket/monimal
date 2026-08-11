/**
 * Whether each workflow still runs, and still works.
 *
 * `triage.yml` failed on every one of its 77 runs and nothing said so.
 * `watch-rulesets.yml` has never run once: a schedule fires only from the
 * default branch, and it lives on a release branch. Two workflows broken in
 * opposite directions, neither visible in a pull request, neither noticed.
 * Issue #153.
 *
 * Pure over already-fetched data, so `tests/workflow-health.test.ts` runs
 * offline. `scripts/verify-workflow-health.mjs` is the half that reads the API.
 *
 * A green run is not the claim. The claim is that every workflow was either
 * judged or declined **with a number**, because `verify:docs` printed an honest
 * count of what it examined while saying nothing about what it dropped (#152).
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How many recent runs to read per workflow. */
export const SAMPLE = 20;

/**
 * Conclusive runs needed before "it fails every time" is a verdict.
 *
 * One red run is a flake and two is a bad afternoon. `triage.yml` was at 77.
 * Below this the run count is reported as it is, and nothing is concluded.
 */
export const MIN_SAMPLE = 3;

/**
 * How long an activity-driven workflow may be quiet.
 *
 * A pull request, a push, or an issue event happens here several times a day,
 * so a fortnight of silence on a workflow that answers one of them means the
 * trigger stopped matching. It is deliberately loose: a rule that reddens on a
 * quiet week is a rule somebody deletes, and a deleted rule catches nothing.
 */
export const ACTIVITY_WINDOW = 14 * DAY;

/**
 * How many cron intervals a scheduled workflow may miss.
 *
 * GitHub delays a scheduled run under load and drops it outright on a quiet
 * repository, so one missed interval is not evidence. Two is.
 */
export const SCHEDULE_TOLERANCE = 2;

/** A conclusion that says the run worked. */
const SUCCEEDED = new Set(['success']);

/**
 * A conclusion that says the run did not work. `startup_failure` is the one
 * `triage.yml` produces: the reusable workflow never resolves, so the run has
 * no jobs at all.
 */
const FAILED = new Set(['failure', 'timed_out', 'startup_failure']);

/**
 * Events the repository fires as a matter of course. A workflow answering one
 * of these and silent for a fortnight has stopped being triggered.
 */
const ACTIVITY_EVENTS = new Set([
  'push',
  'pull_request',
  'pull_request_target',
  'merge_group',
  'issues',
  'issue_comment',
  'discussion',
  'create',
  'delete',
]);

/** Whole minutes, hours, or days between two firings of a cron expression. */
export function cronInterval(expression) {
  const fields = String(expression).trim().split(/\s+/);
  if (fields.length < 5) return undefined;
  const [minute, hour, dayOfMonth, , dayOfWeek] = fields;

  const every = (field) => {
    if (field === '*') return 1;
    const step = /^\*\/(\d+)$/.exec(field);
    return step ? Number(step[1]) : undefined;
  };

  const perMinute = every(minute);
  if (perMinute !== undefined) return perMinute * MINUTE;
  const perHour = every(hour);
  if (perHour !== undefined) return perHour * HOUR;
  const perDay = every(dayOfMonth);
  if (perDay !== undefined && dayOfWeek === '*') return perDay * DAY;
  if (dayOfWeek !== '*') return 7 * DAY;
  return 31 * DAY;
}

/**
 * The triggers a parsed workflow declares.
 *
 * YAML 1.1 reads a bare `on` as the boolean true, and which of the two keys
 * appears depends on the parser's schema. Reading both is one line; guessing
 * wrong is a check that sees no triggers at all and declines every assertion.
 *
 * A push filtered to tags is not repository activity. `release.yml` is that
 * case, and treating it as activity would flag it every quiet fortnight.
 */
export function triggersOf(document) {
  const on = document?.on ?? document?.[true] ?? document?.['true'];
  if (on === undefined || on === null) return { events: [], crons: [] };
  if (typeof on === 'string') return { events: [on], crons: [] };
  if (Array.isArray(on)) return { events: on.map(String), crons: [] };

  const events = [];
  const crons = [];
  for (const [event, value] of Object.entries(on)) {
    if (event === 'schedule') {
      for (const entry of Array.isArray(value) ? value : []) {
        if (typeof entry?.cron === 'string') crons.push(entry.cron);
      }
      continue;
    }
    if (event === 'push' && value !== null && typeof value === 'object') {
      const tagOnly = 'tags' in value && !('branches' in value) && !('paths' in value);
      if (tagOnly) continue;
    }
    events.push(event);
  }
  return { events, crons };
}

/**
 * How often this workflow ought to fire, and why that is or is not decidable.
 *
 * A tag, a dispatch, or a call from another repository has no cadence at all.
 * Silence there is not evidence of anything, so the recency assertion is
 * declined rather than computed — and the count of declinings is printed.
 */
export function cadence({ events, crons }) {
  const intervals = crons.map(cronInterval).filter((value) => value !== undefined);
  if (intervals.length > 0) {
    return { asserted: true, window: Math.min(...intervals) * SCHEDULE_TOLERANCE, why: 'schedule' };
  }
  if (events.some((event) => ACTIVITY_EVENTS.has(event))) {
    return { asserted: true, window: ACTIVITY_WINDOW, why: 'repository activity' };
  }
  return {
    asserted: false,
    why:
      events.length === 0
        ? 'this run read no triggers from the file'
        : `it fires only on ${events.join(', ')}, which has no cadence to be late against`,
  };
}

/**
 * A span in the largest unit that does not round it to nothing. A fixed unit
 * printed "it ran within 0 day(s)" against a window of one minute, which is a
 * message that says less than the number behind it.
 */
function span(length) {
  const round = (value) => String(Math.round(value * 10) / 10);
  if (length >= DAY) return `${round(length / DAY)} day(s)`;
  if (length >= HOUR) return `${round(length / HOUR)} hour(s)`;
  return `${round(length / MINUTE)} minute(s)`;
}

/**
 * One workflow file against the runs GitHub holds for it.
 *
 * `never-run` and `failing` are never merged. A workflow with no runs has not
 * been observed to work or to break; one failing every time has been observed
 * to break, 77 times. They send a reader to different places.
 */
export function assess(observed, now = Date.now()) {
  const { file, triggers, runs = [], unreadable } = observed;
  const findings = [];
  const notes = [];

  if (unreadable !== undefined) {
    return {
      file,
      state: 'unreadable',
      runsRead: 0,
      conclusive: 0,
      recency: { asserted: false, why: unreadable },
      findings,
      notes: [unreadable],
    };
  }

  const conclusive = runs.filter(
    (run) => SUCCEEDED.has(run.conclusion) || FAILED.has(run.conclusion),
  );
  const succeeded = conclusive.filter((run) => SUCCEEDED.has(run.conclusion)).length;
  const recency = cadence(triggers);

  if (runs.length === 0) {
    findings.push({
      assertion: 'GitHub holds at least one run of it',
      detail: observed.registered
        ? 'it is registered and has never been triggered.'
        : 'GitHub has no record of this workflow. A file that exists only on a branch other than the default branch is never registered, so neither `schedule` nor `workflow_dispatch` can reach it.',
    });
    return { file, state: 'never-run', runsRead: 0, conclusive: 0, recency, findings, notes };
  }

  const newest = Math.max(...runs.map((run) => Date.parse(run.createdAt)));
  const age = now - newest;

  if (recency.asserted && age > recency.window) {
    findings.push({
      assertion: `it ran within ${span(recency.window)}`,
      detail: `the newest of ${String(runs.length)} run(s) started ${span(age)} ago, and it is triggered by ${recency.why}.`,
    });
  } else if (!recency.asserted) {
    notes.push(`recency not asserted: ${recency.why}.`);
  }

  if (conclusive.length >= MIN_SAMPLE && succeeded === 0) {
    findings.push({
      assertion: 'not every recent run failed',
      detail: `${String(conclusive.length)} of the last ${String(runs.length)} run(s) reached a conclusion and every one of them failed.`,
    });
  } else if (conclusive.length < MIN_SAMPLE) {
    notes.push(
      `failure rate not asserted: ${String(conclusive.length)} conclusive run(s), fewer than the ${String(MIN_SAMPLE)} a verdict needs.`,
    );
  }

  const state =
    findings.length > 0
      ? findings.some((finding) => finding.assertion === 'not every recent run failed')
        ? 'failing'
        : 'silent'
      : 'healthy';

  return { file, state, runsRead: runs.length, conclusive: conclusive.length, recency, findings, notes };
}

/**
 * Every workflow file against the runs GitHub holds, plus what was declined.
 *
 * The two declined counts cover workflows that are otherwise fine. A workflow
 * already reported as a finding is not also counted as an answer nobody could
 * compute; that would inflate the declined number with the very cases the
 * findings list already carries.
 */
export function evaluate(observed, now = Date.now()) {
  const workflows = observed.map((entry) => assess(entry, now));
  const judged = workflows.filter(
    (entry) => entry.state !== 'unreadable' && entry.state !== 'never-run',
  );
  return {
    examined: workflows.length,
    runsRead: workflows.reduce((total, entry) => total + entry.runsRead, 0),
    recencyDeclined: judged.filter((entry) => !entry.recency.asserted).length,
    rateDeclined: judged.filter((entry) => entry.conclusive < MIN_SAMPLE).length,
    workflows,
  };
}

/**
 * Workflows that are unambiguously broken, one per state this exists to catch.
 * `verify-workflow-health.mjs` evaluates these before it opens a socket, so
 * rules that have stopped detecting a dead workflow fail the run rather than
 * passing it.
 */
export function broken(now = Date.now()) {
  const at = (offset) => new Date(now - offset).toISOString();
  const daily = { events: ['workflow_dispatch'], crons: ['0 6 * * *'] };
  return [
    { file: 'never-run.yml', triggers: daily, runs: [], registered: false, want: 'never-run' },
    {
      file: 'always-failing.yml',
      triggers: { events: ['pull_request'], crons: [] },
      runs: Array.from({ length: SAMPLE }, (_, index) => ({
        conclusion: 'failure',
        createdAt: at(index * HOUR),
      })),
      registered: true,
      want: 'failing',
    },
    {
      file: 'stopped-firing.yml',
      triggers: daily,
      runs: [{ conclusion: 'success', createdAt: at(30 * DAY) }],
      registered: true,
      want: 'silent',
    },
  ];
}

/** Cases the rules failed to notice were broken. */
export function selfTestFailures(now = Date.now()) {
  return broken(now)
    .map((sample) => ({ want: sample.want, got: assess(sample, now) }))
    .filter((entry) => entry.got.state !== entry.want)
    .map((entry) => `${entry.got.file} reported \`${entry.got.state}\`, not \`${entry.want}\`.`);
}

/** The worst state any workflow reached. */
export function overallState(report) {
  const states = report.workflows.map((entry) => entry.state);
  if (states.some((state) => ['failing', 'silent', 'never-run'].includes(state))) return 'broken';
  if (states.includes('unreadable')) return 'unverified';
  return 'healthy';
}

const LABEL = {
  healthy: 'HEALTHY   ',
  failing: 'FAILING   ',
  silent: 'SILENT    ',
  'never-run': 'NEVER RUN ',
  unreadable: 'UNREADABLE',
};

const OVERALL = {
  healthy: 'HEALTHY — every workflow judged has run and is not failing every time.',
  broken:
    'BROKEN — a workflow has never run, has stopped running, or fails every time it does.',
  unverified:
    'UNVERIFIED — nothing was found broken, and at least one workflow could not be read. This is not a clean run.',
};

/** One block per workflow, for the run log. */
export function renderSummary(report) {
  const lines = [
    `Examined ${String(report.examined)} workflow file(s) over ${String(report.runsRead)} run(s)`,
    `Recency declined on ${String(report.recencyDeclined)}, failure rate declined on ${String(report.rateDeclined)}`,
    '',
  ];
  for (const entry of report.workflows) {
    lines.push(`${LABEL[entry.state]}  ${entry.file}`);
    for (const finding of entry.findings) {
      lines.push(`    expected  ${finding.assertion}`, `    got       ${finding.detail}`);
    }
    for (const note of entry.notes) lines.push(`    note      ${note}`);
  }
  lines.push('', OVERALL[overallState(report)]);
  return lines.join('\n');
}

/** Markdown issue body, scoped so the fix is derivable from it alone. */
export function renderIssue(report, repo) {
  const lines = [
    '## A workflow has stopped running, or never worked',
    '',
    `Nothing in a pull request can see this. A workflow that fails on every run, or that no event can reach, is red only in the Actions tab of \`${repo}\`, and \`triage.yml\` was red there 77 times without anybody opening it.`,
    '',
    `This run examined ${String(report.examined)} workflow file(s) over ${String(report.runsRead)} run(s). It declined the recency assertion on ${String(report.recencyDeclined)} and the failure-rate assertion on ${String(report.rateDeclined)}, because a tag-only or dispatch-only workflow has no cadence and a workflow with fewer than ${String(MIN_SAMPLE)} conclusive runs supports no verdict.`,
    '',
  ];
  for (const entry of report.workflows.filter((item) => item.findings.length > 0)) {
    lines.push(`### \`${entry.file}\` — ${entry.state}`, '');
    for (const finding of entry.findings) {
      lines.push(`- **expected:** ${finding.assertion}`, `  - ${finding.detail}`);
    }
    lines.push('', `https://github.com/${repo}/actions/workflows/${entry.file}`, '');
  }
  const unreadable = report.workflows.filter((entry) => entry.state === 'unreadable');
  if (unreadable.length > 0) {
    lines.push(
      '### Not verified by this run',
      '',
      ...unreadable.map((entry) => `- \`${entry.file}\` — ${entry.notes.join(' ')}`),
      '',
    );
  }
  lines.push(
    '---',
    '_Filed by `workflow-health.yml`. Reused while the gap persists, and closed on the next clean run._',
  );
  return lines.join('\n');
}

/** The body filed when no workflow run history could be read at all. */
export function renderUnreadable(repo, reason) {
  return [
    '## The workflow run history could not be read',
    '',
    `This run cannot say whether \`${repo}\`'s workflows are still running. It is not a report that they are broken. It is a report that nobody can currently tell.`,
    '',
    `\`\`\`\n${reason}\n\`\`\``,
    '',
    'The Actions API needs a token with `actions: read`. In a workflow that is `github.token`; locally it is the token `gh auth login` already holds. See `docs/ci.md`.',
    '',
    '---',
    '_Filed by `workflow-health.yml`._',
  ].join('\n');
}
