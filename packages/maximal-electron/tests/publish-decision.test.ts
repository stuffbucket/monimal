import { describe, expect, it } from 'vitest';

import {
  MODES,
  REGISTRY_STATES,
  decidePublish,
  isFailure,
  isVersionConflict,
  publishArguments,
  registryStateFrom,
  renderOutcome,
} from '../scripts/publish-decision.mjs';

/**
 * The rail that replaced "a dispatch run is always a dry run".
 *
 * That sentence held because no input existed to make a dispatch publish. One
 * does now, so the property has to be asserted rather than stated, and this is
 * where it is asserted: `.github/workflows/release.yml` carries the same rail
 * as a condition, and `tests/workflows.test.ts` pins the string, but a YAML
 * expression is not something anybody can run.
 */

const absent = { state: 'absent', detail: 'the registry holds no such package yet.' };
const present = { state: 'present', detail: 'the registry answered 0.0.5 for 0.0.5.' };
const unreadable = { state: 'unreadable', detail: 'npm view exited 1 and said "E401".' };

describe('the tag-ref rail', () => {
  /**
   * Every ref shape a dispatch can name, against every input. `branch` is the
   * case the old rail covered and the one this must not lose: the input is
   * true, and the answer is still no.
   */
  const refs = ['branch', 'unknown', '', 'tags/v0.0.5', 'tag'];

  for (const refType of refs) {
    const wanted = refType === 'tag' ? 'publish' : 'refuse';
    it(`asked to publish from a ${refType || 'nameless'} ref, it answers ${wanted}`, () => {
      expect(decidePublish({ mode: 'publish', refType, registry: absent }).action).toBe(wanted);
    });
  }

  it('names the ref it refused, so the log says why', () => {
    expect(decidePublish({ mode: 'publish', refType: 'branch', registry: absent }).reason).toBe(
      'a real publish needs a tag ref, and this run is on a branch. No input makes a branch publishable. Dispatch against the tag instead.',
    );
  });

  it('rehearses from any ref, because a rehearsal uploads nothing', () => {
    for (const refType of refs) {
      expect(decidePublish({ mode: 'rehearse', refType, registry: absent }).action).toBe('rehearse');
    }
  });

  it('refuses a mode it does not know, rather than picking one', () => {
    // The runner's default is `rehearse`, so an unknown mode is a caller
    // error. Guessing would make a typo publish.
    expect(decidePublish({ mode: 'Publish', refType: 'tag', registry: absent })).toEqual({
      action: 'refuse',
      reason: '`--mode Publish` is not one of publish, rehearse.',
    });
    expect(decidePublish({ mode: undefined, refType: 'tag', registry: absent }).reason).toBe(
      '`--mode undefined` is not one of publish, rehearse.',
    );
  });

  it('refuses a registry state it does not know', () => {
    // A probe that returned something unexpected must not read as `absent`.
    expect(decidePublish({ mode: 'publish', refType: 'tag', registry: { state: 'maybe' } })).toEqual(
      { action: 'refuse', reason: '`maybe` is not one of present, absent, unreadable.' },
    );
  });

  it('offers exactly the two modes and the three states', () => {
    expect(MODES).toEqual(['publish', 'rehearse']);
    expect(REGISTRY_STATES).toEqual(['present', 'absent', 'unreadable']);
  });
});

describe('idempotency', () => {
  it('publishes a version the registry does not have', () => {
    expect(decidePublish({ mode: 'publish', refType: 'tag', registry: absent })).toEqual({
      action: 'publish',
      reason: absent.detail,
    });
  });

  it('reports a version the registry already has, and does not upload', () => {
    expect(decidePublish({ mode: 'publish', refType: 'tag', registry: present })).toEqual({
      action: 'already-published',
      reason: present.detail,
    });
  });

  it('attempts the upload when it could not read the registry', () => {
    // Not the same as absent, and not a reason to stop: the conflict handler
    // below turns a real collision into the already-published outcome.
    expect(decidePublish({ mode: 'publish', refType: 'tag', registry: unreadable })).toEqual({
      action: 'publish',
      reason: unreadable.detail,
    });
  });

  it('carries an empty reason when the probe gave no detail', () => {
    for (const state of REGISTRY_STATES) {
      expect(decidePublish({ mode: 'publish', refType: 'tag', registry: { state } }).reason).toBe(
        '',
      );
      expect(decidePublish({ mode: 'rehearse', refType: 'tag', registry: { state } }).reason).toBe(
        '',
      );
    }
  });

  it('passes the probe detail through a rehearsal', () => {
    expect(decidePublish({ mode: 'rehearse', refType: 'tag', registry: present }).reason).toBe(
      present.detail,
    );
  });
});

describe('what npm view answered', () => {
  it('reads the version back as present', () => {
    expect(registryStateFrom({ code: 0, stdout: '0.0.5\n', version: '0.0.5' })).toEqual({
      state: 'present',
      detail: 'the registry answered 0.0.5 for 0.0.5.',
    });
  });

  it('reads an empty success as absent, which is what npm says for a missing version', () => {
    // `npm view name@1.2.3 version` exits 0 and prints nothing when the
    // package exists and that version does not. Silence is the answer.
    expect(registryStateFrom({ code: 0, stdout: '\n', version: '0.0.5' })).toEqual({
      state: 'absent',
      detail: 'the registry holds the package and no 0.0.5.',
    });
  });

  it('reads E404 as absent, which is what npm says for a missing package', () => {
    expect(
      registryStateFrom({ code: 1, stderr: 'npm error code E404\n', version: '0.0.5' }),
    ).toEqual({ state: 'absent', detail: 'the registry holds no such package yet.' });
  });

  it('reads anything else as unreadable rather than as absent', () => {
    // A 401 that read as absent would send the run into an upload it cannot
    // make, and the failure would name authentication instead of the probe.
    expect(
      registryStateFrom({ code: 1, stderr: 'npm error code E401\n', version: '0.0.5' }),
    ).toEqual({
      state: 'unreadable',
      detail: 'npm view exited 1 and said "npm error code E401".',
    });
  });

  it('reads a wrong version as unreadable', () => {
    expect(registryStateFrom({ code: 0, stdout: '0.0.4', version: '0.0.5' })).toEqual({
      state: 'unreadable',
      detail: 'npm view exited 0 and said "0.0.4".',
    });
  });

  /**
   * The exit code is half of every arm, and each of these is the half that a
   * guard reading only the text would get wrong.
   */
  it('does not read a failed call as present, however familiar its output', () => {
    expect(
      registryStateFrom({ code: 1, stdout: '0.0.5\n', stderr: 'E401', version: '0.0.5' }),
    ).toEqual({ state: 'unreadable', detail: 'npm view exited 1 and said "E401".' });
  });

  it('does not read a successful call as absent because E404 is in its noise', () => {
    expect(
      registryStateFrom({ code: 0, stdout: '0.0.4', stderr: 'E404 for something else', version: '0.0.5' }),
    ).toEqual({ state: 'unreadable', detail: 'npm view exited 0 and said "E404 for something else".' });
  });

  it('survives npm answering nothing at all', () => {
    expect(registryStateFrom({ code: 1, version: '0.0.5' })).toEqual({
      state: 'unreadable',
      detail: 'npm view exited 1 and said "".',
    });
  });
});

describe('the conflict npm reports', () => {
  const conflicts = [
    'npm error code EPUBLISHCONFLICT',
    'npm error code E409',
    'npm error 409 Conflict - PUT https://npm.pkg.github.com/@stuffbucket%2fmaximal-electron',
    'You cannot publish over the previously published versions: 0.0.5.',
  ];

  for (const text of conflicts) {
    it(`recognises ${text.slice(0, 32)}`, () => {
      expect(isVersionConflict(text)).toBe(true);
    });
  }

  it('matches whatever case npm chose', () => {
    expect(isVersionConflict('npm error code epublishconflict')).toBe(true);
  });

  it('does not read an unrelated failure as a conflict', () => {
    // A 401 reported as "already published" is the silent pass this whole
    // change exists to prevent.
    expect(isVersionConflict('npm error code E401 Unable to authenticate')).toBe(false);
    expect(isVersionConflict('')).toBe(false);
    expect(isVersionConflict(undefined)).toBe(false);
    expect(isVersionConflict(null)).toBe(false);
  });
});

describe('the outcome line', () => {
  const at = { name: '@stuffbucket/maximal-electron', version: '0.0.5', registry: 'https://r' };

  /**
   * The two successes a reader has to tell apart. An operation that did
   * nothing must not read like one that did something, so each line says what
   * this run uploaded rather than what the registry now contains.
   */
  it('says a publish uploaded it', () => {
    expect(renderOutcome({ ...at, action: 'publish' })).toBe(
      'PUBLISHED  @stuffbucket/maximal-electron@0.0.5 at https://r: this run uploaded it.',
    );
  });

  it('says an already-published run uploaded nothing', () => {
    expect(renderOutcome({ ...at, action: 'already-published' })).toBe(
      'ALREADY PUBLISHED  @stuffbucket/maximal-electron@0.0.5 at https://r: this run uploaded nothing.',
    );
  });

  it('says a rehearsal reached no registry', () => {
    expect(renderOutcome({ ...at, action: 'rehearse' })).toBe(
      'REHEARSED  @stuffbucket/maximal-electron@0.0.5 at https://r: nothing was uploaded to any registry.',
    );
  });

  it('appends the reason when there is one', () => {
    expect(renderOutcome({ ...at, action: 'refuse', reason: 'a branch is not a tag.' })).toBe(
      'REFUSED  @stuffbucket/maximal-electron@0.0.5 at https://r: nothing was uploaded to any registry. a branch is not a tag.',
    );
  });

  it('appends nothing for an empty reason', () => {
    expect(renderOutcome({ ...at, action: 'publish', reason: '' })).toBe(
      renderOutcome({ ...at, action: 'publish' }),
    );
  });

  it('throws rather than printing a line for an action it has no words for', () => {
    expect(() => renderOutcome({ ...at, action: 'shipped' })).toThrow(
      'no outcome line for action `shipped`',
    );
  });

  it('fails the run for a refusal and for nothing else', () => {
    expect(isFailure('refuse')).toBe(true);
    for (const action of ['publish', 'already-published', 'rehearse']) {
      expect(isFailure(action)).toBe(false);
    }
  });
});

describe('the argument npm gets', () => {
  const registry = 'https://npm.pkg.github.com';

  it('publishes an absolute path', () => {
    expect(publishArguments({ file: '/w/dist-release/a.tgz', registry, dryRun: false })).toEqual([
      'publish',
      '/w/dist-release/a.tgz',
      '--registry',
      registry,
    ]);
  });

  it('adds --dry-run for a rehearsal', () => {
    expect(publishArguments({ file: '/w/a.tgz', registry, dryRun: true })).toEqual([
      'publish',
      '/w/a.tgz',
      '--registry',
      registry,
      '--dry-run',
    ]);
  });

  /**
   * npm reads a bare `a/b` as an `owner/repo` git shorthand and clones it over
   * SSH. The first rehearsal of `publish-package` failed exactly that way, on
   * the path to the tarball it had just downloaded.
   */
  it('refuses a relative path, which npm would clone over SSH', () => {
    expect(() => publishArguments({ file: 'dist-release/a.tgz', registry, dryRun: false })).toThrow(
      'npm publish needs an absolute path, and got `dist-release/a.tgz`. A bare a/b argument is an owner/repo git shorthand, which npm clones over SSH.',
    );
    expect(() => publishArguments({ file: './a.tgz', registry, dryRun: false })).toThrow(
      /absolute path/,
    );
    expect(() => publishArguments({ file: undefined, registry, dryRun: false })).toThrow(
      /absolute path/,
    );
  });
});
