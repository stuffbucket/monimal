import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SettingsPage } from '../src/renderer/components/settings/SettingsPage.js';
import { componentStyles, exportedModules } from './stylesheets.js';

/**
 * What a component's own rules may say.
 *
 * The rules travel with the component now, which puts them in a TypeScript
 * file where nothing was watching for a literal. A colour or a size written
 * out here is a design decision made in a place no theme can reach: it renders
 * correctly in this repository and wrongly for every consumer with a palette
 * of their own, which is the failure `docs/shell-variables.md` describes as
 * "never an error, only a slightly wrong picture".
 *
 * So a value belongs to the token layer. `structure.css` ships the structural
 * ramp with values, `README.md` holds the palette a consumer defines, and a
 * component with geometry of its own declares a token for it rather than
 * inlining the number — the third tier of the usual primitive, semantic and
 * component split.
 */

/** Comments are prose. `74px` in one is an explanation, not a declaration. */
const rules = (css: string): string => css.replaceAll(/\/\*[\s\S]*?\*\//g, '');

/** `var(--x)` and `var(--x, var(--y))`, so what is left is what was written. */
const withoutTokens = (css: string): string =>
  css.replaceAll(/var\([^()]*(?:\([^()]*\)[^()]*)*\)/g, 'TOKEN');

const styles = rules(componentStyles());

/**
 * Lengths that are not design decisions.
 *
 * A hairline is the thinnest line a border can be, and every stylesheet in
 * this repository writes it out. `100%` and `0` are the extremes of a box
 * rather than points on a scale. Nothing else gets in.
 */
const STRUCTURAL_LITERALS = new Set(['0', '1px', '100%']);

/**
 * Track sizing, which is composition rather than a value.
 *
 * `minmax(0, 150px)` says a label column stops growing; `min(720px, 92vw)`
 * says a dialog stops before the viewport edge. Neither is a number a theme
 * would set, and forcing them into tokens would name every layout decision in
 * the system.
 */
const TRACK_FUNCTIONS = /(?:repeat|minmax|min|max|clamp|fit-content)\([^()]*(?:\([^()]*\)[^()]*)*\)/g;

describe('the rules a component carries', () => {
  it('are read at all', () => {
    // The floor. A reader that matched nothing would report every check below
    // as passing over an empty string, which is the shape of the false pass
    // this repository has shipped twice.
    expect(styles.length).toBeGreaterThan(4000);
    expect(styles).toContain('.sb-shell .settings');
  });

  it('name no colour', () => {
    // A palette is the consumer's, and this package ships none of it.
    expect(styles.match(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|color-mix)\(/gi) ?? []).toEqual([]);
  });

  it('write no length the token layer should hold', () => {
    // A custom property is the token layer. A literal there is the value a
    // consumer overrides, which is where a value is supposed to be.
    const declarations = styles.replaceAll(/^\s*--shell-[a-z0-9-]+\s*:[^;]+;/gm, '');
    const written = withoutTokens(declarations).replaceAll(TRACK_FUNCTIONS, 'TRACK');
    const literals = [...written.matchAll(/(?<![\w.-])(\d*\.?\d+(?:px|rem|em|ch|vw|vh|%))/g)]
      .map((match) => match[1] ?? '')
      .filter((literal) => !STRUCTURAL_LITERALS.has(literal));

    expect([...new Set(literals)].sort()).toEqual([]);
  });

  it('declare a token for the geometry they own', () => {
    // The other half of the rule above. A component may need a size the ramp
    // has no name for; what it may not do is inline it. A declaration here is
    // what a consumer overrides.
    const declared = [...styles.matchAll(/^\s*(--shell-[a-z0-9-]+)\s*:/gm)].map((m) => m[1]);
    expect(declared.length).toBeGreaterThan(0);
    expect(declared.filter((name) => name !== undefined && !name.startsWith('--shell-'))).toEqual([]);
  });

  it('scope every rule under the shell root', () => {
    // An unscoped selector injected into a consumer's document restyles their
    // application. `scripts/verify-exports.mjs` asserts this of the published
    // stylesheet; these rules never pass through it.
    const selectors = [...styles.matchAll(/(^|\})\s*([^{}@]+)\{/g)]
      .flatMap((match) => (match[2] ?? '').split(','))
      .map((selector) => selector.trim())
      .filter((selector) => selector.length > 0);

    expect(selectors.length).toBeGreaterThan(20);
    expect(selectors.filter((selector) => !selector.startsWith('.sb-shell'))).toEqual([]);
  });

  it('are asked for by the component that renders them', () => {
    // A string nothing injects is a rule that never applies. Every style
    // constant has to reach `useComponentStyles`, in its own module or in one
    // that imports it.
    const orphans = exportedModules()
      .flatMap(([name, source]) =>
        [...source.matchAll(/^(?:export )?const ([A-Z_]+) = `[^`]*\.sb-shell[^`]*`;$/gm)]
          .map((match) => match[1] ?? '')
          .filter((constant) => !allUses.includes(constant))
          .map((constant) => `${name}: ${constant}`),
      )
      .sort();

    expect(orphans).toEqual([]);
  });
});

/** Every argument any exported module passes to the hook. */
const allUses = exportedModules()
  .flatMap(([, source]) => [...source.matchAll(/useComponentStyles\('[^']+',\s*([A-Z_]+)\)/g)])
  .map((match) => match[1] ?? '');

describe('a component that carries rules', () => {
  it('renders where there is no document to inject into', () => {
    /*
     * `useInsertionEffect` does not run on the server, so this proves only
     * that importing and rendering the component does not reach for a
     * document at module scope or during render. A rule is decoration:
     * refusing to render without one would be worse than rendering without
     * it, and the hook's own guard says the same.
     */
    const markup = renderToStaticMarkup(
      createElement(SettingsPage, { title: 'Diagnostics', children: null }),
    );

    expect(markup).toContain('class="settings"');
    expect(markup).toContain('Diagnostics');
  });
});
