import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { baseStyledClassNames, isScoped, styleRules, styledClassNames } from '../scripts/css-selectors.mjs';

/**
 * What the two stylesheet contracts are, and how to tell them apart.
 *
 * `src/renderer/styles/` holds both. The shell's own palette is checked by
 * `tests/contrast.test.ts` against `REQUIRED_TOKENS`; the public package's is
 * the `--shell-*` namespace that `structural.css` reads, `README.md` documents,
 * and `tests/package-styles.test.ts` checks.
 *
 * They used to be told apart by a filename: `contrast.test.ts` skipped
 * `structural.css`. That exclusion was added when `structural.css` arrived and
 * broke the `REQUIRED_TOKENS` tripwire, and it holds only while there is one
 * file on each side. The namespace is the real distinction, so this module
 * classifies tokens and both tests share it.
 *
 * Not a `.test.ts` file, so Vitest does not collect it.
 */

const STYLES = new URL('../src/renderer/styles/', import.meta.url);
const RENDERER = new URL('../src/renderer/', import.meta.url);

/** The prefix that marks a token as the consumer's to supply. */
export const PACKAGE_NAMESPACE = '--shell-';

/** Whether a token belongs to the public package's contract. */
export function isPackageToken(token: string): boolean {
  return token.startsWith(PACKAGE_NAMESPACE);
}

/** Every stylesheet in the shell's style directory, as name and text. */
export function stylesheets(): [string, string][] {
  return readdirSync(STYLES)
    .filter((name) => name.endsWith('.css'))
    .map((name) => [name, readFileSync(new URL(name, STYLES), 'utf8')]);
}

/** Every `var(--…)` a stylesheet reads, in source order and with repeats. */
export function readTokens(css: string): string[] {
  return [...css.matchAll(/var\((--[a-z0-9-]+)/gi)].map((match) => match[1] ?? '');
}

/**
 * Every `--shell-*` token a stylesheet reads, split by whether it has a
 * fallback. A token read as `var(--shell-x)` is the consumer's to define; one
 * read as `var(--shell-x, 8px)` already has a value.
 */
export function packageReads(css: string): { required: Set<string>; optional: Set<string> } {
  const required = new Set<string>();
  const optional = new Set<string>();

  for (const match of css.matchAll(/var\((--shell-[a-z0-9-]+)\s*(,)?/gi)) {
    const token = match[1];
    if (token) (match[2] ? optional : required).add(token);
  }

  return { required, optional };
}

/**
 * Every module reachable from the package's renderer entry point.
 *
 * Follows relative imports from `src/renderer/index.ts`, which is the same walk
 * `scripts/verify-exports.mjs` makes over the built output. Reading the source
 * rather than `dist/` keeps this a unit test: it needs no build, and it sees a
 * class name written in a template literal that the emitter has since flattened.
 * `tests/class-names.ts` reads the classes back out of each one.
 */
export function exportedModules(): [string, string][] {
  const found: [string, string][] = [];
  const seen = new Set<string>();
  const pending = ['index'];

  while (pending.length > 0) {
    const specifier = pending.pop();
    if (specifier === undefined || seen.has(specifier)) continue;
    seen.add(specifier);

    // The entry re-exports with a `.js` suffix, which is what the emitter
    // wants. On disk the file is `.ts` or `.tsx`.
    const base = specifier.replace(/\.js$/, '');
    const source = ['.ts', '.tsx']
      .map((extension) => new URL(base + extension, RENDERER))
      .find((url) => existsSync(url));
    if (!source) continue;

    const text = readFileSync(source, 'utf8');
    found.push([base, text]);

    const directory = path.posix.dirname(base);
    for (const match of text.matchAll(/from\s*'(\.[^']+)'/g)) {
      const target = match[1];
      if (target !== undefined) pending.push(path.posix.join(directory, target));
    }
  }

  return found;
}

/** Every class a stylesheet writes a rule for. */
export function styledClasses(css: string): Set<string> {
  return new Set(styledClassNames(css));
}

/**
 * Every class a stylesheet styles on its own, under `root` and nothing else.
 *
 * The distinction `styledClasses` cannot draw. A class named in a surviving
 * descendant rule is still mentioned by a selector after its own rule is gone,
 * and the element it names is then laid out by nothing. Issue #118.
 */
export function baseStyledClasses(css: string, root: string): Set<string> {
  return new Set(baseStyledClassNames(css, root));
}

/** A rule the package carries with fewer properties than the reference. */
export interface RuleDrift {
  /** The normalised selector, as the package writes it without its root. */
  selector: string;
  /** The property names the reference declares and the package does not. */
  missing: string[];
}

/** What a mirror comparison examined, and where the two sides disagree. */
export interface Mirror {
  /** How many selectors both stylesheets write a rule for. */
  selectors: number;
  /** How many reference property names those rules declare between them. */
  properties: number;
  /** Reference selectors the package writes no rule for at all. */
  unmatchedReference: number;
  /** Package selectors the reference writes no rule for at all. */
  unmatchedPackage: number;
  /** One entry per shared selector whose package rule is short of properties. */
  drift: RuleDrift[];
}

/**
 * The key two stylesheets compare a rule on.
 *
 * Whitespace collapses, a combinator is padded to one space on each side, and
 * a double-quoted attribute value is rewritten single-quoted, so
 * `.tab[data-state="active"]` and `.tab[data-state='active']` are one rule and
 * `.a>.b` and `.a > .b` are one rule.
 *
 * The enclosing conditional at-rules join the key rather than collapsing to a
 * flag. `@media (prefers-reduced-motion: reduce)` and `@media (hover: hover)`
 * reach different readers, and a rule in one is not the rule in the other.
 */
function ruleKey(selector: string, conditions: string[]): string {
  const normalised = selector
    .replace(/"/g, "'")
    .replace(/\s*([>+~])\s*/g, ' $1 ')
    .replace(/\s+/g, ' ')
    .trim();
  return [...conditions, normalised].join(' | ');
}

/**
 * Every property name a stylesheet declares, by rule key.
 *
 * `root` is stripped from a selector that is confined to it, which is what puts
 * the package's `.sb-shell .panel` and the reference's `.panel` on one key. A
 * selector that reduces to the root alone selects the shell itself and has no
 * counterpart, so it is dropped; one that escapes the root keeps its full text
 * rather than being dropped, because an unscoped rule in the package is a rule
 * the reference may still own.
 *
 * The properties of every rule sharing a key are unioned. The question is
 * whether the stylesheet sets the property for that selector at all, and a
 * stylesheet is free to split one rule into two.
 */
function declarationsByRule(css: string, root: string): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>();

  for (const rule of styleRules(css)) {
    const scoped = root !== '' && isScoped(rule.selector, root);
    const selector = scoped ? rule.selector.slice(root.length).trim() : rule.selector;
    if (selector === '') continue;

    const key = ruleKey(selector, rule.conditions);
    const properties = found.get(key) ?? new Set<string>();
    for (const property of rule.properties) properties.add(property);
    found.set(key, properties);
  }

  return found;
}

/**
 * What the package stylesheet is missing from the reference, rule by rule.
 *
 * Property names only. The values differ on every shared rule by design: the
 * reference carries a palette and `structural.css` reads the `--shell-*`
 * namespace, so a comparison of values would fail everywhere and be deleted
 * rather than fixed. A name is the part that says whether the rule does
 * anything at all — `styledClasses` above reports a class as styled while the
 * body that laid it out is gone, which is how 20 rules drifted unseen.
 */
export function mirroredRules(reference: string, css: string, root: string): Mirror {
  const theirs = declarationsByRule(reference, '');
  const ours = declarationsByRule(css, root);

  const shared = [...theirs.keys()].filter((key) => ours.has(key)).sort();
  const drift: RuleDrift[] = [];
  let properties = 0;

  for (const key of shared) {
    const expected = theirs.get(key) ?? new Set<string>();
    const carried = ours.get(key) ?? new Set<string>();
    properties += expected.size;

    const missing = [...expected].filter((property) => !carried.has(property)).sort();
    if (missing.length > 0) drift.push({ selector: key, missing });
  }

  return {
    selectors: shared.length,
    properties,
    unmatchedReference: theirs.size - shared.length,
    unmatchedPackage: ours.size - shared.length,
    drift,
  };
}
