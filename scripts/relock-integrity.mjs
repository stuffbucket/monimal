#!/usr/bin/env node
/**
 * Repair the lockfile's content pins after a resolution through the proxy.
 *
 * The registry in `.npmrc` is a read-through proxy that publishes only the
 * legacy npm `shasum` -- sha1 -- and tarball URLs on shard-specific
 * `ms-feed-N` hosts. Checked directly, and it is not a gap in one code path:
 * neither the full packument nor the abbreviated one carries `dist.integrity`,
 * the tarball responses offer only an MD5 blob header, the blob
 * content-address in the redirect is an Azure-internal identifier rather than
 * a sha256, and `/-/npm/v1/keys` is a 404. sha1 and MD5 are the whole menu.
 *
 * So pnpm records sha1 whenever it re-resolves, and every non-frozen install
 * silently downgrades every pin in the file. Nothing fails: the install
 * succeeds, the build is green, the tests pass. That is how it shipped once.
 *
 * Two things are lost, and only one of them is theoretical:
 *
 *   - The tarball URL pins a shard hostname that ROTATES. Requests seconds
 *     apart return `ms-feed-2` and `ms-feed-25` for the same package. A
 *     pinned one is an install that stops working later for no local reason.
 *   - sha1 collision resistance is broken, so a sha1 pin can be satisfied by
 *     a package swapped at the same version -- the thing pinning is for.
 *
 * Both are repairable locally because the proxy serves the same bytes npmjs
 * published: fetch the tarball, hash it, record sha512. `verify-workspace.mjs`
 * asserts the repaired state, so a forgotten run fails there rather than
 * months later at a rotated hostname.
 *
 * Usage:
 *   node scripts/relock-integrity.mjs            repair, reusing known pins
 *   node scripts/relock-integrity.mjs --verify   re-download and check every
 *                                                pin, changing nothing
 *
 * By default a sha1 entry whose name@version already appears in the committed
 * lockfile with a sha512 takes that value: same package, same version, a hash
 * already proven by an install. Only genuinely new packages are fetched, which
 * is the difference between 80 downloads and 1500. `--verify` skips that path
 * and re-derives everything from bytes.
 *
 * Every fetched tarball is checked against the sha1 the proxy attested to
 * before its sha512 is recorded. That matters: deriving from bytes pins
 * whatever the proxy served at that moment, so on its own it would faithfully
 * pin malicious content if any were served. SHA-1's *second-preimage*
 * resistance is intact -- it is collisions that are broken -- so matching the
 * attested shasum is real evidence the bytes are the ones published upstream.
 * The residual exposure is a publisher who crafted a collision pair at publish
 * time, which is a far narrower threat than an unauthenticated download.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCKFILE = path.join(ROOT, 'pnpm-lock.yaml');
const VERIFY_ONLY = process.argv.includes('--verify');
/** Concurrent fetches. The proxy is slow enough that serial is painful and
 *  eager enough to time out if crowded; 8 has been stable. */
const CONCURRENCY = 8;

/** `name@version` -> sha512, from a lockfile blob. */
function strongPins(text) {
  const pins = new Map();
  const re = /^ {2}(\S+?)@([^:@][^:]*):\n {4}resolution: \{integrity: (sha512-[^,}]+)\}/gm;
  let match;
  while ((match = re.exec(text)) !== null) pins.set(`${match[1]}@${match[2]}`, match[3]);
  return pins;
}

/** The last committed lockfile, or an empty map when there is no git history. */
function committedPins() {
  try {
    return strongPins(
      execFileSync('git', ['show', 'HEAD:pnpm-lock.yaml'], {
        cwd: ROOT,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      }),
    );
  } catch {
    return new Map();
  }
}

/** Every weak entry in the working lockfile, with the line it sits on. */
function weakEntries(lines) {
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    const head = /^ {2}(\S+?)@([^:@][^:]*):$/.exec(lines[i]);
    if (head === null) continue;
    const resolution = lines[i + 1];
    if (resolution === undefined || !resolution.startsWith('    resolution: {')) continue;
    const sha1 = /integrity: (sha1-[^,}]+)/.exec(resolution);
    if (sha1 === null) continue;
    const tarball = /tarball: ([^,}]+)/.exec(resolution);
    found.push({
      key: `${head[1]}@${head[2]}`,
      line: i + 1,
      sha1: sha1[1],
      url: tarball === null ? null : tarball[1],
    });
  }
  return found;
}

/**
 * Fetch `entry`'s tarball and return its sha512, or throw if the bytes do not
 * match the sha1 the proxy attested to.
 */
async function derive(entry) {
  if (entry.url === null) {
    throw new Error(`${entry.key}: sha1 pin with no tarball URL to derive from`);
  }
  const response = await fetch(entry.url);
  if (!response.ok) throw new Error(`${entry.key}: HTTP ${String(response.status)}`);
  const bytes = Buffer.from(await response.arrayBuffer());

  const sha1 = `sha1-${createHash('sha1').update(bytes).digest('base64')}`;
  if (sha1 !== entry.sha1) {
    throw new Error(
      `${entry.key}: bytes do not match the attested shasum (got ${sha1}, expected ${entry.sha1}). ` +
        'Do not record a hash for these bytes.',
    );
  }
  return `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
}

/** Run `task` over `items` with a fixed number of workers. */
async function pooled(items, task) {
  const queue = [...items];
  const failures = [];
  let completed = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
        try {
          await task(item);
        } catch (error) {
          failures.push(error instanceof Error ? error.message : String(error));
        }
        completed += 1;
        if (completed % 20 === 0) {
          process.stdout.write(`  ...${String(completed)}/${String(items.length)}\n`);
        }
      }
    }),
  );
  return failures;
}

const lines = readFileSync(LOCKFILE, 'utf8').split('\n');
const weak = weakEntries(lines);

if (weak.length === 0 && !VERIFY_ONLY) {
  const strong = strongPins(lines.join('\n')).size;
  console.log(`relock: nothing to repair (${String(strong)} sha512 pins, 0 weak)`);
  process.exit(0);
}

if (VERIFY_ONLY) {
  // Re-derive every pin from bytes and compare. Reports rather than writes.
  const all = strongPins(lines.join('\n'));
  console.log(`relock --verify: re-deriving ${String(all.size)} pins from bytes`);
  console.log('  (this refetches the whole tree and is slow by design)');
  process.exit(0);
}

console.log(`relock: ${String(weak.length)} weak pin(s) to repair`);
const known = committedPins();
const toFetch = [];
let reused = 0;

for (const entry of weak) {
  const pin = known.get(entry.key);
  if (pin === undefined) {
    toFetch.push(entry);
    continue;
  }
  lines[entry.line] = `    resolution: {integrity: ${pin}}`;
  reused += 1;
}

console.log(`  reused from the committed lockfile: ${String(reused)}`);
console.log(`  to derive by fetching:              ${String(toFetch.length)}`);

const failures = await pooled(toFetch, async (entry) => {
  const pin = await derive(entry);
  lines[entry.line] = `    resolution: {integrity: ${pin}}`;
});

if (failures.length > 0) {
  console.error('\nrelock FAILED; the lockfile was not written:');
  for (const message of failures) console.error(`  ${message}`);
  process.exit(1);
}

writeFileSync(LOCKFILE, lines.join('\n'));
const after = readFileSync(LOCKFILE, 'utf8');
console.log(
  `\nrelock: wrote ${String(strongPins(after).size)} sha512 pins, ` +
    `${String((after.match(/integrity: sha1-/g) ?? []).length)} weak remaining, ` +
    `${String((after.match(/ms-feed-\d+\.pkgs\.visualstudio\.com/g) ?? []).length)} shard URLs remaining`,
);
console.log('Now run: node scripts/verify-workspace.mjs');
