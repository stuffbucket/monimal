/**
 * This package's mutation floors. What the report asserts is the workspace's
 * `scripts/mutation-report.mjs`.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkMutationReport } from '../../../scripts/mutation-report.mjs';

export { readReport, summarize, verifyStaticRun } from '../../../scripts/mutation-report.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The mutant count `npm run mutate` produced when this floor was last set.
 *
 * 1246 was a number nothing asserted, so a configuration change that halved
 * the mutated set would still have printed 100.00. Raise this when the count
 * rises; a fall is the defect it exists to catch.
 *
 * It has come down once, from 1736, and only because code was deleted on
 * purpose: `embeddedEngineStatus` and the gated result `llamaCheckLine`
 * printed went with the Windows gate in #149, which is 15 mutants. Lowering it
 * for any other reason is the defect. Say which deletion paid for it.
 *
 * 1721 to 1737 is `windowIconName`, `dockIconName` and `trayIconChoice` in
 * `icons.ts`, which took the platform branches out of `app-icon.ts` and
 * `tray.ts` where nothing could mutate them. `icons.ts` went from 6 mutants to
 * 22. Issue #49.
 *
 * The two trains raised this from different bases and neither number survived
 * the fold. `release/0.0.6` read 1737 and `main` read 1662. A tree holding
 * both sets of changes holds both sets of mutants, so neither is the count
 * here and nor is their difference: 2082 is what the merged tree measured.
 * `publish-decision.mjs`, `check-scope.mjs` and `peer-table.mjs` arrived from
 * `main`, and `icons.ts` at 22 mutants arrived from the release branch.
 *
 * 2082 to 2108 is `createTerminalTransport` in `terminal-transport.ts`, which
 * took the transport wiring out of `bridge-terminal.ts` where nothing mutates
 * it: that file names this shell's own channels and is off the mutate list.
 * The module went from 10 mutants to 36, and it is the only file on the list
 * the change touched.
 *
 * 2108 to 2200 is `Canvas.tsx` joining the list. It gained the listbox
 * keyboard model for issue #171 — a roving tabindex, an arrow-key
 * destination, and the guard that ignores a key from a control inside an
 * option — and every branch of it is reachable from the stories.
 *
 * 2200 to 2292 is `TmuxProjectionBroker` from issue #108. It owns focus
 * epochs, canonical geometry and projection lifecycle around tmux clients.
 *
 * 2292 to 2337 adds owner-loss cleanup to `TmuxProjectionBroker` and adds
 * `TmuxProjectionHost`, which binds trusted commands to the broker.
 *
 * 2337 to 2463 adds application-scoped `TmuxProjectionOwners` and lets the
 * trusted host terminate a reservation before its first projection attaches.
 *
 * 2463 to 2657 adds the pure terminal workspace aggregate: branded identities,
 * ownership validation, split, focus, close and document docking operations.
 *
 * 2657 to 1953 is deletion on purpose: the nineteen terminal, pty and tmux
 * modules left for `@stuffbucket/maximal-terminal`, which carries their
 * mutants under its own floor, and `scripts/publish-decision.mjs` went with
 * this package's registry publishing.
 */
export const MUTANT_FLOOR = 1953;

/**
 * `// Stryker disable` suppressions, counted in mutants rather than comments
 * because one comment covers every mutant on its line.
 *
 * Five comments, in `contrast.ts`, `tab-transfer.ts` and `terminal-lab.ts`,
 * suppress six mutants. An ignored mutant is outside the score, so another
 * must raise this on purpose. `docs/testing.md` says to read the existing ones
 * before writing another.
 */
export const IGNORED_CEILING = 6;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkMutationReport({ root, mutantFloor: MUTANT_FLOOR, ignoredCeiling: IGNORED_CEILING });
}
