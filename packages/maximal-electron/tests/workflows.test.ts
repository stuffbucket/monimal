import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

/**
 * Decidable rules over the workflow files.
 *
 * The release pipeline runs only when a tag is pushed, so a defect in it is
 * found on the one path that cannot be re-run. Three shipped that way: an XML
 * comment that stopped the MSI existing, `npm pack` into a directory nobody
 * created, and a download that cannot resolve a draft. Every one of them was a
 * job that had never executed.
 *
 * These are the rules a compiler would apply if YAML went through one. No
 * style, no judgement: a name pairs up or it does not.
 */

const WORKFLOWS = new URL('../.github/workflows/', import.meta.url);

/**
 * The rail that decides whether a run may touch anything.
 *
 * A tag push used to be the only way to publish, which made the tag a one-shot
 * fuse: an outage that cancelled the run spent the version. A dispatch can
 * publish now, so the rail is a conjunction and both halves are required — a
 * tag ref, and either a tag push or an input that defaults to false.
 *
 * It is written out once here and compared for equality rather than by
 * substring. A near-miss guard is the failure this file exists to catch, and
 * `if: github.ref_type == 'tag'` alone would pass a `contains` test while
 * letting any dispatch of a tag publish.
 */
const RAIL = "github.ref_type == 'tag' && (github.event_name == 'push' || inputs.publish == true)";
const LIVE = `\${{ ${RAIL} }}`;
const REHEARSAL = `\${{ !(${RAIL}) }}`;

/** Calls that create, move, or destroy a release. `view` and `download` read. */
const MUTATES_A_RELEASE = /\bgh release (create|upload|edit|delete)\b/;

/**
 * The one script that talks to a registry. A published version cannot be
 * replaced, moved, or withdrawn, so the call is in a single place with its own
 * rail in `scripts/publish-decision.mjs` rather than spelled into a step.
 */
const PUBLISH_SCRIPT = 'scripts/publish-package.mjs';

interface Step {
  name?: string;
  if?: string;
  run?: string;
  uses?: string;
  with?: Record<string, string>;
}

interface Job {
  if?: string;
  needs?: string | string[];
  permissions?: Record<string, string> | string;
  steps?: Step[];
}

interface Workflow {
  on?: Record<string, unknown>;
  env?: Record<string, string>;
  jobs?: Record<string, Job>;
}

function workflowFiles(): string[] {
  return readdirSync(WORKFLOWS).filter((name) => name.endsWith('.yml'));
}

function read(name: string): Workflow {
  return parse(readFileSync(path.join(WORKFLOWS.pathname, name), 'utf8')) as Workflow;
}

function jobs(workflow: Workflow): [string, Job][] {
  return Object.entries(workflow.jobs ?? {});
}

function steps(workflow: Workflow): { job: Job; step: Step }[] {
  return jobs(workflow).flatMap(([, job]) => (job.steps ?? []).map((step) => ({ job, step })));
}

function needsOf(job: Job): string[] {
  if (job.needs === undefined) return [];
  return typeof job.needs === 'string' ? [job.needs] : job.needs;
}

const files = workflowFiles();
const parsed = new Map(files.map((name) => [name, read(name)]));

describe('the workflow files', () => {
  it('finds files to check, so an empty scan cannot pass', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const [name, workflow] of parsed) {
    it(`${name} declares at least one job`, () => {
      expect(jobs(workflow).length).toBeGreaterThan(0);
    });

    /**
     * Every trigger except this one is a webhook, and a webhook is something
     * GitHub can decline to convert into a run. It declined for nine hours on
     * 2026-08-06, and `ci.yml` was the one workflow with no way to ask: a
     * dispatch is an API call rather than an event, so it is the only trigger
     * an event backlog cannot reach. `gh run rerun` is not a substitute, since
     * it re-runs at the original head and cannot put a check on a commit that
     * never had one. Issue #164.
     */
    it(`${name} can be dispatched, so a throttled webhook is not the only way in`, () => {
      expect(Object.keys(workflow.on ?? {})).toContain('workflow_dispatch');
    });

    it(`${name} names only jobs that exist in needs`, () => {
      const declared = new Set(jobs(workflow).map(([id]) => id));
      const missing = jobs(workflow).flatMap(([id, job]) =>
        needsOf(job)
          .filter((need) => !declared.has(need))
          .map((need) => `${id} needs ${need}`),
      );
      expect(missing).toEqual([]);
    });
  }
});

/**
 * An artifact passes between jobs by name, and nothing checks the pair.
 * `dry-run-artifacts` reads the tarball this way, and a rename on one side
 * leaves a download that finds nothing. #81 was that failure.
 */
describe('artifact hand-off', () => {
  const pairs: string[] = [];

  for (const [name, workflow] of parsed) {
    const uses = (step: Step, action: string) => step.uses?.startsWith(`actions/${action}@`) === true;
    const uploaded = new Set(
      steps(workflow)
        .filter(({ step }) => uses(step, 'upload-artifact'))
        .map(({ step }) => step.with?.['name'])
        .filter((value): value is string => value !== undefined),
    );

    for (const { step } of steps(workflow)) {
      if (!uses(step, 'download-artifact')) continue;
      // No name downloads every artifact in the run.
      const wanted = step.with?.['name'];
      if (wanted === undefined) continue;

      pairs.push(`${name}:${wanted}`);
      it(`${name} uploads the artifact "${wanted}" that it downloads`, () => {
        expect([...uploaded]).toContain(wanted);
      });
    }
  }

  it('found a hand-off to check', () => {
    expect(pairs.length).toBeGreaterThan(0);
  });
});

/**
 * `npm pack --pack-destination` fails with ENOENT rather than creating the
 * directory. That job could only ever have failed, and did, twice (#80).
 */
describe('npm pack', () => {
  const found: string[] = [];

  for (const [name, workflow] of parsed) {
    for (const { step } of steps(workflow)) {
      const match = /npm pack[^\n]*--pack-destination\s+(\S+)/.exec(step.run ?? '');
      if (match === null) continue;

      const destination = match[1] ?? '';
      found.push(`${name}:${destination}`);
      it(`${name} creates ${destination} before packing into it`, () => {
        expect(step.run).toMatch(new RegExp(`mkdir -p ${destination}\\b`));
      });
    }
  }

  it('found a pack step to check', () => {
    expect(found.length).toBeGreaterThan(0);
  });
});

describe('the release workflow', () => {
  const release = parsed.get('release.yml');

  it('is present', () => {
    expect(release).toBeDefined();
  });

  /**
   * The tarball is the only asset a release carries, and `stuffbucket/maximal`
   * is what consumes it. Nothing else may gate the publish. See
   * `docs/release.md`.
   */
  it('gates publish on the tarball alone', () => {
    expect(needsOf(release?.jobs?.['publish'] ?? {})).toEqual(['package-tarball']);
  });

  /**
   * The rail, on every step that would touch a release. Nothing else
   * distinguishes a run that may from a run that may not, so a step without it
   * is a step that publishes from a branch.
   */
  const unguarded: string[] = [];
  const guarded: string[] = [];

  for (const [id, job] of jobs(release ?? {})) {
    for (const step of job.steps ?? []) {
      if (!MUTATES_A_RELEASE.test(step.run ?? '')) continue;

      const where = `${id}: ${step.name ?? step.run?.slice(0, 40) ?? ''}`;
      const isGuarded = [job.if, step.if].includes(LIVE);
      (isGuarded ? guarded : unguarded).push(where);
    }
  }

  it('found a release-mutating step to check', () => {
    expect(guarded.length + unguarded.length).toBeGreaterThan(0);
  });

  it('carries the whole rail on every step that touches a release', () => {
    expect(unguarded).toEqual([]);
  });

  /**
   * The half of the rail the old one was made of. `github.ref_type == 'tag'`
   * is what stops a dispatch of a branch reaching anything, whatever input it
   * passes, and it is the property "a dispatch is always a dry run" used to
   * provide. Asserted on the string rather than inferred from it.
   */
  it('requires a tag ref in the rail, so no input makes a branch publishable', () => {
    expect(RAIL.startsWith("github.ref_type == 'tag' &&")).toBe(true);
  });

  /**
   * The input that has to be asked for. A boolean that defaults to true, or a
   * string, would turn the rail into a formality: GitHub casts a string to a
   * number for `== true`, so `'true'` would compare false and a `type: string`
   * input could never publish — but a `default: true` boolean would always.
   */
  it('takes an explicit publish input that defaults to false', () => {
    const dispatch = (release?.on?.['workflow_dispatch'] ?? {}) as {
      inputs?: Record<string, { type?: string; default?: unknown }>;
    };
    const input = dispatch.inputs?.['publish'];
    expect(input?.type).toBe('boolean');
    expect(input?.default).toBe(false);
  });

  /**
   * `DRY_RUN` is the shell-visible form of the same decision, and `tag-check`
   * branches on it. Two expressions that can disagree is how a rehearsal ends
   * up resolving a tag it was never given.
   */
  it('derives DRY_RUN from the same rail, negated', () => {
    expect(release?.env?.['DRY_RUN']).toBe(REHEARSAL);
  });

  /**
   * Every attach step is skipped on a rehearsal, so a run that built nothing
   * would end green. This job is what asserts otherwise, and it is the one
   * thing in the rehearsal whose deletion nothing else would notice.
   */
  it('ends a rehearsal with a job that asserts the artifacts exist', () => {
    const job = release?.jobs?.['dry-run-artifacts'];
    expect(job?.if).toBe(REHEARSAL);
    expect(needsOf(job ?? {})).toEqual(expect.arrayContaining(['package-tarball']));
  });

  /**
   * The registry publish needs the token permission, and nothing else in the
   * pipeline does. Dropping it turns the one irreversible step into a 403 on a
   * tag, which is the run that cannot be repeated.
   */
  it('gives the publishing job packages: write', () => {
    const permissions = release?.jobs?.['publish-package']?.permissions;
    expect(typeof permissions === 'object' ? permissions : {}).toMatchObject({
      packages: 'write',
    });
  });

  /**
   * The rehearsal's half of the publish. Without a step that runs the same
   * script in the mode that uploads nothing, the whole registry path would be
   * exercised for the first time on a tag, which is how three release defects
   * shipped.
   */
  it('rehearses the publish on a run that is not publishing', () => {
    const rehearsals = (release?.jobs?.['publish-package']?.steps ?? []).filter(
      (step) => (step.run ?? '').includes('--mode rehearse') && step.if === REHEARSAL,
    );
    expect(rehearsals).toHaveLength(1);
  });
});

/**
 * A published version cannot be replaced, moved, or withdrawn. Every other
 * guard in this file protects something a second run can repair; this one does
 * not, so it scans every workflow rather than `release.yml` alone.
 */
describe('publishing to a registry', () => {
  const runSteps: Step[] = [];
  const invocations: { where: string; step: Step; job: Job }[] = [];
  const rawPublishes: string[] = [];

  for (const [name, workflow] of parsed) {
    for (const [id, job] of jobs(workflow)) {
      for (const step of job.steps ?? []) {
        const run = step.run ?? '';
        if (run === '') continue;
        runSteps.push(step);

        const where = `${name} ${id}: ${step.name ?? run.slice(0, 40)}`;
        if (run.includes(PUBLISH_SCRIPT)) invocations.push({ where, step, job });
        if (/\bnpm publish\b/.test(run)) rawPublishes.push(where);
      }
    }
  }

  it('found run steps to scan, so an empty scan cannot pass', () => {
    expect(runSteps.length).toBeGreaterThan(0);
  });

  /**
   * One door. `npm publish` spelled into a step would carry none of the rails
   * in `scripts/publish-decision.mjs` — not the tag-ref refusal, not the
   * already-published outcome, and not the absolute-path argument that a bare
   * `a/b` turns into an `owner/repo` git clone over SSH.
   */
  it('routes every registry publish through the one script', () => {
    expect(rawPublishes).toEqual([]);
  });

  it('found a publish invocation to check', () => {
    expect(invocations.length).toBeGreaterThan(0);
  });

  /**
   * The mode is what the script acts on, so the rail belongs on the step that
   * passes it. A `--mode publish` step without the exact rail is a publish
   * from a branch.
   */
  for (const { where, step, job } of invocations) {
    const wanted = (step.run ?? '').includes('--mode publish') ? LIVE : REHEARSAL;
    it(`${where} carries the rail its mode requires`, () => {
      expect([job.if, step.if]).toContain(wanted);
    });
  }

  /** Neither mode may be left implicit: the default is the caller's, not the workflow's. */
  it('states the mode on every invocation', () => {
    const implicit = invocations.filter(({ step }) => !/--mode (publish|rehearse)\b/.test(step.run ?? ''));
    expect(implicit).toEqual([]);
  });
});
