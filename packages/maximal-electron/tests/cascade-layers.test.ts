import { readFileSync, readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { styleRules } from '../scripts/css-selectors.mjs';
import { packageStylesheets } from '../scripts/shell-variables.mjs';
import { SHELL_COMPONENT_LAYER, SHELL_STYLE_LAYERS } from '../src/renderer/lib/component-styles.js';
import { componentStyles } from './stylesheets.js';

/**
 * Whether a consumer can beat a rule this package ships.
 *
 * Until this, they could not. Every rule here is `.sb-shell .thing`, so a
 * consumer writing `.sb-shell .thing` matches at equal specificity and source
 * order decides — and the rules a component carries arrive by
 * `document.head.append` during the first render, after any stylesheet the
 * consumer linked. Ours won every time. `docs/shell-variables.md` described
 * the tokens a component declares for its own geometry as overridable while
 * that was true of none of them.
 *
 * The alternative was policing our own specificity forever, which is the
 * arrangement Atom had: issue #13019 is a mechanical selector rewrite that
 * stayed syntactically faithful, silently lowered specificity, and left a
 * package's rule and core's both painting. A cascade layer removes the
 * question — an unlayered rule outranks a layered one however many classes the
 * layered one chains — which is the retrofit Radix Themes had to make after
 * shipping two-class selectors that outranked their consumers' utilities.
 *
 * So the invariant is not "some rules are layered". It is that a rule scoped
 * under the shell root is never outside a layer, because one that escapes is
 * one this package wins with and a consumer cannot reach.
 */

const STYLES = new URL('../src/renderer/styles/', import.meta.url);

/** The namespace every layer this package opens sits under. */
const LAYER_ROOT = 'sb-shell';

/** The class every rule the package ships is scoped under. */
const SHELL_ROOT = '.sb-shell';

/** Every stylesheet in the shell's style directory, as name and text. */
function sheets(): [string, string][] {
  return readdirSync(STYLES)
    .filter((name) => name.endsWith('.css'))
    .map((name) => [name, readFileSync(new URL(name, STYLES), 'utf8')]);
}

describe('a rule scoped under the shell root', () => {
  const all = sheets();
  const scoped = all.flatMap(([name, css]) =>
    styleRules(css)
      .filter((rule) => rule.selector.startsWith(SHELL_ROOT))
      .map((rule) => ({ name, ...rule })),
  );

  it('is found in every stylesheet the shell directory holds', () => {
    // The floor. A parser that stopped seeing rules would report every one of
    // them as layered by finding none, which is the false pass this
    // repository has now shipped twice.
    expect(all.length).toBeGreaterThan(4);
    expect(scoped.length).toBeGreaterThan(150);
  });

  it('sits inside a cascade layer, in every stylesheet', () => {
    const escaped = scoped
      .filter((rule) => rule.layers.length === 0)
      .map((rule) => `${rule.name}: ${rule.selector}`);

    expect(escaped).toEqual([]);
  });

  it('sits inside this packageics namespace rather than any layer at all', () => {
    // A bare `@layer { … }` is anonymous and can never be re-ordered by a
    // consumer, and a layer named something else is one they cannot find.
    const foreign = [
      ...new Set(
        scoped
          .flatMap((rule) => rule.layers)
          .filter((layer) => layer !== LAYER_ROOT && !layer.startsWith(`${LAYER_ROOT}.`)),
      ),
    ].sort();

    expect(foreign).toEqual([]);
  });

  it('leaves a stylesheet that only declares tokens unlayered', () => {
    /*
     * `tokens.css` and `shell-contract.css` set custom properties on `:root`
     * and open no rule that competes with anything. Layering them would be
     * harmless and pointless; the reason to say so here is that the check
     * above passes trivially over a file with no scoped rule, and a reader
     * should know which files those are rather than assume the list is
     * complete.
     */
    const unlayered = all
      .filter(([, css]) => styleRules(css).every((rule) => rule.layers.length === 0))
      .map(([name]) => name)
      .sort();

    expect(unlayered).toEqual(['shell-contract.css', 'tokens.css']);
  });
});

describe('the order of those layers', () => {
  it('is stated rather than left to whichever surface renders first', () => {
    /*
     * Layer order is decided by first appearance. A carried stylesheet appears
     * when its component first renders, so without a statement the precedence
     * between the shipped sheet and a carried rule would depend on which
     * surface a consumer happened to open — the same rule producing different
     * results in two applications.
     */
    const published = packageStylesheets()
      .flatMap((sheet) => sheet.sources)
      .map((source) => readFileSync(new URL(`../${source}`, import.meta.url), 'utf8'));

    expect(published[0]).toContain(`@layer ${SHELL_STYLE_LAYERS};`);
  });

  it('puts a carried rule after the sheet it refines', () => {
    // `structural.css` lays out `.settings`; `SettingsPage` carries the rules
    // for `.settings__section`. Reversing them would give the sheet the last
    // word over the component that ships with it.
    const order = SHELL_STYLE_LAYERS.split(',').map((name) => name.trim());

    expect(order).toEqual(['sb-shell.base', 'sb-shell.components']);
    expect(order.indexOf(SHELL_COMPONENT_LAYER)).toBe(order.length - 1);
  });

  it('is not written into the strings a component carries', () => {
    /*
     * The wrapper is applied once at injection rather than typed into every
     * constant. A layer written by hand in one string and forgotten in the
     * next is the drift the whole arrangement exists to end, and it would put
     * the one that forgot ahead of every other rule in the package.
     */
    expect(componentStyles()).not.toContain('@layer');
  });
});
