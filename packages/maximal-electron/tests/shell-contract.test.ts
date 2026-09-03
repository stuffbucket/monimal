import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * The shim that lets the reference application render published rules.
 *
 * `shell-contract.css` declares each published name against the short name
 * `tokens.css` authors, so a component carrying its own rules renders here as
 * it does for a consumer. A name missing from it resolves to nothing, which is
 * not a wrong colour but an invalid declaration — no border rather than a grey
 * one.
 *
 * Derived from `.storybook/consumer.css`, the one worked example of a host
 * defining the contract. The first version was generated from
 * `REQUIRED_TOKENS`, which is the reference application's own token list: that
 * minted `--shell-` plus each short name, a third vocabulary nothing defines
 * and no shipped rule reads, and then declared it so the reference application
 * could never observe the contract being broken. Holding the shim to the
 * worked example is what keeps a name here a name somebody has had to supply.
 */

const STYLES = new URL('../src/renderer/styles/', import.meta.url);
const contract = readFileSync(new URL('shell-contract.css', STYLES), 'utf8');
const consumer = readFileSync(new URL('../.storybook/consumer.css', import.meta.url), 'utf8');

/** `--shell-bg-panel: var(--bg-panel);` */
const ALIAS = /^\s*(--shell-[a-z0-9-]+)\s*:\s*var\(\s*(--[a-z0-9-]+)\s*\)\s*;/gm;

const read = (css: string): [string, string][] =>
  [...css.matchAll(ALIAS)].map(([, published, short]) => [published ?? '', short ?? '']);

const aliases = read(contract);

describe('the contract shim', () => {
  it('aliases something at all', () => {
    // The floor. A syntax change that stopped matching would report a shim in
    // step with the worked example by comparing two empty lists.
    expect(aliases.length).toBeGreaterThan(20);
  });

  it('carries exactly the rows the worked consumer defines', () => {
    expect(aliases).toEqual(read(consumer));
  });

  it('names only tokens the reference palette actually authors', () => {
    // The other direction. An alias forwarding a short name `tokens.css` never
    // defines resolves to nothing, which is the failure this file exists to
    // prevent rather than cause.
    const palette = readFileSync(new URL('tokens.css', STYLES), 'utf8');
    const absent = aliases
      .map(([, short]) => short)
      .filter((short) => !new RegExp(`^\\s*${short}\\s*:`, 'm').test(palette));

    expect(absent).toEqual([]);
  });

  it('declares them where a consumer would', () => {
    // A consumer defines the palette on their own root. This stands in for
    // that, so it is `:root` and not the package's own `.sb-shell`.
    expect(contract).toMatch(/^:root\s*\{/m);
  });
});
