#!/usr/bin/env node
/**
 * Record a screen capture of the running application.
 *
 * The recorder itself lives in `e2e/demo/`, in TypeScript, next to the harness
 * it shares with the end-to-end suite. This script is the front door: it checks
 * that a build exists, then hands over to the Playwright runner.
 *
 * `ffmpeg` is **not** checked here. That search lives in
 * `src/ffmpeg.ts` and runs from `e2e/demo/global-setup.ts`. It checks
 * whether the encoder runs rather than merely checking whether a file exists.
 *
 * Playwright runs the timelines rather than plain Node because it already
 * transpiles the TypeScript and resolves the `.js` import specifiers this
 * repository uses. It is a runner here, not a test framework.
 * `e2e/demo/record.config.ts` matches `*.demo.ts` only, so `npm run test:e2e`
 * never picks a recording up.
 *
 * Usage:
 *
 *   pnpm run record                       the default timeline
 *   pnpm run record -- --grep terminal    one timeline out of several
 *
 * Set FFMPEG or FFPROBE to override the binaries. Set STUFFBUCKET_E2E_VISIBLE=1
 * to watch the run on screen, which is slower and takes over the desktop.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ELECTRON = path.resolve(ROOT, '../maximal-electron');
const CONFIG = path.join(ROOT, 'e2e/demo/record.config.ts');

/* ---------------------------------------------------------------- checks */

const failures = [];

// The recorder drives the unpackaged production shell: the fuse on a packaged
// binary prevents Playwright from attaching to it.
for (const artefact of ['.vite/build/main.js', '.vite/renderer/main_window/index.html']) {
  if (!existsSync(path.join(ELECTRON, artefact))) {
    failures.push(`${artefact} is missing. Run \`pnpm run build:app\` first.`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(` FAIL  ${failure}`);
  process.exit(1);
}

/* ----------------------------------------------------------------- run */

const child = spawn(
  process.execPath,
  [
    path.join(ROOT, 'node_modules/@playwright/test/cli.js'),
    'test',
    '--config',
    CONFIG,
    ...process.argv.slice(2),
  ],
  {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  },
);

child.on('close', (code) => process.exit(code ?? 1));
