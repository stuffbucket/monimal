import { describe, expect, it } from 'vitest';

import { CONTRAST_PAIRS, parseHex } from '../src/renderer/lib/contrast.js';

import { isPackageToken, stylesheets } from './stylesheets.js';

/**
 * Does `CONTRAST_PAIRS` name what the stylesheets actually draw?
 *
 * `REQUIRED_TOKENS` is derived from the stylesheets, so it cannot go stale.
 * The pair list is written by hand, and issue #53 is that a pair nobody adds
 * is a pair nothing measures. PR #45 found one that way: `.icon-button:hover`
 * had been drawing `--text-primary` on `--bg-hover` with no entry naming it,
 * so `check:contrast` reported a clean run over a combination it never saw.
 *
 * Resolving every foreground against whatever surface the cascade puts under
 * it is the hard version, and this is not it. This reads the case that is
 * decidable from one rule: a block that sets both `color` and a background
 * states a pair outright.
 */

/** A declaration block, as its selector and its body. */
interface Rule {
  selector: string;
  body: string;
}

function rules(css: string): Rule[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const found: Rule[] = [];

  for (const match of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = (match[1] ?? '').trim().replace(/\s+/g, ' ');
    const body = match[2] ?? '';
    if (selector && !selector.startsWith('@')) found.push({ selector, body });
  }

  return found;
}

/**
 * The single token a declaration resolves to, or undefined.
 *
 * Only a bare `var(--token)` counts. A gradient, a fallback chain, or a literal
 * is a value this cannot attribute to one token, and guessing would put a pair
 * in the list that nothing draws.
 */
function soleToken(body: string, property: RegExp): string | undefined {
  const declaration = property.exec(body);
  if (!declaration) return undefined;

  const value = (declaration[1] ?? '').trim();
  const single = /^var\((--[a-z0-9-]+)\)$/i.exec(value);
  return single?.[1];
}

/** Every foreground-on-background pair a single rule states outright. */
export function pairsInRule({ selector, body }: Rule):
  | { foreground: string; background: string; selector: string }
  | undefined {
  const foreground = soleToken(body, /(?:^|[;{])\s*color\s*:\s*([^;]+)/i);
  const background = soleToken(body, /(?:^|[;{])\s*background(?:-color)?\s*:\s*([^;]+)/i);

  if (!foreground || !background) return undefined;
  // The public package reads a namespace a consumer supplies, so its values are
  // not this palette's to measure.
  if (isPackageToken(foreground) || isPackageToken(background)) return undefined;
  // A translucent tint composites against whatever is behind it, which no
  // static check knows. `contrast.ts` says the same, and `storybook:check` runs
  // axe over rendered pixels, which does see the result.
  if (background.endsWith('-soft')) return undefined;

  return { foreground, background, selector };
}

describe('CONTRAST_PAIRS covers what the stylesheets draw', () => {
  const stated = stylesheets().flatMap(([name, css]) =>
    rules(css)
      .map(pairsInRule)
      .filter((pair) => pair !== undefined)
      .map((pair) => ({ ...pair, file: name })),
  );

  const listed = new Set(
    CONTRAST_PAIRS.map((pair) => `${pair.foreground}|${pair.background}`),
  );

  it('finds pairs to check, so an empty scan cannot pass', () => {
    // The floor. A regex that stops matching would otherwise report every rule
    // as covered, which is the failure mode this whole file exists to prevent.
    expect(stated.length).toBeGreaterThan(3);
  });

  it('names every pair a single rule states', () => {
    const missing = stated
      .filter((pair) => !listed.has(`${pair.foreground}|${pair.background}`))
      .map((pair) => `${pair.foreground} on ${pair.background} — ${pair.file} ${pair.selector}`);

    expect([...new Set(missing)]).toEqual([]);
  });

  it('skips a -soft background only while -soft means translucent', () => {
    // The skip above reads a naming convention. If a `-soft` token were ever
    // given an opaque value, the skip would quietly stop covering a pair that
    // is measurable after all.
    const [, tokens] = stylesheets().find(([name]) => name === 'tokens.css') ?? ['', ''];
    const soft = [...tokens.matchAll(/(--[a-z0-9-]*-soft)\s*:\s*([^;]+);/gi)];

    expect(soft.length).toBeGreaterThan(0);
    for (const [, token, value] of soft) {
      expect(parseHex((value ?? '').trim()), `${token ?? ''} is ${value ?? ''}`).toBeUndefined();
    }
  });
});
