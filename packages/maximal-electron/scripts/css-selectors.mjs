/**
 * Every selector a stylesheet writes a rule for.
 *
 * The check this replaces built its list from lines starting `.` or `*` and
 * ending `,` or `{`. A rule of any other shape was not in the list and was not
 * judged, so `button { color: red; }` appended to the package stylesheet left
 * the suite green and turned every button in a consumer's application red.
 * `:root {`, `[data-theme] {` and `html, body {` went through the same gap.
 * Issue #51.
 *
 * Plain ESM rather than TypeScript in `tests/`, because
 * `scripts/verify-exports.mjs` runs the same parse over `dist/renderer/
 * styles.css` under plain `node`.
 */

/** At-rules whose body holds style rules rather than declarations. */
const NESTS_RULES = new Set([
  'media',
  'supports',
  'layer',
  'container',
  'scope',
  'starting-style',
  'document',
]);

/**
 * The subset of those whose rules reach only some readers. `@layer` is absent:
 * it orders the cascade and applies to everyone.
 */
const CONDITIONAL = new Set([
  'media',
  'supports',
  'container',
  'scope',
  'starting-style',
  'document',
]);

/** The two block kinds whose body holds style rules. */
const RULES = 'rules';
const CONDITIONAL_RULES = 'conditional rules';

/** The index after the string literal opening at `start`. */
function endOfString(text, start) {
  const quote = text[start];
  let index = start + 1;
  while (index < text.length) {
    if (text[index] === '\\') index += 2;
    else if (text[index] === quote) return index + 1;
    else index += 1;
  }
  return text.length;
}

/** The index after the parenthesised group opening at `start`. */
function endOfGroup(text, start) {
  let depth = 0;
  let index = start;
  while (index < text.length) {
    const char = text[index];
    if (char === '"' || char === "'") {
      index = endOfString(text, index);
      continue;
    }
    if (char === '(') depth += 1;
    else if (char === ')') {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
    index += 1;
  }
  return text.length;
}

/** The at-rule's name, lowercased, without the `@`. */
function atRuleName(prelude) {
  return (/^@([a-z-]+)/i.exec(prelude)?.[1] ?? '').toLowerCase();
}

/**
 * A selector list split on its top-level commas.
 *
 * A comma inside `:is(.a, .b)` or inside `[title=","]` separates nothing.
 */
function splitSelectorList(prelude) {
  const parts = [];
  let current = '';
  let depth = 0;
  let index = 0;

  while (index < prelude.length) {
    const char = prelude[index];
    if (char === '"' || char === "'") {
      const end = endOfString(prelude, index);
      current += prelude.slice(index, end);
      index = end;
      continue;
    }
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    else if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
      index += 1;
      continue;
    }
    current += char;
    index += 1;
  }
  parts.push(current);

  return parts.map((part) => part.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/** A property name: a custom property, or an identifier a vendor may prefix. */
const PROPERTY = /^(--[a-z0-9_-]+|-?[a-z][a-z0-9-]*)$/i;

/**
 * A declaration body split on its top-level semicolons.
 *
 * A nested block is dropped rather than descended into. Its declarations belong
 * to the nested selector, and that selector opens a rule of its own.
 */
function splitDeclarations(body) {
  const parts = [];
  let current = '';
  let depth = 0;
  let index = 0;

  while (index < body.length) {
    const char = body[index];
    if (char === '"' || char === "'") {
      const end = endOfString(body, index);
      if (depth === 0) current += body.slice(index, end);
      index = end;
      continue;
    }
    if (char === '(') {
      const end = endOfGroup(body, index);
      if (depth === 0) current += body.slice(index, end);
      index = end;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      current = '';
    } else if (char === ';' && depth === 0) {
      parts.push(current);
      current = '';
    } else if (depth === 0) current += char;
    index += 1;
  }
  parts.push(current);

  return parts;
}

/**
 * Every property name a declaration body sets, in source order and with
 * repeats.
 *
 * Names only. A value is deliberately not returned: `structural.css` reads the
 * `--shell-*` namespace where the reference stylesheets carry a palette, so
 * every shared rule differs in its values by design.
 */
export function declaredProperties(body) {
  const found = [];
  for (const part of splitDeclarations(body)) {
    const colon = part.indexOf(':');
    if (colon === -1) continue;
    const name = part.slice(0, colon).trim();
    if (PROPERTY.test(name)) found.push(name.toLowerCase());
  }
  return found;
}

/**
 * Every style rule in a stylesheet, in source order: the selector, the
 * conditional at-rules enclosing it, and the property names its body declares.
 *
 * A selector list opens one rule per selector, each carrying the same body, so
 * a caller comparing two stylesheets can key on the individual selector.
 *
 * `conditions` is what tells a rule every reader gets from one only some do.
 * `.tab__emphasis` is laid out by a rule at the top level and has its animation
 * shortened by a second inside `@media (prefers-reduced-motion: reduce)`; a
 * reader who loses the first still sees the second. Issue #118. The prelude
 * rather than a flag, because two different media queries are two conditions.
 *
 * `layers` is the other axis and answers a different question: not who sees
 * the rule, but whether a consumer can beat it. An unlayered rule outranks a
 * layered one whatever its specificity, so a rule that has escaped its layer
 * is one this package would win with and should not. `tests/cascade-layers.
 * test.ts` is the reader.
 */
export function styleRules(css) {
  const found = [];
  /** What the innermost open block holds. The document holds rules. */
  const holds = [RULES];
  /** The conditional at-rule preludes enclosing the current block. */
  const conditions = [];
  /** The cascade layers enclosing the current block, outermost first. */
  const layers = [];
  /** The block depth each of those layers was opened at, so a `}` can pop it. */
  const layerDepths = [];
  /** The open style rule, when the innermost block is one. */
  let rule = null;
  let prelude = '';
  let index = 0;

  const write = (text) => {
    if (rule) rule.body += text;
    else prelude += text;
  };

  while (index < css.length) {
    const char = css[index];

    if (char === '/' && css[index + 1] === '*') {
      const end = css.indexOf('*/', index + 2);
      index = end === -1 ? css.length : end + 2;
      continue;
    }

    if (char === '"' || char === "'") {
      const end = endOfString(css, index);
      write(css.slice(index, end));
      index = end;
      continue;
    }

    if (char === '(') {
      const end = endOfGroup(css, index);
      write(css.slice(index, end));
      index = end;
      continue;
    }

    if (char === '{') {
      const head = prelude.trim();
      prelude = '';
      index += 1;

      const top = holds.at(-1);
      if (top !== RULES && top !== CONDITIONAL_RULES) {
        write('{');
        holds.push('declarations');
      } else if (head.startsWith('@')) {
        const name = atRuleName(head);
        if (CONDITIONAL.has(name)) {
          conditions.push(head.replace(/\s+/g, ' '));
          holds.push(CONDITIONAL_RULES);
        } else {
          holds.push(NESTS_RULES.has(name) ? RULES : 'declarations');
          if (name === 'layer') {
            layers.push(head.replace(/^@layer\s*/i, '').trim());
            layerDepths.push(holds.length);
          }
        }
      } else {
        rule = {
          selectors: splitSelectorList(head),
          conditions: [...conditions],
          layers: [...layers],
          body: '',
          depth: holds.length,
        };
        holds.push('declarations');
      }
      continue;
    }

    if (char === '}') {
      if (rule && holds.length === rule.depth + 1) {
        const properties = declaredProperties(rule.body);
        for (const selector of rule.selectors) {
          found.push({ selector, conditions: rule.conditions, layers: rule.layers, properties });
        }
        rule = null;
      } else if (rule) write('}');

      if (holds.at(-1) === CONDITIONAL_RULES) conditions.pop();
      if (layerDepths.at(-1) === holds.length) {
        layerDepths.pop();
        layers.pop();
      }
      if (holds.length > 1) holds.pop();
      prelude = '';
      index += 1;
      continue;
    }

    // `@import url(…);` and any other statement at-rule. Its prelude opens no
    // block, and carrying it forward would prefix the next rule's selector.
    if (char === ';') {
      if (rule) write(';');
      else prelude = '';
      index += 1;
      continue;
    }

    write(char);
    index += 1;
  }

  return found;
}

/**
 * Every individual selector in a stylesheet, in source order, each with whether
 * a conditional at-rule encloses it.
 */
export function selectorRules(css) {
  return styleRules(css).map(({ selector, conditions }) => ({
    selector,
    conditional: conditions.length > 0,
  }));
}

/** Every individual selector in a stylesheet, in source order. */
export function selectors(css) {
  return selectorRules(css).map((rule) => rule.selector);
}

/** A class name, matched only where a selector attaches a rule to it. */
const CLASS = /\.([a-z][a-z0-9_-]*)/gi;

/**
 * Every class a stylesheet writes a rule for.
 *
 * Read out of the parsed selectors rather than out of the file's text. The
 * predecessor matched `.name` anywhere, so a class named in a comment, in a
 * `content` string, or in nothing but prose counted as styled. Issue #118.
 *
 * An attribute selector's value is dropped first: `[title='.ghost']` selects on
 * a title, not on a class.
 */
export function styledClassNames(css) {
  const found = new Set();
  for (const selector of selectors(css)) {
    for (const match of selector.replace(/\[[^\]]*]/g, ' ').matchAll(CLASS)) found.add(match[1]);
  }
  return [...found].sort();
}

/**
 * Every class a stylesheet styles on its own, under `root` and under nothing
 * else.
 *
 * The selector has to reduce to the class alone: no second class, no attribute,
 * no pseudo-class, and no conditional at-rule around it. That is the rule a
 * consumer gets whatever the element's state, and it is the one whose loss
 * `styledClassNames` cannot see — `.tab__emphasis` renamed in its base rule
 * still appears in `.tab[data-emphasis='busy'] .tab__emphasis`. Issue #118.
 *
 * `root` may be empty, for a stylesheet that scopes nothing.
 */
export function baseStyledClassNames(css, root) {
  const found = new Set();
  for (const { selector, conditional } of selectorRules(css)) {
    if (conditional || !isScoped(selector, root)) continue;
    const name = /^\.([a-z][a-z0-9_-]*)$/i.exec(selector.slice(root.length).trim())?.[1];
    if (name !== undefined) found.add(name);
  }
  return [...found].sort();
}

/**
 * Whether a selector is confined to a root class.
 *
 * The boundary matters: `.sb-shellish .tab` starts with `.sb-shell` and is a
 * different element entirely.
 */
export function isScoped(selector, root) {
  if (!selector.startsWith(root)) return false;
  const next = selector.slice(root.length, root.length + 1);
  return next === '' || !/[\w-]/.test(next);
}

/** Every selector in a stylesheet that escapes the root class. */
export function unscopedSelectors(css, root) {
  return selectors(css).filter((selector) => !isScoped(selector, root));
}
