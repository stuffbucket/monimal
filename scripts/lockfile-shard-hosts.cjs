/**
 * The one definition of "a rotating shard host", shared by the two places that
 * remove them.
 *
 * The 1ES proxy in `.npmrc` serves tarballs from `ms-feed-N.pkgs.visualstudio.com`
 * while the registry is `packagefeedproxy.microsoft.io`. Because the hosts
 * differ, pnpm cannot rebuild the URL from registry + name + version and records
 * it; the next install checks that record against the registry's *current*
 * metadata, finds a different shard, and rejects the lockfile.
 *
 * Two removers, one pattern:
 *   - `.pnpmfile.cjs` drops them from the in-memory lockfile before pnpm writes
 *     it, so they are never committed by anyone, Dependabot included.
 *   - `scripts/strip-lockfile-hosts.mjs` repairs a lockfile already on disk,
 *     editing text so formatting survives.
 *
 * They cannot share the edit -- one has an object, the other has lines -- so
 * they share the only thing that must agree.
 *
 * Deliberately numbered-shard-only. A tarball URL that is genuinely not
 * reconstructible (a git dependency, a GitHub release) is pinned on purpose, and
 * blanking it would break resolution rather than harden it.
 *
 * CommonJS because `.pnpmfile.cjs` must be; the `.mjs` script imports it as a
 * default export.
 *
 * See SOURCES.md#lockfile-integrity.
 */

/** Matches the rotating shard hosts, and nothing else on that domain. */
const SHARD_HOST = /ms-feed-\d+\.pkgs\.visualstudio\.com/;

/**
 * Remove shard-host tarball URLs from a parsed lockfile, in place.
 *
 * @param {{ packages?: Record<string, { resolution?: { tarball?: string } }> }} lockfile
 * @returns {{ dropped: number, inspected: number }}
 */
function dropShardHostUrls(lockfile) {
  const packages = lockfile?.packages;
  // Not `?? {}`: a lockfile shape that stopped carrying `packages` would make
  // this a silent no-op and hosts would quietly start being committed again.
  // Reported rather than thrown -- failing every install over a shape change is
  // worse than the thing this prevents, and verify-workspace.mjs and CI both
  // still check the committed file.
  //
  // `null` is checked separately because `typeof null === "object"`, and
  // `Object.values(null)` throws -- which would fail every install, the exact
  // outcome the paragraph above rejects.
  if (packages === null || typeof packages !== "object") {
    console.warn(
      "pnpmfile: lockfile has no `packages` map; shard hosts were NOT filtered." +
        " The lockfile format may have changed -- see SOURCES.md#lockfile-integrity.",
    );
    return { dropped: 0, inspected: 0 };
  }

  let dropped = 0;
  let inspected = 0;
  for (const entry of Object.values(packages)) {
    const tarball = entry?.resolution?.tarball;
    if (typeof tarball !== "string") continue;
    inspected += 1;
    if (!SHARD_HOST.test(tarball)) continue;
    delete entry.resolution.tarball;
    dropped += 1;
  }
  return { dropped, inspected };
}

module.exports = { SHARD_HOST, dropShardHostUrls };
