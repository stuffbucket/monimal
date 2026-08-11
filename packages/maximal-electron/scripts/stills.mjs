#!/usr/bin/env node
/**
 * Capture the reference images.
 *
 * A developer tool. It drives the shell and writes PNGs: `demo/stills/` for
 * the committed demo images, `test-results/` for the transient ones.
 *
 * This is not part of `npm run test:e2e` and not part of CI, because an image
 * is not a verdict. Capture failed the blocking suite twice for reasons that
 * said nothing about the application: a runner that cannot composite an
 * off-screen panel produced a blank artifact, and a window that happened not
 * to be key rewrote two rows of every still.
 *
 * The output is also not stable enough to diff for equality. Three runs over
 * identical code produced two different canvas layouts. See "A still is not an
 * oracle" in AGENTS.md before using these images to prove anything.
 *
 * Run `npm run package` first. The suite drives the built bundles.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = path.join(ROOT, 'e2e/stills.config.ts');

const child = spawn(
  process.execPath,
  [
    path.join(ROOT, 'node_modules/@playwright/test/cli.js'),
    'test',
    '--config',
    CONFIG,
    ...process.argv.slice(2),
  ],
  { cwd: ROOT, stdio: 'inherit', env: process.env },
);

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
