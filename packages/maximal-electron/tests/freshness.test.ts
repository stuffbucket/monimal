import { mkdtempSync, mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { newestMtime } from '../e2e/freshness.js';

/**
 * The build-freshness walk.
 *
 * `npm run test:e2e` builds nothing, so the suite drives whatever is in
 * `.vite`. A renderer change was once tested against the previous day's
 * bundle: the one assertion that matched the old behaviour passed, and the run
 * was read as evidence the change worked. `e2e/global-setup.ts` now refuses to
 * start in that state, and this is the comparison it depends on.
 */

const roots: string[] = [];

function tree(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'freshness-'));
  roots.push(root);
  return root;
}

/** Write a file with an explicit modification time, in seconds since epoch. */
function file(root: string, relative: string, seconds: number): string {
  const full = path.join(root, relative);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, 'x');
  utimesSync(full, seconds, seconds);
  return full;
}

afterEach(() => {
  roots.length = 0;
});

describe('newestMtime', () => {
  it('returns undefined for a directory that does not exist', () => {
    expect(newestMtime(path.join(tmpdir(), 'freshness-absent-directory'))).toBeUndefined();
  });

  it('returns undefined for an empty directory', () => {
    expect(newestMtime(tree())).toBeUndefined();
  });

  it('reports the newest file, not the first or the last', () => {
    const root = tree();
    file(root, 'a.ts', 1000);
    file(root, 'b.ts', 3000);
    file(root, 'c.ts', 2000);

    expect(newestMtime(root)).toBe(3000 * 1000);
  });

  it('descends into subdirectories', () => {
    // The case that matters. Almost everything in src/ is nested, so a walk
    // that only read the top level would report the tree as older than it is
    // and let a stale bundle through.
    const root = tree();
    file(root, 'top.ts', 1000);
    file(root, 'renderer/components/deep.tsx', 5000);

    expect(newestMtime(root)).toBe(5000 * 1000);
  });

  it('finds the newest file at any depth', () => {
    const root = tree();
    file(root, 'one/two/three/four/deep.ts', 7000);
    file(root, 'shallow.ts', 2000);

    expect(newestMtime(root)).toBe(7000 * 1000);
  });

  it('ignores directory timestamps', () => {
    // A directory's own mtime changes when its contents are listed or written
    // on some systems. Counting it would report phantom staleness.
    const root = tree();
    file(root, 'nested/old.ts', 1000);
    utimesSync(path.join(root, 'nested'), 9000, 9000);

    expect(newestMtime(root)).toBe(1000 * 1000);
  });
});
