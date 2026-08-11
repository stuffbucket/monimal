import { describe, expect, it } from 'vitest';

import {
  importSpecifiers,
  packageSubpath,
  reachesOutside,
  SOURCE_EXTENSIONS,
} from '../scripts/fixture-imports.mjs';

/**
 * The parser behind `npm run verify:fixture-imports`.
 *
 * The check's own scope is the specifiers it extracts, so an extractor that
 * misses a form reports a clean run over an import it never saw. That is the
 * empty-scope defect one level up, and it is the half a scope count cannot
 * catch, so the forms are enumerated here rather than trusted.
 */

const ROOT = '/repo/e2e/fixtures/demo-shell';

describe('importSpecifiers', () => {
  it('reads every form a module states an import in', () => {
    const source = [
      "import { Card } from '@stuffbucket/maximal-electron/renderer';",
      "import './demo.css';",
      "import type { Tab } from './views.js';",
      "export { RUNS } from './runs.js';",
      "const late = await import('./late.js');",
      "const cjs = require('./cjs.js');",
    ].join('\n');

    expect(importSpecifiers(source, '.tsx').map((found) => found.specifier)).toEqual([
      '@stuffbucket/maximal-electron/renderer',
      './demo.css',
      './views.js',
      './runs.js',
      './late.js',
      './cjs.js',
    ]);
  });

  it('names the line, because the message has to point somewhere', () => {
    const source = "const a = 1;\n\nimport '../../../src/renderer/styles/shell.css';";
    expect(importSpecifiers(source, '.ts')).toEqual([
      { specifier: '../../../src/renderer/styles/shell.css', line: 3 },
    ]);
  });

  it('reads a stylesheet, where an import is not an import statement', () => {
    const css = "@import './tokens.css';\n.a { background: url('./bg.png'); }";
    expect(importSpecifiers(css, '.css').map((found) => found.specifier)).toEqual([
      './tokens.css',
      './bg.png',
    ]);
  });

  it('reads a stylesheet written loosely', () => {
    // Every form CSS allows around the same specifier. Each of these was a
    // surviving mutant of the pattern before it was a test. `@import url(…)`
    // is read by the `url()` pattern rather than by the `@import` one, so it
    // is counted once.
    const css = [
      "@import  './spaced.css';",
      "@import url('./wrapped.css');",
      ".a { background: url( './padded.png' ); }",
      '.b { background: url(./bare.png); }',
    ].join('\n');
    expect(importSpecifiers(css, '.css').map((found) => found.specifier)).toEqual([
      './spaced.css',
      './wrapped.css',
      './padded.png',
      './bare.png',
    ]);
  });

  it('reads the document, where a module is a src attribute', () => {
    const html = '<script type="module" src="./main.tsx"></script>';
    expect(importSpecifiers(html, '.html').map((found) => found.specifier)).toEqual([
      './main.tsx',
    ]);
  });

  it('reads an attribute with space around the equals', () => {
    const html = '<script src = "./left.tsx"></script>\n<link href= "./right.css">';
    expect(importSpecifiers(html, '.html').map((found) => found.specifier)).toEqual([
      './left.tsx',
      './right.css',
    ]);
  });

  it('reads a dynamic import with space inside the call', () => {
    expect(
      importSpecifiers("const late = await import( './late.js' );", '.ts').map(
        (found) => found.specifier,
      ),
    ).toEqual(['./late.js']);
  });

  it('reads a comment too, rather than risk missing a line of code', () => {
    // Stripping comments means stripping `//` to end of line, which eats the
    // tail of any line holding a URL. An over-report names a line a person can
    // read; an under-report is the whole defect.
    const source = "// import { x } from '../../../src/x.js';";
    expect(importSpecifiers(source, '.ts').map((found) => found.specifier)).toEqual([
      '../../../src/x.js',
    ]);
  });

  it('covers the extensions the fixture is written in', () => {
    // The whole list, not a membership test: an extension quietly dropped from
    // it takes every file with that extension out of the scan, and the count
    // the check prints goes down without anything else changing.
    expect(SOURCE_EXTENSIONS).toEqual([
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.mts',
      '.css',
      '.html',
    ]);
  });
});

describe('reachesOutside', () => {
  it('passes a sibling and the package by name', () => {
    for (const specifier of [
      './views.js',
      './nested/thing.js',
      '@stuffbucket/maximal-electron/renderer',
      'react',
      'lucide-react',
    ]) {
      expect(reachesOutside(specifier, { fromDir: ROOT, root: ROOT })).toBeUndefined();
    }
  });

  it('fails the path this check exists for', () => {
    expect(
      reachesOutside('../../../src/renderer/components/ShellLayout.js', {
        fromDir: ROOT,
        root: ROOT,
      }),
    ).toMatch(/src\//);
  });

  it('fails an escape that never says src', () => {
    // The resolver arm rather than the name arm. A rename of `src/` would slip
    // straight past a check that only looked for the word.
    expect(reachesOutside('../../harness.js', { fromDir: ROOT, root: ROOT })).toBe(
      'resolves outside the fixture directory',
    );
  });

  it('fails a src path that no resolver would see', () => {
    // The name arm rather than the resolver arm: an alias resolves nowhere on
    // disk, a root-relative path resolves against the server root, and a bare
    // one resolves inside the fixture.
    expect(reachesOutside('@/src/renderer/index.js', { fromDir: ROOT, root: ROOT })).toMatch(
      /src\//,
    );
    expect(reachesOutside('/src/renderer/index.js', { fromDir: ROOT, root: ROOT })).toMatch(
      /src\//,
    );
    expect(reachesOutside('src/renderer/index.js', { fromDir: ROOT, root: ROOT })).toMatch(
      /src\//,
    );
  });

  it('leaves a path it was never asked to resolve alone', () => {
    // Only a relative specifier is resolved. A root-relative one is the
    // server's business, and resolving it would report every one of them as an
    // escape.
    expect(reachesOutside('/vendor/app.js', { fromDir: ROOT, root: ROOT })).toBeUndefined();
  });

  it('passes the fixture directory itself', () => {
    expect(reachesOutside('.', { fromDir: ROOT, root: ROOT })).toBeUndefined();
  });

  it('does not mistake a directory that ends in src', () => {
    expect(reachesOutside('./websrc/thing.js', { fromDir: ROOT, root: ROOT })).toBeUndefined();
  });

  it('does not mistake a sibling directory with the fixture as a prefix', () => {
    expect(
      reachesOutside('../demo-shell-old/thing.js', { fromDir: ROOT, root: ROOT }),
    ).toBe('resolves outside the fixture directory');
  });
});

describe('packageSubpath', () => {
  const NAME = '@stuffbucket/maximal-electron';

  it('returns the subpath an import names', () => {
    expect(packageSubpath(`${NAME}/renderer`, NAME)).toBe('./renderer');
    expect(packageSubpath(`${NAME}/renderer/styles.css`, NAME)).toBe('./renderer/styles.css');
  });

  it('calls the bare name the root subpath, which this package does not export', () => {
    expect(packageSubpath(NAME, NAME)).toBe('.');
  });

  it('ignores anything else', () => {
    expect(packageSubpath('react', NAME)).toBeUndefined();
    expect(packageSubpath('./views.js', NAME)).toBeUndefined();
    // A package whose name starts with ours is a different package.
    expect(packageSubpath(`${NAME}-extra/renderer`, NAME)).toBeUndefined();
  });
});
