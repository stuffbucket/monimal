import { describe, expect, it } from 'vitest';

import {
  DEFERRED,
  mutationScope,
  usesParentPort,
  valueImports,
} from '../scripts/mutation-scope.mjs';

/**
 * The criterion that replaces the hand-maintained mutate list.
 *
 * #102 records the failure it exists to stop: two modules landed with fixture
 * tests and no mutation coverage while the headline stayed 100.00, because
 * nobody remembered to name them in `stryker.conf.json`. The criterion has to
 * be exact in both directions. Too narrow and the same thing happens again;
 * too wide and it selects a module Stryker cannot run at all, which makes the
 * check unlandable rather than merely wrong.
 */

describe('valueImports', () => {
  it('finds a plain import', () => {
    expect(valueImports("import { app } from 'electron';", 'a.ts')).toEqual([
      'electron',
    ]);
  });

  it('finds a side-effect import that binds nothing', () => {
    expect(valueImports("import 'electron';", 'a.ts')).toEqual(['electron']);
  });

  it('finds a re-export, because it loads the module', () => {
    expect(valueImports("export { app } from 'electron';", 'a.ts')).toEqual([
      'electron',
    ]);
  });

  it('finds a dynamic import', () => {
    expect(valueImports("await import('electron');", 'a.ts')).toEqual([
      'electron',
    ]);
  });

  it('finds a require', () => {
    expect(valueImports("const e = require('electron');", 'a.ts')).toEqual([
      'electron',
    ]);
  });

  it('ignores a type-only import, which TypeScript erases', () => {
    expect(
      valueImports("import type { BrowserWindow } from 'electron';", 'a.ts'),
    ).toEqual([]);
  });

  it('ignores a type-only re-export', () => {
    expect(
      valueImports("export type { BrowserWindow } from 'electron';", 'a.ts'),
    ).toEqual([]);
  });

  it('keeps a mixed import, because the value half still loads it', () => {
    expect(
      valueImports("import { app, type BrowserWindow } from 'electron';", 'a.ts'),
    ).toEqual(['electron']);
  });

  it('ignores a specifier inside a comment or a string', () => {
    expect(
      valueImports("const name = 'electron'; // import 'electron'", 'a.ts'),
    ).toEqual([]);
  });

  it('finds every specifier in declaration order', () => {
    const source = ["import 'a';", "import 'b';", "import 'c';"].join('\n');
    expect(valueImports(source, 'a.ts')).toEqual(['a', 'b', 'c']);
  });
});

describe('usesParentPort', () => {
  /**
   * A utility process entry needs an Electron runtime as much as a main
   * process module does, and the criterion cannot see it through imports: the
   * binding arrives on the global `process`. Issue #133.
   */
  it('finds the binding a utility process entry reads', () => {
    expect(usesParentPort('process.parentPort.postMessage(1);', 'a.ts')).toBe(true);
    expect(usesParentPort("process.parentPort.on('message', f);", 'a.ts')).toBe(true);
  });

  it('is false for a file that never touches it', () => {
    expect(usesParentPort('process.exit(0);', 'a.ts')).toBe(false);
    expect(usesParentPort('const parentPort = 1;', 'a.ts')).toBe(false);
    expect(usesParentPort('other.parentPort.postMessage(1);', 'a.ts')).toBe(false);
    expect(usesParentPort("const s = 'process.parentPort';", 'a.ts')).toBe(false);
  });
});

describe('mutationScope', () => {
  const scope = mutationScope();

  it('examines the repository rather than an empty set', () => {
    expect(scope.scanned.length).toBeGreaterThan(50);
  });

  it('selects a set that is neither empty nor everything', () => {
    expect(scope.eligible.length).toBeGreaterThan(0);
    expect(scope.eligible.length).toBeLessThan(scope.scanned.length);
  });

  it('selects every module already on the mutate list', () => {
    for (const file of scope.mutated) expect(scope.eligible).toContain(file);
  });

  it('selects a module whose only electron import is a type', () => {
    // `main-options.ts` names `BrowserWindow` as a type and is mutated today.
    expect(scope.eligible).toContain('src/host/main-options.ts');
  });

  it('rejects a module that imports electron for a value', () => {
    expect(scope.eligible).not.toContain('src/main/index.ts');
  });

  it('rejects a React component', () => {
    expect(scope.eligible).not.toContain('src/renderer/App.tsx');
  });

  it('rejects a utility process entry', () => {
    const worker = scope.outOfScope.find(
      (entry) => entry.file === 'src/main/llama-worker.ts',
    );
    expect(worker?.reason).toBe('utilityProcess');
  });

  it('rejects a module that reaches electron through another module', () => {
    const indirect = scope.outOfScope.find(
      (entry) => entry.file === 'src/main/windows/main-window.ts',
    );
    expect(indirect?.reason).toContain('electron');
  });

  it('would have caught the two modules #102 names', () => {
    // Both shipped with fixture tests and no mutation coverage.
    expect([...scope.eligible, ...scope.mutated]).toContain(
      'scripts/css-selectors.mjs',
    );
    expect([...scope.eligible, ...scope.mutated]).toContain(
      'scripts/neutrality.mjs',
    );
  });

  it('accounts for every module it selects', () => {
    expect(scope.unaccounted).toEqual([]);
  });

  it('names no module that has been deleted or renamed', () => {
    expect(scope.missing).toEqual([]);
  });

  it('holds no deferral that has stopped applying', () => {
    expect(scope.staleDeferrals).toEqual([]);
  });

  it('gives every deferral an issue number', () => {
    for (const [file, issue] of DEFERRED) {
      expect(issue, file).toBeGreaterThan(0);
    }
  });
});
