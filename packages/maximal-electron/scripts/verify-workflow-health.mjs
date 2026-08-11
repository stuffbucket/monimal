#!/usr/bin/env node
/**
 * Verify that every workflow in `.github/workflows/` still runs, and still works.
 *
 *   npm run verify:workflow-health
 *   npm run verify:workflow-health -- --repo owner/name --body-file health.md
 *
 * Exit 0 healthy · 1 a workflow has never run, has stopped running, or fails
 * every time · 2 nothing could be read, nothing was examined, or the rules
 * stopped detecting a dead workflow · 3 unverified, because a workflow's runs
 * could not be read. Four codes rather than pass and fail, so a caller cannot
 * render "nobody could tell" as "verified", and so the half a pull request owns
 * (exit 2) is separable from the half it cannot fix (exit 1). See `docs/ci.md`.
 *
 * The workflow list is discovered from the directory, never listed here.
 * `verify-exports.mjs` listed its targets by hand and never checked a new
 * export; three workflows escaped a hand-list in this repository in one day.
 *
 * It adds no credential. In a workflow it reads `github.token`, which can read
 * Actions on its own repository; locally it reads the token `gh auth login`
 * already holds.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';

import { scopedChecks } from './check-scope.mjs';
import {
  MIN_SAMPLE,
  SAMPLE,
  evaluate,
  overallState,
  renderIssue,
  renderSummary,
  renderUnreadable,
  selfTestFailures,
  triggersOf,
} from './workflow-health.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOWS = path.join(ROOT, '.github', 'workflows');

const flag = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

/** `owner/name`, from the workflow environment or from the manifest. */
function repoSlug() {
  const override = flag('--repo') ?? process.env['GITHUB_REPOSITORY'];
  if (override) return override;
  const manifest = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const match = /github\.com\/([^/]+\/[^/.]+)/.exec(manifest.repository?.url ?? '');
  if (!match) throw new Error('package.json has no GitHub repository URL to check');
  return match[1];
}

/** The token `gh` is logged in with, for a developer machine that exports none. */
function ghCliToken() {
  try {
    return execFileSync('gh', ['auth', 'token'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

/** Every workflow file on disk, which is the only list that cannot go stale. */
function workflowFiles() {
  return readdirSync(WORKFLOWS)
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .sort();
}

function reader() {
  const token =
    process.env['GH_TOKEN'] || process.env['GITHUB_TOKEN'] || ghCliToken();
  const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': 'maximal-electron-workflow-health',
    'x-github-api-version': '2022-11-28',
  };
  // Unauthenticated reads work on a public repository. A token only ever adds
  // visibility, and raises the rate limit this walks straight into without one.
  if (token) headers.authorization = `Bearer ${token}`;

  return async (route) => {
    const response = await fetch(`https://api.github.com${route}`, { headers });
    if (!response.ok) {
      const error = new Error(`GET ${route} answered ${response.status} ${response.statusText}`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  };
}

/**
 * What GitHub holds for one workflow file.
 *
 * A 404 is an answer, not an error: GitHub registers a workflow from the
 * default branch, so a file that lives only on a release branch has no record
 * at all. That is `watch-rulesets.yml`, and it is the defect, not a read
 * failure.
 */
async function observe(read, repo, file, registered) {
  const triggers = triggersOf(parse(readFileSync(path.join(WORKFLOWS, file), 'utf8')));
  try {
    const page = await read(
      `/repos/${repo}/actions/workflows/${file}/runs?per_page=${String(SAMPLE)}`,
    );
    const runs = (page.workflow_runs ?? []).map((run) => ({
      conclusion: run.conclusion,
      createdAt: run.created_at,
    }));
    return { file, triggers, runs, registered: true };
  } catch (error) {
    if (error.status === 404) return { file, triggers, runs: [], registered };
    return { file, triggers, unreadable: error.message };
  }
}

async function main() {
  const repo = repoSlug();
  const bodyFile = flag('--body-file');
  const write = (body) => {
    if (bodyFile) writeFileSync(bodyFile, body);
  };
  const { check, summary } = scopedChecks();

  // Before the network: prove the rules still detect a workflow that has never
  // run, one that stopped, and one that fails every time. Rules that have
  // stopped detecting those fail here rather than reporting a clean repository.
  const blind = selfTestFailures();
  if (
    !check(blind.length === 0, 'the rules still detect a dead workflow', {
      count: 3,
      of: 'known-broken samples',
    })
  ) {
    for (const line of blind) console.error(`         ${line}`);
    summary('verify:workflow-health');
    return 2;
  }

  const files = workflowFiles();
  if (
    !check(files.length > 0, '.github/workflows holds workflows to examine', {
      count: files.length,
      of: 'workflow files',
    })
  ) {
    summary('verify:workflow-health');
    return 2;
  }

  const read = reader();
  let registered;
  try {
    const listed = await read(`/repos/${repo}/actions/workflows?per_page=100`);
    registered = new Set((listed.workflows ?? []).map((entry) => path.basename(entry.path)));
  } catch (error) {
    console.error(`verify-workflow-health: could not read ${repo}'s workflows — ${error.message}`);
    write(renderUnreadable(repo, error.message));
    return 2;
  }

  const observed = [];
  for (const file of files) observed.push(await observe(read, repo, file, registered.has(file)));

  const report = evaluate(observed);
  for (const entry of report.workflows) {
    if (entry.state === 'unreadable') continue;

    check(entry.runsRead > 0, `${entry.file} has a run history to read`, {
      count: entry.runsRead,
      of: 'runs',
    });
    if (entry.runsRead === 0) continue;

    if (entry.recency.asserted) {
      check(
        !entry.findings.some((finding) => finding.assertion.startsWith('it ran within')),
        `${entry.file} has run recently`,
        { count: entry.runsRead, of: 'runs' },
      );
    }
    if (entry.conclusive >= MIN_SAMPLE) {
      check(
        !entry.findings.some((finding) => finding.assertion === 'not every recent run failed'),
        `${entry.file} is not failing every run`,
        { count: entry.conclusive, of: 'conclusive runs' },
      );
    }
  }
  console.error(renderSummary(report));

  const state = overallState(report);
  if (state === 'broken') {
    write(renderIssue(report, repo));
    summary('verify:workflow-health');
    return 1;
  }
  // A run that asserted nothing is the empty-set defect one level up, and the
  // floor above cannot see it: every workflow could be unreadable at once.
  if (summary('verify:workflow-health') !== 0) return 2;
  return state === 'unverified' ? 3 : 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(`verify-workflow-health: ${error.message}`);
    process.exit(2);
  },
);
