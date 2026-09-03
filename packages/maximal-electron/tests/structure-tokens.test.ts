import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { componentStyles } from './stylesheets.js';

/**
 * `structure.css` against the palette it mirrors, and against the contract it
 * is supposed to be extending rather than forking.
 *
 * The published stylesheet already names most of the structure a consumer
 * needs, as an inline fallback on each use. The first version of this file
 * declared a second name for twenty of them — `--shell-radius-card` beside
 * `--shell-radius-large`, `--shell-size-titlebar` beside
 * `--shell-titlebar-height` — and nothing read either. What is left is what
 * the published stylesheet has no name for at all, which is the type ramp:
 * `--shell-font` is one shorthand and a settings surface draws four sizes.
 *
 * A value here is only correct if it is the reference value. The reading sizes
 * are `rem` on purpose: a ramp in `px` stops tracking the root font size,
 * which is what a reader changes when they need larger text.
 */

const STYLES = new URL('../src/renderer/styles/', import.meta.url);
const structure = readFileSync(new URL('structure.css', STYLES), 'utf8');
const structural = readFileSync(new URL('structural.css', STYLES), 'utf8');
const tokens = readFileSync(new URL('tokens.css', STYLES), 'utf8');

/** `--shell-text-sm` is authored as `--text-sm`. */
const DECLARATION = /^\s*--shell-([a-z0-9-]+)\s*:\s*([^;]+);/gm;

const normalise = (value: string): string => value.trim().replace(/\s+/g, ' ');

/**
 * Every custom property `tokens.css` authors, read once.
 *
 * A lookup rather than a regular expression built from the name. The
 * predecessor interpolated the name into a pattern and escaped it by replacing
 * `-` with `\\-`, which CodeQL flagged as incomplete sanitisation: it escapes
 * nothing that matters — a hyphen is not a metacharacter outside a character
 * class — and leaves a backslash in the input untouched.
 *
 * Not exploitable here, because the names come from this package's own
 * stylesheets through a `[a-z0-9-]+` capture, so a backslash cannot reach it.
 * Building a pattern out of data to look up a key is the wrong shape
 * regardless, and a map is both simpler and faster over the eighty-odd names
 * this asks about.
 */
const AUTHORED = new Map(
  [...tokens.matchAll(/^\s*--([a-z0-9-]+)\s*:\s*([^;]+);/gm)].map((match) => [
    match[1] ?? '',
    match[2] ?? '',
  ]),
);

function referenceValue(bare: string): string | undefined {
  return AUTHORED.get(bare);
}


/**
 * What the published stylesheet spells out when a consumer defines nothing.
 *
 * Only a literal. A fallback that is itself a chain of `var()` calls is held
 * to nothing here: there is no single value to compare, and the name it
 * forwards is checked in its own right.
 */
function fallsBackTo(name: string): string | undefined {
  const pattern = new RegExp(`var\\(\\s*${name}\\s*,\\s*([^(),]+)\\)`);
  const found = pattern.exec(structural)?.[1];
  return found === undefined ? undefined : normalise(found);
}

const declared = [...structure.matchAll(DECLARATION)].map(([, bare, value]) => ({
  name: `--shell-${bare ?? ''}`,
  bare: bare ?? '',
  value: normalise(value ?? ''),
}));

describe('the structural tokens', () => {
  it('declare a ramp at all', () => {
    // The floor. Every assertion below iterates this list, so a rename that
    // emptied it would report a clean extension by reading nothing.
    expect(declared.length, 'structure.css declared no --shell-* tokens').toBeGreaterThan(12);
  });

  it('carry the reference value for every one the palette authors', () => {
    /*
     * The names this file adds. Their short counterpart in `tokens.css` is the
     * same suffix, so a value here that is not that value is drift.
     *
     * The names the published stylesheet already reads are held to a different
     * oracle — the fallback it spells out — because their short counterpart is
     * named differently: `--shell-radius` is authored as `--radius-input`.
     */
    const drift = declared
      .filter(({ name }) => !fallsBackTo(name) && !declared.find((d) => d.name === name)?.value.startsWith('var('))
      .map(({ name, bare, value }) => ({ name, value, reference: referenceValue(bare) }))
      .filter(({ value, reference }) => reference === undefined || normalise(reference) !== value);

    expect(drift, drift.map(({ name }) => name).join(', ')).toEqual([]);
  });

  it('give every one a value, so a consumer never has to', () => {
    // The distinction that separates these from the palette: a structural
    // token with no value would silently become the consumer's problem, and
    // nothing in README.md tells them to solve it.
    expect(declared.filter(({ value }) => value.length === 0).map(({ name }) => name)).toEqual([]);
  });

  it('agree with the value the published stylesheet falls back to', () => {
    /*
     * The check that replaces "declare no published name", which was the wrong
     * rule: a name the published stylesheet reads is exactly the name that
     * should be declared here, because it is read there only with an inline
     * fallback and a bare read gets nothing.
     *
     * What must not happen is two values for one name. `var(--shell-radius,
     * 6px)` in the stylesheet and `--shell-radius: 8px` here would resolve to
     * 8px everywhere and read as 6px to anyone reading the rule.
     */
    const drift = declared
      .map(({ name, value }) => ({ name, value, fallback: fallsBackTo(name) }))
      .filter(({ value, fallback }) => fallback !== undefined && fallback !== value);

    // The floor. A pattern that found no fallback would compare nothing.
    expect(declared.filter(({ name }) => fallsBackTo(name) !== undefined).length).toBeGreaterThan(4);
    expect(drift).toEqual([]);
  });

  it('are every one of them read', () => {
    /*
     * A token nothing reads is a name this package is bound to for nothing,
     * and twenty of the original thirty-eight were exactly that.
     *
     * The readers are the stylesheets and the rules a component carries. The
     * second is why this cannot scan `styles/` alone: the type ramp exists for
     * the settings surfaces, whose rules live in TypeScript.
     */
    const read = new Set(
      [...`${structural}\n${componentStyles()}`.matchAll(/var\(\s*(--shell-[a-z0-9-]+)/g)].map(
        (match) => match[1] ?? '',
      ),
    );
    for (const file of ['controls.css', 'shell.css', 'overlay.css']) {
      const css = readFileSync(new URL(file, STYLES), 'utf8');
      for (const match of css.matchAll(/var\(\s*(--shell-[a-z0-9-]+)/g)) read.add(match[1] ?? '');
    }

    expect(declared.map(({ name }) => name).filter((name) => !read.has(name)).sort()).toEqual([]);
  });

  it('scope the ramp to the shell root', () => {
    // `:root` would reach a consumer's whole document. `.sb-shell` is the
    // nearest ancestor of everything this package renders and nothing else.
    expect(structure).toMatch(/^\.sb-shell\s*\{/m);
    expect(structure).not.toMatch(/^:root\s*\{/m);
  });
});
