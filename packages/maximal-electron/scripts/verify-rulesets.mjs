#!/usr/bin/env node
/**
 * Verify the repository rulesets against the floor in `scripts/rulesets.mjs`.
 *
 *   npm run verify:rulesets
 *   npm run verify:rulesets -- --body-file drift.md
 *
 * Exit 0 protected · 1 a protection is missing, weakened, or nothing was
 * examined · 2 the rulesets could not be read at all · 3 unverified, because an
 * assertion could not be computed. Four codes rather than pass and fail, so a
 * caller cannot render "nobody could tell" as "verified".
 *
 * It adds no credential. On a developer machine it reads the token
 * `gh auth login` already holds, which is the only way to see `bypass_actors`.
 * See `docs/admin/repository-settings.md`.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { scopedChecks } from './check-scope.mjs';
import {
  EXPECTED,
  evaluate,
  overallState,
  renderIssue,
  renderSummary,
  renderUnreadable,
  selfTestFailures,
} from './rulesets.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

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

/**
 * The token `gh` is logged in with. A `gh auth login` session stores it in the
 * CLI's own configuration and exports nothing, so without this the local run —
 * the only run that can see `bypass_actors` — reports it unverified.
 */
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

async function fetchRulesets(repo) {
  const token =
    process.env['RULESET_TOKEN'] ||
    process.env['GH_TOKEN'] ||
    process.env['GITHUB_TOKEN'] ||
    ghCliToken();
  const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': 'maximal-electron-ruleset-check',
    'x-github-api-version': '2022-11-28',
  };
  // Unauthenticated reads work on a public repository and see everything here
  // except the bypass list. A token only ever adds visibility.
  if (token) headers.authorization = `Bearer ${token}`;

  const read = async (route) => {
    const response = await fetch(`https://api.github.com${route}`, { headers });
    if (!response.ok) {
      throw new Error(`GET ${route} answered ${response.status} ${response.statusText}`);
    }
    return response.json();
  };

  const summaries = await read(`/repos/${repo}/rulesets`);
  const full = [];
  for (const summary of summaries) {
    full.push(await read(`/repos/${repo}/rulesets/${summary.id}`));
  }
  return full;
}

async function main() {
  const repo = repoSlug();
  const bodyFile = flag('--body-file');
  const write = (body) => {
    if (bodyFile) writeFileSync(bodyFile, body);
  };
  const { check, summary } = scopedChecks();

  // Before the network: prove the floor still detects a gutted ruleset. An
  // emptied EXPECTED fails here on the scope rather than passing on the logic.
  const blind = selfTestFailures();
  if (
    !check(blind.length === 0, 'the recorded floor still detects a gutted ruleset', {
      count: EXPECTED.length,
      of: 'expectations',
    })
  ) {
    for (const line of blind) console.error(`         ${line}`);
    summary('verify:rulesets');
    return 2;
  }

  let live;
  try {
    live = await fetchRulesets(repo);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`verify-rulesets: could not read ${repo}'s rulesets — ${reason}`);
    write(renderUnreadable(repo, reason));
    return 2;
  }

  const report = evaluate(live);
  for (const entry of report.rulesets) {
    check(entry.state !== 'unprotected', `${entry.name} meets its floor`, {
      count: report.examinedLive,
      of: 'live rulesets',
    });
  }
  console.error(renderSummary(report));

  if (summary('verify:rulesets') !== 0) {
    write(renderIssue(report, repo));
    console.error(`https://github.com/${repo}/settings/rules`);
    return 1;
  }
  return overallState(report) === 'unverified' ? 3 : 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(`verify-rulesets: ${error.message}`);
    process.exit(2);
  },
);
