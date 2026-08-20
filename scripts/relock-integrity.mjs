#!/usr/bin/env node
/**
 * Restore strong content pins to the lockfiles after a resolution through the
 * proxy.
 *
 * The registry in `.npmrc` is a read-through proxy that publishes only the
 * legacy npm `shasum` -- sha1 -- and tarball URLs on shard-specific
 * `ms-feed-N` hosts. Checked directly across every channel it exposes:
 * neither the full packument nor the abbreviated one carries
 * `dist.integrity`, tarball responses offer only an MD5 blob header, the blob
 * content-address in the redirect is an Azure-internal identifier rather than
 * a sha256, and `/-/npm/v1/keys` is a 404. sha1 and MD5 are the whole menu.
 *
 * So every package manager pointed at it records a weak pin, and every
 * non-frozen install silently downgrades the file it writes. Nothing fails at
 * the time: the install succeeds, the build is green, the tests pass.
 *
 * Two things are lost, and only one is theoretical:
 *
 *   - The recorded tarball URL pins a shard hostname that ROTATES. Requests
 *     seconds apart return `ms-feed-2` and `ms-feed-25` for the same package.
 *     A pinned one is an install that stops working later for no local
 *     reason. This is the half that is certain.
 *   - sha1 collision resistance is broken, so a sha1 pin can be satisfied by
 *     a package swapped at the same version -- the thing pinning is for.
 *
 * Both lockfiles in this repo are affected, and they degrade the same way for
 * the same reason, so both are handled here. `pnpm-lock.yaml` can drop its
 * `tarball:` field entirely; `bun.lock` needs the URL slot to exist, and an
 * empty string is its "resolve from the configured registry" form. Neither
 * ends up naming a host.
 *
 * Usage: node scripts/relock-integrity.mjs
 *
 * A weak entry whose name@version already appears with a sha512 in recent
 * history takes that value -- same package, same version, a hash already
 * proven by an install. Only genuinely new packages are fetched, which is the
 * difference between tens of downloads and thousands. History is searched
 * back through several commits rather than just HEAD, because the commit you
 * are standing on is frequently the degraded one: a Dependabot branch's tip
 * carries the freshly weakened lockfile, and reading only HEAD there would
 * find nothing to reuse and refetch the entire tree.
 *
 * Every fetched tarball is checked against the sha1 the proxy attested to
 * before its sha512 is recorded. That matters: deriving from bytes pins
 * whatever the proxy served at that moment, so on its own it would faithfully
 * pin malicious content if any were served. SHA-1's *second-preimage*
 * resistance is intact -- collisions are what is broken -- so matching the
 * attested shasum is real evidence the bytes are the ones published upstream.
 * The residual exposure is a publisher who crafted a collision pair at
 * publish time, a far narrower threat than an unauthenticated download.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Concurrent fetches. The proxy times out when crowded; 8 has been stable. */
const CONCURRENCY = 8;
/** How far back to look for a lockfile that still has strong pins. */
const HISTORY_DEPTH = 20;
const SHARD_HOST = /ms-feed-\d+\.pkgs\.visualstudio\.com/;

/**
 * The registry a given lockfile resolves through.
 *
 * Read from the `.npmrc` beside the lockfile, falling back to the root one.
 * The site has its own: it is not a workspace member, CI installs it with its
 * own working-directory, and bun's config lookup starts there. Using the root
 * registry for it would be right only by coincidence.
 */
function registryFor(relLockPath) {
  const candidates = [
    path.join(ROOT, path.dirname(relLockPath), '.npmrc'),
    path.join(ROOT, '.npmrc'),
  ];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const match = /^registry=(.+)$/m.exec(readFileSync(candidate, 'utf8'));
    if (match !== null) return match[1].trim().replace(/\/?$/, '/');
  }
  throw new Error(`no registry configured for ${relLockPath}`);
}

/**
 * Split `name@version`.
 *
 * pnpm quotes any key containing a scope, so roughly two thirds of this
 * lockfile's keys arrive as `'@scope/name@1.2.3'`. Left in, the quotes reach
 * the fallback URL and produce a path no registry will serve -- and because
 * the fallback only runs when the recorded URL has already failed, it would
 * have surfaced as an unfixable lockfile long after the change that caused it.
 */
function splitSpec(spec) {
  const unquoted = /^'(.*)'$/.exec(spec)?.[1] ?? spec;
  const at = unquoted.lastIndexOf('@');
  return { name: unquoted.slice(0, at), version: unquoted.slice(at + 1) };
}

/** The registry-relative URL for a package, used when a pinned shard has rotated away. */
function registryUrl(registry, name, version) {
  const bare = name.startsWith('@') ? name.slice(name.indexOf('/') + 1) : name;
  return `${registry}${name}/-/${bare}-${version}.tgz`;
}

/**
 * `name@version` -> sha512, gathered from recent history of `relPath`.
 *
 * Walks backwards and merges, rather than trusting one commit: the newest
 * commit that touched the lockfile is exactly the one most likely to be
 * degraded.
 */
function knownPins(relPath, extract) {
  const pins = new Map();
  let revisions = [];
  try {
    revisions = execFileSync(
      'git',
      ['rev-list', `--max-count=${String(HISTORY_DEPTH)}`, 'HEAD', '--', relPath],
      { cwd: ROOT, encoding: 'utf8' },
    )
      .split('\n')
      .filter(Boolean);
  } catch {
    return pins;
  }
  for (const revision of revisions) {
    let blob;
    try {
      blob = execFileSync('git', ['show', `${revision}:${relPath}`], {
        cwd: ROOT,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        // Silent: walking back past a lockfile's first commit is expected and
        // git reports it on stderr, which would otherwise look like a fault.
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      continue;
    }
    for (const [key, pin] of extract(blob)) if (!pins.has(key)) pins.set(key, pin);
  }
  return pins;
}

/** Algorithms an attestation may use. Only sha512 is strong enough to record. */
const ATTESTABLE = new Set(['sha1', 'sha256', 'sha384', 'sha512']);

/**
 * Fetch, verify against whatever the registry attested, and return sha512.
 *
 * The attestation is checked in its OWN algorithm rather than assumed to be
 * sha1. This proxy only ever serves sha1, but a lockfile can carry sha256 or
 * sha384 from a registry that did better, and those are perfectly good things
 * to verify bytes against -- better than sha1. What none of them are is
 * strong enough to leave recorded, so they are attestations here and never
 * pins.
 *
 * Attestation is checked BEFORE the registry is consulted. Otherwise an
 * entry with no attestation reports "no registry configured" when none is
 * present, which is a different fault with a different fix, and the real
 * refusal never surfaces.
 *
 * The registry arrives as a getter so a run that never needs a fallback never
 * requires one to exist.
 */
async function derive({ key, attested, url }, getRegistry) {
  if (attested === null) {
    // Fetching would mean recording a hash for bytes nothing vouched for -- a
    // strong pin manufactured from an unauthenticated download, which is
    // worse than the weak pin it replaces because it looks trustworthy.
    throw new Error(
      `${key}: pinned with no integrity to verify against; refusing to record ` +
        'a hash for unattested bytes',
    );
  }
  const algorithm = attested.slice(0, attested.indexOf('-'));
  if (!ATTESTABLE.has(algorithm)) {
    throw new Error(`${key}: unrecognised integrity algorithm ${algorithm}`);
  }

  const seen = new Set();
  let lastError = 'no URL to try';

  const attempt = async (candidate) => {
    if (typeof candidate !== 'string' || candidate === '' || seen.has(candidate)) return null;
    seen.add(candidate);
    try {
      const response = await fetch(candidate);
      if (!response.ok) {
        lastError = `HTTP ${String(response.status)} from ${candidate}`;
        return null;
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = `${error instanceof Error ? error.message : String(error)} (${candidate})`;
      return null;
    }
  };

  const check = (bytes) => {
    const got = `${algorithm}-${createHash(algorithm).update(bytes).digest('base64')}`;
    if (got !== attested) {
      throw new Error(`${key}: bytes do not match the attested integrity (got ${got}, expected ${attested})`);
    }
    return `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
  };

  const recorded = await attempt(url);
  if (recorded !== null) return check(recorded);

  // Only now is a registry needed: the recorded URL is dead, which is the
  // expected state once a shard host has rotated.
  const { name, version } = splitSpec(key);
  const fallback = await attempt(registryUrl(getRegistry(), name, version));
  if (fallback !== null) return check(fallback);

  throw new Error(`${key}: could not fetch -- ${lastError}`);
}

/** Run `task` over `items` with a fixed pool of workers. */
async function pooled(items, task) {
  const queue = [...items];
  const failures = [];
  let done = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
        try {
          await task(item);
        } catch (error) {
          failures.push(error instanceof Error ? error.message : String(error));
        }
        done += 1;
        if (done % 25 === 0) process.stdout.write(`    ...${String(done)}/${String(items.length)}\n`);
      }
    }),
  );
  return failures;
}

// --- pnpm-lock.yaml -------------------------------------------------------

const PNPM_STRONG = /^ {2}(\S+?)@([^:@][^:]*):\n {4}resolution: \{integrity: (sha512-[^,}]+)/gm;

function pnpmPins(blob) {
  const found = [];
  let match;
  const re = new RegExp(PNPM_STRONG.source, 'gm');
  while ((match = re.exec(blob)) !== null) found.push([`${match[1]}@${match[2]}`, match[3]]);
  return found;
}

/**
 * Weak or host-pinned entries. A sha512 entry that still carries a `tarball:`
 * is included: the hash is fine but the rotating hostname is not, and the
 * invariant fails on either, so repairing only one of them would leave a file
 * that can never pass.
 */
function pnpmDamage(lines) {
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    const head = /^ {2}(\S+?)@([^:@][^:]*):$/.exec(lines[i]);
    if (head === null) continue;
    const resolution = lines[i + 1];
    if (resolution === undefined || !resolution.startsWith('    resolution: {')) continue;
    const integrity = /integrity: (sha\d+-[^,}]+)/.exec(resolution);
    const attested = integrity === null ? null : integrity[1];
    // ONLY sha512 counts as a pin. sha256 and sha384 are good enough to
    // verify bytes against and not good enough to leave recorded; treating
    // them as strong would write them straight back and leave the invariant
    // failing forever on an entry the script had just declared repaired.
    const strong = attested !== null && attested.startsWith('sha512-') ? attested : null;
    const tarball = /tarball: ([^,}]+)/.exec(resolution);
    // Only a SHARD host counts as URL damage. A lockfile may legitimately pin
    // a tarball elsewhere -- a git dependency, a GitHub release -- and
    // blanking one of those would not weaken the pin, it would break
    // resolution outright.
    const shardPinned = tarball !== null && SHARD_HOST.test(tarball[1]);
    if (strong !== null && !shardPinned) continue;
    found.push({
      key: `${head[1]}@${head[2]}`,
      line: i + 1,
      attested,
      strong,
      url: tarball === null ? null : tarball[1],
      // A non-shard URL is preserved verbatim; a shard one is dropped so the
      // configured registry supplies it.
      keepUrl: shardPinned || tarball === null ? null : tarball[1],
    });
  }
  return found;
}

// --- bun.lock -------------------------------------------------------------

// One package per line: "name": ["name@version", "url", { deps }, "integrity"],
const BUN_ENTRY = /^(\s*"(?:[^"]+)": \[")([^"]+)(", ")([^"]*)(".*, ")(sha\d+-[^"]+)("\],?)$/;

function bunPins(blob) {
  const found = [];
  for (const line of blob.split('\n')) {
    const match = BUN_ENTRY.exec(line);
    if (match !== null && match[6].startsWith('sha512-')) found.push([match[2], match[6]]);
  }
  return found;
}

function bunDamage(lines) {
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    const match = BUN_ENTRY.exec(lines[i]);
    if (match === null) continue;
    const attested = match[6];
    // Same rule as the pnpm side: only sha512 is a pin.
    const strong = attested.startsWith('sha512-') ? attested : null;
    // Only a shard host is URL damage. bun records git and non-registry
    // sources in this slot too, and blanking one breaks resolution outright.
    const shardPinned = match[4] !== '' && SHARD_HOST.test(match[4]);
    if (strong !== null && !shardPinned) continue;
    found.push({
      key: match[2],
      line: i,
      attested,
      strong,
      url: match[4] === '' ? null : match[4],
      keepUrl: shardPinned || match[4] === '' ? null : match[4],
    });
  }
  return found;
}

// --- drive ----------------------------------------------------------------

const TARGETS = [
  {
    rel: 'pnpm-lock.yaml',
    extract: pnpmPins,
    damage: pnpmDamage,
    // pnpm reconstructs the URL from the configured registry when absent.
    write: (lines, entry, pin) => {
      const tarball = entry.keepUrl === null ? '' : `, tarball: ${entry.keepUrl}`;
      lines[entry.line] = `    resolution: {integrity: ${pin}${tarball}}`;
    },
  },
  {
    rel: path.join('packages', 'maximal', 'site', 'bun.lock'),
    extract: bunPins,
    damage: bunDamage,
    // bun needs the URL slot to exist; empty means "use the configured registry".
    write: (lines, entry, pin) => {
      lines[entry.line] = lines[entry.line].replace(
        BUN_ENTRY,
        (_all, head, spec, mid, _url, tail, _integrity, close) =>
          `${head}${spec}${mid}${entry.keepUrl ?? ''}${tail}${pin}${close}`,
      );
    },
  },
];

let exitCode = 0;

for (const target of TARGETS) {
  const absolute = path.join(ROOT, target.rel);
  if (!existsSync(absolute)) continue;

  const lines = readFileSync(absolute, 'utf8').split('\n');
  const damaged = target.damage(lines);
  if (damaged.length === 0) {
    console.log(`${target.rel}: clean`);
    continue;
  }

  const weak = damaged.filter((entry) => entry.strong === null);
  console.log(
    `${target.rel}: ${String(damaged.length)} entr(ies) to repair ` +
      `(${String(weak.length)} not sha512-pinned, ${String(damaged.length - weak.length)} host-pinned only)`,
  );

  const known = knownPins(target.rel, target.extract);
  const toFetch = [];
  let resolved = 0;

  for (const entry of damaged) {
    // An entry that is already strong only needs its hostname dropped.
    const pin = entry.strong ?? known.get(entry.key);
    if (pin === undefined) {
      toFetch.push(entry);
      continue;
    }
    target.write(lines, entry, pin);
    resolved += 1;
  }

  console.log(`  reused or already strong: ${String(resolved)}`);
  console.log(`  to derive by fetching:    ${String(toFetch.length)}`);

  // Resolved lazily: a run that repairs everything from history touches no
  // network and must not require a registry to be configured at all.
  // Passed as a getter, memoised: a repair satisfied entirely from history
  // must not require a registry, and an entry refused for lacking an
  // attestation must be refused for that reason rather than for a missing
  // .npmrc it never reached.
  let registry;
  const getRegistry = () => (registry ??= registryFor(target.rel));
  const failures = await pooled(toFetch, async (entry) => {
    target.write(lines, entry, await derive(entry, getRegistry));
  });

  if (failures.length > 0) {
    console.error(`  FAILED; ${target.rel} was not written:`);
    for (const message of failures) console.error(`    ${message}`);
    exitCode = 1;
    continue;
  }

  writeFileSync(absolute, lines.join('\n'));
  const after = readFileSync(absolute, 'utf8');
  console.log(
    `  wrote: ${String((after.match(/sha512-/g) ?? []).length)} sha512, ` +
      `${String((after.match(/sha1-/g) ?? []).length)} weak, ` +
      `${String((after.match(new RegExp(SHARD_HOST.source, 'g')) ?? []).length)} shard URLs`,
  );
}

if (exitCode === 0) console.log('\nNow run: node scripts/verify-workspace.mjs');
process.exit(exitCode);
