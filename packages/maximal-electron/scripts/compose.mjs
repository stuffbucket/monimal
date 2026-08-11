#!/usr/bin/env node
/**
 * Cut a video from frames that were already captured.
 *
 * This is the half of recording that does not drive the application. It reads
 * a take from `demo/takes/` and an edit from `demo/edits/`, and writes an mp4.
 * It takes seconds, so changing a hold, reordering clips, freezing on a mark,
 * or hiding a card costs nothing.
 *
 * Capture the frames first, once:
 *
 *   npm run package && npm run record
 *
 * Then re-cut as often as you like:
 *
 *   npm run compose                 every edit that has a take
 *   npm run compose -- workflow     one of them
 *
 * `ffmpeg` and `ffprobe` have to be installed. `src/main/native/ffmpeg.ts`
 * owns that search and says what to do when they are missing.
 */

import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const EDITS = path.join(ROOT, 'demo', 'edits');
const CONFIG = path.join(ROOT, 'e2e', 'demo', 'compose.config.ts');

const wanted = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));

if (!existsSync(EDITS)) {
  console.error(' FAIL  No demo/edits directory. An edit lists the clips to cut.');
  process.exit(1);
}

const available = readdirSync(EDITS)
  .filter((file) => file.endsWith('.json'))
  .map((file) => file.replace(/\.json$/, ''));

const names = wanted.length > 0 ? wanted : available;

if (names.length === 0) {
  console.error(' FAIL  No edits in demo/edits.');
  process.exit(1);
}

for (const name of names) {
  if (!available.includes(name)) {
    console.error(
      ` FAIL  No edit called "${name}". There is: ${available.join(', ') || 'nothing'}.`,
    );
    process.exit(1);
  }
}

const child = spawn(
  process.execPath,
  [path.join(ROOT, 'node_modules/@playwright/test/cli.js'), 'test', '--config', CONFIG],
  {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, COMPOSE_NAMES: names.join(',') },
  },
);

child.on('close', (code) => process.exit(code ?? 1));
