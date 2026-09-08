/**
 * Shared by the in-memory and text lockfile removers. Only numbered feed
 * shard tarball URLs are removable: their shard number rotates, while other
 * tarball URLs must remain pinned.
 */
const SHARD_HOST = /https?:\/\/ms-feed-\d+\.pkgs\.visualstudio\.com(?=[:/]|$)/;

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
