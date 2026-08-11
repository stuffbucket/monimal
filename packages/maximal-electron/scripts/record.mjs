#!/usr/bin/env node
/**
 * Record a screen capture of the running application.
 *
 * The recorder itself lives in `e2e/demo/`, in TypeScript, next to the harness
 * it shares with the end-to-end suite. This script is the front door: it checks
 * that a build exists, then hands over to the Playwright runner.
 *
 * `ffmpeg` is **not** checked here. That search lives in
 * `src/main/native/ffmpeg.ts` and runs from `e2e/demo/global-setup.ts`, so the
 * recorder and the application share one answer about where the encoder is and
 * what to say when it is absent. Duplicating it here meant two searches that
 * could disagree, and this copy was the weaker one: it asked whether a file
 * existed rather than whether it ran.
 *
 * Playwright runs the timelines rather than plain Node because it already
 * transpiles the TypeScript and resolves the `.js` import specifiers this
 * repository uses. It is a runner here, not a test framework.
 * `e2e/demo/record.config.ts` matches `*.demo.ts` only, so `npm run test:e2e`
 * never picks a recording up.
 *
 * Usage:
 *
 *   npm run record                       the default timeline
 *   npm run record -- --grep terminal    one timeline out of several
 *
 * Set FFMPEG or FFPROBE to override the binaries. Set STUFFBUCKET_E2E_VISIBLE=1
 * to watch the run on screen, which is slower and takes over the desktop.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = path.join(ROOT, 'e2e/demo/record.config.ts');

/* ---------------------------------------------------------------- checks */

const failures = [];

// The recorder drives the unpackaged build, for the reason in AGENTS.md: the
// `EnableNodeCliInspectArguments: false` fuse stops Playwright attaching to a
// packaged binary. It drives the capture fixture, which is its own renderer
// bundle, so checking the product's would pass and then fail minutes in.
for (const artefact of ['.vite/build/main.js', '.vite/renderer/demo_window/index.html']) {
  if (!existsSync(path.join(ROOT, artefact))) {
    failures.push(`${artefact} is missing. Run \`npm run package\` first.`);
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
