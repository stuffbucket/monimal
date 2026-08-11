import { describe, expect, it } from 'vitest';

import {
  baseStyledClassNames,
  isScoped,
  selectorRules,
  selectors,
  styledClassNames,
  unscopedSelectors,
} from '../scripts/css-selectors.mjs';

/**
 * The parser behind the scoping check on the package stylesheet.
 *
 * Its predecessor recognised a selector by the shape of the line it sat on, so
 * every shape it did not recognise went unjudged. These fixtures are the shapes
 * issue #51 names, plus the constructs `structural.css` already uses, so a
 * parser that silently stops seeing one of them fails here rather than in the
 * check that depends on it.
 */

describe('reading selectors out of a stylesheet', () => {
  it('finds a bare element rule, which the line heuristic never saw', () => {
    expect(selectors('button {\n  color: red;\n}')).toEqual(['button']);
  });

  it('finds the other shapes that went through the same gap', () => {
    expect(selectors(':root { --a: 1px; }')).toEqual([':root']);
    expect(selectors('[data-theme] { color: red; }')).toEqual(['[data-theme]']);
    expect(selectors('html, body { margin: 0; }')).toEqual(['html', 'body']);
  });

  it('finds a selector written on the same line as its declarations', () => {
    expect(selectors('.a { color: red; } .b { color: blue; }')).toEqual(['.a', '.b']);
  });

  it('splits a selector list across lines and collapses its whitespace', () => {
    expect(selectors('.a,\n.b\n  .c {\n  color: red;\n}')).toEqual(['.a', '.b .c']);
  });

  it('ignores a comma that separates nothing', () => {
    expect(selectors(':is(.a, .b) .c { color: red; }')).toEqual([':is(.a, .b) .c']);
    expect(selectors('[title=","] { color: red; }')).toEqual(['[title=","]']);
  });

  it('reads the rules inside a conditional at-rule', () => {
    expect(selectors('@media (prefers-reduced-motion: reduce) {\n  .a { top: 0; }\n}')).toEqual([
      '.a',
    ]);
    expect(selectors('@supports (display: grid) { .a { top: 0; } }')).toEqual(['.a']);
    expect(selectors('@layer base { .a { top: 0; } }')).toEqual(['.a']);
  });

  it('does not mistake a keyframe offset for a selector', () => {
    expect(selectors('@keyframes spin {\n  from { opacity: 0; }\n  to { opacity: 1; }\n}')).toEqual(
      [],
    );
    // The percentage form, and a comma-separated offset list. `sb-tab-busy` in
    // `structural.css` names its resting position at both ends, so `0%, 100%`
    // is the shape the package stylesheet actually ships.
    expect(
      selectors('@keyframes x {\n  0%,\n  100% { top: 0; }\n\n  50% { top: 1px; }\n}'),
    ).toEqual([]);
  });

  it('does not mistake a declaration-only at-rule for a selector', () => {
    expect(selectors('@font-face { font-family: Inter; }')).toEqual([]);
  });

  it('reads no selector out of a comment', () => {
    expect(selectors('/* button { color: red; } */\n.a { top: 0; }')).toEqual(['.a']);
  });

  it('does not carry a statement at-rule into the next selector', () => {
    expect(selectors("@import url('x.css');\n.a { top: 0; }")).toEqual(['.a']);
  });

  it('judges a nested rule by the selector that already confines it', () => {
    expect(selectors('.a {\n  color: red;\n  & button { color: blue; }\n}')).toEqual(['.a']);
  });

  it('returns nothing for a stylesheet with no rules', () => {
    expect(selectors('')).toEqual([]);
    expect(selectors('/* nothing here */')).toEqual([]);
  });
});

/**
 * The two the class checks in `tests/package-styles.test.ts` stand on.
 *
 * The set they replace was every `.name` in the file's text, which counted a
 * class named in a comment and, worse, counted a class named in a descendant
 * rule as one that had a rule of its own. Issue #118.
 */
describe('reading the classes a stylesheet styles', () => {
  it('reads a class out of a selector rather than out of the text', () => {
    expect(styledClassNames('.a .b { color: red; }')).toEqual(['a', 'b']);
    expect(styledClassNames('/* .ghost { color: red; } */\n.a { top: 0; }')).toEqual(['a']);
    expect(styledClassNames(".a::before { content: '.ghost'; }")).toEqual(['a']);
  });

  it('returns both sets in name order rather than in source order', () => {
    expect(styledClassNames('.b { top: 0; }\n.a { top: 0; }')).toEqual(['a', 'b']);
    expect(baseStyledClassNames('.b { top: 0; }\n.a { top: 0; }', '')).toEqual(['a', 'b']);
  });

  it('reads no class out of an attribute value or a pseudo-element', () => {
    expect(styledClassNames(".a[title='.ghost'] { top: 0; }")).toEqual(['a']);
    expect(styledClassNames('.a::-webkit-scrollbar { width: 0; }')).toEqual(['a']);
  });

  it('reports which rules a conditional at-rule encloses', () => {
    expect(selectorRules('@media (min-width: 1px) { .a { top: 0; } }')).toEqual([
      { selector: '.a', conditional: true },
    ]);
    expect(selectorRules('.a { top: 0; }')).toEqual([{ selector: '.a', conditional: false }]);
    // `@layer` orders the cascade. Every reader gets the rule.
    expect(selectorRules('@layer base { .a { top: 0; } }')).toEqual([
      { selector: '.a', conditional: false },
    ]);
  });

  it('counts a class styled under the root and nothing else', () => {
    expect(baseStyledClassNames('.sb-shell .a { top: 0; }', '.sb-shell')).toEqual(['a']);
    expect(baseStyledClassNames('.sb-shell.a { top: 0; }', '.sb-shell')).toEqual(['a']);
    expect(baseStyledClassNames('.a { top: 0; }', '')).toEqual(['a']);
  });

  it('counts no class a rule reaches only through a condition', () => {
    // The reproduction in issue #118: the base rule renamed, the descendants
    // left naming the class. `styledClassNames` still finds it; this does not.
    const css = `.sb-shell .b-typo { position: absolute; }
      .sb-shell .c[data-x='1'] .b { top: 0; }
      @media (prefers-reduced-motion: reduce) { .sb-shell .b { animation-duration: 0.01ms; } }`;
    expect(styledClassNames(css)).toContain('b');
    expect(baseStyledClassNames(css, '.sb-shell')).toEqual(['b-typo']);
  });

  it('counts no class a state or a second class qualifies', () => {
    expect(baseStyledClassNames('.sb-shell .a:hover { top: 0; }', '.sb-shell')).toEqual([]);
    expect(baseStyledClassNames('.sb-shell .a.b { top: 0; }', '.sb-shell')).toEqual([]);
    expect(baseStyledClassNames(".sb-shell .a[data-x='1'] { top: 0; }", '.sb-shell')).toEqual([]);
    expect(baseStyledClassNames('.sb-shell .a::after { top: 0; }', '.sb-shell')).toEqual([]);
  });

  it('counts no class outside the root', () => {
    expect(baseStyledClassNames('.other .a { top: 0; }', '.sb-shell')).toEqual([]);
    expect(baseStyledClassNames('.sb-shellish .a { top: 0; }', '.sb-shell')).toEqual([]);
  });

  it('returns nothing for a stylesheet with no rules', () => {
    expect(styledClassNames('')).toEqual([]);
    expect(baseStyledClassNames('', '.sb-shell')).toEqual([]);
  });
});

describe('judging a selector against a root class', () => {
  it('accepts the root alone and the root with a suffix', () => {
    expect(isScoped('.sb-shell', '.sb-shell')).toBe(true);
    expect(isScoped('.sb-shell.app', '.sb-shell')).toBe(true);
    expect(isScoped('.sb-shell *::after', '.sb-shell')).toBe(true);
    expect(isScoped('.sb-shell .tab:hover', '.sb-shell')).toBe(true);
  });

  it('rejects a different class that starts with the same characters', () => {
    expect(isScoped('.sb-shellish .tab', '.sb-shell')).toBe(false);
    expect(isScoped('.sb-shell-wide', '.sb-shell')).toBe(false);
  });

  it('rejects a selector that reaches outside the root', () => {
    expect(isScoped('button', '.sb-shell')).toBe(false);
    expect(isScoped(':root', '.sb-shell')).toBe(false);
    expect(isScoped('.app .sb-shell', '.sb-shell')).toBe(false);
  });

  it('reports the escaping half of a selector list', () => {
    expect(unscopedSelectors('.sb-shell .tab,\nbutton {\n  color: red;\n}', '.sb-shell')).toEqual([
      'button',
    ]);
  });

  it('reports nothing when every selector is confined', () => {
    expect(unscopedSelectors('.sb-shell .tab { color: red; }', '.sb-shell')).toEqual([]);
  });
});
