#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { packageStylesheets } from './shell-variables.mjs';

/*
 * The list lives in `shell-variables.mjs` because the `--shell-*` check parses
 * the same files. A stylesheet added to one and missed by the other would ship
 * with an unpublished contract.
 */
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

for (const sheet of packageStylesheets()) {
  const target = path.join(root, sheet.published);
  await mkdir(path.dirname(target), { recursive: true });
  const parts = await Promise.all(
    sheet.sources.map((source) => readFile(path.join(root, source), 'utf8')),
  );
  await writeFile(target, parts.join('\n'));
}
