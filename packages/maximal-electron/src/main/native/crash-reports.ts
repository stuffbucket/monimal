import { app, crashReporter, shell } from 'electron';

import {
  describeCrashArtifacts,
  startCrashArtifacts,
  type CrashArtifacts,
} from '../../host/crash-artifacts.js';

/**
 * This application's crash artifacts.
 *
 * `host/crash-artifacts.ts` holds the decisions and touches no Electron value.
 * This file is the wiring: it starts the reporter, remembers where the dumps
 * land, and opens that directory for the menu. Issue #134.
 */

let artifacts: CrashArtifacts = { directory: '', existing: [] };

/**
 * Start collecting, and say what an earlier run left.
 *
 * The caller sets the profile directory first. Crashpad reads it once, at
 * start, so a reporter started before that writes into the profile the
 * application is about to stop using.
 */
export function startCrashReports(): void {
  artifacts = startCrashArtifacts({ app, crashReporter });
  const earlier = describeCrashArtifacts(artifacts);
  // stderr, so a self-check run's stdout stays the one line its driver reads.
  if (earlier !== undefined) console.error(earlier);
}

/** Where the dumps are, for anything that needs to name it. */
export function crashReportDirectory(): string {
  return artifacts.directory;
}

/**
 * Reveal the directory.
 *
 * A minidump needs a symbol-aware reader, so this is not something a user
 * interprets. It is how they get the file off their machine and onto an issue,
 * which is the only route it has while nothing is uploaded.
 */
export function showCrashReports(): void {
  void shell.openPath(artifacts.directory);
}
