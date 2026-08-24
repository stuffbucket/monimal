#!/usr/bin/env node
/**
 * Remove rotating shard hostnames from the lockfile.
 *
 * The registry in `.npmrc` serves tarballs from `ms-feed-N` hosts that rotate:
 * a single install here hit ms-feed-2, -12, -17 and -25. pnpm records whichever
 * one answered, so a re-resolution bakes in a hostname that expires. The
 * failure arrives later, on a machine that changed nothing, as a fetch error
 * for a package that plainly exists.
 *
 * pnpm reconstructs the URL from the configured registry when `tarball:` is
 * absent, so the repair is to drop the field. A tarball URL that is NOT a
 * shard host is left alone -- a git dependency or a GitHub release is pinned
 * there deliberately, and blanking it would break resolution rather than
 * harden it.
 *
 * Integrity is not touched. The proxy publishes only a sha1 shasum and that is
 * accepted; see SOURCES.md#lockfile-integrity.
 *
 * Usage: node scripts/strip-lockfile-hosts.mjs
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHARD_HOST = /ms-feed-\d+\.pkgs\.visualstudio\.com/;
const LOCKFILE = 'pnpm-lock.yaml';

const absolute = path.join(ROOT, LOCKFILE);
if (!existsSync(absolute)) {
  console.error(`${LOCKFILE}: not found`);
  process.exit(1);
}

const lines = readFileSync(absolute, 'utf8').split('\n');
let stripped = 0;

for (let i = 0; i < lines.length; i++) {
  if (!lines[i].startsWith('    resolution: {')) continue;
  const tarball = /, tarball: ([^,}]+)/.exec(lines[i]);
  if (tarball === null || !SHARD_HOST.test(tarball[1])) continue;
  lines[i] = lines[i].replace(tarball[0], '');
  stripped += 1;
}

if (stripped === 0) {
  console.log(`${LOCKFILE}: clean`);
  process.exit(0);
}

writeFileSync(absolute, lines.join('\n'));
const after = readFileSync(absolute, 'utf8');
console.log(
  `${LOCKFILE}: stripped ${String(stripped)} shard-host URL(s); ` +
    `${String((after.match(new RegExp(SHARD_HOST.source, 'g')) ?? []).length)} remain`,
);
console.log('\nNow run: node scripts/verify-workspace.mjs');
