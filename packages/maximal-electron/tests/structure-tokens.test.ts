import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * `structure.css` against the palette it mirrors.
 *
 * The structural tokens ship with values, so this package owns them and a
 * consumer never has to supply one. `tokens.css` is where the same values are
 * authored for the reference application, and it is not published. Two copies
 * of a ramp is the arrangement `structural.css` already demonstrates the cost
 * of, so the comparison is a test rather than a convention.
 *
 * A value here is only correct if it is the reference value. The reading sizes
 * are `rem` on purpose: a ramp in `px` stops tracking the root font size, which
 * is what a reader changes when they need larger text.
 */

const STYLES = new URL('../src/renderer/styles/', import.meta.url);
const structure = readFileSync(new URL('structure.css', STYLES), 'utf8');
const tokens = readFileSync(new URL('tokens.css', STYLES), 'utf8');

/** `--shell-space-2` is authored as `--space-2`. */
const DECLARATION = /^\s*--shell-([a-z0-9-]+)\s*:\s*([^;]+);/gm;

const normalise = (value: string): string => value.trim().replace(/\s+/g, ' ');

function referenceValue(bare: string): string | undefined {
  const pattern = new RegExp(`^\\s*--${bare.replace(/-/g, '\\-')}\\s*:\\s*([^;]+);`, 'm');
  return pattern.exec(tokens)?.[1];
}

const declared = [...structure.matchAll(DECLARATION)].map(([, bare, value]) => ({
  name: `--shell-${bare}`,
  bare: bare ?? '',
  value: normalise(value ?? ''),
}));

describe('the structural tokens', () => {
  it('declares a ramp at all', () => {
    // The floor. Every assertion below iterates this list, so a rename that
    // empties it would report a clean mirror by reading nothing.
    expect(declared.length, 'structure.css declared no --shell-* tokens').toBeGreaterThan(20);
  });

  it('carries the reference value for every one', () => {
    const drift = declared
      .map(({ name, bare, value }) => ({ name, value, reference: referenceValue(bare) }))
      .filter(({ value, reference }) => reference === undefined || normalise(reference) !== value);

    expect(drift, drift.map(({ name }) => name).join(', ')).toEqual([]);
  });

  it('gives every one a value, so a consumer never has to', () => {
    // The distinction that separates these from the palette: a structural token
    // with no value would silently become the consumer's problem, and nothing
    // in README.md tells them to solve it.
    const empty = declared.filter(({ value }) => value.length === 0);
    expect(empty.map(({ name }) => name)).toEqual([]);
  });

  it('scopes the ramp to the shell root', () => {
    // `:root` would reach a consumer's whole document. `.sb-shell` is the
    // nearest ancestor of everything this package renders and nothing else.
    expect(structure).toMatch(/^\.sb-shell\s*\{/m);
    expect(structure).not.toMatch(/^:root\s*\{/m);
  });
});
