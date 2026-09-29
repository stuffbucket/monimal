/**
 * This package's mutation scope. The criterion is the workspace's
 * `scripts/mutation-scope.mjs`; only the backlog is this package's.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkMutationScope, mutationScope as scopeOf } from '../../../scripts/mutation-scope.mjs';

export { ROOTS, valueImports } from '../../../scripts/mutation-scope.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Files the criterion selects that are not yet mutated. Each one is real work,
 * not an exemption: #125 holds the count and the disposition rule.
 */
export const DEFERRED = new Map([
  ['scripts/build-package.mjs', 125],
  ['scripts/check-contrast.mjs', 125],
  ['scripts/check-install.mjs', 125],
  ['scripts/copy-renderer-css.mjs', 125],
  ['scripts/css-selectors.mjs', 125],
  ['scripts/export-checks.mjs', 125],
  ['scripts/gen-icons.mjs', 125],
  ['scripts/mutation-report.mjs', 125],
  ['scripts/mutation-scope.mjs', 125],
  ['scripts/neutrality.mjs', 125],
  ['scripts/package-contract.mjs', 125],
  ['scripts/packaged-app.mjs', 125],
  ['scripts/smoke-packaged.mjs', 125],
  ['scripts/storybook-check.mjs', 125],
  ['scripts/verify-docs.mjs', 125],
  ['scripts/verify-electron-cache.mjs', 125],
  ['scripts/verify-exports.mjs', 125],
  ['src/host/shutdown-lifecycle.ts', 125],
  ['scripts/verify-neutral.mjs', 125],
  ['scripts/verify-package.mjs', 125],
  ['scripts/verify-workflow-health.mjs', 125],
  ['scripts/workflow-health.mjs', 125],
  ['src/main/native/updates.ts', 125],
  ['src/main/terminal-identity.ts', 125],
  ['src/renderer/lib/content-lorem.ts', 125],
  ['src/renderer/lib/sample-settings.ts', 125],
  ['src/shared/ipc.ts', 125],
]);

export const mutationScope = () => scopeOf({ root, deferred: DEFERRED });

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkMutationScope({ root, deferred: DEFERRED });
}
