/**
 * Types for `shell.mjs`.
 *
 * A flat ESLint config is loaded by ESLint rather than by `tsc`, so the plugin
 * itself is plain ESM. `tests/component-styles.test.ts` imports it to prove
 * the rule fires, and that import is inside the TypeScript program.
 */

import type { ESLint } from 'eslint';

declare const plugin: ESLint.Plugin;
export default plugin;
