/**
 * This package's mutation floors. What the report asserts is the workspace's
 * `scripts/mutation-report.mjs`.
 */
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { checkMutationReport } from '../../../scripts/mutation-report.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The mutant count `pnpm run mutate:all` produced when this floor was last set.
 * Raise it when the count rises. Lower it only for code deleted on purpose,
 * and say which deletion paid for it.
 *
 * The floor is the count measured when the terminal modules left
 * `@stuffbucket/maximal-electron`, less a net five mutants from folding the
 * `TerminalWindowGroups.observe` early return into its
 * missing-echo branch.
 */
export const MUTANT_FLOOR = 3796;

/**
 * `// Stryker disable` suppressions, counted in mutants: the osc-title
 * separator-0 equivalence plus the two window-groups unique-monotonic-index
 * equality equivalences.
 */
export const IGNORED_CEILING = 7;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkMutationReport({
    root,
    mutantFloor: MUTANT_FLOOR,
    ignoredCeiling: IGNORED_CEILING,
    reportDirectory: process.env.MONIMAL_MUTATION_REPORT_DIRECTORY,
  });
}
