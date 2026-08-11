import { describe, expect, it } from 'vitest';

import { summarize } from '../scripts/mutation-report.mjs';

/**
 * What the score does not say.
 *
 * Stryker prints a percentage over a denominator it chooses. A mutant that
 * crashes the runner is scored `RuntimeError` and leaves that denominator, a
 * mutant nothing imports is scored `NoCoverage`, and a file that drops off the
 * mutate list produces no mutants at all. The report still reads 100.00 in all
 * three cases, so `summarize` counts the shapes rather than the score.
 *
 * #116 asked how many kills are assertion kills. This is the function that
 * answers it on every run rather than once.
 */

function report(mutants: unknown[], tests: string[] = ['t1']) {
  return {
    files: {
      'src/example.ts': {
        mutants: mutants.map((mutant, index) => ({
          id: String(index),
          mutatorName: 'ConditionalExpression',
          location: { start: { line: index + 1, column: 1 } },
          ...(mutant as object),
        })),
      },
    },
    testFiles: {
      'tests/example.test.ts': {
        tests: tests.map((id) => ({ id, name: `test ${id}` })),
      },
    },
  };
}

describe('summarize', () => {
  it('counts a kill that names a test that reported', () => {
    const scope = summarize(report([{ status: 'Killed', killedBy: ['t1'] }]));
    expect(scope.total).toBe(1);
    expect(scope.unattributed).toEqual([]);
    expect(scope.dangling).toEqual([]);
    expect([...scope.killers]).toEqual(['t1']);
  });

  it('reports a kill with no killing test', () => {
    // The shape #116 looks for: the run failed, but nothing asserted anything.
    const scope = summarize(report([{ status: 'Killed', killedBy: [] }]));
    expect(scope.unattributed).toHaveLength(1);
    expect(scope.unattributed[0]).toContain('src/example.ts:1');
  });

  it('reports a kill whose killedBy field is absent entirely', () => {
    const scope = summarize(report([{ status: 'Killed' }]));
    expect(scope.unattributed).toHaveLength(1);
  });

  it('reports a kill by a test the run never reported', () => {
    const scope = summarize(report([{ status: 'Killed', killedBy: ['ghost'] }]));
    expect(scope.dangling).toHaveLength(1);
    expect(scope.dangling[0]).toContain('ghost');
    expect(scope.killers.size).toBe(0);
  });

  it('separates a dangling citation from a real one on the same mutant', () => {
    const scope = summarize(
      report([{ status: 'Killed', killedBy: ['t1', 'ghost'] }]),
    );
    expect(scope.dangling).toHaveLength(1);
    expect([...scope.killers]).toEqual(['t1']);
  });

  it('counts a runtime error separately from a kill', () => {
    const scope = summarize(
      report([
        { status: 'Killed', killedBy: ['t1'] },
        { status: 'RuntimeError' },
      ]),
    );
    expect(scope.statuses.get('Killed')).toBe(1);
    expect(scope.statuses.get('RuntimeError')).toBe(1);
    // A RuntimeError has no killing test and must not read as one.
    expect(scope.unattributed).toEqual([]);
  });

  it('counts every status it is given', () => {
    const scope = summarize(
      report([
        { status: 'Killed', killedBy: ['t1'] },
        { status: 'Survived' },
        { status: 'Timeout' },
        { status: 'NoCoverage' },
        { status: 'Ignored' },
      ]),
    );
    expect(scope.total).toBe(5);
    expect(Object.fromEntries(scope.statuses)).toEqual({
      Killed: 1,
      Survived: 1,
      Timeout: 1,
      NoCoverage: 1,
      Ignored: 1,
    });
  });

  it('counts one mutant per file, so a file that produced none is visible', () => {
    const scope = summarize(report([{ status: 'Killed', killedBy: ['t1'] }]));
    expect(scope.perFile.get('src/example.ts')).toBe(1);
  });

  it('counts a distinct killer once however many mutants it killed', () => {
    const scope = summarize(
      report([
        { status: 'Killed', killedBy: ['t1'] },
        { status: 'Killed', killedBy: ['t1'] },
      ]),
    );
    expect(scope.killers.size).toBe(1);
  });

  it('reports an empty run as empty rather than as clean', () => {
    const scope = summarize({ files: {}, testFiles: {} });
    expect(scope.total).toBe(0);
    expect(scope.knownTests).toBe(0);
  });
});
