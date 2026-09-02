import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  SHELL_NAMESPACE,
  failedShellVariableChecks,
  packageStylesheets,
  shellVariableChecks,
  shellVariableContract,
  shellVariableEntries,
  shellVariablesIn,
  type ShellVariableCheck,
  type ShellVariableEntry,
} from '../scripts/shell-variables.mjs';
import { SHELL_TERMINAL_PROPERTIES } from '../src/renderer/lib/terminal-transport.js';

/**
 * The `--shell-*` contract a consumer has to satisfy.
 *
 * `structural.css` reads custom properties the host defines and nothing
 * published which ones, so `stuffbucket/maximal` guessed at the surface and
 * drifted five variables behind. Issue #93, and `docs/shell-variables.md`.
 *
 * The failure this repository keeps producing is not a wrong rule, it is a
 * right rule over an empty scope, so the floors are pinned as hard as the
 * comparisons and each fixture is small enough that an empty one is visible.
 */

const ROOT = new URL('../', import.meta.url);

const failed = (checks: ShellVariableCheck[]): string[] => failedShellVariableChecks(checks);

const sheet = (css: string) => [{ name: 'fixture.css', css }];

/** A whole contract that holds, to vary one part of at a time. */
const whole = {
  stylesheets: sheet('a { color: var(--shell-text); gap: var(--shell-space-1, 4px); }'),
  runtimeProperties: ['--shell-terminal-cursor'],
  published: [
    { name: '--shell-space-1', kind: 'fallback' },
    { name: '--shell-terminal-cursor', kind: 'runtime' },
    { name: '--shell-text', kind: 'required' },
  ] as ShellVariableEntry[],
};

describe('shellVariablesIn', () => {
  it('splits a read with a fallback from one without', () => {
    const found = shellVariablesIn('a { color: var(--shell-text); gap: var(--shell-space-2, 8px); }');
    expect(found.required).toEqual(['--shell-text']);
    expect(found.fallback).toEqual(['--shell-space-2']);
  });

  it('reads a name with no whitespace around it', () => {
    expect(shellVariablesIn('a { color: var(--shell-accent); }').required).toEqual([
      '--shell-accent',
    ]);
  });

  it('reads a name padded with whitespace', () => {
    const found = shellVariablesIn('a { color: var(  --shell-accent  ); b: var(  --shell-x  , 1px); }');
    expect(found.required).toEqual(['--shell-accent']);
    expect(found.fallback).toEqual(['--shell-x']);
  });

  it('reads the inner variable of a nested fallback', () => {
    // `var(--shell-danger, var(--shell-hover))`. The inner read carries no
    // fallback of its own, which is what makes `--shell-hover` required.
    const found = shellVariablesIn('a { background: var(--shell-danger, var(--shell-hover)); }');
    expect(found.required).toEqual(['--shell-hover']);
    expect(found.fallback).toEqual(['--shell-danger']);
  });

  it('sorts and deduplicates', () => {
    const found = shellVariablesIn(
      'a { color: var(--shell-text); } b { color: var(--shell-accent); } c { color: var(--shell-text); }',
    );
    expect(found.required).toEqual(['--shell-accent', '--shell-text']);
  });

  it('ignores a namespace that is not ours', () => {
    expect(shellVariablesIn('a { color: var(--text-primary); }')).toEqual({
      required: [],
      fallback: [],
    });
  });

  it('ignores a differently cased name, which is a different property', () => {
    expect(shellVariablesIn('a { color: var(--Shell-Text); }').required).toEqual([]);
  });

  it('ignores the bare prefix, which names nothing', () => {
    expect(shellVariablesIn('a { color: var(--shell-); }').required).toEqual([]);
  });

  it('finds nothing in an empty stylesheet', () => {
    expect(shellVariablesIn('')).toEqual({ required: [], fallback: [] });
  });
});

describe('shellVariableContract', () => {
  it('merges every stylesheet', () => {
    const contract = shellVariableContract({
      stylesheets: [
        { name: 'one.css', css: 'a { color: var(--shell-text); }' },
        { name: 'two.css', css: 'b { gap: var(--shell-space-1, 4px); }' },
      ],
      runtimeProperties: [],
    });
    expect(contract.required).toEqual(['--shell-text']);
    expect(contract.fallback).toEqual(['--shell-space-1']);
  });

  it('calls a variable read both ways required, because the rule with no fallback draws nothing', () => {
    const contract = shellVariableContract({
      stylesheets: sheet('a { color: var(--shell-x, red); } b { color: var(--shell-x); }'),
      runtimeProperties: [],
    });
    expect(contract.required).toEqual(['--shell-x']);
    expect(contract.fallback).toEqual([]);
  });

  it('calls a runtime property that a rule requires required', () => {
    const contract = shellVariableContract({
      stylesheets: sheet('a { background: var(--shell-terminal-background); }'),
      runtimeProperties: ['--shell-terminal-background'],
    });
    expect(contract.required).toEqual(['--shell-terminal-background']);
    expect(contract.runtime).toEqual([]);
  });

  it('calls a runtime property that a rule defaults a fallback', () => {
    const contract = shellVariableContract({
      stylesheets: sheet('a { background: var(--shell-terminal-background, black); }'),
      runtimeProperties: ['--shell-terminal-background'],
    });
    expect(contract.fallback).toEqual(['--shell-terminal-background']);
    expect(contract.runtime).toEqual([]);
  });

  it('keeps a runtime property no rule mentions', () => {
    const contract = shellVariableContract({
      stylesheets: sheet('a { color: var(--shell-text); }'),
      runtimeProperties: ['--shell-terminal-cursor'],
    });
    expect(contract.runtime).toEqual(['--shell-terminal-cursor']);
  });
});

describe('shellVariableEntries', () => {
  it('names every kind, in name order across all three', () => {
    expect(
      shellVariableEntries({
        stylesheets: sheet('a { color: var(--shell-z); gap: var(--shell-a, 1px); }'),
        runtimeProperties: ['--shell-m'],
      }),
    ).toEqual([
      { name: '--shell-a', kind: 'fallback' },
      { name: '--shell-m', kind: 'runtime' },
      { name: '--shell-z', kind: 'required' },
    ]);
  });
});

describe('shellVariableChecks', () => {
  it('passes a contract that matches', () => {
    expect(failed(shellVariableChecks(whole))).toEqual([]);
  });

  it('names each side of the comparison in the check it reports', () => {
    const names = shellVariableChecks(whole).map((check) => check.name);
    expect(names).toContain('--shell-text is published as required');
    expect(names).toContain('--shell-space-1 is published as fallback');
    expect(names).toContain('--shell-terminal-cursor is published as runtime');
    expect(names).toContain('--shell-text is read by this package');
  });

  it('fails a variable that is read and not published', () => {
    expect(
      failed(
        shellVariableChecks({
          ...whole,
          stylesheets: sheet(
            'a { color: var(--shell-text); gap: var(--shell-space-1, 4px); outline: var(--shell-something-new); }',
          ),
        }),
      ),
    ).toEqual(['--shell-something-new is published as required']);
  });

  it('fails a variable that is published and not read', () => {
    expect(
      failed(
        shellVariableChecks({
          ...whole,
          published: [...whole.published, { name: '--shell-gone', kind: 'required' }],
        }),
      ),
    ).toEqual(['--shell-gone is read by this package']);
  });

  it('fails a variable published under the wrong kind', () => {
    expect(
      failed(
        shellVariableChecks({
          ...whole,
          published: [
            { name: '--shell-space-1', kind: 'required' },
            { name: '--shell-terminal-cursor', kind: 'runtime' },
            { name: '--shell-text', kind: 'required' },
          ],
        }),
      ),
    ).toEqual(['--shell-space-1 is published as fallback']);
  });

  describe('the floors', () => {
    it('fails on no stylesheet at all, rather than reporting a complete contract', () => {
      expect(
        failed(
          shellVariableChecks({ stylesheets: [], runtimeProperties: [], published: [] }),
        ),
      ).toEqual([
        'a stylesheet was read',
        'every stylesheet has text',
        'the derived contract is not empty',
        'a variable is read with no fallback',
        'a variable is read with a fallback',
        'the published contract is not empty',
      ]);
    });

    it('fails on a stylesheet that read as empty text', () => {
      expect(failed(shellVariableChecks({ ...whole, stylesheets: sheet('') }))).toContain(
        'every stylesheet has text',
      );
    });

    it('fails on one empty stylesheet beside a full one', () => {
      // Every, not some. A second stylesheet that reads as empty is a file the
      // build renamed, and the contract derived without it is still complete.
      expect(
        failed(
          shellVariableChecks({
            ...whole,
            stylesheets: [...whole.stylesheets, { name: 'renamed.css', css: '' }],
          }),
        ),
      ).toEqual(['every stylesheet has text']);
    });

    it('fails when nothing is read without a fallback', () => {
      const checks = shellVariableChecks({
        ...whole,
        stylesheets: sheet('a { gap: var(--shell-space-1, 4px); }'),
        published: [
          { name: '--shell-space-1', kind: 'fallback' },
          { name: '--shell-terminal-cursor', kind: 'runtime' },
        ],
      });
      expect(failed(checks)).toEqual(['a variable is read with no fallback']);
    });

    it('fails when nothing is read with a fallback', () => {
      const checks = shellVariableChecks({
        ...whole,
        stylesheets: sheet('a { color: var(--shell-text); }'),
        published: [
          { name: '--shell-terminal-cursor', kind: 'runtime' },
          { name: '--shell-text', kind: 'required' },
        ],
      });
      expect(failed(checks)).toEqual(['a variable is read with a fallback']);
    });

    it('fails on an empty published contract', () => {
      const checks = shellVariableChecks({ ...whole, published: [] });
      expect(failed(checks)).toContain('the published contract is not empty');
    });
  });
});

describe('failedShellVariableChecks', () => {
  it('names the checks that did not hold, and only those', () => {
    expect(
      failedShellVariableChecks([
        { name: 'held', ok: true },
        { name: 'did not', ok: false },
      ]),
    ).toEqual(['did not']);
  });
});

/* ------------------------------------------------- the contract as it ships */

/** The four tables in `docs/shell-variables.md`, by the heading above them. */
function published(): ShellVariableEntry[] {
  const text = readFileSync(new URL('docs/shell-variables.md', ROOT), 'utf8');
  const entries: ShellVariableEntry[] = [];

  for (const section of text.split(/^## /m)) {
    const kind = (/^(Required|Fallback|Structural|Runtime)\n/.exec(section)?.[1] ?? '').toLowerCase();
    if (kind === '') continue;
    // The first cell only. A fallback row names another variable in its second
    // column, and counting that would publish it twice under the wrong kind.
    for (const row of section.matchAll(/^\| `(--shell-[a-z0-9-]+)` \|/gm)) {
      entries.push({ name: row[1] ?? '', kind: kind as ShellVariableEntry['kind'] });
    }
  }

  return entries;
}

/** The stylesheets the package ships, read from disk. */
function shipped(): { name: string; css: string }[] {
  return packageStylesheets().flatMap((entry) =>
    entry.sources.map((source) => ({
      name: source,
      css: readFileSync(new URL(source, ROOT), 'utf8'),
    })),
  );
}

describe('the published contract', () => {
  const runtimeProperties = Object.values(SHELL_TERMINAL_PROPERTIES);

  it('is what docs/shell-variables.md says it is, in both directions', () => {
    /*
     * The tripwire.
     *
     * Both sides are read from files. A variable added to a rule and left out
     * of the document fails here rather than rendering an unstyled control in
     * a consumer's application, and a row nothing reads fails too — otherwise
     * the list only ever grows, and a consumer keeps setting a name that
     * stopped meaning anything.
     */
    expect(
      failedShellVariableChecks(
        shellVariableChecks({
          stylesheets: shipped(),
          runtimeProperties,
          published: published(),
        }),
      ),
    ).toEqual([]);
  });

  it('covers every stylesheet the package exports', () => {
    // `packageStylesheets` drives the copy and this check. The manifest is the
    // third place a stylesheet has to be named, and this is what pairs them.
    const manifest = JSON.parse(readFileSync(new URL('package.json', ROOT), 'utf8')) as {
      exports: Record<string, string>;
    };
    const exported = Object.values(manifest.exports)
      .filter((target): target is string => typeof target === 'string' && target.endsWith('.css'))
      .map((target) => target.replace(/^\.\//, ''))
      .sort();

    expect(exported.length).toBeGreaterThan(0);
    expect(packageStylesheets().map((entry) => entry.published).sort()).toEqual(exported);
    expect(packageStylesheets().flatMap((entry) => entry.sources)).toEqual([
      'src/renderer/styles/structure.css',
      'src/renderer/styles/structural.css',
    ]);
  });

  it('names the same required variables as the README table', () => {
    // README.md carries the eleven with a description of what each draws, and
    // `tests/package-styles.test.ts` checks that table against the CSS. Two
    // tables for one list is a drift waiting to happen, so they are paired
    // here rather than left to agree by coincidence.
    const readme = readFileSync(new URL('README.md', ROOT), 'utf8');
    const documented = [...readme.matchAll(/^\| `(--shell-[a-z0-9-]+)` \| /gm)]
      .map((match) => match[1] ?? '')
      .sort();

    expect(documented.length).toBeGreaterThan(0);
    expect(
      published()
        .filter((entry) => entry.kind === 'required')
        .map((entry) => entry.name)
        .sort(),
    ).toEqual(documented);
  });

  it('reads the stylesheets it names', () => {
    // The floor, again, at the boundary this file owns. Everything above runs
    // over `shipped`; an unreadable path or a renamed file would leave the
    // comparison holding over no CSS at all.
    //
    // A shipped stylesheet takes part in the namespace one of two ways: it
    // declares structural tokens, or it reads them. Requiring a read of every
    // sheet would reject `structure.css`, which is nothing but declarations;
    // requiring neither would let an empty file through, which is the hole this
    // exists to close.
    const stylesheets = shipped();
    const declares = (css: string): boolean => new RegExp(`^\\s*${SHELL_NAMESPACE}`, 'm').test(css);
    const reads = (css: string): boolean => css.includes(`var(${SHELL_NAMESPACE}`);

    expect(SHELL_NAMESPACE).toBe('--shell-');
    expect(stylesheets.length).toBeGreaterThan(0);
    expect(stylesheets.every((entry) => declares(entry.css) || reads(entry.css))).toBe(true);
    expect(stylesheets.some((entry) => reads(entry.css))).toBe(true);
    expect(runtimeProperties.length).toBeGreaterThan(0);
    expect(published().length).toBeGreaterThan(runtimeProperties.length);
  });
});

describe('the declaration a consumer compiles against', () => {
  /*
   * `scripts/shell-variables.d.mts` is hand-written, because the module it
   * describes is plain ESM that a consumer's check runs under bare `node`.
   * Hand-written is the whole problem: `structural` was added to the
   * implementation and not to the declaration, so `shellVariableContract()`
   * returned four lists and told every consumer it returned three.
   * `packages/maximal/client` hit it as `Property 'structural' does not exist`
   * on a field that had existed for a day.
   *
   * Nothing else can see this. `tsc` type-checks this package against the
   * source, not against the declaration a consumer resolves, and every test
   * here calls the implementation directly.
   */
  const declaration = readFileSync(new URL('../scripts/shell-variables.d.mts', import.meta.url), 'utf8');

  it('names every kind the implementation produces', () => {
    const declared = [...(/export type ShellVariableKind =([^;]+);/.exec(declaration)?.[1] ?? '')
      .matchAll(/'([a-z]+)'/g)]
      .map((match) => match[1] ?? '')
      .sort();

    // Derived from a contract rather than from a list, so a fifth kind added
    // to the implementation arrives here without anyone deciding to add it.
    const produced = Object.keys(
      shellVariableContract({
        stylesheets: whole.stylesheets,
        runtimeProperties: whole.runtimeProperties,
      }),
    ).sort();

    expect(declared.length).toBeGreaterThan(2);
    expect(declared).toEqual(produced);
  });

  it('names every list the contract carries', () => {
    const fields = [...(/export interface ShellVariableContract \{([^}]*)}/.exec(declaration)?.[1] ?? '')
      .matchAll(/readonly (\w+):/g)]
      .map((match) => match[1] ?? '')
      .sort();

    expect(fields.length).toBeGreaterThan(2);
    expect(fields).toEqual(
      Object.keys(
        shellVariableContract({
          stylesheets: whole.stylesheets,
          runtimeProperties: whole.runtimeProperties,
        }),
      ).sort(),
    );
  });
});
