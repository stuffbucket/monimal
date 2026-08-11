import type { UpdateStatus } from '../../shared/ipc.js';

/**
 * Update checking.
 *
 * This build ships no update channel, and that is a deliberate, documented
 * position rather than an oversight. This repository publishes a library
 * tarball and no installer, so there is no delivered artifact for an updater
 * to replace. See `docs/release.md`.
 *
 * The IPC channel and the menu item exist now so a fork only has to replace
 * the body of `checkForUpdates`.
 */

const REASON =
  'This build ships no installer and no update channel. See docs/release.md.';

let last: UpdateStatus = { state: 'idle' };

export async function checkForUpdates(): Promise<UpdateStatus> {
  last = { state: 'checking' };

  // A fork replaces this body. The shape of the return value is already the
  // one the renderer and the menu understand.
  last = { state: 'unsupported', reason: REASON };

  // Keep the signature async so a real implementation needs no call-site
  // changes.
  await Promise.resolve();
  return last;
}
