/**
 * The two contracts a reusable surface has to keep, enforced where they are
 * written.
 *
 * A component carries the rules it draws itself with, as a template literal in
 * its own `.tsx`. That solved the drift a hand-copied stylesheet had, and it
 * moved every rule into a file where nothing was watching: `tsc` sees a
 * string, and the CSS tooling that would have judged it never runs over a
 * TypeScript file.
 *
 * `tests/component-styles.test.ts` closed that hole and closed it late. A test
 * reports a list of names after the fact; this reports at the character, in
 * the editor, while the rule is being written — which is the difference
 * between learning that `--shell-text-primary` is undefined and never typing
 * it. Both call `scripts/component-css.mjs`, so there is one judgement and two
 * places it is delivered.
 *
 * The contract is read from the stylesheets this package ships rather than
 * listed here. A list would drift, which is the whole subject.
 */

import { readFileSync } from 'node:fs';

import { COMPONENT_CSS_MESSAGES, componentCssFindings } from '../scripts/component-css.mjs';
import { packageStylesheets } from '../scripts/shell-variables.mjs';

/** Where the shipped stylesheets sit, relative to this file. */
const PACKAGE_ROOT = new URL('../', import.meta.url);

/**
 * Every `--shell-*` the shipped stylesheets read or declare.
 *
 * Read once. A lint run opens hundreds of files and the contract does not
 * change between them; a rule that re-read two stylesheets per template
 * literal would be the "impinges on developer experience" this is meant to
 * avoid.
 *
 * The floor is here rather than in the rule body, because a resolution that
 * silently found nothing would report every name in the repository as fine —
 * the shape of the false pass this package has now shipped twice.
 */
let contract;

function publishedTokens() {
  if (contract !== undefined) return contract;

  const css = packageStylesheets()
    .flatMap((sheet) => sheet.sources)
    .map((source) => readFileSync(new URL(source, PACKAGE_ROOT), 'utf8'))
    .join('\n');

  const found = new Set([
    ...[...css.matchAll(/var\(\s*(--shell-[a-z0-9-]+)/g)].map((match) => match[1]),
    ...[...css.matchAll(/^\s*(--shell-[a-z0-9-]+)\s*:/gm)].map((match) => match[1]),
  ]);

  if (found.size < 30) {
    throw new Error(
      `shell: read ${String(found.size)} tokens from the shipped stylesheets, which is too few to be the contract. ` +
        'Check that packageStylesheets() still names files that exist.',
    );
  }

  contract = found;
  return contract;
}

/**
 * A template literal is a stylesheet when it says `.sb-shell`.
 *
 * The same marker `tests/stylesheets.ts` uses, and it is not a heuristic:
 * `src/renderer/lib/component-styles.ts` requires the scope, so a carried
 * rule that omits it is already broken. A literal with an expression in it is
 * skipped — the offsets a finding carries would not survive the substitution,
 * and no carried stylesheet has ever had one.
 */
function styleText(node) {
  if (node.expressions.length > 0) return undefined;
  const text = node.quasis[0]?.value.cooked;
  return text !== undefined && text.includes('.sb-shell') ? text : undefined;
}

/** @type {import('eslint').Rule.RuleModule} */
const designTokens = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Hold a component-carried stylesheet to the published design contract.',
    },
    schema: [],
    messages: COMPONENT_CSS_MESSAGES,
  },
  create(context) {
    const published = publishedTokens();

    return {
      TemplateLiteral(node) {
        const css = styleText(node);
        if (css === undefined) return;

        // The text starts one character past the opening backtick.
        const origin = node.range[0] + 1;

        for (const finding of componentCssFindings(css, { published })) {
          context.report({
            loc: {
              start: context.sourceCode.getLocFromIndex(origin + finding.index),
              end: context.sourceCode.getLocFromIndex(origin + finding.index + finding.length),
            },
            messageId: finding.id,
            data: finding.data,
          });
        }
      },
    };
  },
};

/**
 * Words a reusable control may not hold.
 *
 * Five exported components carried fifty-seven user-facing strings. A control
 * that does that fixes the language and the product's voice for everyone who
 * installs it. `src/renderer/lib/content.ts` is where the strings went, and
 * this is what stops the next one being typed back in.
 *
 * `tests/content-seam.test.ts` is the other half: it renders each surface from
 * the lorem stub and fails on English that still reaches the DOM. That check
 * is the stronger one and it cannot see the two dialogs, because Radix portals
 * them and there is no document to portal into. This reads source, so it sees
 * every surface — and it sees them while they are being written.
 */

/** Props whose value a person reads. */
const CONTENT_PROPS = new Set([
  'about',
  'aria-label',
  'aria-description',
  'confirmLabel',
  'description',
  'hint',
  'label',
  'message',
  'placeholder',
  'title',
]);

/** Text with a letter in it. `·`, `(`, `.` and a bare entity are not content. */
const PROSE = /\p{L}/u;

/** @type {import('eslint').Rule.RuleModule} */
const content = {
  meta: {
    type: 'problem',
    docs: { description: 'Keep user-facing words out of a reusable component.' },
    schema: [],
    messages: {
      text: 'A reusable control takes its words from the caller. Move `{{text}}` into `src/renderer/lib/content.ts` and read it through `useShellContent()`.',
      prop: '`{{name}}` is what a person reads. Move `{{text}}` into `src/renderer/lib/content.ts` and read it through `useShellContent()`.',
    },
  },
  create(context) {
    /** Trimmed to one line, and cut, so a message stays a message. */
    const excerpt = (value) => {
      const text = value.trim().replaceAll(/\s+/g, ' ');
      return text.length > 40 ? `${text.slice(0, 40)}…` : text;
    };

    return {
      JSXText(node) {
        if (!PROSE.test(node.value)) return;
        context.report({ node, messageId: 'text', data: { text: excerpt(node.value) } });
      },
      JSXAttribute(node) {
        const name = node.name.type === 'JSXIdentifier' ? node.name.name : '';
        if (!CONTENT_PROPS.has(name)) return;

        const value = node.value;
        if (value === null) return;

        // A string written in the tag: title="Usage".
        if (value.type === 'Literal' && typeof value.value === 'string') {
          if (!PROSE.test(value.value)) return;
          context.report({
            node: value,
            messageId: 'prop',
            data: { name, text: excerpt(value.value) },
          });
          return;
        }

        // A template in braces: label={`Remove ${client.label}`}. The words
        // between the substitutions are the part that is English.
        if (value.type !== 'JSXExpressionContainer') return;
        const expression = value.expression;
        if (expression.type !== 'TemplateLiteral') return;

        const literal = expression.quasis.map((quasi) => quasi.value.cooked ?? '').join(' ');
        if (!PROSE.test(literal)) return;
        context.report({
          node: expression,
          messageId: 'prop',
          data: { name, text: excerpt(literal) },
        });
      },
    };
  },
};

export default {
  meta: { name: 'shell' },
  rules: { content, 'design-tokens': designTokens },
};
