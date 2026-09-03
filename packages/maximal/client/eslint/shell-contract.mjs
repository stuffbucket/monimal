/**
 * The shell's namespace, held to what the shell actually publishes.
 *
 * This application supplies the `--shell-*` contract and reads it back from
 * every stylesheet it writes. Nothing checked that the names it uses are names
 * the installed package knows: `src/renderer/theme.test.ts` asserts that every
 * *required* variable is defined, which is the ratchet in one direction only.
 * The other direction is where the mistakes are.
 *
 * A name in `--shell-*` that the package does not publish resolves to nothing.
 * `var(--shell-x, #22c55e)` then paints its hardcoded fallback and ignores the
 * theme for ever, and `var(--shell-x)` with no fallback is worse: an undefined
 * custom property with no fallback makes the whole declaration invalid at
 * computed-value time, so it is no border rather than a faint one. Neither is
 * an error, which is why both survive.
 *
 * It is also a claim on somebody else's vocabulary. `--shell-success` was
 * defined here, in the package's prefix, for a colour the package has no name
 * for — so it reads as part of a contract it is not part of, and the day the
 * package publishes `--shell-success` meaning something else, this application
 * silently gets that meaning. Theia and Positron settle this the same way:
 * downstream products layer their own namespace rather than extending the
 * workbench's. This application's is `--maximal-*`.
 *
 * The contract is read from the installed package rather than listed, so it
 * tracks what is actually on disk. `stuffbucket-electron/verify/shell-variables`
 * exists for exactly this and is what `theme.test.ts` already uses.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** The prefix the package owns. */
const SHELL_NAMESPACE = '--shell-';

/** What this application calls a token of its own. */
const OWN_NAMESPACE = '--maximal-';

/** A `var()` read, capturing the name. */
const READ = /\bvar\(\s*(--[a-z0-9-]+)/g;

/** The start of a custom-property declaration. */
const DECLARATION = /(--[a-z0-9-]+)\s*:/g;

/** A comment, which is prose. */
const COMMENT = /\/\*[\s\S]*?\*\//g;

/**
 * Every `--shell-*` the installed stylesheet reads or declares.
 *
 * Read once per lint run. The floor is here rather than at each use: a
 * resolution that silently found nothing would report every name in the
 * application as fine, which is the shape of false pass this workspace has
 * shipped more than once.
 */
let contract;

function publishedContract() {
  if (contract !== undefined) return contract;

  const path = require.resolve('stuffbucket-electron/renderer/styles.css');
  const css = readFileSync(path, 'utf8').replaceAll(COMMENT, '');

  const found = new Set([
    ...[...css.matchAll(READ)].map((match) => match[1]),
    ...[...css.matchAll(DECLARATION)].map((match) => match[1]),
  ].filter((name) => name !== undefined && name.startsWith(SHELL_NAMESPACE)));

  if (found.size < 30) {
    throw new Error(
      `shell-contract: read ${String(found.size)} names from ${path}, which is too few to be the contract.`,
    );
  }

  contract = found;
  return contract;
}

/** A template literal holding CSS, which is the only place these names appear. */
function styleText(node) {
  if (node.expressions.length > 0) return undefined;
  const text = node.quasis[0]?.value.cooked;
  return text !== undefined && text.includes('{') && text.includes(':') ? text : undefined;
}

/** @type {import('eslint').Rule.RuleModule} */
const shellNamespace = {
  meta: {
    type: 'problem',
    docs: { description: 'Use only the `--shell-*` names the installed package publishes.' },
    schema: [],
    messages: {
      unknown:
        '`{{name}}` is not in the contract `stuffbucket-electron` publishes, so it resolves to nothing — a hardcoded fallback that ignores the theme, or an invalid declaration if there is no fallback. Use a published name, or `{{suggestion}}` if this colour is this application\'s own.',
    },
  },
  create(context) {
    const published = publishedContract();

    return {
      TemplateLiteral(node) {
        const css = styleText(node);
        if (css === undefined) return;

        const bare = css.replaceAll(COMMENT, (found) => found.replaceAll(/[^\n]/g, ' '));
        const origin = node.range[0] + 1;

        for (const pattern of [READ, DECLARATION]) {
          for (const match of bare.matchAll(pattern)) {
            const name = match[1] ?? '';
            if (!name.startsWith(SHELL_NAMESPACE) || published.has(name)) continue;

            const offset = match[0].indexOf(name);
            context.report({
              loc: {
                start: context.sourceCode.getLocFromIndex(origin + match.index + offset),
                end: context.sourceCode.getLocFromIndex(
                  origin + match.index + offset + name.length,
                ),
              },
              messageId: 'unknown',
              data: {
                name,
                suggestion: OWN_NAMESPACE + name.slice(SHELL_NAMESPACE.length),
              },
            });
          }
        }
      },
    };
  },
};

export default {
  meta: { name: 'shell-contract' },
  rules: { namespace: shellNamespace },
};
