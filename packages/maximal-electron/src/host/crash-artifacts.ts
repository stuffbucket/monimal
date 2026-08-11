import { readdirSync } from 'node:fs';
import path from 'node:path';

import type { App, CrashReporter } from 'electron';

/**
 * Local crash artifacts.
 *
 * Electron's `crashReporter` writes a Crashpad minidump for every process it
 * owns, and it needs no `submitURL` to do it. With `uploadToServer` false
 * nothing leaves the machine, so there is no endpoint, no service, and no
 * credential. Issue #134.
 *
 * Without the call there is no artifact at all. A measured run with the start
 * suppressed left the database directory absent rather than empty, on the same
 * crash that fills it otherwise. See `docs/architecture.md`.
 *
 * This module imports no Electron value, so it is mutation tested. The runtime
 * is injected for the same reason it is on `runMain`: the seam can be driven
 * without an Electron process.
 */

/** What `startCrashArtifacts` needs of Electron. */
export interface CrashArtifactRuntime {
  app: Pick<App, 'getPath'>;
  crashReporter: Pick<CrashReporter, 'start'>;
}

export interface CrashArtifacts {
  /** The Crashpad database. `<userData>/Crashpad` on every platform measured. */
  directory: string;
  /** Minidumps already on disk, left by a crash in an earlier run. */
  existing: readonly string[];
}

const DUMP_EXTENSION = '.dmp';

/**
 * Every minidump under the database.
 *
 * Recursive, because the layout is Crashpad's rather than this repository's:
 * macOS writes into `pending/`, and Windows uses a different set of names. A
 * scan that listed the directories it knew would report nothing on the
 * platform whose names it did not have, which is the empty-scope defect
 * `.claude/skills/write-a-check/SKILL.md` is written about.
 *
 * A directory that does not exist is no dumps rather than an error: nothing
 * has crashed yet is the ordinary case, and Crashpad creates the tree lazily.
 */
export function findCrashDumps(root: string): string[] {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const found: string[] = [];
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) found.push(...findCrashDumps(full));
    else if (entry.name.endsWith(DUMP_EXTENSION)) found.push(full);
  }
  return found;
}

/**
 * Start writing crash artifacts, and report what earlier runs left.
 *
 * Crashpad derives its database from `userData` at the moment it starts, so
 * the caller picks the profile first. Starting twice is harmless — measured on
 * Electron 43, both calls returned and the database was intact — so a consumer
 * that both passes `collectCrashDumps` and calls this itself is not punished
 * for it.
 */
export function startCrashArtifacts(runtime: CrashArtifactRuntime): CrashArtifacts {
  runtime.crashReporter.start({ uploadToServer: false });
  const directory = runtime.app.getPath('crashDumps');
  return { directory, existing: findCrashDumps(directory) };
}

/**
 * One line naming the artifact, or nothing when there is none.
 *
 * Silent on a clean start. A line printed on every run is one nobody reads,
 * and the whole value here is that a developer looking at a survived crash
 * finds out where the dump is.
 */
export function describeCrashArtifacts(artifacts: CrashArtifacts): string | undefined {
  const count = artifacts.existing.length;
  if (count === 0) return undefined;
  return (
    `${String(count)} crash minidump(s) from an earlier run are in ${artifacts.directory}. ` +
    'Nothing is uploaded.'
  );
}
