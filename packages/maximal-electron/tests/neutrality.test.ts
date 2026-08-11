import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FORBIDDEN_TERMS,
  forbiddenImports,
  forbiddenTerms,
  isForbiddenPackage,
  moduleSpecifiers,
  termMatches,
} from '../scripts/neutrality.mjs';

/**
 * The guard that keeps this shell agnostic about the application it hosts.
 *
 * Fixtures on both sides, as issue #16 asks. The positives are the laundering
 * forms — `require.resolve`, `createRequire`, an aliased `createRequire`, a
 * type-position import — because a guard that only reads `import` statements
 * is a guard anybody can walk around. The non-violations are here because a
 * check that fails on everything gets turned off.
 */

const specifiers = (source: string): (string | undefined)[] =>
  forbiddenImports(source, 'fixture.ts').map((found) => found.text);

describe('reaching a forbidden package', () => {
  it('catches a plain import, a re-export, and a type-only import', () => {
    expect(specifiers("import 'maximal';")).toEqual(['maximal']);
    expect(specifiers("export { a } from 'maximal-core';")).toEqual(['maximal-core']);
    expect(specifiers("import type { A } from '@stuffbucket/maximal-core';")).toEqual([
      '@stuffbucket/maximal-core',
    ]);
    expect(specifiers("type A = import('maximal-core').B;")).toEqual(['maximal-core']);
  });

  it('catches a dynamic import and an import-equals', () => {
    expect(specifiers("const a = await import('maximal/client');")).toEqual(['maximal/client']);
    expect(specifiers("import a = require('maximal');")).toEqual(['maximal']);
  });

  it('catches require and require.resolve', () => {
    expect(specifiers("const a = require('maximal');")).toEqual(['maximal']);
    expect(specifiers("const a = require.resolve('maximal-core');")).toEqual(['maximal-core']);
  });

  it('catches createRequire, assigned or called in place', () => {
    const assigned = `
      import { createRequire } from 'node:module';
      const load = createRequire(import.meta.url);
      load('@stuffbucket/maximal-core');
    `;
    expect(specifiers(assigned)).toEqual(['@stuffbucket/maximal-core']);
    expect(
      specifiers("import { createRequire } from 'node:module';\ncreateRequire(x)('maximal');"),
    ).toEqual(['maximal']);
    expect(
      specifiers(
        "import { createRequire } from 'node:module';\ncreateRequire(x).resolve('maximal');",
      ),
    ).toEqual(['maximal']);
  });

  it('catches createRequire under an alias', () => {
    const aliased = `
      import { createRequire as make } from 'node:module';
      const load = make(import.meta.url);
      load.resolve('maximal');
    `;
    expect(specifiers(aliased)).toEqual(['maximal']);
  });

  it('catches import.meta.resolve', () => {
    expect(specifiers("await import.meta.resolve('maximal');")).toEqual(['maximal']);
  });

  it('reports the line and the syntax that named it', () => {
    const found = forbiddenImports("const a = 1;\nrequire.resolve('maximal');", 'fixture.ts');
    expect(found).toEqual([{ text: 'maximal', line: 2, form: 'require.resolve' }]);
  });
});

describe('what is not a forbidden import', () => {
  it('leaves every real dependency of this shell alone', () => {
    const real = `
      import { BrowserWindow } from 'electron';
      import path from 'node:path';
      import { TabBar } from './components/TabBar.js';
      const pty = require('node-pty');
    `;
    expect(specifiers(real)).toEqual([]);
  });

  it('does not match a package that merely starts with a forbidden name', () => {
    expect(isForbiddenPackage('maximalist')).toBe(false);
    expect(isForbiddenPackage('maximal-core-types')).toBe(false);
    expect(isForbiddenPackage('@stuffbucket/maximal-core-contract')).toBe(false);
  });

  it('does match a subpath of a forbidden package', () => {
    expect(isForbiddenPackage('maximal/client')).toBe(true);
    expect(isForbiddenPackage('@stuffbucket/maximal-core/control')).toBe(true);
  });

  it('still reads a specifier it cannot judge, rather than dropping it', () => {
    // `verify-neutral.mjs` fails on this. A computed specifier is the one
    // shape the parse cannot decide, so it must never leave silently.
    const found = moduleSpecifiers('const a = require(name);', 'fixture.ts');
    expect(found).toEqual([{ text: undefined, line: 1, form: 'require' }]);
  });

  it('reads the specifiers of a file with no violation at all', () => {
    // The floor. A collector that returned nothing would report every source
    // in this repository as clean.
    const found = moduleSpecifiers("import 'electron';\nimport './a.js';", 'fixture.ts');
    expect(found.map((one) => one.text)).toEqual(['electron', './a.js']);
  });
});

describe('the forbidden term list', () => {
  it('defaults to the three terms the issue names', () => {
    expect(forbiddenTerms({})).toEqual(['maximal', 'maximal-core', 'copilot']);
    expect(DEFAULT_FORBIDDEN_TERMS).toEqual(['maximal', 'maximal-core', 'copilot']);
  });

  it('takes a comma-separated list from the environment', () => {
    expect(forbiddenTerms({ FORBIDDEN_TERMS: 'alpha, beta' })).toEqual(['alpha', 'beta']);
  });

  it('yields nothing for an empty override, which the guard treats as an error', () => {
    expect(forbiddenTerms({ FORBIDDEN_TERMS: '' })).toEqual([]);
    expect(forbiddenTerms({ FORBIDDEN_TERMS: ' , ' })).toEqual([]);
  });
});

describe('scanning prose and code for a forbidden term', () => {
  const terms = DEFAULT_FORBIDDEN_TERMS;
  const found = (text: string): string[] => termMatches(text, terms).map((match) => match.term);

  it('matches a bare term in prose', () => {
    expect(found('Discovery finds maximal on localhost.')).toEqual(['maximal']);
  });

  it('matches across case and across the separators a constant uses', () => {
    // `\b` does not treat `_` as a boundary, so `\bmaximal\b` misses the one
    // constant issue #16 was filed about.
    expect(found("const MAXIMAL_BASE = 'http://localhost:4141';")).toEqual(['maximal']);
    expect(found('COPILOT_API_HOME')).toEqual(['copilot']);
    expect(found("id: 'copilot-cli'")).toEqual(['copilot']);
  });

  it('matches a term inside a string literal', () => {
    expect(found("export type P = 'maximal' | 'ollama';")).toEqual(['maximal']);
  });

  it('reports the line and the whole line', () => {
    expect(termMatches('clean\nconst a = 1; // maximal\n', ['maximal'])).toEqual([
      { term: 'maximal', line: 2, excerpt: 'const a = 1; // maximal' },
    ]);
  });

  it('exempts a term inside an owner-qualified repository slug', () => {
    // This repository is called maximal-electron. Its own Help-menu URL is
    // the reason this rule exists, and it is the only exemption.
    expect(found("const REPO = 'https://github.com/stuffbucket/maximal-electron';")).toEqual([]);
    expect(found('modeled on `stuffbucket/maximal`’s splash.html')).toEqual([]);
  });

  it('does not exempt a bare term on a line that also carries a slug', () => {
    expect(found('stuffbucket/maximal-electron, and maximal itself')).toEqual(['maximal']);
  });

  it('does not exempt an npm scope, which a string can name', () => {
    // The `@` is the difference. Without it the exemption covered
    // `@stuffbucket/maximal-core` sitting in a string literal, which is the
    // specifier this guard exists to find.
    expect(found("const p = '@stuffbucket/maximal-core';")).toEqual([
      'maximal',
      'maximal-core',
    ]);
  });

  it('does not match a longer word that contains a term', () => {
    expect(found('a maximally wide layout')).toEqual([]);
    expect(found('maximalist')).toEqual([]);
    expect(found('copilots')).toEqual([]);
  });

  it('matches nothing in a file that names none of them', () => {
    expect(found('import { BrowserWindow } from "electron";')).toEqual([]);
  });

  it('matches nothing when the term list is empty', () => {
    // Which is why `verify-neutral.mjs` fails on an empty list rather than
    // reporting a clean tree.
    expect(termMatches('maximal everywhere', [])).toEqual([]);
  });
});

/**
 * A package's own name is not a foreign name.
 *
 * `@stuffbucket/maximal-electron` is an npm scope, so the slug rule above
 * deliberately does not cover it, and must not: exempting that shape
 * wholesale is what let `@stuffbucket/maximal-core` sit in a string literal
 * unreported. So the exemption is the exact string, and these are the tests
 * that say it stayed that narrow.
 */
describe('the self-name exemption', () => {
  const terms = DEFAULT_FORBIDDEN_TERMS;
  const self = ['@stuffbucket/maximal-electron', 'stuffbucket-maximal-electron'];
  const found = (text: string): string[] =>
    termMatches(text, terms, self).map((match) => match.term);

  it('exempts the package specifier a consumer imports', () => {
    expect(found("import { createHostWindow } from '@stuffbucket/maximal-electron/host';")).toEqual(
      [],
    );
  });

  it('exempts the flattened name npm writes as a release asset', () => {
    expect(found('stuffbucket-maximal-electron-0.0.5.tgz')).toEqual([]);
  });

  it('still reports the sibling npm scope', () => {
    expect(found("const p = '@stuffbucket/maximal-core';")).toEqual(['maximal', 'maximal-core']);
  });

  it('still reports the sibling in the same flattened shape', () => {
    expect(found('stuffbucket-maximal-core-0.0.5.tgz')).toEqual(['maximal', 'maximal-core']);
  });

  it('still reports a bare term beside the exempt name', () => {
    expect(found('@stuffbucket/maximal-electron, and maximal itself')).toEqual(['maximal']);
  });

  it('exempts nothing when no name is passed', () => {
    expect(termMatches("'@stuffbucket/maximal-electron'", terms).map((m) => m.term)).toEqual([
      'maximal',
    ]);
  });
});
