import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

/**
 * Decidable rules over the workflow files.
 *
 * These are the rules a compiler would apply if YAML went through one. No
 * style, no judgement: a name pairs up or it does not.
 */

const WORKFLOWS = new URL('../.github/workflows/', import.meta.url);

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
