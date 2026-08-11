#!/usr/bin/env node
/**
 * Publish the packed tarball to GitHub Packages, or say it was already there.
 *
 * A tag is a pointer. This is the operation invoked against that pointer, and
 * it is re-invokable: running it twice for the same version is a success that
 * says so, not a 409 and not a silent pass that reads like a first publish.
 *
 *   node scripts/publish-package.mjs --dir dist-release --tag v0.0.5 --mode rehearse
 *   node scripts/publish-package.mjs --dir dist-release --tag v0.0.5 --mode publish
 *
 * `--mode publish` is refused unless the ref is a tag. `--ref-type` defaults to
 * `GITHUB_REF_TYPE`, which the runner sets, so a dispatch against a branch
 * cannot publish whatever input asked it to. `scripts/publish-decision.mjs`
 * holds that rail and `tests/publish-decision.test.ts` walks a table over it.
 *
 * Exit 0 published, already published, or rehearsed · 1 refused, or a
 * precondition failed.
 */

import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { scopedChecks } from './check-scope.mjs';
import { packedTarballName } from './export-checks.mjs';
import {
  decidePublish,
  isFailure,
  isVersionConflict,
  publishArguments,
  registryStateFrom,
  renderOutcome,
} from './publish-decision.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const flag = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
};

const manifest = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const directoryFlag = flag('--dir', 'dist-release');
const directory = path.resolve(ROOT, directoryFlag);

const tag = flag('--tag', `v${manifest.version}`);
const version = tag.replace(/^v/, '');
const mode = flag('--mode', 'rehearse');
const refType = flag('--ref-type', process.env['GITHUB_REF_TYPE'] ?? 'unknown');
const registryUrl = flag('--registry', manifest.publishConfig?.registry ?? '');

const npm = (argv) => spawnSync('npm', argv, { cwd: ROOT, encoding: 'utf8', env: process.env });

/** What the registry holds for this exact version. */
function probe() {
  const answer = npm(['view', `${manifest.name}@${version}`, 'version', '--registry', registryUrl]);
  return registryStateFrom({
    code: answer.status ?? 1,
    stdout: answer.stdout,
    stderr: answer.stderr,
    version,
  });
}

/** Preconditions, each with the size of the set it ran over. */
function preconditions(check, tarballs) {
  const floor = check(
    tarballs.length === 1,
    `exactly one tarball is in ${directoryFlag}`,
    { count: tarballs.length, of: 'tarballs' },
  );
  if (floor) {
    const expected = packedTarballName(manifest.name, version);
    check(tarballs[0] === expected, `the tarball is named ${expected}`, {
      count: 1,
      of: 'names compared',
    });
  }
  check(registryUrl !== '', `a registry is named (${registryUrl || 'unset'})`, {
    count: 1,
    of: 'registries',
  });
}

/** The upload, and the conflict that means somebody else got there first. */
function upload(action, tarball) {
  const argv = publishArguments({
    file: path.join(directory, tarball),
    registry: registryUrl,
    dryRun: action === 'rehearse',
  });
  // On stderr, where npm writes its own narration, so the two interleave in
  // the order they happened.
  console.error(`\n$ npm ${argv.join(' ')}`);


  const result = npm(argv);
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  if ((result.status ?? 1) === 0) return { action };

  // The probe and the upload are two calls, and the registry can gain the
  // version between them. A conflict is the same outcome as the probe having
  // found it, so it is reported as that rather than as a failure.
  if (isVersionConflict(`${result.stdout ?? ''}${result.stderr ?? ''}`)) {
    return {
      action: 'already-published',
      reason: 'npm refused the upload because the version was already there.',
    };
  }
  console.error(`\n::error::npm exited ${String(result.status ?? 1)}.`);
  return null;
}

function main() {
  const { check, summary } = scopedChecks();

  const tarballs = existsSync(directory)
    ? readdirSync(directory).filter((entry) => entry.endsWith('.tgz'))
    : [];

  preconditions(check, tarballs);
  if (summary('publish:package') !== 0) return 1;

  const registry = probe();
  console.log(`\nRegistry state: ${registry.state}. ${registry.detail}`);

  let { action, reason } = decidePublish({ mode, refType, registry });

  if (action === 'publish' || action === 'rehearse') {
    const done = upload(action, tarballs[0]);
    if (done === null) return 1;
    action = done.action;
    reason = done.reason ?? reason;
  }

  const line = renderOutcome({
    action,
    name: manifest.name,
    version,
    registry: registryUrl,
    reason,
  });
  console.log(`\n${line}`);

  const summaryFile = process.env['GITHUB_STEP_SUMMARY'];
  if (summaryFile !== undefined && summaryFile !== '') appendFileSync(summaryFile, `${line}\n`);

  if (isFailure(action)) {
    console.error(`::error::${line}`);
    return 1;
  }
  return 0;
}

process.exit(main());
