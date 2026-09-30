import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FORBIDDEN_TERMS,
  deniedPackages,
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

/** A denied set in the shape `deniedPackages` derives from the tree. */
const DENIED = ['maximal', '@maximal/maximal-client', 'maximal-core', '@maximal/maximal-core'];

const specifiers = (source: string): (string | undefined)[] =>
  forbiddenImports(source, 'fixture.ts', DENIED).map((found) => found.text);

describe('reaching a forbidden package', () => {
  it('catches a plain import, a re-export, and a type-only import', () => {
    expect(specifiers("import 'maximal';")).toEqual(['maximal']);
    expect(specifiers("export { a } from 'maximal-core';")).toEqual(['maximal-core']);
    expect(specifiers("import type { A } from '@maximal/maximal-core';")).toEqual([
      '@maximal/maximal-core',
    ]);
    expect(specifiers("type A = import('maximal-core').B;")).toEqual(['maximal-core']);
  });

  it('catches a dynamic import and an import-equals', () => {
    expect(specifiers("const a = await import('@maximal/maximal-client');")).toEqual(['@maximal/maximal-client']);
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
      load('@maximal/maximal-core');
    `;
    expect(specifiers(assigned)).toEqual(['@maximal/maximal-core']);
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
    const found = forbiddenImports("const a = 1;\nrequire.resolve('maximal');", 'fixture.ts', DENIED);
    expect(found).toEqual([{ text: 'maximal', line: 2, form: 'require.resolve' }]);
  });
});

describe('the denied set, from the declared tree', () => {
  const policy = {
    packages: {
      shell: { dependsOn: ['terminal'] },
      terminal: { dependsOn: [] },
      client: { dependsOn: ['shell'] },
      core: {},
    },
  };

  it('denies every declared package outside the tree of self', () => {
    expect(deniedPackages(policy, 'shell')).toEqual(['client', 'core']);
  });

  it('allows a sibling by being listed, whatever it is called', () => {
    expect(deniedPackages(policy, 'client')).toEqual(['core', 'terminal']);
  });

  it('refuses a package the tree does not declare', () => {
    expect(() => deniedPackages(policy, 'stranger')).toThrow('stranger is not in the declared tree');
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
    expect(isForbiddenPackage('maximalist', DENIED)).toBe(false);
    expect(isForbiddenPackage('maximal-core-types', DENIED)).toBe(false);
    expect(isForbiddenPackage('@maximal/maximal-core-contract', DENIED)).toBe(false);
  });

  it('does match a subpath of a forbidden package', () => {
    expect(isForbiddenPackage('@maximal/maximal-client', DENIED)).toBe(true);
    expect(isForbiddenPackage('@maximal/maximal-client/renderer', DENIED)).toBe(true);
    expect(isForbiddenPackage('@maximal/maximal-core/control', DENIED)).toBe(true);
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
  it('defaults to the application terms, not the workspace family name', () => {
    expect(forbiddenTerms({})).toEqual(['maximal-core', 'copilot']);
    expect(DEFAULT_FORBIDDEN_TERMS).toEqual(['maximal-core', 'copilot']);
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
    expect(found('Discovery finds copilot on localhost.')).toEqual(['copilot']);
    expect(found('Start maximal-core first.')).toEqual(['maximal-core']);
  });

  it('matches across case and across the separators a constant uses', () => {
    // `\b` does not treat `_` as a boundary, so `\bcopilot\b` misses a
    // constant.
    expect(found("const COPILOT_BASE = 'http://localhost:4141';")).toEqual(['copilot']);
    expect(found('COPILOT_API_HOME')).toEqual(['copilot']);
    expect(found("id: 'copilot-cli'")).toEqual(['copilot']);
  });

  it('matches a term inside a string literal', () => {
    expect(found("export type P = 'copilot' | 'ollama';")).toEqual(['copilot']);
  });

  it('reports the line and the whole line', () => {
    expect(termMatches('clean\nconst a = 1; // copilot\n', ['copilot'])).toEqual([
      { term: 'copilot', line: 2, excerpt: 'const a = 1; // copilot' },
    ]);
  });

  it('leaves sibling workspace packages alone', () => {
    expect(found("import { x } from '@maximal/maximal-terminal/renderer';")).toEqual([]);
    expect(found("import { y } from '@maximal/maximal-electron/host';")).toEqual([]);
  });

  it('exempts a term inside an owner-qualified repository slug', () => {
    expect(found('see https://github.com/stuffbucket/maximal-core')).toEqual([]);
    expect(found('modeled on `stuffbucket/copilot`’s splash.html')).toEqual([]);
  });

  it('does not exempt a bare term on a line that also carries a slug', () => {
    expect(found('stuffbucket/maximal-core, and copilot itself')).toEqual(['copilot']);
  });

  it('does not exempt an npm scope, which a string can name', () => {
    // The `@` is the difference. Without it the exemption covered
    // `@maximal/maximal-core` sitting in a string literal, which is the
    // specifier this guard exists to find.
    expect(found("const p = '@maximal/maximal-core';")).toEqual(['maximal-core']);
  });

  it('does not match a longer word that contains a term', () => {
    expect(found('maximal-cores')).toEqual([]);
    expect(found('copilots')).toEqual([]);
  });

  it('matches nothing in a file that names none of them', () => {
    expect(found('import { BrowserWindow } from "electron";')).toEqual([]);
  });

  it('matches nothing when the term list is empty', () => {
    // Which is why `verify-neutral.mjs` fails on an empty list rather than
    // reporting a clean tree.
    expect(termMatches('copilot everywhere', [])).toEqual([]);
  });
});
