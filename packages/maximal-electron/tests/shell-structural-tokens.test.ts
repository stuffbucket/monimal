import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { shellVariablesIn } from '../scripts/shell-variables.mjs';
import { componentStyles } from './stylesheets.js';

/** The package's structural token owner against its reference token lineage. */

const STYLES = new URL('../src/renderer/styles/', import.meta.url);
const structuralTokens = readFileSync(new URL('shell-structural-tokens.css', STYLES), 'utf8');
const packageRules = readFileSync(new URL('shell-package-rules.css', STYLES), 'utf8');
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

const REFERENCE_NAMES = new Map([
  ['radius', 'radius-input'],
  ['radius-large', 'radius-card'],
]);

function referenceValue(bare: string): string | undefined {
  return AUTHORED.get(REFERENCE_NAMES.get(bare) ?? bare);
}

const declared = [...structuralTokens.matchAll(DECLARATION)].map(([, bare, value]) => ({
  name: `--shell-${bare ?? ''}`,
  bare: bare ?? '',
  value: normalise(value ?? ''),
}));

describe('the structural tokens', () => {
  it('declare a ramp at all', () => {
    // The floor. Every assertion below iterates this list, so a rename that
    // emptied it would report a clean extension by reading nothing.
    expect(declared.length, 'shell-structural-tokens.css declared no --shell-* tokens').toBeGreaterThan(12);
  });

  it('carry the reference value for every one the palette authors', () => {
    const drift = declared
      .filter(({ value }) => !value.startsWith('var('))
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

  it('are the only value owner for every token they declare', () => {
    const fallbacks = new Set(shellVariablesIn(packageRules).fallback);

    expect(fallbacks).toContain('--shell-border-strong');
    expect(declared.map(({ name }) => name).filter((name) => fallbacks.has(name))).toEqual([]);
  });

  it('are every one of them read', () => {
    /*
     * A token nothing reads is a name this package is bound to for nothing,
     * and twenty of the original thirty-eight were exactly that.
     *
     * The package ships rules in the linked stylesheet and in components that
     * carry their own CSS. Both are required: the type ramp is read only by
     * settings surfaces whose rules live in TypeScript.
     */
    const read = new Set(
      [...`${packageRules}\n${componentStyles()}`.matchAll(/var\(\s*(--shell-[a-z0-9-]+)/g)].map(
        (match) => match[1] ?? '',
      ),
    );

    expect(declared.map(({ name }) => name).filter((name) => !read.has(name)).sort()).toEqual([]);
  });

  it('scope the ramp to the shell root', () => {
    // `:root` would reach a consumer's whole document. `.sb-shell` is the
    // nearest ancestor of everything this package renders and nothing else.
    expect(structuralTokens).toMatch(/^\.sb-shell\s*\{/m);
    expect(structuralTokens).not.toMatch(/^:root\s*\{/m);
  });
});
