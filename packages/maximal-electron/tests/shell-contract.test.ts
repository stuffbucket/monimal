import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { REQUIRED_TOKENS } from '../src/renderer/lib/contrast.js';

/**
 * The shim that lets the reference application render published rules.
 *
 * `shell-contract.css` declares every published name against the short name
 * `tokens.css` authors, so a component carrying its own rules renders here as
 * it does for a consumer. A name missing from it resolves to nothing — the
 * failure `docs/shell-variables.md` describes as "never an error, only a
 * slightly wrong picture" — so the list is derived from `REQUIRED_TOKENS`
 * rather than maintained beside it.
 */

const contract = readFileSync(
  new URL('../src/renderer/styles/shell-contract.css', import.meta.url),
  'utf8',
);

/** `--shell-bg-panel: var(--bg-panel);` */
const ALIAS = /^\s*--shell-([a-z0-9-]+)\s*:\s*var\(\s*--([a-z0-9-]+)\s*\)\s*;/gm;

const aliases = [...contract.matchAll(ALIAS)].map(([, published, internal]) => ({
  published: `--shell-${published ?? ''}`,
  internal: `--${internal ?? ''}`,
}));

describe('the contract shim', () => {
  it('aliases something at all', () => {
    // The floor. A syntax change that stopped matching would report a complete
    // shim by comparing two empty lists.
    expect(aliases.length).toBeGreaterThan(60);
  });

  it('covers exactly the tokens the shell requires', () => {
    expect(aliases.map(({ internal }) => internal).sort()).toEqual([...REQUIRED_TOKENS].sort());
  });

  it('names each alias after the token it forwards', () => {
    // `--shell-bg-panel` must forward `--bg-panel`. A crossed pair renders a
    // plausible picture in the wrong colour, which no other check would see.
    const crossed = aliases.filter(
      ({ published, internal }) => published !== `--shell-${internal.slice(2)}`,
    );
    expect(crossed).toEqual([]);
  });

  it('declares them where a consumer would', () => {
    // A consumer defines the palette on their own root. This file stands in
    // for that, so it is `:root` and not the package's own `.sb-shell`.
    expect(contract).toMatch(/^:root\s*\{/m);
  });
});
