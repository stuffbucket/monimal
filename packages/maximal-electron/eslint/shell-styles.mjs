/**
 * The design contract, enforced where it is written.
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
      `shell-styles: read ${String(found.size)} tokens from the shipped stylesheets, which is too few to be the contract. ` +
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

export default {
  meta: { name: 'shell-styles' },
  rules: { 'design-tokens': designTokens },
};
