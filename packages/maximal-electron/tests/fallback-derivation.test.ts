import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { packageStylesheets } from '../scripts/shell-variables.mjs';

/**
 * Whether a colour this package falls back to tracks the palette it sits in.
 *
 * A `fallback` token is one a shipped rule reads with a value already in hand:
 * `var(--shell-border-strong, …)`. What goes after the comma decides whether
 * the token is part of the design system or a stowaway in it.
 *
 * VS Code's `registerColor` takes a default that *references* another colour —
 * `transparent(editorSelectionBackground, 0.5)`, `lighten(toolbarHover,
 * 0.1)` — so a theme sets a small base and everything else resolves from it.
 * A default written as its own swatch cannot do that: a consumer changes
 * `--shell-border` and the strong border stays whatever hex was transcribed,
 * and nothing reports an error, because a colour that is merely wrong renders.
 * That is the mechanism behind the twenty-nine divergent
 * `var(--shell-*, literal)` sites measured in `packages/maximal/client`.
 *
 * So a colour falls back to a `var()`, and a size falls back to a number. The
 * second half is not an oversight: `structure.css` ships the structural ramp
 * with values on purpose, because a consumer is not expected to define a
 * spacing scale, and a literal is what "ships with a value" means.
 */

/** The one colour that is not the palette's, and the reason. */
const INDEPENDENT = new Map([
  [
    '--shell-scrim',
    // A scrim darkens whatever is behind a modal. Derived from the palette it
    // would be white on a light theme, which is not a dimmer version of the
    // page — it is a brighter one. Black at low alpha is the value that means
    // the same thing in both themes, which is why every system writes it out.
    'rgb(0 0 0 / 0.34)',
  ],
]);

/** Anything whose text names a colour outright. */
const COLOUR = /^(?:#[0-9a-f]{3,8}|(?:rgba?|hsla?|oklch|oklab|lab|lch|color-mix)\()/i;

/** Every `--shell-*` read with a fallback, and the fallback it was given. */
function fallbacks(css: string): Map<string, string> {
  const found = new Map<string, string>();
  const opening = /var\(\s*(--shell-[a-z0-9-]+)\s*,/g;
  let match: RegExpExecArray | null;

  while ((match = opening.exec(css)) !== null) {
    let index = opening.lastIndex;
    const start = index;
    let depth = 1;

    while (index < css.length && depth > 0) {
      if (css[index] === '(') depth += 1;
      else if (css[index] === ')') depth -= 1;
      index += 1;
    }

    const name = match[1] ?? '';
    if (!found.has(name)) found.set(name, css.slice(start, index - 1).trim());
  }

  return found;
}

describe('what a shipped rule falls back to', () => {
  const css = packageStylesheets()
    .flatMap((sheet) => sheet.sources)
    .map((source) => readFileSync(new URL(`../${source}`, import.meta.url), 'utf8'))
    .join('\n');

  const found = fallbacks(css);

  it('is read from the stylesheets this package ships', () => {
    // The floor. A reader that matched nothing reports every fallback as a
    // derivation by finding none of them.
    expect(found.size).toBeGreaterThan(25);
    expect(found.get('--shell-border-strong')).toBe('var(--shell-border)');
  });

  it('names no colour at all', () => {
    /*
     * The package's central claim, as one assertion. `structure.css` shipped
     * `--shell-input-border: var(--shell-border-strong, var(--shell-border,
     * #2a2a2a))` — one transcribed swatch, three levels down a fallback chain,
     * in the file added to end exactly this. It rendered correctly here and
     * drew a grey border for any consumer whose palette had none.
     *
     * The inner fallback was also pointless: `--shell-border` is a required
     * token, so a consumer defines it or nothing in the stylesheet has a
     * border anyway.
     */
    const comments = /\/\*[\s\S]*?\*\//g;
    expect(css.replaceAll(comments, '').match(/#[0-9a-f]{3,8}\b/gi) ?? []).toEqual([]);
  });

  it('names another token wherever it names a colour', () => {
    const transcribed = [...found]
      .filter(([name, value]) => COLOUR.test(value) && !INDEPENDENT.has(name))
      .map(([name, value]) => `${name} -> ${value}`)
      .sort();

    expect(transcribed).toEqual([]);
  });

  it('still writes out the one colour the palette does not own', () => {
    // Named rather than merely allowed. An exemption nobody can see is how a
    // second one gets added.
    for (const [name, value] of INDEPENDENT) {
      expect(found.get(name)).toBe(value);
    }
  });

  it('writes a value out wherever it is structural', () => {
    /*
     * The other direction, and the reason this is two assertions rather than
     * one rule. A consumer is not expected to define a spacing ramp or a
     * corner radius, so those ship with numbers — and a size that fell back to
     * a `var()` would be a size with no value anywhere, which is the defect
     * its sibling `structure-tokens.test.ts` exists for.
     */
    const structural = [...found].filter(
      ([, value]) => /^\d/.test(value) || value === 'none' || value === 'fixed',
    );

    expect(structural.length).toBeGreaterThan(10);
  });
});
