/**
 * What a component's own rules may say, as findings with positions.
 *
 * The rules a component draws itself with live in its `.tsx` as a template
 * literal, which is a place nothing was watching for a literal. Two readers
 * need to judge them and they must not judge them differently:
 *
 * - `eslint/shell.mjs` reports at the character while the file is open,
 *   which is where a mistake is cheapest to fix.
 * - `tests/component-styles.test.ts` reports over every carried string at once,
 *   which is what CI fails on.
 *
 * Two implementations of one rule is the drift this package settles the same
 * way three times in `AGENTS.md` — fuse values, icon names, hoisted
 * dependencies — so there is one implementation and both call it.
 *
 * Plain ESM in `scripts/` for the reason `css-selectors.mjs` gives: ESLint
 * loads it from a flat config outside the TypeScript program.
 *
 * Every finding carries `index` and `length` into the string it was given, so
 * a caller with a source map can point at the offending character. That is why
 * nothing here rewrites the text: masking replaces a span with spaces of the
 * same width so every offset still means what it meant.
 */

/** The prefix a custom property this package writes must carry. */
export const SHELL_NAMESPACE = '--shell-';

/**
 * Lengths that are not design decisions.
 *
 * A hairline is the thinnest line a border can be, and every stylesheet in
 * this repository writes it out. `100%` and `0` are the extremes of a box
 * rather than points on a scale. Nothing else gets in.
 */
const STRUCTURAL_LITERALS = new Set(['0', '1px', '100%']);

/** Anything that names a colour outright. */
const COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color-mix)\(/gi;

/** A number with a unit, which is a point on some scale a theme should own. */
const LENGTH = /(?<![\w.-])(\d*\.?\d+(?:px|rem|em|ch|vw|vh|vmin|vmax|%))/g;

/**
 * Track sizing, which is composition rather than a value.
 *
 * `minmax(0, 150px)` says a label column stops growing; `min(720px, 92vw)`
 * says a dialog stops before the viewport edge. Neither is a number a theme
 * would set, and forcing them into tokens would name every layout decision in
 * the system.
 */
const TRACK_FUNCTION =
  /\b(?:repeat|minmax|min|max|clamp|fit-content)\([^()]*(?:\([^()]*\)[^()]*)*\)/g;

/** `var(--x)` and `var(--x, var(--y))`, however deeply the fallback nests. */
const VAR_CALL = /\bvar\([^()]*(?:\([^()]*\)[^()]*)*\)/g;

/** A comment, which is prose. `74px` in one is an explanation. */
const COMMENT = /\/\*[\s\S]*?\*\//g;

/** The start of a custom-property declaration, wherever it appears. */
const DECLARATION = /(--[a-z0-9-]+)\s*:/g;

/** A custom-property declaration and everything it is set to. */
const DECLARATION_VALUE = /--[a-z0-9-]+\s*:[^;}]*/g;

/** A `var()` read, capturing the name and nothing of the fallback. */
const READ = /\bvar\(\s*(--[a-z0-9-]+)/g;

/**
 * A span replaced by spaces of the same width.
 *
 * Rewriting the text would move every offset after it, and an offset is how a
 * finding points at a character. Newlines survive so a line number still
 * resolves.
 */
function mask(text, pattern) {
  return text.replaceAll(pattern, (found) => found.replaceAll(/[^\n]/g, ' '));
}

/** The text with every comment blanked, offsets intact. */
export function withoutComments(css) {
  return mask(css, COMMENT);
}

/** Every custom property the text declares a value for. */
export function declaredTokens(css) {
  return [...withoutComments(css).matchAll(DECLARATION)].map((match) => match[1] ?? '');
}

/** Every custom property the text reads through `var()`. */
export function readTokens(css) {
  return [...withoutComments(css).matchAll(READ)].map((match) => match[1] ?? '');
}

/**
 * Every selector the text opens a rule with.
 *
 * Deliberately not `css-selectors.mjs`: that module parses a stylesheet into
 * rules and loses the offset of each selector, and the offset is the whole
 * point here. This is the cruder reader, and `tests/component-styles.test.ts`
 * runs the parsed one over the same strings, so a rule shape this misses is
 * still judged.
 */
function selectorsWithOffsets(css) {
  const found = [];

  for (const match of withoutComments(css).matchAll(/(^|[};])([^{};@]+)\{/g)) {
    const prefix = (match[1] ?? '').length;
    let cursor = match.index + prefix;

    for (const part of (match[2] ?? '').split(',')) {
      const lead = part.length - part.trimStart().length;
      const text = part.trim();
      if (text.length > 0) found.push({ text, index: cursor + lead, length: text.length });
      cursor += part.length + 1;
    }
  }

  return found;
}

/**
 * Everything wrong with one carried stylesheet.
 *
 * `published` is every `--shell-*` the shipped stylesheets read or declare —
 * the contract a consumer actually defines. It is a required argument with no
 * default on purpose: the check that matters most reports every name as fine
 * when the set is empty, and an empty set has to come from a caller who meant
 * it rather than from a default nobody noticed.
 *
 * @param {string} css
 * @param {{ published: ReadonlySet<string> }} contract
 * @returns {{ id: string, index: number, length: number, text: string, data: Record<string, string> }[]}
 */
export function componentCssFindings(css, contract) {
  const findings = [];
  const bare = withoutComments(css);
  const add = (id, index, length, text, data = {}) =>
    findings.push({ id, index, length, text, data });

  for (const match of bare.matchAll(COLOUR)) {
    add('colour', match.index, match[0].length, match[0]);
  }

  /*
   * A literal inside a custom-property declaration is the token layer, which
   * is where a value is supposed to be. Everything else is a size decided in a
   * place no theme can reach.
   */
  const values = mask(mask(mask(bare, DECLARATION_VALUE), VAR_CALL), TRACK_FUNCTION);
  for (const match of values.matchAll(LENGTH)) {
    const literal = match[1] ?? '';
    if (STRUCTURAL_LITERALS.has(literal)) continue;
    add('length', match.index, literal.length, literal, { literal });
  }

  const declared = new Set();
  for (const match of bare.matchAll(DECLARATION)) {
    const name = match[1] ?? '';
    declared.add(name);

    if (!name.startsWith(SHELL_NAMESPACE)) {
      add('foreign', match.index, name.length, name, { name });
      continue;
    }

    /*
     * The twenty-name case. `structure.css` once declared `--shell-radius-input`
     * beside a published `--shell-radius`, and `--shell-text-primary` beside a
     * published `--shell-text`: a second vocabulary for things that already had
     * a name, which no consumer defines and no shipped rule reads.
     */
    if (contract.published.has(name)) {
      add('redundant', match.index, name.length, name, { name });
    }
  }

  for (const match of bare.matchAll(READ)) {
    const name = match[1] ?? '';
    const offset = match[0].length - name.length;
    if (!name.startsWith(SHELL_NAMESPACE)) {
      add('foreign-read', match.index + offset, name.length, name, { name });
      continue;
    }
    if (contract.published.has(name) || declared.has(name)) continue;

    /*
     * An undefined custom property with no fallback makes the whole
     * declaration invalid at computed-value time, so this is not a wrong
     * colour or a smaller radius — it is no border and a square corner. It
     * renders correctly here for as long as something in this repository
     * happens to define the name, and wrongly for every consumer.
     */
    add('unknown', match.index + offset, name.length, name, { name });
  }

  for (const selector of selectorsWithOffsets(css)) {
    if (selector.text.startsWith('@') || selector.text.startsWith('.sb-shell')) continue;
    add('unscoped', selector.index, selector.length, selector.text, { selector: selector.text });
  }

  return findings.sort((left, right) => left.index - right.index);
}

/** What each finding means, in the words the reporter uses. */
export const COMPONENT_CSS_MESSAGES = {
  colour:
    'A carried rule names no colour. This package ships no palette — read a `--shell-*` token and let the consumer supply the value.',
  length:
    '`{{literal}}` is a design decision in a place no theme can reach. Read a token from `structure.css`, or declare one for geometry this component owns.',
  foreign:
    '`{{name}}` is outside the published namespace. A custom property this package writes is `--shell-*`, or a consumer cannot find it to override.',
  'foreign-read':
    '`{{name}}` is outside the published namespace. A carried rule reads `--shell-*`; the short names belong to this application, not to the package.',
  redundant:
    '`{{name}}` is already in the published contract. Read it rather than declaring a second value for it — two values for one name is the drift this is meant to end.',
  unknown:
    '`{{name}}` is in no shipped stylesheet, so a consumer defines nothing for it and the whole declaration is invalid at computed-value time — no border, not a faint one. Use a published `--shell-*` name, or declare this one with a value.',
  unscoped:
    '`{{selector}}` is not under `.sb-shell`. These rules are injected into the consumer\'s document, where an unscoped selector restyles their application.',
};
