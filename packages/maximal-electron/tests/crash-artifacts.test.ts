import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  describeCrashArtifacts,
  findCrashDumps,
  startCrashArtifacts,
} from '../src/host/crash-artifacts.js';

/**
 * Local crash artifacts.
 *
 * The behaviour these tests pin was measured on Electron 43 before it was
 * written: with the reporter started, a `utilityProcess` abort leaves a
 * `.dmp` under `<userData>/Crashpad`, and with the start suppressed the
 * directory does not exist at all. `scripts/verify-crash-artifact.mjs` is what
 * re-establishes that against a packaged build; this file covers the decisions
 * around it. Issue #134.
 */

const made: string[] = [];

function tree(layout: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'crash-artifacts-'));
  made.push(root);
  for (const [relative, contents] of Object.entries(layout)) {
    const full = path.join(root, relative);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, contents);
  }
  return root;
}

afterEach(() => {
  for (const root of made.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('findCrashDumps', () => {
  it('finds a dump however deep Crashpad filed it', () => {
    // The layout is Crashpad's and differs by platform, which is why the scan
    // is recursive rather than a list of directory names.
    const root = tree({
      'pending/one.dmp': 'x',
      'reports/nested/two.dmp': 'y',
      'three.dmp': 'z',
    });
    expect(findCrashDumps(root).map((file) => path.basename(file)).sort()).toEqual([
      'one.dmp',
      'three.dmp',
      'two.dmp',
    ]);
  });

  it('returns absolute paths, so a caller can stat one', () => {
    const root = tree({ 'pending/one.dmp': 'x' });
    expect(findCrashDumps(root)).toEqual([path.join(root, 'pending', 'one.dmp')]);
  });

  it('ignores everything that is not a dump', () => {
    // `settings.dat` is written when the reporter starts, before anything has
    // crashed. Counting it would report an artifact that does not exist.
    const root = tree({ 'settings.dat': 'x', 'pending/notes.txt': 'y', 'attachments/a.dmp.log': 'z' });
    expect(findCrashDumps(root)).toEqual([]);
  });

  it('reads a directory that is not there as no dumps', () => {
    // Crashpad creates the tree lazily, and nothing has crashed yet is the
    // ordinary case rather than an error.
    expect(findCrashDumps(path.join(tmpdir(), 'crash-artifacts-absent-directory'))).toEqual([]);
  });
});

describe('startCrashArtifacts', () => {
  const runtime = (directory: string) => ({
    app: { getPath: vi.fn(() => directory) as unknown as Parameters<typeof startCrashArtifacts>[0]['app']['getPath'] },
    crashReporter: { start: vi.fn() },
  });

  it('starts the reporter with no submitURL and no upload', () => {
    // The whole reason this needs no credential: there is nowhere to send it.
    const root = tree({});
    const injected = runtime(root);
    startCrashArtifacts(injected);
    expect(injected.crashReporter.start).toHaveBeenCalledWith({ uploadToServer: false });
    expect(injected.crashReporter.start.mock.calls[0]?.[0]).not.toHaveProperty('submitURL');
  });

  it('reports the directory Electron chose and what is already in it', () => {
    const root = tree({ 'pending/one.dmp': 'x' });
    const artifacts = startCrashArtifacts(runtime(root));
    expect(artifacts.directory).toBe(root);
    expect(artifacts.existing).toHaveLength(1);
  });

  it('asks for the crashDumps path rather than deriving one', () => {
    const root = tree({});
    const injected = runtime(root);
    startCrashArtifacts(injected);
    expect(injected.app.getPath).toHaveBeenCalledWith('crashDumps');
  });
});

describe('describeCrashArtifacts', () => {
  it('says nothing when nothing crashed', () => {
    // A line on every start is a line nobody reads.
    expect(describeCrashArtifacts({ directory: '/tmp/Crashpad', existing: [] })).toBeUndefined();
  });

  it('names how many and where', () => {
    const line = describeCrashArtifacts({
      directory: '/tmp/Crashpad',
      existing: ['/tmp/Crashpad/pending/one.dmp', '/tmp/Crashpad/pending/two.dmp'],
    });
    expect(line).toContain('2 crash minidump(s)');
    expect(line).toContain('/tmp/Crashpad');
  });

  it('says nothing is uploaded, because that is the question a dump raises', () => {
    const line = describeCrashArtifacts({
      directory: '/tmp/Crashpad',
      existing: ['/tmp/Crashpad/pending/one.dmp'],
    });
    expect(line).toContain('Nothing is uploaded.');
  });
});
