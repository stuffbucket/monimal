/**
 * Keep rotating shard hostnames out of the lockfile, at the moment it is
 * written rather than after the fact.
 *
 * `afterAllResolved` runs on the in-memory lockfile before pnpm serializes it,
 * so the hosts are never written -- by anyone, including Dependabot, which
 * cannot be asked to run a repair script and which otherwise opens every
 * dependency PR with ~1700 host-pinned entries.
 *
 * This cannot be a `postinstall` hook: pnpm rejects a recorded host *before*
 * lifecycle scripts run, so the install is already dead by then.
 * `afterAllResolved` is part of resolution, which is earlier.
 *
 * It only helps a lockfile being written. `--frozen-lockfile` skips resolution,
 * so this never runs there and a lockfile that arrives host-pinned still fails
 * -- CI normalises before installing for exactly that case, and
 * `scripts/strip-lockfile-hosts.mjs` is the manual repair.
 *
 * Editing this file changes `pnpmfileChecksum` in the lockfile, and every frozen
 * install then fails with ERR_PNPM_LOCKFILE_CONFIG_MISMATCH until the lockfile
 * is re-resolved and committed alongside it.
 *
 * The pattern and the filtering live in `scripts/lockfile-shard-hosts.cjs`,
 * shared with the repair script so the two cannot drift.
 *
 * See SOURCES.md#lockfile-integrity.
 */

const { dropShardHostUrls } = require("./scripts/lockfile-shard-hosts.cjs");

function afterAllResolved(lockfile) {
  const { dropped } = dropShardHostUrls(lockfile);
  if (dropped > 0) {
    console.log(
      `pnpmfile: dropped ${dropped} rotating shard-host tarball URL(s) from the lockfile`,
    );
  }
  return lockfile;
}

module.exports = { hooks: { afterAllResolved } };
