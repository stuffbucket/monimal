import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { declaredTokens } from '../scripts/component-css.mjs';
import { shellVariablesIn } from '../scripts/shell-variables.mjs';
import { componentStyles } from './stylesheets.js';

/**
 * Whether this application actually defines the contract it renders against.
 *
 * The reference application is supposed to be a consumer of its own package —
 * that is the whole reason `shell-contract.css` exists, and it is the strongest
 * available test of the contract, because a name nobody defines shows up as a
 * missing border rather than as an error. The property is only worth anything
 * while something checks it, and until this nothing did. Twice now it has been
 * false while every suite was green:
 *
 * - the rules a component carries were written against `--shell-` plus the
 *   short names `tokens.css` authors, and `shell-contract.css` was generated
 *   from that same list, so the application defined exactly the vocabulary it
 *   read and a consumer defined none of it;
 * - `structure.css` is the only file that gives the structural ramp values,
 *   a consumer gets it as half of `dist/renderer/styles.css`, and this
 *   application built its own stylesheet and never loaded it — so every
 *   carried rule's padding, radius, type size and weight was invalid at
 *   computed-value time. A model card in the running application had
 *   `border-radius: 0px` and `padding: 0px`, through 106 stories that render
 *   and pass axe.
 *
 * An undefined custom property with no fallback makes the whole declaration
 * invalid, so neither of those is a slightly wrong picture. It is no border,
 * no background, no gap.
 *
 * The stylesheets are followed rather than listed. A list is the third
 * hand-maintained copy this package has already been burned by.
 */

const ROOT = new URL('../', import.meta.url);

/**
 * A set of stylesheets and everything they `@import`, transitively.
 *
 * `@import` is followed because that is how the browser reads them, and the
 * one file that gives the structural ramp values reaches both arrangements
 * through one. A reader that stopped at the named files would report the
 * ramp as undefined in the mode that has it.
 */
function expand(entries: string[]): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const pending = [...entries];

  while (pending.length > 0) {
    const file = pending.pop();
    if (file === undefined || seen.has(file)) continue;
    seen.add(file);
    found.push(file);

    if (!existsSync(new URL(file, ROOT))) continue;
    const css = readFileSync(new URL(file, ROOT), 'utf8');
    for (const match of css.matchAll(/@import\s*'([^']+)'/g)) {
      pending.push(path.posix.join(path.posix.dirname(file), match[1] ?? ''));
    }
  }

  return found;
}

/** Every `.css` file a module tree reaches, following `@import` as well. */
function stylesheetsFrom(entry: string): string[] {
  const text = readFileSync(new URL(entry, ROOT), 'utf8');
  return expand(
    [...text.matchAll(/import\s*'(\.[^']+\.css)'/g)].map((match) =>
      path.posix.join(path.posix.dirname(entry), match[1] ?? ''),
    ),
  );
}

/**
 * What Storybook's package mode composes, read out of the mode itself.
 *
 * Restating the list here would be a second copy of the arrangement this file
 * exists to check, so the identifiers each mode joins are read from the source
 * and resolved through its own import lines.
 */
function shellModeSources(mode: string): string[] {
  const source = readFileSync(new URL('.storybook/shell-mode.ts', ROOT), 'utf8');

  const paths = new Map(
    [...source.matchAll(/import (\w+) from '([^']+)\?inline'/g)].map((match) => [
      match[1] ?? '',
      path.posix.join('.storybook', match[2] ?? ''),
    ]),
  );

  const line = new RegExp(`^\\s*${mode}: (.+)$`, 'm').exec(source)?.[1] ?? '';
  return expand(
    [...line.matchAll(/\b(\w+Css)\b/g)]
      .map((match) => paths.get(match[1] ?? '') ?? '')
      .filter((file) => file !== ''),
  );
}

/** Every `--shell-*` a set of stylesheets gives a value. */
function definedBy(files: string[]): Set<string> {
  const css = files.map((file) => readFileSync(new URL(file, ROOT), 'utf8')).join('\n');
  return new Set(declaredTokens(css).filter((name) => name.startsWith('--shell-')));
}

/**
 * Every `--shell-*` a carried rule reads *bare*, and does not itself declare.
 *
 * The distinction is the whole check. `var(--shell-space-3)` with nothing
 * after the comma has no value if nobody defines the name, and an undefined
 * custom property with no fallback makes the whole declaration invalid at
 * computed-value time — no gap, not a smaller one. `var(--shell-status,
 * var(--shell-text-muted))` has a value either way, and `--shell-status` is
 * deliberately undefined until a host writes its own `[data-status]` rules:
 * `.storybook/consumer.css` says so at length and leaves it unset on purpose.
 * Demanding a definition for it would be demanding the package promise a
 * vocabulary of states it does not have.
 */
function carriedReads(): string[] {
  const css = componentStyles();
  const declared = new Set(declaredTokens(css));
  return shellVariablesIn(css).required.filter((name) => !declared.has(name));
}

describe('the contract a carried rule reads', () => {
  const needed = carriedReads();

  it('is a set worth checking', () => {
    // The floor. A reader that found nothing would report every arrangement
    // below as complete, which is the shape of the false pass this repository
    // has now shipped three times.
    expect(needed.length).toBeGreaterThan(10);
    expect(needed).toContain('--shell-space-3');
    expect(needed).toContain('--shell-text');
  });

  it('is defined in full by the stylesheet this application loads', () => {
    /*
     * The real document. `main.tsx` is the renderer entry, and what it imports
     * — plus what those files `@import` — is every rule and every token in the
     * running application. If a name a carried rule reads is not in there, the
     * application draws that rule with the declaration dropped.
     */
    const loaded = stylesheetsFrom('src/renderer/main.tsx');
    const defined = definedBy(loaded);

    expect(loaded.length).toBeGreaterThan(2);
    expect(needed.filter((name) => !defined.has(name))).toEqual([]);
  });

  it('is defined in full by the consumer Storybook models', () => {
    // The other half of the same property. Package mode is the CSS a consumer
    // installs plus the one worked example of a host supplying the palette, so
    // a name missing here is a name missing from every consumer.
    const sources = shellModeSources('package');
    const defined = definedBy(sources);

    expect(sources.length).toBeGreaterThan(2);
    expect(needed.filter((name) => !defined.has(name))).toEqual([]);
  });

  it('is defined in full by the mode Storybook calls the application', () => {
    // App mode used to be `shell.css` alone, which is what made this
    // application render its own carried rules with no padding and no radius
    // while claiming to be the reference for consumers.
    const sources = shellModeSources('app');
    const defined = definedBy(sources);

    expect(sources.length).toBeGreaterThan(1);
    expect(needed.filter((name) => !defined.has(name))).toEqual([]);
  });

  it('resolves the stylesheets it names, in every arrangement', () => {
    // A path that does not exist reads as an empty file, and an empty file
    // defines nothing — which this would report as a failure rather than a
    // pass. Named anyway: a typo in the reader is a worse failure to debug
    // than a missing token.
    const files = [
      ...stylesheetsFrom('src/renderer/main.tsx'),
      ...shellModeSources('package'),
      ...shellModeSources('app'),
    ];

    expect(files.filter((file) => !existsSync(new URL(file, ROOT)))).toEqual([]);
  });
});
