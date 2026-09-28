/**
 * This package's mutation scope. The criterion is the workspace's
 * `scripts/mutation-scope.mjs`; only the backlog is this package's.
 */
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { checkMutationScope, mutationScope as scopeOf } from '../../../scripts/mutation-scope.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Modules the criterion selects that are not yet mutated, with the issue that closes each. */
export const DEFERRED = new Map([
  ['src/contract.ts', 125],
  ['src/host/session-backend.ts', 125],
  ['src/host/terminal-host.ts', 125],
]);

export const mutationScope = () => scopeOf({ root, roots: ['src'], deferred: DEFERRED });

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkMutationScope({ root, roots: ['src'], deferred: DEFERRED });
}
